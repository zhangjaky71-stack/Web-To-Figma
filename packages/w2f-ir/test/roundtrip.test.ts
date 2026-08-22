import { describe, expect, it } from "vitest";
import {
  WTF_IR_VERSION,
  createWtfIrEnvelope,
  decodeWtfIrEnvelope,
  encodeWtfIrEnvelope,
  migrateWtfIrEnvelope,
  validateWtfIrBundle,
} from "../src/index.js";
import { createIrBundle } from "./fixture.js";

describe("W2F IR V2 roundtrip and migration", () => {
  it("validates the canonical Source Graph + Render Tree fixture", () => {
    expect(validateWtfIrBundle(createIrBundle()).ok).toBe(true);
  });

  it("roundtrips the complete IR bundle through deterministic JSON", () => {
    const envelope = createWtfIrEnvelope(createIrBundle());
    const encoded = encodeWtfIrEnvelope(envelope);
    const decoded = decodeWtfIrEnvelope(encoded);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.migrated).toBe(false);
    expect(decoded.value.envelope).toEqual(envelope);
    expect(encodeWtfIrEnvelope(decoded.value.envelope)).toBe(encoded);
  });

  it("preserves sub-pixel browser geometry in the encoded IR", () => {
    const encoded = encodeWtfIrEnvelope(createWtfIrEnvelope(createIrBundle()));
    expect(encoded).toContain("64.33333333333333");
    expect(encoded).toContain("1359.5");
  });

  it("migrates the recognized flat V2 draft envelope into the canonical envelope", () => {
    const bundle = createIrBundle();
    const migrated = migrateWtfIrEnvelope({ irVersion: WTF_IR_VERSION, ...bundle });

    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.migrated).toBe(true);
    expect(migrated.value.fromVersion).toBe("2.0.0-flat-draft");
    expect(migrated.value.toVersion).toBe(WTF_IR_VERSION);
    expect(migrated.value.envelope.bundle).toEqual(bundle);
  });

  it("rejects unsupported IR versions instead of silently coercing them", () => {
    const result = migrateWtfIrEnvelope({
      irVersion: "3.0.0",
      bundle: createIrBundle(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("WTF_IR_VERSION_UNSUPPORTED");
    }
  });

  it("reports invalid JSON through the IR validation result", () => {
    const result = decodeWtfIrEnvelope("{not-json}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("WTF_IR_JSON_INVALID");
    }
  });
});
