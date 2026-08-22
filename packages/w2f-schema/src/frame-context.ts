export interface FrameContext {
  frameId: string;
  parentFrameId?: string;
  origin?: string;
  url?: string;
}

export type FrameContextValidationResult =
  | { ok: true; value: FrameContext }
  | { ok: false; errors: string[] };

export function validateFrameContext(value: unknown): FrameContextValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["frame context must be an object"] };
  }

  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof record.frameId !== "string" || record.frameId.trim().length === 0) {
    errors.push("frameId must be a non-empty string");
  }
  for (const field of ["parentFrameId", "origin", "url"] as const) {
    const candidate = record[field];
    if (candidate !== undefined && (typeof candidate !== "string" || candidate.length === 0)) {
      errors.push(`${field} must be a non-empty string when present`);
    }
  }

  return errors.length === 0
    ? { ok: true, value: value as FrameContext }
    : { ok: false, errors };
}
