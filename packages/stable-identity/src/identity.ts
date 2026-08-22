import { canonicalStringify } from "@w2f/w2f-schema";
import { sha256Hex, shortStableHash } from "./hash.js";
import { collectStableIdentitySignals, normalizeDocumentLocator } from "./normalize.js";
import type {
  CaptureIdentityInput,
  DocumentIdentityInput,
  RevisionIdentityInput,
  StableCaptureIdentity,
  StableDocumentIdentity,
  StableIdentityAssignment,
  StableIdentityNodeInput,
  StableIdentitySignals,
  StableRevisionIdentity,
} from "./types.js";

function clampConfidence(value: number): number {
  return Math.round(Math.min(0.99, Math.max(0, value)) * 1000) / 1000;
}

function identityEvidence(signals: StableIdentitySignals): {
  confidence: number;
  evidence: string[];
} {
  let confidence = 0.22;
  const evidence = ["document-scope", `tag=${signals.tagName}`];

  if (signals.stableIdAttribute) {
    confidence += 0.52;
    evidence.push("stable-id-attribute");
  }
  if (signals.stableDataAttributes.length > 0) {
    confidence += 0.32;
    evidence.push("stable-data-attribute");
  }
  if (signals.role) {
    confidence += 0.07;
    evidence.push(`role=${signals.role}`);
  }
  if (signals.ancestry.length > 0) {
    confidence += 0.1;
    evidence.push("semantic-ancestry");
  }
  if (signals.meaningfulClasses.length > 0) {
    confidence += 0.08;
    evidence.push("meaningful-class-signature");
  }
  if (signals.normalizedText) {
    confidence += 0.06;
    evidence.push("normalized-content-fingerprint");
  }
  if (signals.assetFingerprints.length > 0) {
    confidence += 0.08;
    evidence.push("asset-fingerprint");
  }
  if (signals.usesStructuralFallback) {
    confidence += 0.06;
    evidence.push("structural-position-fallback");
    confidence = Math.min(confidence, 0.69);
  } else if (!signals.stableIdAttribute && signals.stableDataAttributes.length === 0) {
    confidence = Math.min(confidence, 0.84);
  }

  return { confidence: clampConfidence(confidence), evidence };
}

function signaturePayload(signals: StableIdentitySignals): unknown[] {
  const payload: unknown[] = [
    "w2f-stable-node-v1",
    signals.documentId,
    signals.sourceOrigin ?? "",
    signals.namespace ?? "",
    signals.tagName,
    signals.role ?? "",
    signals.stableIdAttribute ?? "",
    signals.stableDataAttributes,
    signals.meaningfulClasses,
    signals.ancestry,
    signals.normalizedText ?? "",
    signals.assetFingerprints,
  ];

  if (signals.usesStructuralFallback) {
    payload.push({
      siblingIndex: signals.structuralPosition.siblingIndex,
      sameKindIndex:
        signals.structuralPosition.sameKindIndex ?? signals.structuralPosition.siblingIndex,
      documentOrder: signals.structuralPosition.documentOrder ?? null,
    });
  }

  return payload;
}

async function identityFromSignals(
  captureNodeId: string,
  signals: StableIdentitySignals,
): Promise<StableIdentityAssignment> {
  const signatureHash = await sha256Hex(canonicalStringify(signaturePayload(signals)));
  const scored = identityEvidence(signals);
  return {
    captureNodeId,
    identity: {
      id: `sid_${shortStableHash(signatureHash)}`,
      confidence: scored.confidence,
      evidence: scored.evidence,
    },
    signatureHash,
    signals,
  };
}

export async function assignStableIdentity(
  input: StableIdentityNodeInput,
): Promise<StableIdentityAssignment> {
  return identityFromSignals(input.captureNodeId, collectStableIdentitySignals(input));
}

function collisionKey(assignment: StableIdentityAssignment): string {
  const position = assignment.signals.structuralPosition;
  return canonicalStringify([
    assignment.identity.id,
    assignment.signals.ancestry,
    position.sameKindIndex ?? position.siblingIndex,
    position.siblingIndex,
    position.documentOrder ?? null,
  ]);
}

