import { resolveTabSource, } from "./source-providers/index.js";
export async function resolveActiveTabSource() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || typeof tab.id !== "number" || !tab.url) {
        throw new Error("No active browser tab with a source URL is available");
    }
    const fileSchemeAccess = tab.url.startsWith("file:")
        ? await chrome.extension.isAllowedFileSchemeAccess()
        : false;
    const resolved = resolveTabSource({
        url: tab.url,
        fileSchemeAccess,
        ...(tab.title === undefined ? {} : { title: tab.title }),
    });
    return {
        tabId: tab.id,
        tab,
        capability: resolved.capability,
        ...(resolved.descriptor === undefined ? {} : { descriptor: resolved.descriptor }),
    };
}
//# sourceMappingURL=source-runtime.js.map