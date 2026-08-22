import {
  resolveTabSource,
  type SourceCapability,
  type SourceDescriptor,
} from "@w2f/source-providers";

export interface ActiveTabSourceResolution {
  tabId: number;
  tabUrl: string;
  tabTitle?: string;
  capability: SourceCapability;
  descriptor?: SourceDescriptor;
}

export async function resolveActiveTabSource(): Promise<ActiveTabSourceResolution> {
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
    tabUrl: tab.url,
    ...(tab.title === undefined ? {} : { tabTitle: tab.title }),
    capability: resolved.capability,
    ...(resolved.descriptor === undefined ? {} : { descriptor: resolved.descriptor }),
  };
}
