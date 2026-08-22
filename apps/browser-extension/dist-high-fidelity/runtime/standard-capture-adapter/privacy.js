const SENSITIVE_ATTRIBUTE_PATTERN = /(?:^|[-_:])(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)(?:$|[-_:])/i;
const SENSITIVE_QUERY_PATTERN = /(authorization|auth|token|secret|password|passwd|cookie|session|credential|signature|api[-_]?key|access[-_]?key)/i;
const URL_ATTRIBUTES = new Set(["action", "formaction", "href", "poster", "src", "cite"]);
export function isSensitiveCapturedAttribute(tagName, attributeName) {
    const tag = tagName.toUpperCase();
    const name = attributeName.toLowerCase();
    if (name === "srcdoc" || name === "style" || name.startsWith("on"))
        return true;
    if ((tag === "INPUT" || tag === "TEXTAREA") && name === "value")
        return true;
    return SENSITIVE_ATTRIBUTE_PATTERN.test(name);
}
export function sanitizeCapturedUrl(value, baseUrl) {
    try {
        const url = new URL(value, baseUrl);
        if (url.username || url.password) {
            url.username = "";
            url.password = "";
        }
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_QUERY_PATTERN.test(key))
                url.searchParams.delete(key);
        }
        return url.href;
    }
    catch {
        return value;
    }
}
export function sanitizeCapturedAttributes(tagName, attributes, baseUrl) {
    const result = {};
    for (const attribute of attributes) {
        const name = attribute.name.toLowerCase();
        if (isSensitiveCapturedAttribute(tagName, name))
            continue;
        const rawValue = attribute.value.slice(0, 16_384);
        result[name] = URL_ATTRIBUTES.has(name) ? sanitizeCapturedUrl(rawValue, baseUrl) : rawValue;
    }
    return result;
}
//# sourceMappingURL=privacy.js.map