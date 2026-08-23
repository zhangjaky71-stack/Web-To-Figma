export const ENVIRONMENT_CAPTURE_VERSION = "1.0.0" as const;

export type EnvironmentCaptureVersion = typeof ENVIRONMENT_CAPTURE_VERSION;
export type EnvironmentCaptureAdapter = "standard" | "cdp";
export type EnvironmentEvidenceAvailability = "observed" | "unavailable" | "not-applicable";

export interface EnvironmentMediaFeatureEvidence {
  id: string;
  query: string;
  matches: boolean;
  availability: EnvironmentEvidenceAvailability;
}

export interface RuntimeEnvironmentEvidence {
  browserName: string;
  browserVersion: string;
  platform: string;
  language: string;
  direction: "ltr" | "rtl";
  colorScheme: "light" | "dark";
  reducedMotion: boolean;
  mediaFeatures?: EnvironmentMediaFeatureEvidence[];
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
  pageZoom?: number;
  pageZoomAvailability: EnvironmentEvidenceAvailability;
  visualViewportScale?: number;
  cssZoom?: number;
  cssZoomAvailability: EnvironmentEvidenceAvailability;
}

export interface MediaRuleEvidence {
  id: string;
  query: string;
  active: boolean;
  activeInSnapshotIds: string[];
  affectedProperties: string[];
  affectedSourceNodeIds: string[];
  stylesheetRef?: string;
  ruleIndex?: number;
}

export interface ContainerDefinitionEvidence {
  sourceNodeId: string;
  containerName?: string;
  containerType?: string;
  writingMode?: string;
  inlineSize?: number;
  blockSize?: number;
}

export interface ContainerQueryEvidence {
  id: string;
  containerName?: string;
  condition: string;
  active?: boolean;
  activeAvailability?: EnvironmentEvidenceAvailability;
  containerSourceNodeId?: string;
  affectedProperties: string[];
  affectedSourceNodeIds: string[];
  stylesheetRef?: string;
  ruleIndex?: number;
}

export interface EnvironmentCaptureDiagnostic {
  code:
    | "ENV_STYLESHEET_INACCESSIBLE"
    | "ENV_SELECTOR_UNSUPPORTED"
    | "ENV_SOURCE_NODE_UNRESOLVED"
    | "ENV_CAPTURE_BUDGET_EXCEEDED"
    | "ENV_PAGE_ZOOM_UNAVAILABLE"
    | "ENV_CONTAINER_QUERY_STATUS_UNAVAILABLE";
  message: string;
  sourceNodeId?: string;
  stylesheetRef?: string;
}

export interface EnvironmentCapture {
  version: EnvironmentCaptureVersion;
  adapter: EnvironmentCaptureAdapter;
  snapshotId: string;
  environment: RuntimeEnvironmentEvidence;
  mediaRules: MediaRuleEvidence[];
  containers: ContainerDefinitionEvidence[];
  containerQueries: ContainerQueryEvidence[];
  diagnostics: EnvironmentCaptureDiagnostic[];
}

export interface CreateEnvironmentCaptureInput {
  adapter: EnvironmentCaptureAdapter;
  snapshotId: string;
  environment: RuntimeEnvironmentEvidence;
  mediaRules?: MediaRuleEvidence[];
  containers?: ContainerDefinitionEvidence[];
  containerQueries?: ContainerQueryEvidence[];
  diagnostics?: EnvironmentCaptureDiagnostic[];
}

export interface EnvironmentCaptureSummary {
  version: EnvironmentCaptureVersion;
  adapter: EnvironmentCaptureAdapter;
  mediaRuleCount: number;
  activeMediaRuleCount: number;
  containerCount: number;
  containerQueryCount: number;
  observedContainerQueryCount: number;
  activeContainerQueryCount: number;
  diagnosticCount: number;
}
