export const W2F_NODE31_RC_VERSION = "1.0.0" as const;

export const W2F_NODE31_THRESHOLDS = {
  deterministicVisualSimilarity: 0.99,
  realisticVisualMedian: 0.95,
  geometryFidelity: 0.98,
  textFidelity: 0.97,
  assetFidelity: 0.99,
  structureFidelity: 0.95,
  editableAreaMedian: 0.9,
  responsiveFidelity: 0.9,
  rasterAreaMedianMax: 0.15,
} as const;

export const W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES = [
  "landing-page",
  "ecommerce",
  "docs",
  "dashboard",
  "table",
  "saas-shell",
  "local-site",
  "shadow-dom",
  "iframe",
  "canvas",
  "webgl",
  "responsive-app",
] as const;

export const W2F_NODE31_REQUIRED_SECURITY_FIXTURES = [
  "malformed-archive",
  "path-traversal",
  "oversized-expansion",
  "invalid-checksum",
  "malformed-schema",
  "hostile-svg",
] as const;

export const W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES = [
  "canonical-v2-manifest",
  "min-reader-enforced",
  "v2-current-noop",
  "v2-compatible-minor",
  "unsupported-major-rejected",
  "forward-optional-metadata-preserved",
] as const;

export type W2fNode31Status = "PASS" | "WARNING" | "FAIL" | "UNAVAILABLE";
export type W2fNode31TestClass = "A" | "B" | "C";
export type W2fNode31SupportClass =
  | "native-supported"
  | "expected-fallback"
  | "unsupported-blocked";
export type W2fNode31RealisticCategory =
  (typeof W2F_NODE31_REQUIRED_REALISTIC_CATEGORIES)[number];
export type W2fNode31SecurityFixture = (typeof W2F_NODE31_REQUIRED_SECURITY_FIXTURES)[number];
export type W2fNode31SchemaCompatibilityCase =
  (typeof W2F_NODE31_REQUIRED_SCHEMA_COMPATIBILITY_CASES)[number];

export interface W2fNode31CorpusSample {
  id: string;
  testClass: W2fNode31TestClass;
  category: W2fNode31RealisticCategory | string;
  supportClass: W2fNode31SupportClass;
  standardHtmlCss: boolean;
  level?: 1 | 2 | 3;
  behaviorStatus: W2fNode31Status;
  fallbackOrDiagnostic?: string;
  knownLimitationId?: string;
  p0Contradiction?: boolean;
  visualSimilarity?: number;
  geometryFidelity?: number;
  textFidelity?: number;
  assetFidelity?: number;
  structureFidelity?: number;
  editableAreaRatio?: number;
  responsiveFidelity?: number;
  rasterAreaRatio?: number;
  severeLocalRegression?: boolean;
  antiCheatingViolations?: readonly string[];
}

export interface W2fNode31P0Item {
  id: string;
  disposition: "complete" | "approved-adr" | "missing";
  adrId?: string;
}

export interface W2fNode31SecurityFixtureResult {
  id: W2fNode31SecurityFixture | string;
  status: W2fNode31Status;
}

export interface W2fNode31SecurityEvidence {
  knownCriticalBlockers: number;
  knownHighBlockers: number;
  fixtures: readonly W2fNode31SecurityFixtureResult[];
}

export interface W2fNode31SchemaCompatibilityResult {
  id: W2fNode31SchemaCompatibilityCase | string;
  status: W2fNode31Status;
}

export interface W2fNode31KnownLimitationsEvidence {
  documentCurrent: boolean;
  undocumentedLimitations: number;
  silentSupportClaims: number;
  p0Contradictions: number;
}

export interface W2fNode31CompatibilityMatrixRow {
  id: string;
  testClass: W2fNode31TestClass;
  category: string;
  supportClass: W2fNode31SupportClass;
  status: W2fNode31Status;
  fallbackOrDiagnostic?: string;
  knownLimitationId?: string;
}

export interface W2fNode31CompatibilityMatrix {
  version: typeof W2F_NODE31_RC_VERSION;
  status: W2fNode31Status;
  rows: readonly W2fNode31CompatibilityMatrixRow[];
  missingRealisticCategories: readonly W2fNode31RealisticCategory[];
  failures: readonly string[];
  warnings: readonly string[];
}

export interface W2fNode31GateResult {
  id: string;
  status: W2fNode31Status;
  detail: string;
  observed?: number | string;
  target?: number | string;
}

export interface W2fNode31ReleaseCandidateInput {
  p0Items: readonly W2fNode31P0Item[];
  corpus: readonly W2fNode31CorpusSample[];
  determinismStatus: W2fNode31Status;
  scaleStatus: W2fNode31Status;
  security: W2fNode31SecurityEvidence;
  schemaCompatibility: readonly W2fNode31SchemaCompatibilityResult[];
  knownLimitations: W2fNode31KnownLimitationsEvidence;
}

export interface W2fNode31ReleaseCandidateReport {
  version: typeof W2F_NODE31_RC_VERSION;
  status: W2fNode31Status;
  releaseReady: boolean;
  gates: readonly W2fNode31GateResult[];
  compatibilityMatrix: W2fNode31CompatibilityMatrix;
  failures: readonly string[];
  warnings: readonly string[];
}
