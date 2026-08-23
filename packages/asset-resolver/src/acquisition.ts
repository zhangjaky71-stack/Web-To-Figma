import {
  DEFAULT_ASSET_ACQUISITION_POLICY,
  type AssetAcquiredResource,
  type AssetAcquisitionPolicy,
  type AssetAcquisitionResult,
  type AssetCaptureDiagnostic,
  type AssetDiscoveryResult,
  type AssetResourceCandidate,
} from "./types.js";

export interface AssetBinaryFetchResult {
  bytes: Uint8Array;
  mediaTypeHint?: string;
}

export type AssetBinaryFetcher = (
  candidate: AssetResourceCandidate,
  policy: AssetAcquisitionPolicy,
) => Promise<AssetBinaryFetchResult>;

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function decodeDataUrl(value: string): AssetBinaryFetchResult {
  if (!value.toLowerCase().startsWith("data:")) throw new TypeError("expected data URL");
  const comma = value.indexOf(",");
  if (comma < 0) throw new TypeError("data URL has no payload separator");
  const metadata = value.slice(5, comma);
  const payload = value.slice(comma + 1);
  const parts = metadata.split(";").filter(Boolean);
  const mediaType = parts[0]?.includes("/") ? parts[0].toLowerCase() : undefined;
  const base64 = parts.some((part) => part.toLowerCase() === "base64");
  const bytes = base64
    ? decodeBase64(payload)
    : new TextEncoder().encode(decodeURIComponent(payload.replace(/\+/g, "%20")));
  return {
    bytes,
    ...(mediaType ? { mediaTypeHint: mediaType } : {}),
  };
}

function toAcquired(
  candidate: AssetResourceCandidate,
  result: AssetBinaryFetchResult,
): AssetAcquiredResource {
  return {
    acquisitionId: candidate.acquisitionId,
    bytes: [...result.bytes],
    ...(result.mediaTypeHint ?? candidate.mediaTypeHint
      ? { mediaTypeHint: result.mediaTypeHint ?? candidate.mediaTypeHint }
      : {}),
    ...(candidate.currentSrc ? { currentSrc: candidate.currentSrc } : {}),
    ...(candidate.authoredSrc ? { authoredSrc: candidate.authoredSrc } : {}),
    ...(candidate.intrinsicWidth === undefined
      ? {}
      : { intrinsicWidth: candidate.intrinsicWidth }),
    ...(candidate.intrinsicHeight === undefined
      ? {}
      : { intrinsicHeight: candidate.intrinsicHeight }),
    ...(candidate.displayWidth === undefined ? {} : { displayWidth: candidate.displayWidth }),
    ...(candidate.displayHeight === undefined ? {} : { displayHeight: candidate.displayHeight }),
    provenance: candidate.provenance,
  };
}

function diagnosticFor(
  candidate: AssetResourceCandidate,
  code: AssetCaptureDiagnostic["code"],
  message: string,
): AssetCaptureDiagnostic {
  return {
    code,
    message,
    acquisitionId: candidate.acquisitionId,
    ...(candidate.provenance.sourceNodeId
      ? { sourceNodeId: candidate.provenance.sourceNodeId }
      : {}),
    ...(candidate.locator ? { sourceUrl: candidate.locator } : {}),
  };
}

function policyWithDefaults(policy?: Partial<AssetAcquisitionPolicy>): AssetAcquisitionPolicy {
  const resolved = { ...DEFAULT_ASSET_ACQUISITION_POLICY, ...policy };
  for (const [key, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${key} must be a positive integer`);
  }
  return resolved;
}

export async function acquireAssetCandidates(
  discovery: AssetDiscoveryResult,
  fetcher: AssetBinaryFetcher,
  policy?: Partial<AssetAcquisitionPolicy>,
): Promise<AssetAcquisitionResult> {
  const resolvedPolicy = policyWithDefaults(policy);
  const diagnostics = [...discovery.diagnostics];
  const resources: AssetAcquiredResource[] = [];
  const fetchCache = new Map<string, Promise<AssetBinaryFetchResult>>();
  let totalBytes = 0;

  for (const candidate of discovery.candidates) {
    if (resources.length >= resolvedPolicy.maxAssets) {
      diagnostics.push(
        diagnosticFor(
          candidate,
          "ASSET_COUNT_BUDGET_EXCEEDED",
          `Asset acquisition stopped at ${resolvedPolicy.maxAssets} resources.`,
        ),
      );
      break;
    }

    let result: AssetBinaryFetchResult;
    try {
      if (candidate.inlineText !== undefined) {
        result = {
          bytes: new TextEncoder().encode(candidate.inlineText),
          mediaTypeHint: candidate.mediaTypeHint ?? "image/svg+xml",
        };
      } else if (candidate.locator?.toLowerCase().startsWith("data:")) {
        result = decodeDataUrl(candidate.locator);
      } else if (candidate.locator) {
        let pending = fetchCache.get(candidate.locator);
        if (!pending) {
          pending = fetcher(candidate, resolvedPolicy);
          fetchCache.set(candidate.locator, pending);
        }
        result = await pending;
      } else {
        diagnostics.push(
          diagnosticFor(candidate, "ASSET_FETCH_FAILED", "Asset candidate has no fetchable locator."),
        );
        continue;
      }
    } catch (error) {
      diagnostics.push(
        diagnosticFor(
          candidate,
          "ASSET_FETCH_FAILED",
          `Asset fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      continue;
    }

    if (result.bytes.byteLength > resolvedPolicy.maxAssetBytes) {
      diagnostics.push(
        diagnosticFor(
          candidate,
          "ASSET_TOO_LARGE",
          `Asset exceeds the ${resolvedPolicy.maxAssetBytes} byte per-resource budget.`,
        ),
      );
      continue;
    }
    if (totalBytes + result.bytes.byteLength > resolvedPolicy.maxTotalBytes) {
      diagnostics.push(
        diagnosticFor(
          candidate,
          "ASSET_TOTAL_BUDGET_EXCEEDED",
          `Asset acquisition exceeds the ${resolvedPolicy.maxTotalBytes} byte total budget.`,
        ),
      );
      break;
    }
    totalBytes += result.bytes.byteLength;
    resources.push(toAcquired(candidate, result));
  }

  return { resources, diagnostics };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
