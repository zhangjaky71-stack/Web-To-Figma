import type { HttpPageInput, ResolvedSourceReference, SourceCapability, SourceDescriptor, SourceProvider } from "./types.js";
export declare class HttpPageProvider implements SourceProvider<HttpPageInput> {
    readonly kind: "http-page";
    getCapability(input: HttpPageInput): SourceCapability;
    open(input: HttpPageInput): SourceDescriptor;
    resolveReference(reference: string, source: SourceDescriptor): ResolvedSourceReference;
}
//# sourceMappingURL=http-page-provider.d.ts.map