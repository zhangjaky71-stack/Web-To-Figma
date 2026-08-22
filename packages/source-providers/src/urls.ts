import {
  SourceProviderError,
  type ResolvedSourceReference,
  type SourceReferenceKind,
} from "./types.js";

const UNSAFE_PROTOCOLS = new Set(["javascript:", "vbscript:"]);

export function sanitizeSerializableUrl(input: string): string {
  const url = new URL(input);
  url.username = "";
  url.password = "";
  return url.toString();
}

export function getUrlProtocol(input: string): string | null {
  try {
    return new URL(input).protocol.toLowerCase();
  } catch {
    return null;
  }
}

function classifyProtocol(protocol: string): SourceReferenceKind {
  switch (protocol) {
    case "http:":
    case "https:":
      return "network";
    case "file:":
      return "file";
    case "data:":
      return "inline";
    case "blob:":
      return "blob";
    default:
      return "unsupported";
  }
}

export function resolveUrlReference(reference: string, baseUrl: string): ResolvedSourceReference {
  let resolved: URL;
  try {
    resolved = new URL(reference, baseUrl);
  } catch {
    throw new SourceProviderError("invalid-reference", `Invalid source reference: ${reference}`);
  }

  const protocol = resolved.protocol.toLowerCase();
  if (UNSAFE_PROTOCOLS.has(protocol)) {
    return {
      input: reference,
      locator: resolved.toString(),
      scheme: protocol,
      kind: "unsupported",
      resolvable: false,
    };
  }

  const kind = classifyProtocol(protocol);
  return {
    input: reference,
    locator: sanitizeSerializableUrl(resolved.toString()),
    scheme: protocol,
    kind,
    resolvable: kind !== "unsupported",
  };
}

export function normalizeLocalRelativePath(input: string): string {
  const normalizedInput = input.replaceAll("\\", "/").trim();
  if (!normalizedInput || normalizedInput.includes("\0")) {
    throw new SourceProviderError(
      "invalid-reference",
      "Local path must be non-empty and contain no NUL bytes",
    );
  }
  if (normalizedInput.startsWith("/") || /^[A-Za-z]:\//.test(normalizedInput)) {
    throw new SourceProviderError(
      "path-escapes-root",
      `Absolute local path is not allowed: ${input}`,
    );
  }

  const stack: string[] = [];
  for (const segment of normalizedInput.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) {
        throw new SourceProviderError(
          "path-escapes-root",
          `Local path escapes selected root: ${input}`,
        );
      }
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  if (stack.length === 0) {
    throw new SourceProviderError(
      "invalid-reference",
      `Local path resolves to an empty path: ${input}`,
    );
  }
  return stack.join("/");
}

export function splitReferenceSuffix(reference: string): { path: string; suffix: string } {
  const queryIndex = reference.indexOf("?");
  const hashIndex = reference.indexOf("#");
  const candidates = [queryIndex, hashIndex].filter((value) => value >= 0);
  if (candidates.length === 0) return { path: reference, suffix: "" };
  const boundary = Math.min(...candidates);
  return { path: reference.slice(0, boundary), suffix: reference.slice(boundary) };
}

export function buildLocalFolderLocator(rootId: string, relativePath: string, suffix = ""): string {
  const encodedRoot = encodeURIComponent(rootId);
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `local-folder://${encodedRoot}/${encodedPath}${suffix}`;
}
