import type {
  DocumentIdentityInput,
  StableAncestrySegment,
  StableIdentityNodeInput,
  StableIdentitySignals,
} from "./types.js";

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
]);

const STABLE_DATA_KEYS = new Set([
  "data-testid",
  "data-test-id",
  "data-test",
  "data-qa",
  "data-cy",
  "data-component",
  "data-component-id",
  "data-slot",
  "data-part",
  "data-role",
  "data-name",
]);

const UNSTABLE_DATA_PREFIXES = ["data-react", "data-v-", "data-radix", "data-headlessui"];

const GENERIC_UTILITY_CLASSES = new Set([
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "hidden",
  "contents",
  "relative",
  "absolute",
  "fixed",
  "sticky",
  "container",
  "truncate",
  "antialiased",
]);

const UTILITY_CLASS_PATTERN = /^(?:-?(?:m|p)(?:[trblxy])?-[^\s]+|(?:w|h|min-w|max-w|min-h|max-h)-[^\s]+|(?:bg|text|font|leading|tracking|rounded|border|shadow|ring|gap|space|items|justify|self|content|place|col|row|z|opacity|overflow|object|aspect|translate|scale|rotate|skew|inset|top|right|bottom|left)-[^\s]+)$/;
const CSS_MODULE_PATTERN = /(?:__|--)[A-Za-z0-9_-]*[A-Za-z0-9]{5,}$|_[a-f0-9]{6,}$/i;
const UUID_PATTERN = /^(?:[a-f0-9]{8}-){1}[a-f0-9]{4}-[1-5a-f0-9][a-f0-9]{3}-[89ab0-9][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LONG_DIGITS_PATTERN = /\d{10,}/;
const HYDRATION_ID_PATTERN = /^(?::r\d+:|react[-_:]|radix[-_:]|headlessui[-_:]|ember\d+|mui-\d+|uid-?\d+$|__next$)/i;
const HASHY_VALUE_PATTERN = /(?:^|[-_])[a-f0-9]{10,}(?:$|[-_])/i;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeSourceOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.origin.toLowerCase();
    }
    if (url.protocol === "file:") return "file://";
  } catch {
    // Fall through to a conservative normalized opaque origin.
  }
  const normalized = normalizeWhitespace(value).toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOpaqueSourceKey(value: string): string {
  return normalizeWhitespace(value).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function normalizeDocumentLocator(input: DocumentIdentityInput): string {
  if (input.sourceUrl) {
    try {
      const url = new URL(input.sourceUrl);
      url.username = "";
      url.password = "";
      url.hash = "";

      if (url.protocol === "http:" || url.protocol === "https:") {
        const kept = [...url.searchParams.entries()]
          .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_QUERY_KEYS.has(key.toLowerCase()))
          .sort(([aKey, aValue], [bKey, bValue]) =>
            aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
          );
        url.search = "";
        for (const [key, value] of kept) url.searchParams.append(key, value);
        url.hostname = url.hostname.toLowerCase();
        url.protocol = url.protocol.toLowerCase();
        return `${input.sourceType}:${url.toString()}`;
      }

      if (url.protocol === "file:") {
        return `${input.sourceType}:file://${normalizeOpaqueSourceKey(decodeURIComponent(url.pathname))}`;
      }
    } catch {
      // Use the opaque source key fallback below.
    }
  }

  if (input.sourceKey) {
    const key = normalizeOpaqueSourceKey(input.sourceKey);
    if (key.length > 0) return `${input.sourceType}:${key}`;
  }

  throw new TypeError("document identity requires sourceUrl or sourceKey");
}

export function isStableIdAttribute(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = normalizeWhitespace(value);
  if (normalized.length === 0 || normalized.length > 128) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (UUID_PATTERN.test(normalized)) return false;
  if (LONG_DIGITS_PATTERN.test(normalized)) return false;
  if (HYDRATION_ID_PATTERN.test(normalized)) return false;
  if (HASHY_VALUE_PATTERN.test(normalized)) return false;
  return true;
}

function isStableDataValue(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  if (normalized.length === 0 || normalized.length > 160) return false;
  if (UUID_PATTERN.test(normalized) || LONG_DIGITS_PATTERN.test(normalized)) return false;
  if (HASHY_VALUE_PATTERN.test(normalized)) return false;
  return true;
}

export function getStableDataAttributes(
  attributes: Readonly<Record<string, string>> | undefined,
): string[] {
  if (!attributes) return [];
  const pairs: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(attributes)) {
    const key = rawKey.toLowerCase();
    if (UNSTABLE_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (!STABLE_DATA_KEYS.has(key)) continue;
    if (!isStableDataValue(rawValue)) continue;
    pairs.push(`${key}=${normalizeWhitespace(rawValue).toLowerCase()}`);
  }
  return pairs.sort();
}

