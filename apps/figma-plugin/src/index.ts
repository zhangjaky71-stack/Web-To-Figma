import { WTF_SCHEMA_VERSION } from "@w2f/w2f-schema";

export const FIGMA_PLUGIN_APP_ID = "w2f-figma-plugin" as const;

export function getFigmaPluginAppId(): string {
  return FIGMA_PLUGIN_APP_ID;
}

export function getFigmaWtfSchemaVersion(): string {
  return WTF_SCHEMA_VERSION;
}
