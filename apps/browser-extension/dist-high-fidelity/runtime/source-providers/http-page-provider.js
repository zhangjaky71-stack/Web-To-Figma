import { SourceProviderError } from "./types.js";
import { getUrlProtocol, resolveUrlReference, sanitizeSerializableUrl } from "./urls.js";
export class HttpPageProvider {
    kind = "http-page";
    getCapability(input) {
        const protocol = getUrlProtocol(input.url);
        const supported = protocol === "http:" || protocol === "https:";
        return supported
            ? {
                provider: this.kind,
                supported: true,
                available: true,
                code: "ready",
                reason: "HTTP(S) page is available through the active-tab capture boundary",
            }
            : {
                provider: this.kind,
                supported: false,
                available: false,
                code: "unsupported-scheme",
                reason: `HttpPageProvider requires http: or https:, received ${protocol ?? "invalid URL"}`,
            };
    }
    open(input) {
        const capability = this.getCapability(input);
        if (!capability.available) {
            throw new SourceProviderError(capability.code, capability.reason);
        }
        const sourceUrl = sanitizeSerializableUrl(input.url);
        const parsed = new URL(sourceUrl);
        return {
            provider: this.kind,
            sourceType: "http",
            sourceUrl,
            baseLocator: sourceUrl,
            displayName: input.title?.trim() || parsed.hostname,
            offline: false,
        };
    }
    resolveReference(reference, source) {
        if (source.provider !== this.kind || source.sourceType !== "http" || !source.sourceUrl) {
            throw new SourceProviderError("invalid-reference", "HttpPageProvider received an incompatible source descriptor");
        }
        return resolveUrlReference(reference, source.baseLocator);
    }
}
//# sourceMappingURL=http-page-provider.js.map