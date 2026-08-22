import { WTF_SCHEMA_VERSION } from "@w2f/w2f-schema";

export const BROWSER_EXTENSION_APP_ID = "w2f-browser-extension" as const;

export function getBrowserExtensionAppId(): string {
  return BROWSER_EXTENSION_APP_ID;
}

export function getBrowserWtfSchemaVersion(): string {
  return WTF_SCHEMA_VERSION;
}
