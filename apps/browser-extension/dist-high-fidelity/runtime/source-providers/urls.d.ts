import { type ResolvedSourceReference } from "./types.js";
export declare function sanitizeSerializableUrl(input: string): string;
export declare function getUrlProtocol(input: string): string | null;
export declare function resolveUrlReference(reference: string, baseUrl: string): ResolvedSourceReference;
export declare function normalizeLocalRelativePath(input: string): string;
export declare function splitReferenceSuffix(reference: string): {
    path: string;
    suffix: string;
};
export declare function buildLocalFolderLocator(rootId: string, relativePath: string, suffix?: string): string;
//# sourceMappingURL=urls.d.ts.map