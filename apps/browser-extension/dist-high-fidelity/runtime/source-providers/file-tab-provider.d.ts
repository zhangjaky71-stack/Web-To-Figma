import type { FileTabInput, ResolvedSourceReference, SourceCapability, SourceDescriptor, SourceProvider } from "./types.js";
export declare class FileTabProvider implements SourceProvider<FileTabInput> {
    readonly kind: "file-tab";
    getCapability(input: FileTabInput): SourceCapability;
    open(input: FileTabInput): SourceDescriptor;
    resolveReference(reference: string, source: SourceDescriptor): ResolvedSourceReference;
}
//# sourceMappingURL=file-tab-provider.d.ts.map