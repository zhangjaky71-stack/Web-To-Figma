export function captureStandardSnapshotInPage(input) {
    const maxNodes = Math.max(1, Math.min(input.maxNodes ?? 100_000, 200_000));
    const captureTarget = input.captureTarget;
    const nodes = [];
    const nodeIds = new Map();
    const frames = [];
    const scrollContainers = [];
    const diagnostics = [];
    const slotElements = [];
    let nodeSequence = 0;
    let frameSequence = 0;
    let budgetReported = false;
    const sensitiveNamePattern = /(?:^|[-_:])(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)(?:$|[-_:])/i;
    const sensitiveQueryPattern = /(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)/i;
    const urlAttributes = new Set(["action", "formaction", "href", "poster", "src", "cite"]);
    function safeUrl(value, baseUrl) {
        try {
            const url = new URL(value, baseUrl);
            url.username = "";
            url.password = "";
            for (const key of [...url.searchParams.keys()]) {
                if (sensitiveQueryPattern.test(key))
                    url.searchParams.delete(key);
            }
            return url.href;
        }
        catch {
            return value;
        }
    }
    function frameContext(frameId, parentFrameId, view) {
        let url = "";
        let origin = "";
        try {
            url = safeUrl(view.location.href, view.location.href);
            origin = view.location.origin;
        }
        catch {
            // Cross-origin frame details are recorded from the iframe boundary instead.
        }
        return {
            frameId,
            ...(parentFrameId === undefined ? {} : { parentFrameId }),
            ...(origin ? { origin } : {}),
            ...(url ? { url } : {}),
        };
    }
    function sanitizeAttributes(element) {
        const result = {};
        const tagName = element.tagName.toUpperCase();
        for (const attribute of [...element.attributes]) {
            const name = attribute.name.toLowerCase();
            if (name === "srcdoc" ||
                name === "style" ||
                name.startsWith("on") ||
                sensitiveNamePattern.test(name) ||
                ((tagName === "INPUT" || tagName === "TEXTAREA") && name === "value")) {
                continue;
            }
            const rawValue = attribute.value.slice(0, 16_384);
            result[name] = urlAttributes.has(name)
                ? safeUrl(rawValue, element.ownerDocument.baseURI)
                : rawValue;
        }
        return result;
    }
    function toDocumentRect(rect, offsetX, offsetY) {
        return {
            x: offsetX + rect.x,
            y: offsetY + rect.y,
            width: rect.width,
            height: rect.height,
        };
    }
    function clientRects(node, offsetX, offsetY) {
        if (node.nodeType === 1) {
            return [...node.getClientRects()].map((rect) => toDocumentRect(rect, offsetX, offsetY));
        }
        if (node.nodeType === 3 && node.textContent) {
            const range = node.ownerDocument?.createRange();
            if (!range)
                return [];
            range.selectNodeContents(node);
            return [...range.getClientRects()].map((rect) => toDocumentRect(rect, offsetX, offsetY));
        }
        return [];
    }
    function boundsForNode(node, offsetX, offsetY) {
        if (node.nodeType === 9) {
            const doc = node;
            const root = doc.documentElement;
            const body = doc.body;
            return {
                x: offsetX,
                y: offsetY,
                width: Math.max(root?.scrollWidth ?? 0, root?.clientWidth ?? 0, body?.scrollWidth ?? 0),
                height: Math.max(root?.scrollHeight ?? 0, root?.clientHeight ?? 0, body?.scrollHeight ?? 0),
            };
        }
        const rects = clientRects(node, offsetX, offsetY);
        if (rects.length === 0)
            return undefined;
        const left = Math.min(...rects.map((rect) => rect.x));
        const top = Math.min(...rects.map((rect) => rect.y));
        const right = Math.max(...rects.map((rect) => rect.x + rect.width));
        const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
    }
    function intersects(a, b) {
        return (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y);
    }
    function contains(outer, inner) {
        return (inner.x >= outer.x &&
            inner.y >= outer.y &&
            inner.x + inner.width <= outer.x + outer.width &&
            inner.y + inner.height <= outer.y + outer.height);
    }
    function isFullyExcluded(bounds) {
        if (!bounds || captureTarget.type !== "region")
            return false;
        return captureTarget.exclusions.some((item) => item.kind === "exclude" && contains(item.bounds, bounds));
    }
    function isMasked(bounds) {
        if (!bounds || captureTarget.type !== "region")
            return false;
        return captureTarget.exclusions.some((item) => intersects(item.bounds, bounds));
    }
    function sourceSelector(element) {
        const segments = [];
        let current = element;
        while (current) {
            const tag = current.tagName.toLowerCase();
            let segment = tag;
            const parent = current.parentElement;
            if (parent) {
                const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
                if (sameTag.length > 1)
                    segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
            }
            segments.unshift(segment);
            const root = current.getRootNode();
            current = parent;
            if (!current || root instanceof ShadowRoot)
                break;
        }
        return segments.join(" > ");
    }
    function createId(frameId) {
        const id = `std:${frameId}:${nodeSequence}`;
        nodeSequence += 1;
        return id;
    }
    function reportBudget(frameId) {
        if (budgetReported)
            return;
        budgetReported = true;
        diagnostics.push({
            code: "STANDARD_CAPTURE_NODE_LIMIT",
            message: `Standard capture stopped at the configured ${maxNodes} node limit`,
            frameId,
        });
    }
    function visibilityFor(element) {
        const view = element.ownerDocument.defaultView;
        if (!view)
            return undefined;
        const style = view.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visibility = style.visibility;
        return {
            display: style.display,
            visibility,
            contentVisibility: style.contentVisibility || "visible",
            opacity: Number.parseFloat(style.opacity || "1"),
            hiddenAttribute: element.hasAttribute("hidden"),
            rendered: style.display !== "none" &&
                visibility !== "hidden" &&
                visibility !== "collapse" &&
                rect.width >= 0 &&
                rect.height >= 0,
        };
    }
    function registerScrollContainer(element, captureNodeId, parentScrollContainerId, frameId) {
        const view = element.ownerDocument.defaultView;
        if (!view)
            return parentScrollContainerId;
        const style = view.getComputedStyle(element);
        const html = element;
        const scrollable = html.scrollWidth > html.clientWidth || html.scrollHeight > html.clientHeight;
        if (!scrollable)
            return parentScrollContainerId;
        const record = {
            sourceNodeId: captureNodeId,
            scrollWidth: html.scrollWidth,
            scrollHeight: html.scrollHeight,
            clientWidth: html.clientWidth,
            clientHeight: html.clientHeight,
            scrollLeft: html.scrollLeft,
            scrollTop: html.scrollTop,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            isDocumentScrollRoot: false,
            isPrimaryApplicationScrollRoot: false,
            ...(parentScrollContainerId === undefined ? {} : { parentScrollContainerId }),
        };
        scrollContainers.push(record);
        if (record.clientWidth <= 0 || record.clientHeight <= 0) {
            diagnostics.push({
                code: "STANDARD_CAPTURE_ZERO_SCROLL_VIEWPORT",
                message: "Scrollable element has a zero-size client viewport",
                frameId,
                sourceNodeId: captureNodeId,
            });
        }
        return captureNodeId;
    }
    function captureDocument(doc, context, offsetX, offsetY, sourceParentId) {
        if (nodes.length >= maxNodes) {
            reportBudget(context.frameId);
            return undefined;
        }
        const documentId = createId(context.frameId);
        const documentBounds = boundsForNode(doc, offsetX, offsetY);
        const documentNode = {
            captureNodeId: documentId,
            kind: "document",
            relationships: {
                ...(sourceParentId === undefined
                    ? {}
                    : { sourceParentId, composedParentId: sourceParentId }),
            },
            childCaptureNodeIds: [],
            frameContext: context,
            source: {},
            ...(documentBounds === undefined ? {} : { geometry: { bounds: documentBounds } }),
        };
        nodes.push(documentNode);
        nodeIds.set(doc, documentId);
        const view = doc.defaultView;
        const root = doc.documentElement;
        if (view && root) {
            scrollContainers.push({
                sourceNodeId: documentId,
                scrollWidth: root.scrollWidth,
                scrollHeight: root.scrollHeight,
                clientWidth: root.clientWidth,
                clientHeight: root.clientHeight,
                scrollLeft: view.scrollX,
                scrollTop: view.scrollY,
                overflowX: view.getComputedStyle(root).overflowX,
                overflowY: view.getComputedStyle(root).overflowY,
                isDocumentScrollRoot: true,
                isPrimaryApplicationScrollRoot: false,
            });
        }
        for (const child of [...doc.childNodes]) {
            const childId = captureNode(child, documentId, documentId, context, offsetX, offsetY, documentId);
            if (childId)
                documentNode.childCaptureNodeIds.push(childId);
        }
        return documentId;
    }
    function captureShadowRoot(root, hostId, context, offsetX, offsetY, parentScrollContainerId) {
        if (nodes.length >= maxNodes) {
            reportBudget(context.frameId);
            return undefined;
        }
        const rootId = createId(context.frameId);
        const raw = {
            captureNodeId: rootId,
            kind: "shadow-root",
            relationships: { sourceParentId: hostId, composedParentId: hostId, shadowHostId: hostId },
            childCaptureNodeIds: [],
            frameContext: context,
            source: {},
        };
        nodes.push(raw);
        nodeIds.set(root, rootId);
        for (const child of [...root.childNodes]) {
            const childId = captureNode(child, rootId, hostId, context, offsetX, offsetY, parentScrollContainerId, hostId);
            if (childId)
                raw.childCaptureNodeIds.push(childId);
        }
        return rootId;
    }
    function captureIframeDocument(element, iframeId, parentContext, iframeBounds) {
        frameSequence += 1;
        const childFrameId = `${parentContext.frameId}.iframe-${frameSequence}`;
        let childDoc = null;
        let childView = null;
        try {
            childDoc = element.contentDocument;
            childView = element.contentWindow;
            if (childDoc)
                void childDoc.documentElement;
            if (childView)
                void childView.location.href;
        }
        catch {
            childDoc = null;
            childView = null;
        }
        if (!childDoc || !childView) {
            const rawSrc = element.getAttribute("src") ?? "";
            const url = rawSrc ? safeUrl(rawSrc, element.ownerDocument.baseURI) : undefined;
            const context = {
                frameId: childFrameId,
                parentFrameId: parentContext.frameId,
                ...(url ? { url } : {}),
            };
            frames.push({
                context,
                accessible: false,
                inaccessibleReason: "cross-origin-or-inaccessible",
            });
            diagnostics.push({
                code: "STANDARD_CAPTURE_FRAME_INACCESSIBLE",
                message: "iframe content is cross-origin, sandboxed, or otherwise unavailable to Standard capture",
                frameId: childFrameId,
                sourceNodeId: iframeId,
            });
            return;
        }
        const context = frameContext(childFrameId, parentContext.frameId, childView);
        const frameRecord = { context, accessible: true };
        frames.push(frameRecord);
        const childRoot = captureDocument(childDoc, context, (iframeBounds?.x ?? 0) + element.clientLeft, (iframeBounds?.y ?? 0) + element.clientTop, iframeId);
        if (childRoot)
            frameRecord.rootCaptureNodeId = childRoot;
    }
    function captureNode(node, sourceParentId, composedParentId, context, offsetX, offsetY, parentScrollContainerId, shadowHostId) {
        if (nodes.length >= maxNodes) {
            reportBudget(context.frameId);
            return undefined;
        }
        if (node.nodeType === 3) {
            if (!node.textContent)
                return undefined;
            const bounds = boundsForNode(node, offsetX, offsetY);
            if (isFullyExcluded(bounds))
                return undefined;
            const captureNodeId = createId(context.frameId);
            const masked = isMasked(bounds);
            const rects = clientRects(node, offsetX, offsetY);
            const raw = {
                captureNodeId,
                kind: "text",
                relationships: {
                    sourceParentId,
                    composedParentId,
                    ...(shadowHostId === undefined ? {} : { shadowHostId }),
                },
                childCaptureNodeIds: [],
                frameContext: context,
                source: {},
                ...(bounds === undefined ? {} : { geometry: { bounds, clientRects: rects } }),
                ...(masked ? {} : { textContent: node.textContent }),
            };
            nodes.push(raw);
            nodeIds.set(node, captureNodeId);
            return captureNodeId;
        }
        if (node.nodeType === 8) {
            if (!input.includeComments)
                return undefined;
            const captureNodeId = createId(context.frameId);
            const raw = {
                captureNodeId,
                kind: "comment",
                relationships: {
                    sourceParentId,
                    composedParentId,
                    ...(shadowHostId === undefined ? {} : { shadowHostId }),
                },
                childCaptureNodeIds: [],
                frameContext: context,
                source: {},
            };
            nodes.push(raw);
            nodeIds.set(node, captureNodeId);
            return captureNodeId;
        }
        if (node.nodeType !== 1)
            return undefined;
        const element = node;
        const bounds = boundsForNode(element, offsetX, offsetY);
        if (isFullyExcluded(bounds))
            return undefined;
        const captureNodeId = createId(context.frameId);
        const masked = isMasked(bounds);
        const tagName = element.tagName.toUpperCase();
        const kind = tagName === "IFRAME" ? "iframe" : tagName === "SLOT" ? "slot" : "element";
        const namespace = element.namespaceURI;
        const role = element.getAttribute("role");
        const source = {
            tagName,
            ...(namespace === null ? {} : { namespace }),
            ...(role === null ? {} : { role }),
            sourceSelector: sourceSelector(element),
            ...(masked ? {} : { attributes: sanitizeAttributes(element) }),
        };
        const visibility = visibilityFor(element);
        const raw = {
            captureNodeId,
            kind,
            relationships: {
                sourceParentId,
                composedParentId,
                ...(shadowHostId === undefined ? {} : { shadowHostId }),
            },
            childCaptureNodeIds: [],
            frameContext: context,
            source,
            ...(bounds === undefined
                ? {}
                : { geometry: { bounds, clientRects: clientRects(element, offsetX, offsetY) } }),
            ...(visibility === undefined ? {} : { visibility }),
        };
        nodes.push(raw);
        nodeIds.set(node, captureNodeId);
        const currentScrollContainerId = registerScrollContainer(element, captureNodeId, parentScrollContainerId, context.frameId);
        if (tagName === "SLOT") {
            slotElements.push({ element: element, captureNodeId });
        }
        const isFormValueContainer = tagName === "INPUT" || tagName === "TEXTAREA";
        if (!isFormValueContainer) {
            for (const child of [...element.childNodes]) {
                const childId = captureNode(child, captureNodeId, captureNodeId, context, offsetX, offsetY, currentScrollContainerId, shadowHostId);
                if (childId)
                    raw.childCaptureNodeIds.push(childId);
            }
        }
        const shadow = element.shadowRoot;
        if (shadow?.mode === "open") {
            const shadowId = captureShadowRoot(shadow, captureNodeId, context, offsetX, offsetY, currentScrollContainerId);
            if (shadowId)
                raw.childCaptureNodeIds.push(shadowId);
        }
        if (tagName === "IFRAME" && !masked) {
            captureIframeDocument(element, captureNodeId, context, bounds);
        }
        return captureNodeId;
    }
    const mainContext = frameContext("frame-main", undefined, window);
    const mainFrame = { context: mainContext, accessible: true };
    frames.push(mainFrame);
    const rootCaptureNodeId = captureDocument(document, mainContext, window.scrollX, window.scrollY);
    if (!rootCaptureNodeId)
        throw new Error("Standard capture could not create the document root");
    mainFrame.rootCaptureNodeId = rootCaptureNodeId;
    for (const slot of slotElements) {
        let assigned = [];
        try {
            assigned = slot.element.assignedNodes({ flatten: true });
        }
        catch {
            assigned = [];
        }
        for (const assignedNode of assigned) {
            const assignedId = nodeIds.get(assignedNode);
            if (!assignedId)
                continue;
            const raw = nodes.find((item) => item.captureNodeId === assignedId);
            if (!raw)
                continue;
            raw.relationships.composedParentId = slot.captureNodeId;
            raw.relationships.assignedSlotId = slot.captureNodeId;
        }
    }
    const nonDocumentScroll = scrollContainers.filter((item) => !item.isDocumentScrollRoot);
    const primary = nonDocumentScroll
        .filter((item) => item.clientWidth > 0 && item.clientHeight > 0)
        .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (primary &&
        primary.clientWidth * primary.clientHeight >= window.innerWidth * window.innerHeight * 0.5) {
        primary.isPrimaryApplicationScrollRoot = true;
    }
    let finalNodes = nodes;
    if (captureTarget.type === "region") {
        const nodeById = new Map(nodes.map((node) => [node.captureNodeId, node]));
        const keep = new Set([rootCaptureNodeId]);
        for (const node of nodes) {
            const bounds = node.geometry?.bounds;
            if (bounds && intersects(bounds, captureTarget.bounds))
                keep.add(node.captureNodeId);
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const id of [...keep]) {
                const node = nodeById.get(id);
                if (!node)
                    continue;
                for (const field of [
                    "sourceParentId",
                    "composedParentId",
                    "assignedSlotId",
                    "shadowHostId",
                ]) {
                    const relation = node.relationships[field];
                    if (relation && !keep.has(relation)) {
                        keep.add(relation);
                        changed = true;
                    }
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
    const usedFrameIds = new Set(finalNodes.map((node) => node.frameContext.frameId));
    for (const diagnostic of diagnostics) {
        if (diagnostic.frameId &&
            (diagnostic.sourceNodeId === undefined || finalNodeIds.has(diagnostic.sourceNodeId))) {
            usedFrameIds.add(diagnostic.frameId);
        }
    }
    let frameClosureChanged = true;
    while (frameClosureChanged) {
        frameClosureChanged = false;
        for (const frame of frames) {
            if (!usedFrameIds.has(frame.context.frameId))
                continue;
            const parentId = frame.context.parentFrameId;
            if (parentId && !usedFrameIds.has(parentId)) {
                usedFrameIds.add(parentId);
                frameClosureChanged = true;
            }
        }
    }
    const finalFrames = frames
        .filter((frame) => usedFrameIds.has(frame.context.frameId))
        .map((frame) => {
        if (!frame.rootCaptureNodeId || finalNodeIds.has(frame.rootCaptureNodeId))
            return frame;
        return {
            context: frame.context,
            accessible: frame.accessible,
            ...(frame.inaccessibleReason === undefined
                ? {}
                : { inaccessibleReason: frame.inaccessibleReason }),
        };
    });
    const snapshot = {
        version: "1.0.0",
        adapter: "standard",
        capturedAt: new Date().toISOString(),
        url: safeUrl(window.location.href, window.location.href),
        title: document.title,
        rootCaptureNodeId,
        captureTarget,
        environment: {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scale: {
                context: {
                    devicePixelRatio: window.devicePixelRatio,
                    ...(window.visualViewport?.scale === undefined
                        ? {}
                        : { visualViewportScale: window.visualViewport.scale }),
                },
                browserPageZoomAvailability: "unavailable",
                cssZoomAvailability: "unavailable",
                reasons: [
                    "Standard page APIs expose DPR and visual viewport scale but cannot reliably separate browser page zoom from OS display scaling.",
                    "CSS zoom is element-scoped evidence and is intentionally deferred to authored/computed CSS capture.",
                ],
            },
        },
        nodes: finalNodes,
        frames: finalFrames,
        scrollContainers: scrollContainers.filter((item) => finalNodeIds.has(item.sourceNodeId)),
        diagnostics,
    };
    return { snapshot };
}
//# sourceMappingURL=capture.js.map