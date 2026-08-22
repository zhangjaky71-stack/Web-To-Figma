export const SOURCE_PROVIDERS_VERSION = "1.0.0";
export class SourceProviderError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "SourceProviderError";
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map