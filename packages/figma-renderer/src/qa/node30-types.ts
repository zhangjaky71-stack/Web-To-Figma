export const W2F_NODE30_QA_VERSION = "1.0.0" as const;
export const W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD = 0.9 as const;
export const W2F_NODE30_REQUIRED_DETERMINISM_RUNS = 10 as const;
export const W2F_NODE30_RESPONSIVE_DOMAINS = [
  "sizing",
  "spacing",
  "min-max",
  "layout",
  "constraints",
  "breakpoints",
] as const;

export type W2fNode30QaStatus = "PASS" | "WARNING" | "FAIL" | "UNAVAILABLE";
export type W2fResponsiveQaDomain = (typeof W2F_NODE30_RESPONSIVE_DOMAINS)[number];

export interface W2fResponsiveQaCheck {
  id: string;
  domain: W2fResponsiveQaDomain;
  matched: number;
  total: number;
  detail?: string;
}

export interface W2fResponsiveStructuralChangeEvidence {
  id: string;
  expected: boolean;
  detected: boolean;
  executableInFigma: boolean;
  reportedWhenNotExecutable: boolean;
}

export interface W2fResponsiveQaInput {
  checks: readonly W2fResponsiveQaCheck[];
  structuralChanges?: readonly W2fResponsiveStructuralChangeEvidence[];
  requiredDomains?: readonly W2fResponsiveQaDomain[];
}

export interface W2fResponsiveQaReport {
  version: typeof W2F_NODE30_QA_VERSION;
  status: W2fNode30QaStatus;
  compositeScore: number;
  threshold: typeof W2F_NODE30_RESPONSIVE_SCORE_THRESHOLD;
  domainScores: Readonly<Partial<Record<W2fResponsiveQaDomain, number>>>;
  failures: readonly string[];
  warnings: readonly string[];
}

export interface W2fDeterminismRunInput {
  runId: string;
  environmentFingerprint: string;
  assetHashes: readonly string[];
  sourceGraph: unknown;
  renderTree: unknown;
  stableIdentityIds: readonly string[];
  layoutDecisions: unknown;
}

export interface W2fDeterminismRunFingerprint {
  runId: string;
  assetHash: string;
  sourceGraphHash: string;
  renderTreeHash: string;
  stableIdentityHash: string;
  layoutDecisionHash: string;
}

export interface W2fDeterminismQaReport {
  version: typeof W2F_NODE30_QA_VERSION;
  status: W2fNode30QaStatus;
  requiredRuns: typeof W2F_NODE30_REQUIRED_DETERMINISM_RUNS;
  observedRuns: number;
  environmentFingerprint: string | null;
  fingerprints: readonly W2fDeterminismRunFingerprint[];
  failures: readonly string[];
}

export type W2fPerformanceScaleBand =
  "lt-2k" | "2k-5k" | "5k-10k" | "10k-20k" | "20k-50k" | "gt-50k";

export interface W2fPerformanceSample {
  id: string;
  benchmarkEnvironment: string;
  renderNodeCount: number;
  durationMs: number;
  completed: boolean;
  crashed: boolean;
  chunkingSupported: boolean;
  progressSupported: boolean;
  userWarningShown: boolean;
  sectionOrSimplifiedStrategyOffered: boolean;
  explicitConfirmationObtained: boolean;
}

export interface W2fPerformanceQaSampleResult {
  id: string;
  band: W2fPerformanceScaleBand;
  status: W2fNode30QaStatus;
  failures: readonly string[];
  warnings: readonly string[];
}

export interface W2fPerformanceQaReport {
  version: typeof W2F_NODE30_QA_VERSION;
  status: W2fNode30QaStatus;
  benchmarkEnvironment: string | null;
  sampleResults: readonly W2fPerformanceQaSampleResult[];
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  calibratedHardBudgetMs: null;
  failures: readonly string[];
  warnings: readonly string[];
}
