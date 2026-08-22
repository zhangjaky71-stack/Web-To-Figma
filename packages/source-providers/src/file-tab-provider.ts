import type {
  FileTabInput,
  ResolvedSourceReference,
  SourceCapability,
  SourceDescriptor,
  SourceProvider,
} from "./types.js";
import { SourceProviderError } from "./types.js";
import { getUrlProtocol, resolveUrlReference, sanitizeSerializableUrl } from "./urls.js";

export class FileTabProvider implements SourceProvider<FileTabInput> {
  readonly kind = "file-tab" as const;

  getCapability(input: FileTabInput): SourceCapability {
    const protocol = getUrlProtocol(input.url);
    if (protocol !== "file:") {
      return {
        provider: this.kind,
        supported: false,
        available: false,
        code: "unsupported-scheme",
        reason: `FileTabProvider requires file:, received ${protocol ?? "invalid URL"}`,
      };
    }
    if (!input.fileSchemeAccess) {
      return {
        provider: this.kind,
        supported: true,
        available: false,
        code: "file-scheme-access-disabled",
        reason: "Chrome file URL access is disabled for this extension",
        requiredUserAction: "enable-file-url-access",
      };
    }
    return {
      provider: this.kind,
      supported: true,
      available: true,
      code: "ready",
      reason: "Local file tab is available because file URL access is enabled",
    };
  }

  open(input: FileTabInput): SourceDescriptor {
    const capability = this.getCapability(input);
    if (!capability.available) {
      throw new SourceProviderError(capability.code, capability.reason);
    }

    const sourceUrl = sanitizeSerializableUrl(input.url);
    const parsed = new URL(sourceUrl);
    const fileName = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "Local file";
    return {
      provider: this.kind,
      sourceType: "file",
      sourceUrl,
      baseLocator: sourceUrl,
      displayName: input.title?.trim() || decodeURIComponent(fileName),
      offline: true,
    };
  }

  resolveReference(reference: string, source: SourceDescriptor): ResolvedSourceReference {
    if (source.provider !== this.kind || source.sourceType !== "file" || !source.sourceUrl) {
      throw new SourceProviderError("invalid-reference", "FileTabProvider received an incompatible source descriptor");
    }
    return resolveUrlReference(reference, source.baseLocator);
  }
}
