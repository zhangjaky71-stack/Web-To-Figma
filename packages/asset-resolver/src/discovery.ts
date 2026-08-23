import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture, CssCascadePropertyTrace } from "@w2f/css-cascade";
import { resolveUrlReference } from "@w2f/source-providers";
import type {
  AssetCaptureDiagnostic,
  AssetDiscoveryResult,
  AssetDomEvidence,
  AssetResourceCandidate,
  AssetResourceProvenance,
  AssetResourceSourceType,
} from "./types.js";

export interface DiscoverAssetCandidatesInput {
  snapshot: RawSnapshot;
  cascade?: CssCascadeCapture;
  domEvidence?: AssetDomEvidence[];
}

function stableId(parts: Array<string | number | undefined>): string {
  return `asset-acq:${parts.map((part) => encodeURIComponent(String(part ?? ""))).join(":")}`;
}

function frameOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.origin === "null" ? undefined : parsed.origin;
  } catch {
    return undefined;
  }
}

function sourceTypeForUrl(url: string, fallback: AssetResourceSourceType): AssetResourceSourceType {
  const lowered = url.trim().toLowerCase();
  if (lowered.startsWith("data:")) return "data-url";
  if (lowered.startsWith("blob:")) return "blob";
  if (/\.svg(?:[?#]|$)/i.test(lowered)) return "svg-external";
  return fallback;
}

function resolveCandidateUrl(
  reference: string,
  baseUrl: string,
  diagnosticContext: Pick<AssetCaptureDiagnostic, "sourceNodeId">,
  diagnostics: AssetCaptureDiagnostic[],
): string | undefined {
  try {
    const resolved = resolveUrlReference(reference, baseUrl);
    if (!resolved.resolvable) {
      diagnostics.push({
        code: "ASSET_REFERENCE_UNSUPPORTED",
        message: `Asset reference uses an unsupported scheme: ${resolved.scheme}`,
        ...diagnosticContext,
        sourceUrl: resolved.locator,
      });
      return undefined;
    }
    return resolved.locator;
  } catch (error) {
    diagnostics.push({
      code: "ASSET_REFERENCE_INVALID",
      message: `Asset reference could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
      ...diagnosticContext,
      sourceUrl: reference,
    });
    return undefined;
  }
}

export function extractCssUrls(value: string): string[] {
  const urls: string[] = [];
  let index = 0;
  while (index < value.length) {
    const match = /url\s*\(/gi.exec(value.slice(index));
    if (!match) break;
    let cursor = index + match.index + match[0].length;
    while (cursor < value.length && /\s/.test(value[cursor] ?? "")) cursor += 1;
    const quote = value[cursor] === '"' || value[cursor] === "'" ? value[cursor] : undefined;
    if (quote) cursor += 1;
    const start = cursor;
    let escaped = false;
    let nested = 0;
    let closed = false;
    for (; cursor < value.length; cursor += 1) {
      const char = value[cursor]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (char === quote) {
          closed = true;
          break;
        }
        continue;
      }
      if (char === "(") nested += 1;
      else if (char === ")") {
        if (nested === 0) {
          closed = true;
          break;
        }
        nested -= 1;
      }
    }
    if (!closed) break;
    const raw = value
      .slice(start, cursor)
      .trim()
      .replace(/\\([\\'"()])/g, "$1");
    if (raw) urls.push(raw);
    if (quote) {
      cursor += 1;
      while (cursor < value.length && value[cursor] !== ")") cursor += 1;
    }
    index = Math.min(value.length, cursor + 1);
  }
  return urls;
}

function cssSourceType(property: string): AssetResourceSourceType {
  const normalized = property.toLowerCase();
  if (normalized.includes("background")) return "css-background";
  if (normalized.includes("mask")) return "css-mask";
  if (normalized.includes("border-image")) return "css-border";
  if (normalized === "content") return "css-content";
  return "css-image";
}

function baseUrlForTrace(snapshotUrl: string, trace: CssCascadePropertyTrace): string {
  const winner = trace.candidates.find((candidate) => candidate.status === "winner");
  const stylesheetRef = winner?.source.stylesheetRef;
  if (!stylesheetRef) return snapshotUrl;
  try {
    return new URL(stylesheetRef).toString();
  } catch {
    return snapshotUrl;
  }
}

function authoredUrlsForTrace(trace: CssCascadePropertyTrace): string[] {
  const winner = trace.candidates.find((candidate) => candidate.status === "winner");
  return winner ? extractCssUrls(winner.authoredValue) : [];
}

function pushDomCandidate(
  candidates: AssetResourceCandidate[],
  diagnostics: AssetCaptureDiagnostic[],
  snapshotUrl: string,
  evidence: AssetDomEvidence,
): void {
  const tagName = evidence.tagName.toLowerCase();
  if (tagName === "svg" && evidence.inlineSvg?.trim()) {
    candidates.push({
      acquisitionId: stableId([evidence.sourceNodeId, "svg-inline"]),
      inlineText: evidence.inlineSvg,
      mediaTypeHint: "image/svg+xml",
      ...(evidence.displayWidth === undefined ? {} : { displayWidth: evidence.displayWidth }),
      ...(evidence.displayHeight === undefined ? {} : { displayHeight: evidence.displayHeight }),
      provenance: {
        sourceType: "svg-inline",
        sourceNodeId: evidence.sourceNodeId,
        frameId: evidence.frameId,
        ...(evidence.frameOrigin ? { frameOrigin: evidence.frameOrigin } : {}),
      },
    });
    return;
  }

  const selected = evidence.currentSrc?.trim() || evidence.authoredSrc?.trim();
  if (!selected) return;
  const locator = resolveCandidateUrl(
    selected,
    snapshotUrl,
    { sourceNodeId: evidence.sourceNodeId },
    diagnostics,
  );
  if (!locator) return;
  const fallbackType: AssetResourceSourceType =
    tagName === "video" ? "video-poster" : tagName === "picture" ? "picture" : "img";
  candidates.push({
    acquisitionId: stableId([evidence.sourceNodeId, "dom", locator]),
    locator,
    ...(evidence.currentSrc ? { currentSrc: evidence.currentSrc } : {}),
    ...(evidence.authoredSrc ? { authoredSrc: evidence.authoredSrc } : {}),
    ...(evidence.intrinsicWidth === undefined ? {} : { intrinsicWidth: evidence.intrinsicWidth }),
    ...(evidence.intrinsicHeight === undefined
      ? {}
      : { intrinsicHeight: evidence.intrinsicHeight }),
    ...(evidence.displayWidth === undefined ? {} : { displayWidth: evidence.displayWidth }),
    ...(evidence.displayHeight === undefined ? {} : { displayHeight: evidence.displayHeight }),
    provenance: {
      sourceType: sourceTypeForUrl(locator, fallbackType),
      sourceNodeId: evidence.sourceNodeId,
      sourceUrl: locator,
      ...(evidence.authoredSrc ? { originalUrl: evidence.authoredSrc } : {}),
      frameId: evidence.frameId,
      ...(evidence.frameOrigin ? { frameOrigin: evidence.frameOrigin } : {}),
    },
  });
}

function rawDomFallback(snapshot: RawSnapshot): AssetDomEvidence[] {
  return snapshot.nodes.flatMap((node) => {
    if (node.kind !== "element") return [];
    const tagName = node.source.tagName?.toLowerCase();
    const attributes = node.source.attributes ?? {};
    let authoredSrc: string | undefined;
    if (tagName === "img" || (tagName === "input" && attributes.type?.toLowerCase() === "image")) {
      authoredSrc = attributes.src;
    } else if (tagName === "video") {
      authoredSrc = attributes.poster;
    }
    if (!authoredSrc && tagName !== "svg") return [];
    const origin = node.frameContext.url ? frameOrigin(node.frameContext.url) : undefined;
    return [
      {
        sourceNodeId: node.captureNodeId,
        frameId: node.frameContext.frameId,
        ...(origin ? { frameOrigin: origin } : {}),
        tagName: tagName ?? "",
        ...(authoredSrc ? { authoredSrc } : {}),
        ...(node.geometry
          ? {
              displayWidth: node.geometry.bounds.width,
              displayHeight: node.geometry.bounds.height,
            }
          : {}),
      },
    ];
  });
}

export function discoverAssetCandidates(input: DiscoverAssetCandidatesInput): AssetDiscoveryResult {
  const diagnostics: AssetCaptureDiagnostic[] = [];
  const candidates: AssetResourceCandidate[] = [];
  const liveByNode = new Map((input.domEvidence ?? []).map((item) => [item.sourceNodeId, item]));
  const domEvidence = rawDomFallback(input.snapshot).map((fallback) => {
    const live = liveByNode.get(fallback.sourceNodeId);
    return live ? { ...fallback, ...live } : fallback;
  });
  for (const live of input.domEvidence ?? []) {
    if (!domEvidence.some((item) => item.sourceNodeId === live.sourceNodeId))
      domEvidence.push(live);
  }
  for (const evidence of domEvidence) {
    pushDomCandidate(candidates, diagnostics, input.snapshot.url, evidence);
  }

  for (const node of input.cascade?.cascade.nodes ?? []) {
    for (const trace of node.traces) {
      const computedUrls = extractCssUrls(trace.computedValue);
      if (!computedUrls.length) continue;
      const authoredUrls = authoredUrlsForTrace(trace);
      const winner = trace.candidates.find((candidate) => candidate.status === "winner");
      const baseUrl = baseUrlForTrace(input.snapshot.url, trace);
      computedUrls.forEach((computedUrl, index) => {
        const locator = resolveCandidateUrl(
          computedUrl,
          baseUrl,
          { sourceNodeId: node.sourceNodeId },
          diagnostics,
        );
        if (!locator) return;
        const authoredUrl = authoredUrls[index] ?? authoredUrls[0];
        const provenance: AssetResourceProvenance = {
          sourceType: sourceTypeForUrl(locator, cssSourceType(trace.property)),
          sourceNodeId: node.sourceNodeId,
          sourceUrl: locator,
          ...(authoredUrl ? { originalUrl: authoredUrl } : {}),
          ...(winner?.source.stylesheetRef ? { stylesheetRef: winner.source.stylesheetRef } : {}),
          cssProperty: trace.property,
        };
        candidates.push({
          acquisitionId: stableId([node.sourceNodeId, trace.property, index, locator]),
          locator,
          ...(authoredUrl ? { authoredSrc: authoredUrl } : {}),
          provenance,
        });
      });
    }
  }

  const byId = new Map<string, AssetResourceCandidate>();
  for (const candidate of candidates) byId.set(candidate.acquisitionId, candidate);
  return {
    candidates: [...byId.values()].sort((a, b) => a.acquisitionId.localeCompare(b.acquisitionId)),
    diagnostics: diagnostics.sort(
      (a, b) =>
        a.code.localeCompare(b.code) ||
        (a.sourceNodeId ?? "").localeCompare(b.sourceNodeId ?? "") ||
        (a.sourceUrl ?? "").localeCompare(b.sourceUrl ?? ""),
    ),
  };
}
