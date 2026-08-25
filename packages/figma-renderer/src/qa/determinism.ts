import { deterministicHash } from "./canonical.js";
import {
  W2F_NODE30_QA_VERSION,
  W2F_NODE30_REQUIRED_DETERMINISM_RUNS,
  type W2fDeterminismQaReport,
  type W2fDeterminismRunFingerprint,
  type W2fDeterminismRunInput,
} from "./node30-types.js";

const VOLATILE_SOURCE_GRAPH_KEYS = [
  "capturedAt",
  "captureId",
  "revisionId",
  "parentRevisionId",
] as const;

function fingerprintRun(run: W2fDeterminismRunInput): W2fDeterminismRunFingerprint {
  return {
    runId: run.runId,
    assetHash: deterministicHash([...run.assetHashes].sort()),
    sourceGraphHash: deterministicHash(run.sourceGraph, VOLATILE_SOURCE_GRAPH_KEYS),
    renderTreeHash: deterministicHash(run.renderTree),
    stableIdentityHash: deterministicHash([...run.stableIdentityIds].sort()),
    layoutDecisionHash: deterministicHash(run.layoutDecisions),
  };
}

function mismatchFields(
  baseline: W2fDeterminismRunFingerprint,
  candidate: W2fDeterminismRunFingerprint,
): string[] {
  const mismatches: string[] = [];
  for (const key of [
    "assetHash",
    "sourceGraphHash",
    "renderTreeHash",
    "stableIdentityHash",
    "layoutDecisionHash",
  ] as const) {
    if (candidate[key] !== baseline[key]) mismatches.push(key);
  }
  return mismatches;
}

export function evaluateDeterminismQa(
  runs: readonly W2fDeterminismRunInput[],
): W2fDeterminismQaReport {
  const fingerprints = runs.map(fingerprintRun);
  const failures: string[] = [];
  const environmentFingerprint = runs[0]?.environmentFingerprint.trim() || null;

  if (runs.length < W2F_NODE30_REQUIRED_DETERMINISM_RUNS) {
    return {
      version: W2F_NODE30_QA_VERSION,
      status: "UNAVAILABLE",
      requiredRuns: W2F_NODE30_REQUIRED_DETERMINISM_RUNS,
      observedRuns: runs.length,
      environmentFingerprint,
      fingerprints,
      failures: [
        `Determinism gate requires ${W2F_NODE30_REQUIRED_DETERMINISM_RUNS} runs; observed ${runs.length}`,
      ],
    };
  }

  if (!environmentFingerprint) {
    failures.push("Determinism gate requires a non-empty same-environment fingerprint");
  }
  const runIds = new Set<string>();
  for (const run of runs) {
    if (!run.runId.trim()) failures.push("Determinism runId must be non-empty");
    if (runIds.has(run.runId)) failures.push(`Duplicate determinism runId ${run.runId}`);
    runIds.add(run.runId);
    if (!run.environmentFingerprint.trim()) {
      failures.push(`Run ${run.runId} is missing environmentFingerprint`);
    } else if (environmentFingerprint && run.environmentFingerprint !== environmentFingerprint) {
      failures.push(`Run ${run.runId} used a different environment fingerprint`);
    }
  }

  const baseline = fingerprints[0];
  if (!baseline) {
    return {
      version: W2F_NODE30_QA_VERSION,
      status: "UNAVAILABLE",
      requiredRuns: W2F_NODE30_REQUIRED_DETERMINISM_RUNS,
      observedRuns: 0,
      environmentFingerprint,
      fingerprints,
      failures: ["Determinism gate has no baseline run"],
    };
  }

  for (const candidate of fingerprints.slice(1)) {
    const mismatches = mismatchFields(baseline, candidate);
    if (mismatches.length > 0) {
      failures.push(`Run ${candidate.runId} differs from ${baseline.runId}: ${mismatches.join(", ")}`);
    }
  }

  return {
    version: W2F_NODE30_QA_VERSION,
    status: failures.length > 0 ? "FAIL" : "PASS",
    requiredRuns: W2F_NODE30_REQUIRED_DETERMINISM_RUNS,
    observedRuns: runs.length,
    environmentFingerprint,
    fingerprints,
    failures,
  };
}
