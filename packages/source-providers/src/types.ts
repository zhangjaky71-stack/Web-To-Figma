export const SOURCE_PROVIDERS_VERSION = "1.0.0" as const;

export type SourceProviderKind = "http-page" | "file-tab" | "local-folder";
export type SourceDocumentType = "http" | "file" | "local-folder";
export type SourceUserAction = "enable-file-url-access" | "choose-local-folder";
export type SourceReferenceKind =
  | "network"
  | "file"
  | "local-folder"
  | "inline"
  | "blob"
  | "unsupported";

export interface SourceCapability {
  provider: SourceProviderKind;
  supported: boolean;
  available: boolean;
  code:
    | "ready"
    | "unsupported-scheme"
    | "file-scheme-access-disabled"
    | "missing-local-folder-selection"
    | "invalid-local-folder-selection";
  reason: string;
  requiredUserAction?: SourceUserAction;
}

export interface SourceDescriptor {
  provider: SourceProviderKind;
  sourceType: SourceDocumentType;
  baseLocator: string;
  displayName: string;
  offline: boolean;
  sourceUrl?: string;
  sourceKey?: string;
}

export interface ResolvedSourceReference {
  input: string;
  locator: string;
  scheme: string;
  kind: SourceReferenceKind;
  resolvable: boolean;
  localPath?: string;
  exists?: boolean;
}

export interface HttpPageInput {
  url: string;
  title?: string;
}

export interface FileTabInput {
  url: string;
  title?: string;
  fileSchemeAccess: boolean;
}

export interface LocalFolderEntry {
  relativePath: string;
  size?: number;
  mediaType?: string;
  lastModified?: number;
}

export interface LocalFolderInput {
  rootId?: string;
  rootName?: string;
  documentPath?: string;
  entries?: readonly LocalFolderEntry[];
}

export interface OpenLocalFolderSource {
  descriptor: SourceDescriptor;
  documentPath: string;
  entries: ReadonlyMap<string, LocalFolderEntry>;
}

export interface SourceProvider<TInput, TOpened = SourceDescriptor> {
  readonly kind: SourceProviderKind;
  getCapability(input: TInput): SourceCapability;
  open(input: TInput): TOpened;
}

export class SourceProviderError extends Error {
  readonly code: SourceCapability["code"] | "invalid-reference" | "path-escapes-root";

  constructor(
    code: SourceProviderError["code"],
    message: string,
  ) {
    super(message);
    this.name = "SourceProviderError";
    this.code = code;
  }
}
