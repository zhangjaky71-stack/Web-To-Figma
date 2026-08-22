export const CDP_COMPUTED_STYLE_PROPERTIES = [
    "display",
    "visibility",
    "content-visibility",
    "opacity",
    "overflow-x",
    "overflow-y",
    "position",
];
const SENSITIVE_ATTRIBUTE_PATTERN = /(?:^|[-_:])(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)(?:$|[-_:])/i;
const SENSITIVE_QUERY_PATTERN = /(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)/i;
const URL_ATTRIBUTES = new Set(["action", "formaction", "href", "poster", "src", "cite"]);
function stringAt(strings, index) {
    return typeof index === "number" && index >= 0 && index < strings.length
        ? (strings[index] ?? "")
        : "";
}
function rareInteger(data, nodeIndex) {
    if (!data)
        return undefined;
    const position = data.index.indexOf(nodeIndex);
    return position < 0 ? undefined : data.value[position];
}
function rareString(data, nodeIndex, strings) {
    if (!data)
        return undefined;
    const position = data.index.indexOf(nodeIndex);
    if (position < 0)
        return undefined;
    const value = stringAt(strings, data.value[position]);
    return value || undefined;
}
function rectangle(value) {
    if (!value || value.length < 4)
        return undefined;
    const [x, y, width, height] = value;
    if (![x, y, width, height].every((item) => typeof item === "number" && Number.isFinite(item))) {
        return undefined;
    }
    return { x: x, y: y, width: Math.max(0, width), height: Math.max(0, height) };
}
function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function contains(outer, inner) {
    return (inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height);
}
function safeUrl(value, baseUrl) {
    try {
        const url = new URL(value, baseUrl);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_QUERY_PATTERN.test(key))
                url.searchParams.delete(key);
        }
        return url.href;
    }
    catch {
        return value;
    }
}
function sanitizeAttributes(nodeName, encoded, strings, baseUrl) {
    const result = {};
    if (!encoded)
        return result;
    for (let index = 0; index + 1 < encoded.length; index += 2) {
        const name = stringAt(strings, encoded[index]).toLowerCase();
        if (!name)
            continue;
        if (name === "srcdoc" ||
            name === "style" ||
            name.startsWith("on") ||
            SENSITIVE_ATTRIBUTE_PATTERN.test(name) ||
            ((nodeName === "INPUT" || nodeName === "TEXTAREA") && name === "value")) {
            continue;
        }
        const raw = stringAt(strings, encoded[index + 1]).slice(0, 16_384);
        result[name] = URL_ATTRIBUTES.has(name) ? safeUrl(raw, baseUrl) : raw;
    }
    return result;
}
function flattenFrameTree(tree, result = new Map()) {
    result.set(tree.frame.id, tree.frame);
    for (const child of tree.childFrames ?? [])
        flattenFrameTree(child, result);
    return result;
}
function layoutLookup(layout) {
    return new Map(layout.nodeIndex.map((nodeIndex, layoutIndex) => [nodeIndex, layoutIndex]));
}
function nodeKind(nodeType, nodeName, shadowRootType) {
    if (nodeType === 9)
        return "document";
    if (nodeType === 3)
        return "text";
    if (nodeType === 8)
        return "comment";
    if (nodeType === 11 && shadowRootType)
        return "shadow-root";
    if (nodeType !== 1 && nodeType !== 11)
        return undefined;
    if (nodeName === "IFRAME" || nodeName === "FRAME")
        return "iframe";
    if (nodeName === "SLOT")
        return "slot";
    return "element";
}
function stylesFor(layout, layoutIndex, strings) {
    const values = layoutIndex === undefined ? undefined : layout.styles[layoutIndex];
    const output = {};
    CDP_COMPUTED_STYLE_PROPERTIES.forEach((property, index) => {
        output[property] = stringAt(strings, values?.[index]);
    });
    return output;
}
function makeNodeId(documentIndex, nodeIndex, backendNodeId) {
    return `cdp:${documentIndex}:${backendNodeId ?? nodeIndex}`;
}
function findDocumentRootIndex(nodes) {
    const index = nodes.nodeType.findIndex((value) => value === 9);
    return index >= 0 ? index : 0;
}
function buildDocumentNodeIds(documentIndex, document) {
    return document.nodes.nodeType.map((_, nodeIndex) => makeNodeId(documentIndex, nodeIndex, document.nodes.backendNodeId[nodeIndex]));
}
function documentUrl(document, strings, fallback) {
    const raw = stringAt(strings, document.documentURL) || fallback;
    return raw ? safeUrl(raw, raw) : "";
}
function frameContextFor(frameId, frames, fallbackUrl) {
    const frame = frames.get(frameId);
    const url = frame?.url ? safeUrl(frame.url, frame.url) : fallbackUrl;
    let origin = frame?.securityOrigin;
    if (!origin && url) {
        try {
            origin = new URL(url).origin;
        }
        catch {
            origin = undefined;
        }
    }
    return {
        frameId,
        ...(frame?.parentId ? { parentFrameId: frame.parentId } : {}),
        ...(origin ? { origin } : {}),
        ...(url ? { url } : {}),
    };
}
export function normalizeCdpCapture(input) {
    const { domSnapshot, layoutMetrics, frameTree, screenshot } = input.evidence;
    if (domSnapshot.documents.length === 0)
        throw new Error("CDP DOMSnapshot returned no documents");
    if (!screenshot.data)
        throw new Error("CDP Page.captureScreenshot returned no data");
    const strings = domSnapshot.strings;
    const frameMap = flattenFrameTree(frameTree.frameTree);
    const nodeIdsByDocument = domSnapshot.documents.map((document, index) => buildDocumentNodeIds(index, document));
    const documentFrameIds = domSnapshot.documents.map((document, index) => {
        const value = stringAt(strings, document.frameId);
        return value || `cdp-document-${index}`;
    });
    const documentOwner = new Map();
    domSnapshot.documents.forEach((document, documentIndex) => {
        document.nodes.nodeType.forEach((_, nodeIndex) => {
            const childDocumentIndex = rareInteger(document.nodes.contentDocumentIndex, nodeIndex);
            if (childDocumentIndex !== undefined) {
                documentOwner.set(childDocumentIndex, { documentIndex, nodeIndex });
            }
        });
    });
    const nodes = [];
    const frames = [];
    const diagnostics = [];
    domSnapshot.documents.forEach((document, documentIndex) => {
        const frameId = documentFrameIds[documentIndex];
        const url = documentUrl(document, strings, input.fallbackUrl ?? "");
        const context = frameContextFor(frameId, frameMap, url);
        const owner = documentOwner.get(documentIndex);
        if (owner) {
            const parentFrameId = documentFrameIds[owner.documentIndex];
            if (parentFrameId !== undefined)
                context.parentFrameId = parentFrameId;
        }
        const rootIndex = findDocumentRootIndex(document.nodes);
        frames.push({
            context,
            rootCaptureNodeId: nodeIdsByDocument[documentIndex][rootIndex],
            accessible: true,
        });
        const layoutMap = layoutLookup(document.layout);
        const baseUrl = stringAt(strings, document.baseURL) || url;
        document.nodes.nodeType.forEach((type, nodeIndex) => {
            const nodeName = stringAt(strings, document.nodes.nodeName[nodeIndex]).toUpperCase();
            const shadowRootType = rareString(document.nodes.shadowRootType, nodeIndex, strings);
            const kind = nodeKind(type, nodeName, shadowRootType);
            if (!kind)
                return;
            const captureNodeId = nodeIdsByDocument[documentIndex][nodeIndex];
            const parentIndex = document.nodes.parentIndex[nodeIndex];
            const ownerForRoot = nodeIndex === rootIndex ? owner : undefined;
            const parentCaptureNodeId = ownerForRoot
                ? nodeIdsByDocument[ownerForRoot.documentIndex]?.[ownerForRoot.nodeIndex]
                : typeof parentIndex === "number" && parentIndex >= 0
                    ? nodeIdsByDocument[documentIndex]?.[parentIndex]
                    : undefined;
            const layoutIndex = layoutMap.get(nodeIndex);
            const bounds = rectangle(layoutIndex === undefined ? undefined : document.layout.bounds[layoutIndex]);
            if (input.captureTarget.type === "region" &&
                bounds &&
                input.captureTarget.exclusions.some((item) => item.kind === "exclude" && contains(item.bounds, bounds))) {
                return;
            }
            const masked = input.captureTarget.type === "region" &&
                bounds !== undefined &&
                input.captureTarget.exclusions.some((item) => item.kind === "redact" && intersects(item.bounds, bounds));
            const computed = stylesFor(document.layout, layoutIndex, strings);
            const attributes = sanitizeAttributes(nodeName, document.nodes.attributes[nodeIndex], strings, baseUrl);
            const hiddenAttribute = Object.hasOwn(attributes, "hidden");
            const rendered = layoutIndex !== undefined &&
                computed.display !== "none" &&
                computed.visibility !== "hidden" &&
                computed.visibility !== "collapse";
            const nodeValue = stringAt(strings, document.nodes.nodeValue[nodeIndex]);
            const clientRect = rectangle(layoutIndex === undefined ? undefined : document.layout.clientRects?.[layoutIndex]);
            const paintOrder = layoutIndex === undefined ? undefined : document.layout.paintOrders?.[layoutIndex];
            const raw = {
                captureNodeId,
                kind,
                relationships: {
                    ...(parentCaptureNodeId
                        ? { sourceParentId: parentCaptureNodeId, composedParentId: parentCaptureNodeId }
                        : {}),
                },
                childCaptureNodeIds: [],
                frameContext: context,
                source: {
                    ...(nodeName && !nodeName.startsWith("#") ? { tagName: nodeName } : {}),
                    ...(masked ? {} : { attributes }),
                    ...(typeof document.nodes.backendNodeId[nodeIndex] === "number"
                        ? { backendNodeId: document.nodes.backendNodeId[nodeIndex] }
                        : {}),
                },
                ...(bounds
                    ? { geometry: { bounds, ...(clientRect ? { clientRects: [clientRect] } : {}) } }
                    : {}),
                ...(layoutIndex === undefined
                    ? {}
                    : {
                        visibility: {
                            display: computed.display || "",
                            visibility: computed.visibility || "",
                            ...(computed["content-visibility"]
                                ? { contentVisibility: computed["content-visibility"] }
                                : {}),
                            opacity: Number.parseFloat(computed.opacity || "1"),
                            hiddenAttribute,
                            rendered,
                        },
                    }),
                ...(kind === "text" && !masked && nodeValue ? { textContent: nodeValue } : {}),
                ...(typeof paintOrder === "number" ? { paintOrder } : {}),
            };
            nodes.push(raw);
        });
    });
    const nodeById = new Map(nodes.map((node) => [node.captureNodeId, node]));
    for (const node of nodes) {
        const parentId = node.relationships.sourceParentId;
        if (parentId)
            nodeById.get(parentId)?.childCaptureNodeIds.push(node.captureNodeId);
    }
    for (const frame of frameMap.values()) {
        if (frames.some((item) => item.context.frameId === frame.id))
            continue;
        frames.push({
            context: frameContextFor(frame.id, frameMap, frame.url),
            accessible: false,
            inaccessibleReason: "frame-not-present-in-root-domsnapshot",
        });
        diagnostics.push({
            code: "CDP_FRAME_DOCUMENT_UNAVAILABLE",
            message: "Frame is present in Page.getFrameTree but absent from the root DOMSnapshot; it may be an out-of-process iframe target.",
            frameId: frame.id,
        });
    }
    let finalNodes = nodes;
    const rootDocument = domSnapshot.documents[0];
    const rootIndex = findDocumentRootIndex(rootDocument.nodes);
    const rootCaptureNodeId = nodeIdsByDocument[0][rootIndex];
    if (input.captureTarget.type === "region") {
        const keep = new Set([rootCaptureNodeId]);
        for (const node of nodes) {
            const bounds = node.geometry?.bounds;
            if (bounds && intersects(bounds, input.captureTarget.bounds))
                keep.add(node.captureNodeId);
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const id of [...keep]) {
                const node = nodeById.get(id);
                const parentId = node?.relationships.sourceParentId;
                if (parentId && !keep.has(parentId)) {
                    keep.add(parentId);
                    changed = true;
                }
            }
        }
        finalNodes = nodes
            .filter((node) => keep.has(node.captureNodeId))
            .map((node) => ({
            ...node,
            childCaptureNodeIds: node.childCaptureNodeIds.filter((id) => keep.has(id)),
        }));
    }
    const finalNodeIds = new Set(finalNodes.map((node) => node.captureNodeId));
    const finalFrameIds = new Set(finalNodes.map((node) => node.frameContext.frameId));
    for (const diagnostic of diagnostics)
        if (diagnostic.frameId)
            finalFrameIds.add(diagnostic.frameId);
    let frameChanged = true;
    while (frameChanged) {
        frameChanged = false;
        for (const frame of frames) {
            if (!finalFrameIds.has(frame.context.frameId))
                continue;
            const parent = frame.context.parentFrameId;
            if (parent && !finalFrameIds.has(parent)) {
                finalFrameIds.add(parent);
                frameChanged = true;
            }
        }
    }
    const finalFrames = frames
        .filter((frame) => finalFrameIds.has(frame.context.frameId))
        .map((frame) => frame.rootCaptureNodeId && !finalNodeIds.has(frame.rootCaptureNodeId)
        ? {
            context: frame.context,
            accessible: frame.accessible,
            ...(frame.inaccessibleReason ? { inaccessibleReason: frame.inaccessibleReason } : {}),
        }
        : frame);
    const cssLayout = layoutMetrics.cssLayoutViewport ?? layoutMetrics.layoutViewport;
    const cssVisual = layoutMetrics.cssVisualViewport ?? layoutMetrics.visualViewport;
    const contentSize = layoutMetrics.cssContentSize ?? layoutMetrics.contentSize;
    const browserPageZoom = cssVisual?.zoom;
    const visualViewportScale = cssVisual?.scale;
    const rootFrame = frameTree.frameTree.frame;
    const rootUrl = documentUrl(rootDocument, strings, input.fallbackUrl ?? rootFrame.url);
    const rootTitle = stringAt(strings, rootDocument.title) || input.fallbackTitle || "";
    const scrollContainers = [];
    if (finalNodeIds.has(rootCaptureNodeId)) {
        const rootBounds = finalNodes.find((node) => node.captureNodeId === rootCaptureNodeId)?.geometry
            ?.bounds;
        scrollContainers.push({
            sourceNodeId: rootCaptureNodeId,
            scrollWidth: rootDocument.contentWidth ?? contentSize?.width ?? rootBounds?.width ?? 0,
            scrollHeight: rootDocument.contentHeight ?? contentSize?.height ?? rootBounds?.height ?? 0,
            clientWidth: cssLayout?.clientWidth ?? cssVisual?.clientWidth ?? 0,
            clientHeight: cssLayout?.clientHeight ?? cssVisual?.clientHeight ?? 0,
            scrollLeft: rootDocument.scrollOffsetX ?? cssLayout?.pageX ?? 0,
            scrollTop: rootDocument.scrollOffsetY ?? cssLayout?.pageY ?? 0,
            overflowX: "",
            overflowY: "",
            isDocumentScrollRoot: true,
            isPrimaryApplicationScrollRoot: false,
        });
    }
    const snapshot = {
        version: "1.0.0",
        adapter: "cdp",
        capturedAt: input.capturedAt,
        url: rootUrl,
        title: rootTitle,
        rootCaptureNodeId,
        captureTarget: input.captureTarget,
        environment: {
            viewportWidth: cssVisual?.clientWidth ?? cssLayout?.clientWidth ?? contentSize?.width ?? 0,
            viewportHeight: cssVisual?.clientHeight ?? cssLayout?.clientHeight ?? contentSize?.height ?? 0,
            scale: {
                context: {
                    devicePixelRatio: input.evidence.devicePixelRatio,
                    ...(typeof browserPageZoom === "number" && browserPageZoom > 0
                        ? { browserPageZoom }
                        : {}),
                    ...(typeof visualViewportScale === "number" && visualViewportScale > 0
                        ? { visualViewportScale }
                        : {}),
                },
                browserPageZoomAvailability: typeof browserPageZoom === "number" && browserPageZoom > 0 ? "observed" : "unavailable",
                cssZoomAvailability: "unavailable",
                reasons: [
                    "CDP Page.getLayoutMetrics supplies CSS visual viewport zoom when available.",
                    "Element-scoped CSS zoom remains deferred to CSS capture semantics.",
                ],
            },
            layoutMetrics: {
                ...(contentSize ? { contentSize } : {}),
                ...(cssLayout ? { layoutViewport: cssLayout } : {}),
                ...(cssVisual ? { visualViewport: cssVisual } : {}),
            },
        },
        nodes: finalNodes,
        frames: finalFrames,
        scrollContainers,
        diagnostics,
    };
    return {
        snapshot,
        screenshot: {
            format: "png",
            dataBase64: screenshot.data,
            captureBeyondViewport: true,
        },
    };
}
//# sourceMappingURL=normalize.js.map