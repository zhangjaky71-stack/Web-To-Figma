import { SOURCE_PROVIDERS_VERSION } from "@w2f/source-providers";
import { STABLE_IDENTITY_ALGORITHM_VERSION } from "@w2f/stable-identity";
import { WTF_IR_VERSION } from "@w2f/w2f-ir";
import { WTF_SCHEMA_VERSION } from "@w2f/w2f-schema";
import { W2F_EXTENSION_SHELL_VERSION } from "./runtime/protocol.js";

export const BROWSER_EXTENSION_APP_ID = "w2f-browser-extension" as const;

export function getBrowserExtensionAppId(): string {
  return BROWSER_EXTENSION_APP_ID;
}

export function getBrowserWtfSchemaVersion(): string {
  return WTF_SCHEMA_VERSION;
}

export function getBrowserWtfIrVersion(): string {
  return WTF_IR_VERSION;
}

export function getBrowserStableIdentityAlgorithmVersion(): string {
  return STABLE_IDENTITY_ALGORITHM_VERSION;
}

export function getBrowserSourceProvidersVersion(): string {
  return SOURCE_PROVIDERS_VERSION;
}

export function getBrowserExtensionShellVersion(): string {
  return W2F_EXTENSION_SHELL_VERSION;
}
