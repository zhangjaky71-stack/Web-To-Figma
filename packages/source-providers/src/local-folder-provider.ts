import type {
  LocalFolderEntry,
  LocalFolderInput,
  OpenLocalFolderSource,
  ResolvedSourceReference,
  SourceCapability,
  SourceProvider,
} from "./types.js";
import { SourceProviderError } from "./types.js";
import {
  buildLocalFolderLocator,
  getUrlProtocol,
  normalizeLocalRelativePath,
  resolveUrlReference,
  splitReferenceSuffix,
} from "./urls.js";

function normalizedEntries(entries: readonly LocalFolderEntry[]): Map<string, LocalFolderEntry> {
  const result = new Map<string, LocalFolderEntry>();
  for (const entry of entries) {
    const relativePath = normalizeLocalRelativePath(entry.relativePath);
    if (result.has(relativePath)) {
      throw new SourceProviderError(
        "invalid-local-folder-selection",
        `Duplicate local folder entry: ${relativePath}`,
      );
    }
    result.set(relativePath, { ...entry, relativePath });
  }
  return result;
}

function getSelectionError(input: LocalFolderInput): string | null {
  if (!input.rootId?.trim() || !input.rootName?.trim() || !input.documentPath?.trim() || !input.entries) {
    return "A local folder root, entry document, and file list must be selected";
  }
  try {
    const entries = normalizedEntries(input.entries);
    const documentPath = normalizeLocalRelativePath(input.documentPath);
    if (!entries.has(documentPath)) return `Selected document is not present in the local folder: ${documentPath}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

function joinLocalReference(documentPath: string, referencePath: string): string {
  if (!referencePath) return documentPath;
  if (referencePath.startsWith("/")) {
    return normalizeLocalRelativePath(referencePath.slice(1));
  }
  const slash = documentPath.lastIndexOf("/");
  const baseDirectory = slash < 0 ? "" : documentPath.slice(0, slash + 1);
  return normalizeLocalRelativePath(`${baseDirectory}${referencePath}`);
}

export class LocalFolderProvider implements SourceProvider<LocalFolderInput, OpenLocalFolderSource> {
  readonly kind = "local-folder" as const;

  getCapability(input: LocalFolderInput): SourceCapability {
    const hasAnySelection = Boolean(input.rootId || input.rootName || input.documentPath || input.entries);
    if (!hasAnySelection) {
      return {
        provider: this.kind,
        supported: true,
        available: false,
        code: "missing-local-folder-selection",
        reason: "No local folder has been selected",
        requiredUserAction: "choose-local-folder",
      };
    }

    const error = getSelectionError(input);
    if (error) {
      return {
        provider: this.kind,
        supported: true,
        available: false,
        code: "invalid-local-folder-selection",
        reason: error,
        requiredUserAction: "choose-local-folder",
      };
    }

    return {
      provider: this.kind,
      supported: true,
      available: true,
      code: "ready",
      reason: "Selected local folder contains the requested entry document",
    };
  }

  open(input: LocalFolderInput): OpenLocalFolderSource {
    const capability = this.getCapability(input);
    if (!capability.available) {
      throw new SourceProviderError(capability.code, capability.reason);
    }

    const rootId = input.rootId!;
    const rootName = input.rootName!;
    const documentPath = normalizeLocalRelativePath(input.documentPath!);
    const entries = normalizedEntries(input.entries!);
    const baseLocator = buildLocalFolderLocator(rootId, documentPath);

    return {
      descriptor: {
        provider: this.kind,
        sourceType: "local-folder",
        sourceKey: `local-folder:${rootId}`,
        baseLocator,
        displayName: rootName,
        offline: true,
      },
      documentPath,
      entries,
    };
  }

  resolveReference(reference: string, source: OpenLocalFolderSource): ResolvedSourceReference {
    const protocol = getUrlProtocol(reference);
    if (protocol) {
      return resolveUrlReference(reference, source.descriptor.baseLocator);
    }
    if (reference.startsWith("//")) {
      return {
        input: reference,
        locator: reference,
        scheme: "",
        kind: "unsupported",
        resolvable: false,
      };
    }

    const { path, suffix } = splitReferenceSuffix(reference);
    const relativePath = joinLocalReference(source.documentPath, path);
    return {
      input: reference,
      locator: buildLocalFolderLocator(source.descriptor.sourceKey!.slice("local-folder:".length), relativePath, suffix),
      scheme: "local-folder:",
      kind: "local-folder",
      resolvable: true,
      localPath: relativePath,
      exists: source.entries.has(relativePath),
    };
  }
}
