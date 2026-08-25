import {
  W2F_NODE31_RC_VERSION,
  W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES,
  W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES,
  W2F_NODE31_REQUIRED_SECURITY_FIXTURES,
  type W2fNode31Status,
} from "./node31-types.js";

export type W2fNode31EvidenceManifestState = "collecting" | "ready";

export interface W2fNode31EvidenceManifestReport {
  version: typeof W2F_NODE31_RC_VERSION;
  status: W2fNode31Status;
  manifestState: W2fNode31EvidenceManifestState | null;
  sourceCount: number;
  measuredCount: number;
  missingRealisticCategories: readonly string[];
  failures: readonly string[];
  unavailable: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function evidenceStatus(value: unknown): "PASS" | "FAIL" | "UNAVAILABLE" | null {
  return value === "PASS" || value === "FAIL" || value === "UNAVAILABLE" ? value : null;
}

function inspectMeasuredEntry(
  entry: unknown,
  scope: string,
  failures: string[],
  unavailable: string[],
): { source: boolean; measured: boolean } {
  if (!isRecord(entry)) {
    failures.push(`${scope} entry must be an object`);
    return { source: false, measured: false };
  }
  const id = stringValue(entry.id) ?? scope;
  const sourceArtifact = stringValue(entry.sourceArtifact);
  const measurementArtifact = stringValue(entry.measurementArtifact);
  const status = evidenceStatus(entry.measurementStatus);

  if (!status) {
    failures.push(`${id} has invalid measurementStatus`);
    return { source: sourceArtifact !== null, measured: false };
  }
  if (status === "PASS" && !measurementArtifact) {
    failures.push(`${id} cannot PASS without a measurementArtifact`);
  }
  if (status === "FAIL") failures.push(`${id} measurement failed`);
  if (status === "UNAVAILABLE") unavailable.push(`${id} measurement is unavailable`);

  return {
    source: sourceArtifact !== null,
    measured: status === "PASS" && measurementArtifact !== null,
  };
}

function inspectStatusEntry(
  entry: unknown,
  id: string,
  failures: string[],
  unavailable: string[],
): void {
  if (!isRecord(entry)) {
    failures.push(`${id} evidence is missing`);
    return;
  }
  const status = evidenceStatus(entry.status);
  if (!status) failures.push(`${id} has invalid status`);
  else if (status === "FAIL") failures.push(`${id} failed`);
  else if (status === "UNAVAILABLE") unavailable.push(`${id} is unavailable`);
}

export function evaluateNode31EvidenceManifest(input: unknown): W2fNode31EvidenceManifestReport {
  const failures: string[] = [];
  const unavailable: string[] = [];
  if (!isRecord(input)) {
    return {
      version: W2F_NODE31_RC_VERSION,
      status: "FAIL",
      manifestState: null,
      sourceCount: 0,
      measuredCount: 0,
      missingRealisticCategories: [...W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES],
      failures: ["NODE-31 evidence manifest must be an object"],
      unavailable: [],
    };
  }

  if (input.version !== W2F_NODE31_RC_VERSION) {
    failures.push(`unsupported evidence manifest version ${String(input.version)}`);
  }
  const manifestState =
    input.status === "collecting" || input.status === "ready" ? input.status : null;
  if (!manifestState) failures.push("evidence manifest status must be collecting or ready");
  if (!stringValue(input.baselineCommit)) failures.push("baselineCommit is required");

  let sourceCount = 0;
  let measuredCount = 0;
  const classA = asArray(input.classA);
  const classB = asArray(input.classB);
  for (const [index, entry] of classA.entries()) {
    const result = inspectMeasuredEntry(entry, `Class A #${index + 1}`, failures, unavailable);
    if (result.source) sourceCount += 1;
    if (result.measured) measuredCount += 1;
  }

  const realisticCategories = new Set<string>();
  for (const [index, entry] of classB.entries()) {
    if (!isRecord(entry)) {
      failures.push(`Class B #${index + 1} entry must be an object`);
      continue;
    }
    const category = stringValue(entry.category);
    if (!category) failures.push(`Class B #${index + 1} category is required`);
    else realisticCategories.add(category);
    const result = inspectMeasuredEntry(entry, `Class B #${index + 1}`, failures, unavailable);
    if (!result.source) {
      failures.push(
        `${stringValue(entry.id) ?? `Class B #${index + 1}`} must name a sourceArtifact`,
      );
    } else {
      sourceCount += 1;
    }
    if (result.measured) measuredCount += 1;
  }

  const missingRealisticCategories = W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES.filter(
    (category) => !realisticCategories.has(category),
  );
  for (const category of missingRealisticCategories) {
    failures.push(`versioned realistic corpus is missing ${category}`);
  }

  const security = isRecord(input.security) ? input.security : null;
  if (!security) {
    failures.push("security evidence is missing");
  } else {
    const critical = security.knownCriticalBlockers;
    const high = security.knownHighBlockers;
    if (critical === null || critical === undefined || high === null || high === undefined) {
      unavailable.push("security blocker counts are unavailable");
    } else if (
      !Number.isSafeInteger(critical) ||
      !Number.isSafeInteger(high) ||
      Number(critical) < 0 ||
      Number(high) < 0
    ) {
      failures.push("security blocker counts must be non-negative safe integers");
    } else if (Number(critical) > 0 || Number(high) > 0) {
      failures.push(`known security blockers critical=${String(critical)} high=${String(high)}`);
    }

    const fixtureById = new Map<string, unknown>();
    for (const fixture of asArray(security.fixtures)) {
      if (isRecord(fixture) && stringValue(fixture.id)) {
        fixtureById.set(stringValue(fixture.id) as string, fixture);
      }
    }
    for (const id of W2F_NODE31_REQUIRED_SECURITY_FIXTURES) {
      inspectStatusEntry(fixtureById.get(id), `security fixture ${id}`, failures, unavailable);
    }
  }

  const schemaById = new Map<string, unknown>();
  for (const entry of asArray(input.schemaCompatibility)) {
    if (isRecord(entry) && stringValue(entry.id)) {
      schemaById.set(stringValue(entry.id) as string, entry);
    }
  }
  for (const id of W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES) {
    inspectStatusEntry(schemaById.get(id), `schema compatibility ${id}`, failures, unavailable);
  }

  inspectStatusEntry(input.knownLimitations, "known limitations", failures, unavailable);
  inspectStatusEntry(input.p0, "P0", failures, unavailable);
  inspectStatusEntry(input.determinism, "determinism", failures, unavailable);
  inspectStatusEntry(input.scale, "scale", failures, unavailable);

  if (manifestState === "ready" && unavailable.length > 0) {
    failures.push("evidence manifest cannot claim ready while required evidence is unavailable");
  }

  const status: W2fNode31Status =
    failures.length > 0 ? "FAIL" : unavailable.length > 0 ? "UNAVAILABLE" : "PASS";
  return {
    version: W2F_NODE31_RC_VERSION,
    status,
    manifestState,
    sourceCount,
    measuredCount,
    missingRealisticCategories,
    failures,
    unavailable,
  };
}
