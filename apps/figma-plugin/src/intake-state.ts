import {
  type W2fFileIntakeDescriptor,
  type W2fImportProgress,
  type W2fImportProgressStage,
  type W2fImportSelection,
  type W2fIntakeSource,
  type W2fParserPreview,
} from "./protocol.js";

export const W2F_MAX_INTAKE_BYTES = 1024 * 1024 * 1024;

export interface W2fIntakeState {
  descriptor: W2fFileIntakeDescriptor | null;
  preview: W2fParserPreview | null;
  selection: W2fImportSelection;
  progress: W2fImportProgress;
  error: { code: string; message: string } | null;
}

export function createDefaultImportSelection(): W2fImportSelection {
  return {
    profile: "balanced",
    scope: "whole-page",
    selectedSectionIds: [],
    tokenPolicy: "literal",
  };
}

export function createIdleProgress(): W2fImportProgress {
  return { stage: "idle", completed: 0, total: 1, label: "Choose or drop a .wtf file" };
}

export function createInitialIntakeState(): W2fIntakeState {
  return {
    descriptor: null,
    preview: null,
    selection: createDefaultImportSelection(),
    progress: createIdleProgress(),
    error: null,
  };
}

export function isWtfFilename(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith(".wtf");
}

export function assertWtfIntakeCandidate(fileName: string, byteLength: number): void {
  if (!isWtfFilename(fileName)) throw new TypeError("W2F_E_FILE_EXTENSION: expected a .wtf file");
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new TypeError("W2F_E_FILE_SIZE: file size must be a non-negative safe integer");
  }
  if (byteLength > W2F_MAX_INTAKE_BYTES) {
    throw new RangeError("W2F_E_FILE_TOO_LARGE: file exceeds the frozen 1 GiB archive ceiling");
  }
}

function stableIntakeId(source: W2fIntakeSource, fileName: string, byteLength: number): string {
  let hash = 2166136261;
  const input = `${source}\u0000${fileName}\u0000${byteLength}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `intake_${(hash >>> 0).toString(16).padStart(8, "0")}_${byteLength}`;
}

export function createFileIntakeDescriptor(input: {
  source: W2fIntakeSource;
  fileName: string;
  mimeType?: string;
  byteLength: number;
  canvasPoint?: { x: number; y: number };
}): W2fFileIntakeDescriptor {
  const fileName = input.fileName.trim();
  assertWtfIntakeCandidate(fileName, input.byteLength);
  return {
    intakeId: stableIntakeId(input.source, fileName, input.byteLength),
    source: input.source,
    fileName,
    mimeType: input.mimeType?.trim() || "application/x-wtf",
    byteLength: input.byteLength,
    ...(input.canvasPoint ? { canvasPoint: { ...input.canvasPoint } } : {}),
  };
}

const ALLOWED_PROGRESS_TRANSITIONS: Record<
  W2fImportProgressStage,
  readonly W2fImportProgressStage[]
> = {
  idle: ["reading", "cancelled", "failed"],
  reading: ["awaiting-secure-parser", "validating", "cancelled", "failed"],
  "awaiting-secure-parser": ["validating", "cancelled", "failed"],
  validating: ["migrating", "preview-ready", "cancelled", "failed"],
  migrating: ["preview-ready", "cancelled", "failed"],
  "preview-ready": ["importing", "reading", "cancelled", "failed"],
  importing: ["finalizing", "cancelled", "failed"],
  finalizing: ["done", "failed"],
  done: ["reading"],
  failed: ["reading", "idle"],
  cancelled: ["reading", "idle"],
};

export function transitionProgress(
  current: W2fImportProgress,
  next: W2fImportProgress,
): W2fImportProgress {
  if (
    current.stage !== next.stage &&
    !ALLOWED_PROGRESS_TRANSITIONS[current.stage].includes(next.stage)
  ) {
    throw new Error(`W2F_E_IMPORT_STATE: invalid transition ${current.stage} -> ${next.stage}`);
  }
  if (
    !Number.isSafeInteger(next.completed) ||
    !Number.isSafeInteger(next.total) ||
    next.completed < 0 ||
    next.total < 1 ||
    next.completed > next.total
  ) {
    throw new TypeError("W2F_E_IMPORT_PROGRESS: progress counters are invalid");
  }
  return { ...next };
}

export function selectionForPreview(
  current: W2fImportSelection,
  preview: W2fParserPreview,
): W2fImportSelection {
  const validIds = new Set(preview.sectionOutline.map((section) => section.id));
  const defaults = preview.sectionOutline
    .filter((section) => section.defaultSelected)
    .map((section) => section.id);
  const selected = current.selectedSectionIds.filter((id) => validIds.has(id));
  return {
    ...current,
    selectedSectionIds: selected.length > 0 ? selected : defaults,
    tokenPolicy: "literal",
  };
}

export function normalizeSelectedSections(
  preview: W2fParserPreview,
  sectionIds: readonly string[],
): string[] {
  const validIds = new Set(preview.sectionOutline.map((section) => section.id));
  return [...new Set(sectionIds.filter((id) => validIds.has(id)))].sort();
}
