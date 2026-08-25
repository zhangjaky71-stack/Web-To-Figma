const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

function normalize(value: unknown, excludedKeys: ReadonlySet<string>, inArray = false): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("NODE-30 canonical JSON rejects non-finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value === undefined) return inArray ? null : undefined;
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, excludedKeys, true));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (excludedKeys.has(key)) continue;
      const normalized = normalize((value as Record<string, unknown>)[key], excludedKeys, false);
      if (normalized !== undefined) output[key] = normalized;
    }
    return output;
  }
  throw new Error(`NODE-30 canonical JSON rejects ${typeof value}`);
}

export function canonicalJson(value: unknown, excludedKeys: readonly string[] = []): string {
  return JSON.stringify(normalize(value, new Set(excludedKeys))) ?? "null";
}

export function deterministicHash(value: unknown, excludedKeys: readonly string[] = []): string {
  const text = canonicalJson(value, excludedKeys);
  let hash = FNV64_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * FNV64_PRIME) & FNV64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}
