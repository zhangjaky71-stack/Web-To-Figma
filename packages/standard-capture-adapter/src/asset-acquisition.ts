import type {
  AssetAcquiredResource,
  AssetCaptureDiagnostic,
  AssetResourceSourceType,
} from "@w2f/asset-resolver";
import type {
  StandardAssetInput,
  StandardAssetResult,
  StandardCascadeTargetHint,
} from "./types.js";

export async function captureStandardAssetsInPage(input: StandardAssetInput): Promise<StandardAssetResult> {
  type Root = Document | ShadowRoot;
  type ResolvedTarget = {
    hint: StandardCascadeTargetHint;
    element: Element;
    pseudoType?: string;
  };
  type Candidate = {
    acquisitionId: string;
    url?: string;
    inlineSvg?: string;
    mediaTypeHint?: string;
    currentSrc?: string;
    authoredSrc?: string;
    intrinsicWidth?: number;
    intrinsicHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    sourceType: AssetResourceSourceType;
    sourceNodeId: string;
    frameId: string;
    frameOrigin?: string;
    originalUrl?: string;
    cssProperty?: string;
  };

  const maxAssets = Math.max(1, Math.min(input.maxAssets ?? 2_000, 10_000));
  const maxAssetBytes = Math.max(1024, Math.min(input.maxAssetBytes ?? 20 * 1024 * 1024, 100 * 1024 * 1024));
  const maxTotalBytes = Math.max(maxAssetBytes, Math.min(input.maxTotalBytes ?? 100 * 1024 * 1024, 500 * 1024 * 1024));
  const diagnostics: AssetCaptureDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const frameDocuments = new Map<string, Document>();
  const targetHints = new Map(input.targets.map((target) => [target.sourceNodeId, target]));
  const resolvedTargets = new Map<string, ResolvedTarget>();
  const candidates: Candidate[] = [];
  const candidateKeys = new Set<string>();
  const fetchCache = new Map<string, Promise<{ bytes: number[]; mediaTypeHint?: string }>>();
  let totalBytes = 0;
  let budgetReported = false;

  function pushDiagnostic(value: AssetCaptureDiagnostic): void {
    const key = `${value.code}\u001f${value.acquisitionId ?? ""}\u001f${value.sourceNodeId ?? ""}\u001f${value.sourceUrl ?? ""}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(value);
  }

  function reportCountBudget(): void {
    if (budgetReported) return;
    budgetReported = true;
    pushDiagnostic({
      code: "ASSET_COUNT_BUDGET_EXCEEDED",
      message: `Asset acquisition reached the configured ${maxAssets} reference budget.`,
    });
  }

  function rootFrameId(): string | undefined {
    return input.frames.find((frame) => !frame.parentFrameId)?.frameId ?? input.frames[0]?.frameId;
  }

  const mainFrameId = rootFrameId();
  if (mainFrameId) frameDocuments.set(mainFrameId, document);

  function resolveElement(sourceNodeId: string): Element | undefined {
    const existing = resolvedTargets.get(sourceNodeId)?.element;
    if (existing) return existing;
    const hint = targetHints.get(sourceNodeId);
    if (!hint || hint.pseudoType) return undefined;
    const frameDocument = frameDocuments.get(hint.frameId);
    if (!frameDocument) return undefined;
    let root: Root = frameDocument;
    if (hint.shadowHostSourceNodeId) {
      const host = resolveElement(hint.shadowHostSourceNodeId);
      if (!host?.shadowRoot) return undefined;
      root = host.shadowRoot;
    }
    if (!hint.sourceSelector) return undefined;
    try {
      const element = root.querySelector(hint.sourceSelector);
      if (!element) return undefined;
      resolvedTargets.set(sourceNodeId, { hint, element });
      return element;
    } catch {
      pushDiagnostic({
        code: "ASSET_SELECTOR_UNSUPPORTED",
        message: `Asset source selector could not be evaluated: ${hint.sourceSelector}`,
        sourceNodeId,
      });
      return undefined;
    }
  }

  let frameProgress = true;
  while (frameProgress) {
    frameProgress = false;
    for (const frame of input.frames) {
      if (frameDocuments.has(frame.frameId) || !frame.parentFrameId || !frame.ownerSourceNodeId) continue;
      if (!frameDocuments.has(frame.parentFrameId)) continue;
      const owner = resolveElement(frame.ownerSourceNodeId);
      if (!(owner instanceof HTMLIFrameElement) || !owner.contentDocument) continue;
      frameDocuments.set(frame.frameId, owner.contentDocument);
      frameProgress = true;
    }
  }

  function resolveTarget(hint: StandardCascadeTargetHint): ResolvedTarget | undefined {
    const existing = resolvedTargets.get(hint.sourceNodeId);
    if (existing) return existing;
    if (hint.pseudoType) {
      const hostId = hint.pseudoHostSourceNodeId;
      if (!hostId) return undefined;
      const element = resolveElement(hostId);
      if (!element) return undefined;
      const target = { hint, element, pseudoType: hint.pseudoType };
      resolvedTargets.set(hint.sourceNodeId, target);
      return target;
    }
    const element = resolveElement(hint.sourceNodeId);
    return element ? resolvedTargets.get(hint.sourceNodeId) : undefined;
  }

  function absoluteUrl(raw: string, ownerDocument: Document): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "none" || trimmed.startsWith("#")) return undefined;
    try {
      return new URL(trimmed, ownerDocument.baseURI).href;
    } catch {
      return undefined;
    }
  }

  function sourceTypeForUrl(url: string, preferred: AssetResourceSourceType): AssetResourceSourceType {
    if (url.startsWith("data:")) return "data-url";
    if (url.startsWith("blob:")) return "blob";
    try {
      if (new URL(url).pathname.toLowerCase().endsWith(".svg")) return "svg-external";
    } catch {
      // Preserve the preferred source type for non-standard but fetchable locators.
    }
    return preferred;
  }

  function addCandidate(candidate: Candidate): void {
    if (candidates.length >= maxAssets) {
      reportCountBudget();
      return;
    }
    const key = [
      candidate.sourceNodeId,
      candidate.sourceType,
      candidate.url ?? "",
      candidate.inlineSvg ?? "",
      candidate.cssProperty ?? "",
    ].join("\u001f");
    if (candidateKeys.has(key)) return;
    candidateKeys.add(key);
    candidates.push(candidate);
  }

  function cssUrls(value: string): string[] {
    const urls: string[] = [];
    const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/giu;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) {
      const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      if (raw) urls.push(raw.replace(/\\([()'"\\ ])/gu, "$1"));
    }
    return urls;
  }

  function addUrlCandidate(
    target: ResolvedTarget,
    rawUrl: string,
    preferredType: AssetResourceSourceType,
    suffix: string,
    extra: Partial<Candidate> = {},
  ): void {
    const ownerDocument = target.element.ownerDocument;
    const url = absoluteUrl(rawUrl, ownerDocument);
    if (!url) return;
    const frameOrigin = ownerDocument.location?.origin || undefined;
    addCandidate({
      acquisitionId: `${target.hint.sourceNodeId}:${suffix}:${candidates.length}`,
      url,
      sourceType: sourceTypeForUrl(url, preferredType),
      sourceNodeId: target.hint.sourceNodeId,
      frameId: target.hint.frameId,
      ...(frameOrigin ? { frameOrigin } : {}),
      originalUrl: rawUrl,
      ...extra,
    });
  }

  for (const hint of input.targets) {
    const target = resolveTarget(hint);
    if (!target) {
      if (hint.sourceSelector || hint.pseudoType) {
        pushDiagnostic({
          code: "ASSET_SOURCE_NODE_UNRESOLVED",
          message: "Asset acquisition could not resolve the captured source node.",
          sourceNodeId: hint.sourceNodeId,
        });
      }
      continue;
    }

    const element = target.element;
    if (!target.pseudoType) {
      if (element instanceof HTMLImageElement) {
        const currentSrc = element.currentSrc || element.src;
        const authoredSrc = element.getAttribute("src") ?? undefined;
        if (currentSrc) {
          addUrlCandidate(
            target,
            currentSrc,
            element.parentElement instanceof HTMLPictureElement ? "picture" : "img",
            "img",
            {
              currentSrc,
              ...(authoredSrc ? { authoredSrc } : {}),
              intrinsicWidth: element.naturalWidth,
              intrinsicHeight: element.naturalHeight,
              displayWidth: element.getBoundingClientRect().width,
              displayHeight: element.getBoundingClientRect().height,
              ...(authoredSrc ? { originalUrl: authoredSrc } : {}),
            },
          );
        }
      } else if (element instanceof SVGSVGElement) {
        const serializer = new XMLSerializer();
        const inlineSvg = serializer.serializeToString(element);
        const frameOrigin = element.ownerDocument.location?.origin || undefined;
        addCandidate({
          acquisitionId: `${hint.sourceNodeId}:svg-inline`,
          inlineSvg,
          mediaTypeHint: "image/svg+xml",
          sourceType: "svg-inline",
          sourceNodeId: hint.sourceNodeId,
          frameId: hint.frameId,
          ...(frameOrigin ? { frameOrigin } : {}),
          displayWidth: element.getBoundingClientRect().width,
          displayHeight: element.getBoundingClientRect().height,
        });
      } else if (element instanceof SVGImageElement) {
        const raw = element.getAttribute("href") ?? element.getAttribute("xlink:href") ?? element.href.baseVal;
        if (raw) addUrlCandidate(target, raw, "svg-external", "svg-image");
      } else if (element instanceof HTMLVideoElement && element.poster) {
        addUrlCandidate(target, element.poster, "video-poster", "video-poster");
      } else if (element instanceof HTMLInputElement && element.type.toLowerCase() === "image" && element.src) {
        addUrlCandidate(target, element.src, "img", "input-image", {
          authoredSrc: element.getAttribute("src") ?? undefined,
        });
      }
    }

    const view = element.ownerDocument.defaultView;
    if (!view) continue;
    const pseudo = target.pseudoType ? `::${target.pseudoType}` : null;
    const computed = view.getComputedStyle(element, pseudo);
    const cssProperties: Array<[string, AssetResourceSourceType]> = [
      ["background-image", "css-background"],
      ["mask-image", "css-mask"],
      ["-webkit-mask-image", "css-mask"],
      ["border-image-source", "css-border"],
      ["content", "css-content"],
    ];
    for (const [property, sourceType] of cssProperties) {
      const value = computed.getPropertyValue(property);
      for (const rawUrl of cssUrls(value)) {
        addUrlCandidate(target, rawUrl, sourceType, `css:${property}`, { cssProperty: property });
      }
    }
  }

  async function loadUrl(url: string): Promise<{ bytes: number[]; mediaTypeHint?: string }> {
    const cached = fetchCache.get(url);
    if (cached) return cached;
    const pending = (async () => {
      const response = await fetch(url, { credentials: "include", cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maxAssetBytes) throw new Error(`resource exceeds ${maxAssetBytes} byte limit`);
      const mediaTypeHint = response.headers.get("content-type")?.split(";", 1)[0]?.trim() || undefined;
      return {
        bytes: Array.from(new Uint8Array(buffer)),
        ...(mediaTypeHint ? { mediaTypeHint } : {}),
      };
    })();
    fetchCache.set(url, pending);
    return pending;
  }

  const resources: AssetAcquiredResource[] = [];
  for (const candidate of candidates) {
    try {
      let loaded: { bytes: number[]; mediaTypeHint?: string };
      if (candidate.inlineSvg !== undefined) {
        const bytes = Array.from(new TextEncoder().encode(candidate.inlineSvg));
        if (bytes.length > maxAssetBytes) throw new Error(`resource exceeds ${maxAssetBytes} byte limit`);
        loaded = { bytes, mediaTypeHint: "image/svg+xml" };
      } else if (candidate.url) {
        loaded = await loadUrl(candidate.url);
      } else {
        continue;
      }

      if (totalBytes + loaded.bytes.length > maxTotalBytes) {
        pushDiagnostic({
          code: "ASSET_TOTAL_BUDGET_EXCEEDED",
          message: `Asset bytes exceed the configured ${maxTotalBytes} byte total budget.`,
          acquisitionId: candidate.acquisitionId,
          sourceNodeId: candidate.sourceNodeId,
          ...(candidate.url ? { sourceUrl: candidate.url } : {}),
        });
        break;
      }
      totalBytes += loaded.bytes.length;
      resources.push({
        acquisitionId: candidate.acquisitionId,
        bytes: loaded.bytes,
        ...(loaded.mediaTypeHint ?? candidate.mediaTypeHint
          ? { mediaTypeHint: loaded.mediaTypeHint ?? candidate.mediaTypeHint }
          : {}),
        ...(candidate.currentSrc ? { currentSrc: candidate.currentSrc } : {}),
        ...(candidate.authoredSrc ? { authoredSrc: candidate.authoredSrc } : {}),
        ...(candidate.intrinsicWidth === undefined ? {} : { intrinsicWidth: candidate.intrinsicWidth }),
        ...(candidate.intrinsicHeight === undefined ? {} : { intrinsicHeight: candidate.intrinsicHeight }),
        ...(candidate.displayWidth === undefined ? {} : { displayWidth: candidate.displayWidth }),
        ...(candidate.displayHeight === undefined ? {} : { displayHeight: candidate.displayHeight }),
        provenance: {
          sourceType: candidate.sourceType,
          sourceNodeId: candidate.sourceNodeId,
          ...(candidate.url ? { sourceUrl: candidate.url } : {}),
          ...(candidate.originalUrl ? { originalUrl: candidate.originalUrl } : {}),
          frameId: candidate.frameId,
          ...(candidate.frameOrigin ? { frameOrigin: candidate.frameOrigin } : {}),
          ...(candidate.cssProperty ? { cssProperty: candidate.cssProperty } : {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushDiagnostic({
        code: message.includes("exceeds") ? "ASSET_TOO_LARGE" : "ASSET_FETCH_FAILED",
        message: `Asset fetch failed: ${message}`,
        acquisitionId: candidate.acquisitionId,
        sourceNodeId: candidate.sourceNodeId,
        ...(candidate.url ? { sourceUrl: candidate.url } : {}),
      });
    }
  }

  return { acquisition: { resources, diagnostics } };
}
