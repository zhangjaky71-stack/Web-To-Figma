import type { LocalFolderInput, OpenLocalFolderSource, ResolvedSourceReference, SourceCapability, SourceProvider } from "./types.js";
export declare class LocalFolderProvider implements SourceProvider<LocalFolderInput, OpenLocalFolderSource> {
    readonly kind: "local-folder";
    getCapability(input: LocalFolderInput): SourceCapability;
    open(input: LocalFolderInput): OpenLocalFolderSource;
    resolveReference(reference: string, source: OpenLocalFolderSource): ResolvedSourceReference;
}
//# sourceMappingURL=local-folder-provider.d.ts.map