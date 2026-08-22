import type { SourceCapability, SourceDescriptor } from "./types.js";
export interface TabSourceInput {
    url: string;
    title?: string;
    fileSchemeAccess: boolean;
}
export interface TabSourceResolution {
    capability: SourceCapability;
    descriptor?: SourceDescriptor;
}
export declare function getTabSourceCapability(input: TabSourceInput): SourceCapability;
export declare function resolveTabSource(input: TabSourceInput): TabSourceResolution;
//# sourceMappingURL=registry.d.ts.map