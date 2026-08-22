export interface ScaleContext {
  devicePixelRatio: number;
  browserPageZoom?: number;
  cssZoom?: number;
  visualViewportScale?: number;
}

export type ScaleEvidenceAvailability = "observed" | "unavailable" | "not-applicable";

export interface ScaleContextEvidence {
  context: ScaleContext;
  browserPageZoomAvailability: ScaleEvidenceAvailability;
  cssZoomAvailability: ScaleEvidenceAvailability;
  reasons: string[];
}

export type ScaleContextValidationResult =
  { ok: true; value: ScaleContext } | { ok: false; errors: string[] };

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateScaleContext(value: unknown): ScaleContextValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["scale context must be an object"] };
  }

  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!isPositiveFinite(record.devicePixelRatio)) {
    errors.push("devicePixelRatio must be a positive finite number");
  }
  for (const field of ["browserPageZoom", "cssZoom", "visualViewportScale"] as const) {
    const candidate = record[field];
    if (candidate !== undefined && !isPositiveFinite(candidate)) {
      errors.push(`${field} must be a positive finite number when present`);
    }
  }

  return errors.length === 0 ? { ok: true, value: value as ScaleContext } : { ok: false, errors };
}
