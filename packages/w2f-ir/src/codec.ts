import { canonicalStringify } from "@w2f/w2f-schema";
import { WTF_IR_VERSION } from "./types.js";
import { validateWtfIrBundle } from "./validation.js";
import type {
  WtfIrBundle,
  WtfIrEnvelope,
  WtfIrMigrationResult,
  WtfIrValidationError,
  WtfIrValidationResult,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const BUNDLE_KEYS = [
  "document",
  "sourceGraph",
  "renderTree",
  "styles",
  "assets",
  "responsive",
  "states",
  "diagnostics",
  "tokens",
] as const;

function validationFailure(
  path: string,
  code: string,
  message: string,
): WtfIrValidationResult<never> {
  return { ok: false, errors: [{ path, code, message }] };
}

function selectFlatBundle(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(BUNDLE_KEYS.map((key) => [key, value[key]]));
}

export function createWtfIrEnvelope(bundle: WtfIrBundle): WtfIrEnvelope {
  return { irVersion: WTF_IR_VERSION, bundle };
}

export function migrateWtfIrEnvelope(
  value: unknown,
): WtfIrValidationResult<WtfIrMigrationResult> {
  if (!isRecord(value)) {
    return validationFailure("$", "WTF_IR_ENVELOPE_INVALID", "IR envelope must be an object");
  }

  if (value.irVersion !== WTF_IR_VERSION) {
    return validationFailure(
      "$.irVersion",
      "WTF_IR_VERSION_UNSUPPORTED",
      `unsupported IR version: ${String(value.irVersion)}`,
    );
  }

  let bundleValue: unknown;
  let migrated = false;
  let fromVersion = WTF_IR_VERSION;

  if (isRecord(value.bundle)) {
    bundleValue = value.bundle;
  } else if (BUNDLE_KEYS.every((key) => key in value)) {
    bundleValue = selectFlatBundle(value);
    migrated = true;
    fromVersion = `${WTF_IR_VERSION}-flat-draft`;
  } else {
    return validationFailure(
      "$.bundle",
      "WTF_IR_BUNDLE_MISSING",
      "IR envelope must contain bundle or the recognized flat V2 draft payloads",
    );
  }

  const validation = validateWtfIrBundle(bundleValue);
  if (!validation.ok) return validation;

  return {
    ok: true,
    value: {
      migrated,
      fromVersion,
      toVersion: WTF_IR_VERSION,
      envelope: createWtfIrEnvelope(validation.value),
    },
  };
}

export function encodeWtfIrEnvelope(envelope: WtfIrEnvelope): string {
  const migration = migrateWtfIrEnvelope(envelope);
  if (!migration.ok) {
    const details = migration.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new TypeError(`Cannot encode invalid W2F IR: ${details}`);
  }
  return canonicalStringify(migration.value.envelope);
}

export function decodeWtfIrEnvelope(text: string): WtfIrValidationResult<WtfIrMigrationResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    const errors: WtfIrValidationError[] = [
      { path: "$", code: "WTF_IR_JSON_INVALID", message },
    ];
    return { ok: false, errors };
  }
  return migrateWtfIrEnvelope(parsed);
}
