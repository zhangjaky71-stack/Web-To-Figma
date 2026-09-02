import {
  resolveTabSource,
  type SourceCapability,
  type SourceDescriptor,
} from "@w2f/source-providers";

export interface ActiveTabSourceResolution {
  tabId: number;
  tab: chrome.tabs.Tab;
  capability: SourceCapability;
  descriptor?: SourceDescriptor;
}

type ChromeWithPermissions = typeof chrome & {
  permissions: {
    contains(permissions: { origins?: string[] }): Promise<boolean>;
  };
};

async function hasActiveFileSchemeAccess(): Promise<boolean> {
  return (chrome as ChromeWithPermissions).permissions.contains({ origins: ["file:///*"] });
}

export async function resolveActiveTabSource(): Promise<ActiveTabSourceResolution> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number" || !tab.url) {
    throw new Error("No active browser tab with a source URL is available");
  }

  const fileSchemeAccess = tab.url.startsWith("file:")
    ? await hasActiveFileSchemeAccess()
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
