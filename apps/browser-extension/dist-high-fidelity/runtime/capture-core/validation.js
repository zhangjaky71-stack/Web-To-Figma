import { RAW_SNAPSHOT_VERSION } from "./types.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isPositiveFiniteNumber(value) {
    return isFiniteNumber(value) && value > 0;
}
function isNonNegativeFiniteNumber(value) {
    return isFiniteNumber(value) && value >= 0;
}
function isRect(value) {
    if (!isRecord(value))
        return false;
    return (isFiniteNumber(value.x) &&
        isFiniteNumber(value.y) &&
        isNonNegativeFiniteNumber(value.width) &&
        isNonNegativeFiniteNumber(value.height));
}
function rectContains(outer, inner) {
    if (!isRecord(outer) || !isRecord(inner) || !isRect(outer) || !isRect(inner))
        return false;
    const outerX = outer.x;
    const outerY = outer.y;
    const outerWidth = outer.width;
    const outerHeight = outer.height;
    const innerX = inner.x;
    const innerY = inner.y;
    const innerWidth = inner.width;
    const innerHeight = inner.height;
    return (innerX >= outerX &&
        innerY >= outerY &&
        innerX + innerWidth <= outerX + outerWidth &&
        innerY + innerHeight <= outerY + outerHeight);
}
function isFrameContext(value) {
    if (!isRecord(value) || !isNonEmptyString(value.frameId))
        return false;
    for (const field of ["parentFrameId", "origin", "url"]) {
        const candidate = value[field];
        if (candidate !== undefined && !isNonEmptyString(candidate))
            return false;
    }
    return true;
}
function isScaleContext(value) {
    if (!isRecord(value) || !isPositiveFiniteNumber(value.devicePixelRatio))
        return false;
    for (const field of ["browserPageZoom", "cssZoom", "visualViewportScale"]) {
        const candidate = value[field];
        if (candidate !== undefined && !isPositiveFiniteNumber(candidate))
            return false;
    }
    return true;
}
function isScaleAvailability(value) {
    return value === "observed" || value === "unavailable" || value === "not-applicable";
}
function isScaleEvidence(value) {
    if (!isRecord(value) || !isScaleContext(value.context))
        return false;
    return (isScaleAvailability(value.browserPageZoomAvailability) &&
        isScaleAvailability(value.cssZoomAvailability) &&
        Array.isArray(value.reasons) &&
        value.reasons.every((reason) => typeof reason === "string"));
}
function isLayoutViewport(value) {
    return (isRecord(value) &&
        [value.pageX, value.pageY, value.clientWidth, value.clientHeight].every(isFiniteNumber) &&
        isNonNegativeFiniteNumber(value.clientWidth) &&
        isNonNegativeFiniteNumber(value.clientHeight));
}
function isVisualViewport(value) {
    if (!isRecord(value))
        return false;
    if (![
        value.offsetX,
        value.offsetY,
        value.pageX,
        value.pageY,
        value.clientWidth,
        value.clientHeight,
    ].every(isFiniteNumber) ||
        !isNonNegativeFiniteNumber(value.clientWidth) ||
        !isNonNegativeFiniteNumber(value.clientHeight) ||
        !isPositiveFiniteNumber(value.scale)) {
        return false;
    }
    return value.zoom === undefined || isPositiveFiniteNumber(value.zoom);
}
function isLayoutMetricsEvidence(value) {
    if (!isRecord(value))
        return false;
    return ((value.contentSize === undefined || isRect(value.contentSize)) &&
        (value.layoutViewport === undefined || isLayoutViewport(value.layoutViewport)) &&
        (value.visualViewport === undefined || isVisualViewport(value.visualViewport)));
}
function isRawCaptureTarget(value) {
    if (!isRecord(value))
        return false;
    if (value.type === "document")
        return true;
    if (value.type !== "region" || !isRect(value.bounds) || !Array.isArray(value.exclusions)) {
        return false;
    }
    return value.exclusions.every((item) => isRecord(item) &&
        (item.kind === "redact" || item.kind === "exclude") &&
        isRect(item.bounds) &&
        rectContains(value.bounds, item.bounds));
}
function isRawNode(value) {
    if (!isRecord(value) || !isNonEmptyString(value.captureNodeId))
        return false;
    if (!["document", "element", "text", "shadow-root", "iframe", "slot", "comment"].includes(String(value.kind))) {
        return false;
    }
    if (!isRecord(value.relationships) || !Array.isArray(value.childCaptureNodeIds))
        return false;
    if (!value.childCaptureNodeIds.every(isNonEmptyString))
        return false;
    if (new Set(value.childCaptureNodeIds).size !== value.childCaptureNodeIds.length)
        return false;
    if (!isFrameContext(value.frameContext) || !isRecord(value.source))
        return false;
    if (value.geometry !== undefined) {
        if (!isRecord(value.geometry) || !isRect(value.geometry.bounds))
            return false;
        if (value.geometry.clientRects !== undefined &&
            (!Array.isArray(value.geometry.clientRects) || !value.geometry.clientRects.every(isRect))) {
            return false;
        }
        if (value.geometry.scrollContainerId !== undefined &&
            !isNonEmptyString(value.geometry.scrollContainerId)) {
            return false;
        }
    }
    if (value.visibility !== undefined) {
        if (!isRecord(value.visibility))
            return false;
        if (typeof value.visibility.display !== "string" ||
            typeof value.visibility.visibility !== "string" ||
            (value.visibility.contentVisibility !== undefined &&
                typeof value.visibility.contentVisibility !== "string") ||
            !isFiniteNumber(value.visibility.opacity) ||
            typeof value.visibility.hiddenAttribute !== "boolean" ||
            typeof value.visibility.rendered !== "boolean") {
            return false;
        }
    }
    if (value.textContent !== undefined && typeof value.textContent !== "string")
        return false;
    if (value.paintOrder !== undefined && !isNonNegativeFiniteNumber(value.paintOrder))
        return false;
    if (value.source.backendNodeId !== undefined &&
        !isNonNegativeFiniteNumber(value.source.backendNodeId)) {
        return false;
    }
    if (value.source.attributes !== undefined) {
        if (!isRecord(value.source.attributes))
            return false;
        if (!Object.values(value.source.attributes).every((item) => typeof item === "string")) {
            return false;
        }
    }
    return true;
}
function isRawDiagnostic(value) {
    if (!isRecord(value) || !isNonEmptyString(value.code) || !isNonEmptyString(value.message)) {
        return false;
    }
    for (const field of ["frameId", "sourceNodeId"]) {
        const candidate = value[field];
        if (candidate !== undefined && !isNonEmptyString(candidate))
            return false;
    }
    return true;
}
export function isRawSnapshot(value) {
    if (!isRecord(value))
        return false;
    if (value.version !== RAW_SNAPSHOT_VERSION ||
        (value.adapter !== "standard" && value.adapter !== "cdp") ||
        !isNonEmptyString(value.capturedAt) ||
        Number.isNaN(Date.parse(value.capturedAt)) ||
        typeof value.url !== "string" ||
        typeof value.title !== "string" ||
        !isNonEmptyString(value.rootCaptureNodeId) ||
        !isRawCaptureTarget(value.captureTarget) ||
        !isRecord(value.environment) ||
        !isNonNegativeFiniteNumber(value.environment.viewportWidth) ||
        !isNonNegativeFiniteNumber(value.environment.viewportHeight) ||
        !isScaleEvidence(value.environment.scale) ||
        (value.environment.layoutMetrics !== undefined &&
            !isLayoutMetricsEvidence(value.environment.layoutMetrics)) ||
        !Array.isArray(value.nodes) ||
        !Array.isArray(value.frames) ||
        !Array.isArray(value.scrollContainers) ||
        !Array.isArray(value.diagnostics) ||
        !value.diagnostics.every(isRawDiagnostic)) {
        return false;
    }
    if (!value.nodes.every(isRawNode))
        return false;
    const nodes = value.nodes;
    const nodeIds = new Set();
    for (const node of nodes) {
        if (nodeIds.has(node.captureNodeId))
            return false;
        nodeIds.add(node.captureNodeId);
    }
    if (!nodeIds.has(value.rootCaptureNodeId))
        return false;
    for (const node of nodes) {
        for (const childId of node.childCaptureNodeIds) {
            if (!nodeIds.has(childId))
                return false;
        }
        for (const field of [
            "sourceParentId",
            "composedParentId",
            "renderParentId",
            "assignedSlotId",
            "shadowHostId",
        ]) {
            const reference = node.relationships[field];
            if (reference !== undefined && !nodeIds.has(reference))
                return false;
        }
    }
    const frameIds = new Set();
    for (const frame of value.frames) {
        if (!isRecord(frame) ||
            !isFrameContext(frame.context) ||
            typeof frame.accessible !== "boolean") {
            return false;
        }
        const context = frame.context;
        if (frameIds.has(context.frameId))
            return false;
        frameIds.add(context.frameId);
        if (frame.rootCaptureNodeId !== undefined &&
            (!isNonEmptyString(frame.rootCaptureNodeId) || !nodeIds.has(frame.rootCaptureNodeId))) {
            return false;
        }
        if (frame.inaccessibleReason !== undefined && !isNonEmptyString(frame.inaccessibleReason)) {
            return false;
        }
    }
    for (const frame of value.frames) {
        if (!isRecord(frame) || !isRecord(frame.context))
            return false;
        const parentFrameId = frame.context.parentFrameId;
        if (parentFrameId !== undefined &&
            (!isNonEmptyString(parentFrameId) || !frameIds.has(parentFrameId))) {
            return false;
        }
    }
    for (const node of nodes) {
        if (!frameIds.has(node.frameContext.frameId))
            return false;
    }
    const scrollNodeIds = new Set();
    for (const item of value.scrollContainers) {
        if (!isRecord(item) ||
            !isNonEmptyString(item.sourceNodeId) ||
            !nodeIds.has(item.sourceNodeId) ||
            scrollNodeIds.has(item.sourceNodeId) ||
            ![
                item.scrollWidth,
                item.scrollHeight,
                item.clientWidth,
                item.clientHeight,
                item.scrollLeft,
                item.scrollTop,
            ].every(isFiniteNumber) ||
            typeof item.overflowX !== "string" ||
            typeof item.overflowY !== "string" ||
            typeof item.isDocumentScrollRoot !== "boolean" ||
            typeof item.isPrimaryApplicationScrollRoot !== "boolean") {
            return false;
        }
        scrollNodeIds.add(item.sourceNodeId);
    }
    for (const item of value.scrollContainers) {
        if (!isRecord(item))
            return false;
        const parent = item.parentScrollContainerId;
        if (parent !== undefined && (!isNonEmptyString(parent) || !scrollNodeIds.has(parent))) {
            return false;
        }
    }
    for (const diagnostic of value.diagnostics) {
        if (!isRecord(diagnostic))
            return false;
        if (diagnostic.frameId !== undefined && !frameIds.has(String(diagnostic.frameId)))
            return false;
        if (diagnostic.sourceNodeId !== undefined && !nodeIds.has(String(diagnostic.sourceNodeId))) {
            return false;
        }
    }
    return true;
}
export function summarizeRawSnapshot(snapshot) {
    if (!isRawSnapshot(snapshot))
        throw new TypeError("invalid RawSnapshot");
    return {
        version: snapshot.version,
        adapter: snapshot.adapter,
        nodeCount: snapshot.nodes.length,
        frameCount: snapshot.frames.length,
        scrollContainerCount: snapshot.scrollContainers.length,
        diagnosticCount: snapshot.diagnostics.length,
    };
}
//# sourceMappingURL=validation.js.map