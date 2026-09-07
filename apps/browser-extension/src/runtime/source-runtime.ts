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

type TabsQueryWithLastFocusedWindow = (queryInfo: {
  active?: boolean;
  lastFocusedWindow?: boolean;
}) => Promise<chrome.tabs.Tab[]>;

async function hasActiveFileSchemeAccess(): Promise<boolean> {
  return (chrome as ChromeWithPermissions).permissions.contains({ origins: ["file:///*"] });
}

function isUsableSourceTab(tab: chrome.tabs.Tab | undefined): tab is chrome.tabs.Tab & {
  id: number;
  url: string;
} {
  return Boolean(tab && typeof tab.id === "number" && tab.url);
}

async function resolveFallbackSourceTab(): Promise<chrome.tabs.Tab | undefined> {
  const queryTabs = chrome.tabs.query as unknown as TabsQueryWithLastFocusedWindow;
  const tabs = await queryTabs({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

export async function resolveActiveTabSource(
  preferredTab?: chrome.tabs.Tab,
): Promise<ActiveTabSourceResolution> {
  const tab = isUsableSourceTab(preferredTab) ? preferredTab : await resolveFallbackSourceTab();
  if (!isUsableSourceTab(tab)) {
    throw new Error("No active browser tab with a source URL is available");
  }

  const fileSchemeAccess = tab.url.startsWith("file:") ? await hasActiveFileSchemeAccess() : false;
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