export function isMeaningfulClassToken(value: string): boolean {
  const token = value.trim();
  if (token.length < 2 || token.length > 80) return false;
  if (token.includes(":") || token.includes("[") || token.includes("]") || token.includes("/")) {
    return false;
  }
  const lower = token.toLowerCase();
  if (GENERIC_UTILITY_CLASSES.has(lower)) return false;
  if (UTILITY_CLASS_PATTERN.test(lower)) return false;
  if (CSS_MODULE_PATTERN.test(token)) return false;
  if (HASHY_VALUE_PATTERN.test(token)) return false;
  return true;
}

export function getMeaningfulClasses(classes: readonly string[] | undefined): string[] {
  if (!classes) return [];
  return [...new Set(classes.filter(isMeaningfulClassToken).map((item) => item.trim().toLowerCase()))]
    .sort()
    .slice(0, 8);
}

export function normalizeRole(role: string | undefined): string | undefined {
  if (!role) return undefined;
  const normalized = normalizeWhitespace(role).toLowerCase();
  return normalized.length > 0 && normalized.length <= 80 ? normalized : undefined;
}

export function normalizeTagName(tagName: string): string {
  const normalized = normalizeWhitespace(tagName).toLowerCase();
  if (normalized.length === 0) throw new TypeError("tagName must be non-empty");
  return normalized;
}

export function normalizeTextForIdentity(text: string | undefined): string | undefined {
  if (!text) return undefined;
  let normalized = normalizeWhitespace(text).toLowerCase();
  if (normalized.length === 0) return undefined;
  normalized = normalized
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "<email>")
    .replace(/\b\d+(?:[.,:/-]\d+)*\b/g, "#")
    .replace(/\s+/g, " ")
    .slice(0, 192);
  return normalized.length > 0 ? normalized : undefined;
}

function ancestrySegmentSignature(segment: StableAncestrySegment): string {
  const tag = normalizeTagName(segment.tagName);
  const role = normalizeRole(segment.role);
  const id = isStableIdAttribute(segment.idAttribute)
    ? normalizeWhitespace(segment.idAttribute!).toLowerCase()
    : undefined;
  const data = getStableDataAttributes(segment.dataAttributes);
  const classes = getMeaningfulClasses(segment.classList);
  return [
    tag,
    role ? `role=${role}` : "",
    id ? `id=${id}` : "",
    data.length > 0 ? `data=${data.join("&")}` : "",
    classes.length > 0 ? `class=${classes.join(".")}` : "",
  ]
    .filter(Boolean)
    .join("|");
}

export function normalizeAncestry(ancestry: readonly StableAncestrySegment[] | undefined): string[] {
  if (!ancestry) return [];
  return ancestry.slice(-10).map(ancestrySegmentSignature);
}

export function normalizeAssetFingerprints(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => normalizeWhitespace(value).toLowerCase()).filter(Boolean))]
    .sort()
    .slice(0, 8);
}

export function collectStableIdentitySignals(input: StableIdentityNodeInput): StableIdentitySignals {
  if (!input.captureNodeId.trim()) throw new TypeError("captureNodeId must be non-empty");
  if (!input.documentId.trim()) throw new TypeError("documentId must be non-empty");
  if (!Number.isSafeInteger(input.structuralPosition.siblingIndex) || input.structuralPosition.siblingIndex < 0) {
    throw new TypeError("structuralPosition.siblingIndex must be a non-negative integer");
  }

  const stableIdAttribute = isStableIdAttribute(input.idAttribute)
    ? normalizeWhitespace(input.idAttribute!).toLowerCase()
    : undefined;
  const stableDataAttributes = getStableDataAttributes(input.dataAttributes);
  const meaningfulClasses = getMeaningfulClasses(input.classList);
  const ancestry = normalizeAncestry(input.ancestry);
  const normalizedText = normalizeTextForIdentity(input.textContent);
  const assetFingerprints = normalizeAssetFingerprints(input.assetFingerprints);
  const usesStructuralFallback =
    !stableIdAttribute &&
    stableDataAttributes.length === 0 &&
    !normalizedText &&
    assetFingerprints.length === 0;

  return {
    documentId: input.documentId.trim(),
    ...(normalizeSourceOrigin(input.sourceOrigin)
      ? { sourceOrigin: normalizeSourceOrigin(input.sourceOrigin) }
      : {}),
    tagName: normalizeTagName(input.tagName),
    ...(input.namespace ? { namespace: normalizeWhitespace(input.namespace).toLowerCase() } : {}),
    ...(normalizeRole(input.role) ? { role: normalizeRole(input.role) } : {}),
    ...(stableIdAttribute ? { stableIdAttribute } : {}),
    stableDataAttributes,
    meaningfulClasses,
    ancestry,
    ...(normalizedText ? { normalizedText } : {}),
    assetFingerprints,
    structuralPosition: input.structuralPosition,
    usesStructuralFallback,
  };
}
