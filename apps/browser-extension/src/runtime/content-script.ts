(() => {
  type ContentRequest =
    | { type: "W2F_PROBE_PAGE"; jobId: string }
    | { type: "W2F_SELECT_REGION"; jobId: string }
    | { type: "W2F_CANCEL_REGION_SELECTION"; jobId: string };

  type RegionRect = { x: number; y: number; width: number; height: number };
  type RegionSelectionMode = "free-rect" | "smart-element";
  type RegionExclusionKind = "redact" | "exclude";
  type SelectorTool = "free" | "smart" | "redact" | "exclude";

  type RegionExclusion = {
    id: string;
    kind: RegionExclusionKind;
    bounds: RegionRect;
  };

  type ShellGlobal = typeof globalThis & {
    __W2F_CONTENT_SHELL_INSTALLED__?: boolean;
  };

  interface ActiveSession {
    jobId: string;
    cancel(): void;
  }

  interface DragState {
    pointerId: number;
    kind: "selection" | RegionExclusionKind;
    anchor: { x: number; y: number };
    current: { x: number; y: number };
  }

  function isContentRequest(value: unknown): value is ContentRequest {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      (record.type === "W2F_PROBE_PAGE" ||
        record.type === "W2F_SELECT_REGION" ||
        record.type === "W2F_CANCEL_REGION_SELECTION") &&
      typeof record.jobId === "string" &&
      record.jobId.length > 0
    );
  }

  function pageProbe() {
    const root = document.documentElement;
    const body = document.body;
    return {
      url: location.href,
      title: document.title,
      documentWidth: Math.max(
        root.scrollWidth,
        root.offsetWidth,
        root.clientWidth,
        body?.scrollWidth ?? 0,
        body?.offsetWidth ?? 0,
      ),
      documentHeight: Math.max(
        root.scrollHeight,
        root.offsetHeight,
        root.clientHeight,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
      ),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
  }

  function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): RegionRect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x, b.x) - x,
      height: Math.max(a.y, b.y) - y,
    };
  }

  function intersectRects(a: RegionRect, b: RegionRect): RegionRect | null {
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (right <= left || bottom <= top) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function containsRect(outer: RegionRect, inner: RegionRect): boolean {
    const epsilon = 0.5;
    return (
      outer.x <= inner.x + epsilon &&
      outer.y <= inner.y + epsilon &&
      outer.x + outer.width >= inner.x + inner.width - epsilon &&
      outer.y + outer.height >= inner.y + inner.height - epsilon
    );
  }

  let activeSession: ActiveSession | null = null;

  function openRegionSelector(jobId: string, sendResponse: (response: unknown) => void): void {
    activeSession?.cancel();

    const host = document.createElement("div");
    host.dataset.w2fRegionSelector = jobId;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "none";
    host.style.contain = "strict";

    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .surface { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; }
      .box { position: fixed; display: none; box-sizing: border-box; pointer-events: none; }
      .selection { border: 2px solid #2f80ed; background: rgba(47,128,237,.08); }
      .candidate { border: 2px solid #8b5cf6; background: rgba(139,92,246,.08); }
      .exclusion { border: 2px solid #111827; background: rgba(17,24,39,.72); }
      .exclusion[data-kind="exclude"] { border-style: dashed; background: rgba(239,68,68,.20); border-color: #ef4444; }
      .size { position: fixed; display: none; pointer-events: none; padding: 4px 7px; border-radius: 6px; background: #111827; color: white; font: 11px/1.2 ui-sans-serif, system-ui, sans-serif; white-space: nowrap; }
      .toolbar { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); pointer-events: auto; display: flex; align-items: center; gap: 6px; padding: 7px; border-radius: 10px; background: rgba(17,24,39,.96); box-shadow: 0 8px 30px rgba(0,0,0,.25); color: white; font: 12px/1.2 ui-sans-serif, system-ui, sans-serif; }
      button { appearance: none; border: 0; border-radius: 7px; padding: 7px 9px; background: #374151; color: #f9fafb; font: inherit; cursor: pointer; }
      button:hover { background: #4b5563; }
      button[data-active="true"] { background: #2563eb; }
      button[data-danger="true"] { background: #991b1b; }
      button:disabled { opacity: .45; cursor: default; }
      .status { min-width: 170px; max-width: 300px; color: #d1d5db; padding: 0 6px; }
      .hint { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); pointer-events: none; border-radius: 8px; background: rgba(17,24,39,.92); color: #e5e7eb; padding: 7px 10px; font: 11px/1.3 ui-sans-serif, system-ui, sans-serif; }
      .redactions { position: fixed; inset: 0; pointer-events: none; }
    `;

    const surface = document.createElement("div");
    surface.className = "surface";
    const selectionBox = document.createElement("div");
    selectionBox.className = "box selection";
    const candidateBox = document.createElement("div");
    candidateBox.className = "box candidate";
    const sizeLabel = document.createElement("div");
    sizeLabel.className = "size";
    const redactionLayer = document.createElement("div");
    redactionLayer.className = "redactions";
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const status = document.createElement("span");
    status.className = "status";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent =
      "Drag to select · Enter confirm · Esc cancel · Arrows 1px · Shift+Arrows 10px · Alt bypass snap";

    function button(label: string, action: () => void): HTMLButtonElement {
      const value = document.createElement("button");
      value.type = "button";
      value.textContent = label;
      value.addEventListener("pointerdown", (event) => event.stopPropagation());
      value.addEventListener("click", (event) => {
        event.stopPropagation();
        action();
      });
      toolbar.append(value);
      return value;
    }

    let tool: SelectorTool = "free";
    let selectionMode: RegionSelectionMode = "free-rect";
    let selection: RegionRect | null = null;
    let drag: DragState | null = null;
    let candidate: { element: Element; bounds: RegionRect } | null = null;
    let selectedElement: Element | null = null;
    let draftExclusion: { kind: RegionExclusionKind; bounds: RegionRect } | null = null;
    const exclusions: RegionExclusion[] = [];
    let exclusionCounter = 0;
    let lastPointerClient = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let autoScrollFrame = 0;
    let finished = false;

    const freeButton = button("Free", () => setTool("free"));
    const smartButton = button("Smart", () => setTool("smart"));
    const redactButton = button("Redact", () => setTool("redact"));
    const excludeButton = button("Exclude", () => setTool("exclude"));
    const undoButton = button("Undo mask", () => {
      exclusions.pop();
      render();
    });
    const confirmButton = button("Confirm", () => confirm());
    const cancelButton = button("Cancel", () => cancel());
    cancelButton.dataset.danger = "true";
    toolbar.append(status);

    shadow.append(
      style,
      surface,
      candidateBox,
      selectionBox,
      redactionLayer,
      sizeLabel,
      toolbar,
      hint,
    );
    document.documentElement.append(host);

    function documentBounds(): RegionRect {
      const probe = pageProbe();
      return { x: 0, y: 0, width: probe.documentWidth, height: probe.documentHeight };
    }

    function documentPoint(clientX: number, clientY: number): { x: number; y: number } {
      return { x: clientX + window.scrollX, y: clientY + window.scrollY };
    }

    function elementBounds(element: Element): RegionRect {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    }

    function elementAt(clientX: number, clientY: number): Element | null {
      const previousVisibility = host.style.visibility;
      host.style.visibility = "hidden";
      const elements = document.elementsFromPoint(clientX, clientY);
      host.style.visibility = previousVisibility;

      let fallback: Element | null = null;
      for (const element of elements) {
        if (element === host) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const computed = getComputedStyle(element);
        if (computed.display === "none" || computed.visibility === "hidden") continue;
        if (element === document.documentElement || element === document.body) {
          fallback ??= element;
          continue;
        }
        return element;
      }
      return fallback;
    }

    function updateCandidate(clientX: number, clientY: number): void {
      const element = elementAt(clientX, clientY);
      candidate = element ? { element, bounds: elementBounds(element) } : null;
    }

    function snapPoint(
      clientX: number,
      clientY: number,
      point: { x: number; y: number },
      bypass: boolean,
    ): { x: number; y: number } {
      if (bypass) return point;
      const element = elementAt(clientX, clientY);
      if (!element) return point;
      const bounds = elementBounds(element);
      const threshold = 8;
      const edgesX = [bounds.x, bounds.x + bounds.width];
      const edgesY = [bounds.y, bounds.y + bounds.height];
      let x = point.x;
      let y = point.y;
      for (const edge of edgesX) if (Math.abs(x - edge) <= threshold) x = edge;
      for (const edge of edgesY) if (Math.abs(y - edge) <= threshold) y = edge;
      return { x, y };
    }

    function setTool(next: SelectorTool): void {
      if ((next === "redact" || next === "exclude") && !selection) {
        status.textContent = "Create the main selection first.";
        return;
      }
      tool = next;
      if (next === "free") selectionMode = "free-rect";
      if (next === "smart") selectionMode = "smart-element";
      render();
    }

    function setFixedRect(element: HTMLElement, bounds: RegionRect | null): void {
      if (!bounds) {
        element.style.display = "none";
        return;
      }
      element.style.display = "block";
      element.style.left = `${bounds.x - window.scrollX}px`;
      element.style.top = `${bounds.y - window.scrollY}px`;
      element.style.width = `${bounds.width}px`;
      element.style.height = `${bounds.height}px`;
    }

    function render(): void {
      setFixedRect(selectionBox, selection);
      setFixedRect(candidateBox, tool === "smart" && !drag ? candidate?.bounds ?? null : null);

      redactionLayer.replaceChildren();
      for (const exclusion of exclusions) {
        const value = document.createElement("div");
        value.className = "box exclusion";
        value.dataset.kind = exclusion.kind;
        setFixedRect(value, exclusion.bounds);
        redactionLayer.append(value);
      }
      if (draftExclusion) {
        const value = document.createElement("div");
        value.className = "box exclusion";
        value.dataset.kind = draftExclusion.kind;
        setFixedRect(value, draftExclusion.bounds);
        redactionLayer.append(value);
      }

      if (selection) {
        sizeLabel.style.display = "block";
        sizeLabel.textContent = `${Math.round(selection.width)} × ${Math.round(selection.height)} CSS px`;
        sizeLabel.style.left = `${Math.max(8, selection.x - window.scrollX)}px`;
        sizeLabel.style.top = `${Math.max(8, selection.y - window.scrollY - 26)}px`;
      } else {
        sizeLabel.style.display = "none";
      }

      freeButton.dataset.active = String(tool === "free");
      smartButton.dataset.active = String(tool === "smart");
      redactButton.dataset.active = String(tool === "redact");
      excludeButton.dataset.active = String(tool === "exclude");
      redactButton.disabled = !selection;
      excludeButton.disabled = !selection;
      undoButton.disabled = exclusions.length === 0;
      confirmButton.disabled = !selection;

      status.textContent = selection
        ? `${selectionMode === "smart-element" ? "Smart element" : "Free rectangle"} · ${exclusions.length} mask${exclusions.length === 1 ? "" : "s"}`
        : tool === "smart"
          ? "Hover and click an element."
          : "Drag a rectangle on the page.";
    }

    function updateDrag(event: PointerEvent): void {
      if (!drag) return;
      const raw = documentPoint(event.clientX, event.clientY);
      const current =
        drag.kind === "selection" && tool === "free"
          ? snapPoint(event.clientX, event.clientY, raw, event.altKey)
          : raw;
      drag.current = current;
      if (drag.kind === "selection") {
        selection = rectFromPoints(drag.anchor, current);
        selectedElement = null;
      } else if (selection) {
        const clipped = intersectRects(rectFromPoints(drag.anchor, current), selection);
        draftExclusion = clipped ? { kind: drag.kind, bounds: clipped } : null;
      }
      render();
    }

    function autoScrollVelocity(position: number, size: number): number {
      const edge = 56;
      const maxSpeed = 28;
      if (position < edge) return -maxSpeed * (1 - Math.max(0, position) / edge);
      if (position > size - edge) {
        return maxSpeed * (1 - Math.max(0, size - position) / edge);
      }
      return 0;
    }

    function runAutoScroll(): void {
      if (!drag) {
        autoScrollFrame = 0;
        return;
      }
      const dx = autoScrollVelocity(lastPointerClient.x, window.innerWidth);
      const dy = autoScrollVelocity(lastPointerClient.y, window.innerHeight);
      if (dx !== 0 || dy !== 0) {
        const beforeX = window.scrollX;
        const beforeY = window.scrollY;
        window.scrollBy(dx, dy);
        if (window.scrollX !== beforeX || window.scrollY !== beforeY) {
          drag.current = documentPoint(lastPointerClient.x, lastPointerClient.y);
          if (drag.kind === "selection") {
            selection = rectFromPoints(drag.anchor, drag.current);
          } else if (selection) {
            const clipped = intersectRects(rectFromPoints(drag.anchor, drag.current), selection);
            draftExclusion = clipped ? { kind: drag.kind, bounds: clipped } : null;
          }
          render();
        }
      }
      autoScrollFrame = requestAnimationFrame(runAutoScroll);
    }

    function startAutoScroll(): void {
      if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(runAutoScroll);
    }

    function stopAutoScroll(): void {
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = 0;
    }

    function selectionRoot() {
      if (!selection) throw new Error("selection is required");
      let element = selectionMode === "smart-element" ? selectedElement : null;
      if (!element) element = elementAt(lastPointerClient.x, lastPointerClient.y);
      while (element && element !== document.documentElement) {
        const bounds = elementBounds(element);
        if (containsRect(bounds, selection)) {
          return {
            kind: "element" as const,
            bounds,
            clip: selection,
            tagName: element.tagName.toLowerCase(),
            ...(element.id ? { id: element.id } : {}),
            ...(element.getAttribute("role") ? { role: element.getAttribute("role")! } : {}),
            ...(element.getAttribute("aria-label")
              ? { ariaLabel: element.getAttribute("aria-label")! }
              : {}),
          };
        }
        element = element.parentElement;
      }
      return {
        kind: "document" as const,
        bounds: documentBounds(),
        clip: selection,
      };
    }

    function cleanup(): void {
      stopAutoScroll();
      window.removeEventListener("scroll", render);
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
      if (activeSession?.jobId === jobId) activeSession = null;
    }

    function finish(response: unknown): void {
      if (finished) return;
      finished = true;
      cleanup();
      sendResponse(response);
    }

    function cancel(): void {
      finish({ type: "W2F_CONTENT_SELECTION_CANCELLED", jobId });
    }

    function confirm(): void {
      if (!selection || selection.width < 2 || selection.height < 2) {
        status.textContent = "Selection must be at least 2 × 2 CSS px.";
        return;
      }
      finish({
        type: "W2F_CONTENT_REGION_RESULT",
        jobId,
        page: pageProbe(),
        region: {
          version: "1.0.0",
          coordinateSpace: "document-css-px",
          mode: selectionMode,
          bounds: selection,
          viewportBounds: {
            x: selection.x - window.scrollX,
            y: selection.y - window.scrollY,
            width: selection.width,
            height: selection.height,
          },
          selectionRoot: selectionRoot(),
          exclusions,
        },
      });
    }

    function moveSelection(dx: number, dy: number): void {
      if (!selection) return;
      const bounds = documentBounds();
      let nextDx = dx;
      let nextDy = dy;
      if (selection.x + nextDx < 0) nextDx = -selection.x;
      if (selection.y + nextDy < 0) nextDy = -selection.y;
      if (selection.x + selection.width + nextDx > bounds.width) {
        nextDx = bounds.width - selection.x - selection.width;
      }
      if (selection.y + selection.height + nextDy > bounds.height) {
        nextDy = bounds.height - selection.y - selection.height;
      }
      selection = { ...selection, x: selection.x + nextDx, y: selection.y + nextDy };
      for (const exclusion of exclusions) {
        exclusion.bounds = {
          ...exclusion.bounds,
          x: exclusion.bounds.x + nextDx,
          y: exclusion.bounds.y + nextDy,
        };
      }
      render();
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        confirm();
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && exclusions.length > 0) {
        event.preventDefault();
        exclusions.pop();
        render();
        return;
      }
      if (!selection) return;
      const step = event.shiftKey ? 10 : 1;
      const movement: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = movement[event.key];
      if (!delta) return;
      event.preventDefault();
      moveSelection(delta[0], delta[1]);
    }

    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      lastPointerClient = { x: event.clientX, y: event.clientY };

      if (tool === "smart") {
        updateCandidate(event.clientX, event.clientY);
        if (candidate) {
          selection = candidate.bounds;
          selectedElement = candidate.element;
          selectionMode = "smart-element";
          render();
        }
        return;
      }

      const kind: DragState["kind"] =
        tool === "redact" ? "redact" : tool === "exclude" ? "exclude" : "selection";
      drag = {
        pointerId: event.pointerId,
        kind,
        anchor: documentPoint(event.clientX, event.clientY),
        current: documentPoint(event.clientX, event.clientY),
      };
      if (kind === "selection") {
        selectionMode = "free-rect";
        selection = { x: drag.anchor.x, y: drag.anchor.y, width: 0, height: 0 };
      }
      surface.setPointerCapture(event.pointerId);
      startAutoScroll();
      render();
    });

    surface.addEventListener("pointermove", (event) => {
      lastPointerClient = { x: event.clientX, y: event.clientY };
      if (drag) updateDrag(event);
      else if (tool === "smart") {
        updateCandidate(event.clientX, event.clientY);
        render();
      }
    });

    surface.addEventListener("pointerup", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      updateDrag(event);
      const completedDrag = drag;
      drag = null;
      stopAutoScroll();
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);

      if (completedDrag.kind === "selection") {
        if (!selection || selection.width < 2 || selection.height < 2) selection = null;
      } else if (draftExclusion && draftExclusion.bounds.width >= 2 && draftExclusion.bounds.height >= 2) {
        exclusions.push({
          id: `region_${++exclusionCounter}`,
          kind: draftExclusion.kind,
          bounds: draftExclusion.bounds,
        });
      }
      draftExclusion = null;
      render();
    });

    surface.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        window.scrollBy(event.deltaX, event.deltaY);
        render();
      },
      { passive: false },
    );

    window.addEventListener("scroll", render, { passive: true });
    document.addEventListener("keydown", onKeyDown, true);

    activeSession = { jobId, cancel };
    render();
  }

  const shellGlobal = globalThis as ShellGlobal;
  if (shellGlobal.__W2F_CONTENT_SHELL_INSTALLED__) return;
  shellGlobal.__W2F_CONTENT_SHELL_INSTALLED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isContentRequest(message)) return false;

    if (message.type === "W2F_PROBE_PAGE") {
      sendResponse({
        type: "W2F_CONTENT_PROBE_RESULT",
        jobId: message.jobId,
        page: pageProbe(),
      });
      return false;
    }

    if (message.type === "W2F_CANCEL_REGION_SELECTION") {
      if (activeSession?.jobId === message.jobId) activeSession.cancel();
      sendResponse({ type: "W2F_CONTENT_SELECTION_CANCELLED", jobId: message.jobId });
      return false;
    }

    openRegionSelector(message.jobId, sendResponse);
    return true;
  });
})();