async function disambiguateCollisionGroup(
  group: StableIdentityAssignment[],
): Promise<StableIdentityAssignment[]> {
  const keys = group.map(collisionKey);
  if (new Set(keys).size !== keys.length) {
    throw new TypeError(
      "stable identity collision cannot be deterministically disambiguated; provide distinct structural positions",
    );
  }

  return Promise.all(
    group.map(async (assignment) => {
      const collisionHash = await sha256Hex(
        canonicalStringify(["w2f-stable-node-collision-v1", collisionKey(assignment)]),
      );
      return {
        ...assignment,
        identity: {
          id: `sid_${shortStableHash(collisionHash)}`,
          confidence: clampConfidence(Math.max(0, assignment.identity.confidence - 0.12)),
          evidence: [
            ...assignment.identity.evidence,
            "collision-disambiguated-by-structural-position",
          ],
        },
      };
    }),
  );
}

export async function assignStableIdentities(
  inputs: readonly StableIdentityNodeInput[],
): Promise<StableIdentityAssignment[]> {
  const captureIds = inputs.map((input) => input.captureNodeId);
  if (new Set(captureIds).size !== captureIds.length) {
    throw new TypeError("captureNodeId values must be unique within one assignment batch");
  }

  const baseAssignments = await Promise.all(inputs.map(assignStableIdentity));
  const groups = new Map<string, StableIdentityAssignment[]>();
  for (const assignment of baseAssignments) {
    const group = groups.get(assignment.identity.id) ?? [];
    group.push(assignment);
    groups.set(assignment.identity.id, group);
  }

  const replacements = new Map<string, StableIdentityAssignment>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (only) replacements.set(only.captureNodeId, only);
      continue;
    }
    for (const replacement of await disambiguateCollisionGroup(group)) {
      replacements.set(replacement.captureNodeId, replacement);
    }
  }

  return inputs.map((input) => {
    const assignment = replacements.get(input.captureNodeId);
    if (!assignment) throw new Error(`missing stable identity assignment: ${input.captureNodeId}`);
    return assignment;
  });
}

export async function createDocumentIdentity(
  input: DocumentIdentityInput,
): Promise<StableDocumentIdentity> {
  const normalizedSourceLocator = normalizeDocumentLocator(input);
  const documentHash = await sha256Hex(
    canonicalStringify(["w2f-document-v1", normalizedSourceLocator]),
  );
  const sourceFingerprint = await sha256Hex(
    canonicalStringify([
      "w2f-source-fingerprint-v1",
      normalizedSourceLocator,
      input.rootStructuralFingerprint ?? "",
    ]),
  );
  return {
    documentId: `doc_${shortStableHash(documentHash)}`,
    sourceFingerprint,
    normalizedSourceLocator,
  };
}

export async function createCaptureIdentity(
  input: CaptureIdentityInput,
): Promise<StableCaptureIdentity> {
  if (!input.documentId.trim()) throw new TypeError("documentId must be non-empty");
  if (!input.captureNonce.trim()) throw new TypeError("captureNonce must be non-empty");
  const timestamp = new Date(input.capturedAt);
  if (Number.isNaN(timestamp.getTime()))
    throw new TypeError("capturedAt must be a valid timestamp");
  const capturedAt = timestamp.toISOString();
  const hash = await sha256Hex(
    canonicalStringify([
      "w2f-capture-v1",
      input.documentId.trim(),
      capturedAt,
      input.captureNonce.trim(),
    ]),
  );
  return { captureId: `cap_${shortStableHash(hash)}`, capturedAt };
}

export async function createRevisionIdentity(
  input: RevisionIdentityInput,
): Promise<StableRevisionIdentity> {
  const revisionHash = await sha256Hex(
    canonicalStringify([
      "w2f-revision-v1",
      input.document.documentId,
      input.capture.captureId,
      input.document.sourceFingerprint,
      input.parentRevisionId ?? "",
      input.revisionNonce ?? "",
    ]),
  );
  const revisionId = `rev_${shortStableHash(revisionHash)}`;
  return {
    revisionId,
    manifestIdentity: {
      documentId: input.document.documentId,
      captureId: input.capture.captureId,
      sourceFingerprint: input.document.sourceFingerprint,
      capturedAt: input.capture.capturedAt,
      revisionId,
      ...(input.parentRevisionId ? { parentRevisionId: input.parentRevisionId } : {}),
    },
  };
}
