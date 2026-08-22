import type { RawCaptureTarget, RawSnapshot } from "@w2f/capture-core";
export declare const STANDARD_CAPTURE_ADAPTER_VERSION: "1.0.0";
export interface StandardCaptureInput {
    captureTarget: RawCaptureTarget;
    maxNodes?: number;
    includeComments?: boolean;
}
export interface StandardCaptureResult {
    snapshot: RawSnapshot;
}
//# sourceMappingURL=types.d.ts.map