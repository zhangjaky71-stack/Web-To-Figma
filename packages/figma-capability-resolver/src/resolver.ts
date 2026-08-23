import { CURRENT_FIGMA_CAPABILITY_REGISTRY } from "./registry.js";
import {
  PROFILE_ORDER,
  STRATEGY_TO_RENDER,
  nativeContextSatisfied,
  normalizeRenderProfile,
} from "./policy.js";
import type {
  FigmaCapabilityRecord,
  FigmaCapabilityRegistry,
  W2fCapabilityPlan,
  W2fCapabilityRequest,
  W2fRenderNodeCapabilityRequest,
  W2fResolutionStrategy,
} from "./types.js";

function availableStrategies(
  record: FigmaCapabilityRecord,
  request: W2fCapabilityRequest,
): Set<W2fResolutionStrategy> {
  const available = new Set<W2fResolutionStrategy>(["UNSUPPORTED"]);
  const nativeAllowed =
    (record.state === "native" || record.state === "partial") &&
    nativeContextSatisfied(record, request);

  if (nativeAllowed) available.add("NATIVE");
  if (
    record.emulationAvailable &&
    (record.state === "emulated" || record.state === "partial" || !nativeAllowed)
  ) {
    available.add("EMULATED");
  }
  if (record.wrapperEligible && request.context.canInsertWrapper) available.add("WRAPPER");
  if (record.absoluteEligible && request.context.canUseAbsolutePositioning) {
    available.add("ABSOLUTE");
  }
  if (record.rasterEligible && request.context.rasterEvidenceAvailable) available.add("RASTER");
  return available;
}

function safetyBoundary(
  preferred: W2fCapabilityRequest["preferredStrategy"],
  available: ReadonlySet<W2fResolutionStrategy>,
): W2fResolutionStrategy | undefined {
  if (preferred === "raster") return available.has("RASTER") ? "RASTER" : "UNSUPPORTED";
  if (preferred === "unsupported") return "UNSUPPORTED";
  return undefined;
}

export function resolveFigmaCapability(
  request: W2fCapabilityRequest,
  registry: FigmaCapabilityRegistry = CURRENT_FIGMA_CAPABILITY_REGISTRY,
): W2fCapabilityPlan {
  const record = registry.records[request.capability];
  const profile = normalizeRenderProfile(request.profile);
  const available = availableStrategies(record, request);
  const boundaryStrategy = safetyBoundary(request.preferredStrategy, available);
  const order = PROFILE_ORDER[profile];
  const strategy =
    boundaryStrategy ?? order.find((candidate) => available.has(candidate)) ?? "UNSUPPORTED";

  const reasons = [
    `registry:${registry.snapshotId}`,
    `capability:${record.key};state=${record.state}`,
    `native-context:${record.nativeContext};parent=${request.context.parentLayout};target=${request.context.targetLayout};variant=${request.context.featureVariant ?? "default"}`,
    `profile:${profile};order=${order.join(">")}`,
    `available:${[...available].sort().join(",")}`,
  ];
  if (boundaryStrategy) reasons.push(`safety-boundary:${request.preferredStrategy ?? "none"}`);
  if (strategy !== "NATIVE") reasons.push(`downgrade:${record.note}`);
  reasons.push(`selected:${strategy}`);

  return {
    capability: request.capability,
    capabilityState: record.state,
    profile,
    strategy,
    renderStrategy: STRATEGY_TO_RENDER[strategy],
    requiresWrapper: strategy === "WRAPPER",
    reasons,
    registrySnapshotId: registry.snapshotId,
    sourceStableIds: [...(request.sourceStableIds ?? [])],
    ...(request.revisionHashes ? { revisionHashes: request.revisionHashes } : {}),
    tokenPolicy: request.tokenPolicy ?? "literal",
    preservesRevisionMetadata: true,
    preservesStableSourceMapping: true,
  };
}

export function resolveRenderNodeCapability(
  request: W2fRenderNodeCapabilityRequest,
  registry: FigmaCapabilityRegistry = CURRENT_FIGMA_CAPABILITY_REGISTRY,
): W2fCapabilityPlan {
  return resolveFigmaCapability(
    {
      capability: request.capability,
      nodeKind: request.node.kind,
      profile: request.profile,
      context: request.context,
      preferredStrategy: request.node.renderStrategy,
      sourceStableIds: request.node.sourceStableIds ?? [],
      ...(request.node.revisionHashes ? { revisionHashes: request.node.revisionHashes } : {}),
      tokenPolicy: "literal",
    },
    registry,
  );
}
