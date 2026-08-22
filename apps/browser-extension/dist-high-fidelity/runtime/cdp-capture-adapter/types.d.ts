import type { RawCaptureTarget, RawSnapshot } from "@w2f/capture-core";
export declare const CDP_CAPTURE_ADAPTER_VERSION: "1.0.0";
export interface CdpRareIntegerData {
    index: number[];
    value: number[];
}
export interface CdpRareStringData {
    index: number[];
    value: number[];
}
export interface CdpNodeTreeSnapshot {
    parentIndex: number[];
    nodeType: number[];
    nodeName: number[];
    nodeValue: number[];
    backendNodeId: number[];
    attributes: number[][];
    shadowRootType?: CdpRareStringData;
    contentDocumentIndex?: CdpRareIntegerData;
    pseudoType?: CdpRareStringData;
    currentSourceURL?: CdpRareStringData;
    originURL?: CdpRareStringData;
}
export interface CdpLayoutTreeSnapshot {
    nodeIndex: number[];
    styles: number[][];
    bounds: number[][];
    text: number[];
    paintOrders?: number[];
    clientRects?: number[][];
    scrollRects?: number[][];
}
export interface CdpDocumentSnapshot {
    documentURL: number;
    title: number;
    baseURL: number;
    frameId: number;
    nodes: CdpNodeTreeSnapshot;
    layout: CdpLayoutTreeSnapshot;
    scrollOffsetX?: number;
    scrollOffsetY?: number;
    contentWidth?: number;
    contentHeight?: number;
}
export interface CdpDomSnapshotResponse {
    documents: CdpDocumentSnapshot[];
    strings: string[];
}
export interface CdpLayoutViewport {
    pageX: number;
    pageY: number;
    clientWidth: number;
    clientHeight: number;
}
export interface CdpVisualViewport {
    offsetX: number;
    offsetY: number;
    pageX: number;
    pageY: number;
    clientWidth: number;
    clientHeight: number;
    scale: number;
    zoom?: number;
}
export interface CdpRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface CdpLayoutMetricsResponse {
    cssLayoutViewport?: CdpLayoutViewport;
    cssVisualViewport?: CdpVisualViewport;
    cssContentSize?: CdpRect;
    layoutViewport?: CdpLayoutViewport;
    visualViewport?: CdpVisualViewport;
    contentSize?: CdpRect;
}
export interface CdpFrame {
    id: string;
    parentId?: string;
    url: string;
    name?: string;
    securityOrigin?: string;
}
export interface CdpFrameTree {
    frame: CdpFrame;
    childFrames?: CdpFrameTree[];
}
export interface CdpFrameTreeResponse {
    frameTree: CdpFrameTree;
}
export interface CdpScreenshotResponse {
    data: string;
}
export interface CdpCaptureEvidence {
    domSnapshot: CdpDomSnapshotResponse;
    layoutMetrics: CdpLayoutMetricsResponse;
    frameTree: CdpFrameTreeResponse;
    screenshot: CdpScreenshotResponse;
    devicePixelRatio: number;
}
export interface CdpCaptureInput {
    captureTarget: RawCaptureTarget;
    evidence: CdpCaptureEvidence;
    capturedAt: string;
    fallbackUrl?: string;
    fallbackTitle?: string;
}
export interface CdpCaptureResult {
    snapshot: RawSnapshot;
    screenshot: {
        format: "png";
        dataBase64: string;
        captureBeyondViewport: true;
    };
}
//# sourceMappingURL=types.d.ts.map