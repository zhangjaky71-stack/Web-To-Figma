import {
  createDefaultImportSelection,
  createFileIntakeDescriptor,
  createInitialIntakeState,
  assertWtfIntakeCandidate,
  normalizeSelectedSections,
  selectionForPreview,
  transitionProgress,
  type W2fIntakeState,
} from "./intake-state.js";
import {
  figmaMessage,
  isW2fImportProfile,
  isW2fImportScope,
  W2F_FIGMA_PROTOCOL,
  W2F_FIGMA_PROTOCOL_VERSION,
  type W2fFileIntakeDescriptor,
  type W2fImportProfile,
  type W2fImportScope,
  type W2fMainToUiPayload,
  type W2fParserPreview,
  type W2fUiToMainPayload,
} from "./protocol.js";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`W2F_E_UI_ELEMENT: missing #${id}`);
  return value as T;
}

const fileInput = element<HTMLInputElement>("wtf-file");
const chooseButton = element<HTMLButtonElement>("choose-file");
const dropZone = element<HTMLDivElement>("drop-zone");
const fileName = element<HTMLDivElement>("file-name");
const fileMeta = element<HTMLDivElement>("file-meta");
const progressLabel = element<HTMLDivElement>("progress-label");
const progressDetail = element<HTMLDivElement>("progress-detail");
const progressBar = element<HTMLProgressElement>("progress-bar");
const scopeGroup = element<HTMLFieldSetElement>("scope-group");
const sections = element<HTMLDivElement>("section-outline");
const sectionsEmpty = element<HTMLDivElement>("sections-empty");
const importButton = element<HTMLButtonElement>("import-button");
const cancelButton = element<HTMLButtonElement>("cancel-button");
const closeButton = element<HTMLButtonElement>("close-button");
const parserBoundary = element<HTMLDivElement>("parser-boundary");

let state: W2fIntakeState = createInitialIntakeState();
let currentBytes: Uint8Array | null = null;

function postToMain(payload: W2fUiToMainPayload): void {
  parent.postMessage({ pluginMessage: figmaMessage(payload) }, "*");
}

function isMainMessage(value: unknown): value is { payload: W2fMainToUiPayload } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.protocol !== W2F_FIGMA_PROTOCOL || record.version !== W2F_FIGMA_PROTOCOL_VERSION)
    return false;
  if (
    typeof record.payload !== "object" ||
    record.payload === null ||
    Array.isArray(record.payload)
  )
    return false;
  return typeof (record.payload as Record<string, unknown>).type === "string";
}

function setProgress(next: W2fIntakeState["progress"]): void {
  state = { ...state, progress: transitionProgress(state.progress, next) };
  progressLabel.textContent = next.label;
  progressDetail.textContent = next.detail ?? "";
  progressBar.max = next.total;
  progressBar.value = next.completed;
  progressBar.dataset.stage = next.stage;
  cancelButton.disabled = ["idle", "done", "failed", "cancelled"].includes(next.stage);
}

function setError(code: string, message: string): void {
  state = {
    ...state,
    error: { code, message },
    progress: {
      stage: "failed",
      completed: 0,
      total: 1,
      label: "File intake failed",
      detail: message,
    },
  };
  progressLabel.textContent = "File intake failed";
  progressDetail.textContent = `${code}: ${message}`;
  progressBar.value = 0;
  importButton.disabled = true;
}

function renderFile(descriptor: W2fFileIntakeDescriptor | null): void {
  if (!descriptor) {
    fileName.textContent = "No file selected";
    fileMeta.textContent = ".wtf · local only";
    return;
  }
  fileName.textContent = descriptor.fileName;
  const location = descriptor.canvasPoint
    ? ` · canvas ${Math.round(descriptor.canvasPoint.x)}, ${Math.round(descriptor.canvasPoint.y)}`
    : "";
  fileMeta.textContent = `${descriptor.byteLength.toLocaleString()} bytes · ${descriptor.source}${location}`;
}

function renderSections(preview: W2fParserPreview | null): void {
  sections.replaceChildren();
  if (!preview || preview.sectionOutline.length === 0) {
    sectionsEmpty.hidden = false;
    return;
  }
  sectionsEmpty.hidden = true;
  const selected = new Set(state.selection.selectedSectionIds);
  for (const section of preview.sectionOutline) {
    const label = document.createElement("label");
    label.className = "section-item";
    label.style.paddingInlineStart = `${12 + section.depth * 14}px`;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = section.id;
    input.checked = selected.has(section.id);
    input.disabled = state.selection.scope !== "selected-sections";
    input.addEventListener("change", () => {
      if (!state.preview) return;
      const current = [
        ...sections.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'),
      ].map((item) => item.value);
      state = {
        ...state,
        selection: {
          ...state.selection,
          selectedSectionIds: normalizeSelectedSections(state.preview, current),
        },
      };
      postToMain({ type: "W2F_IMPORT_SELECTION", selection: state.selection });
    });
    const text = document.createElement("span");
    text.textContent = section.name;
    label.append(input, text);
    sections.append(label);
  }
}

function updateSelectionFromControls(): void {
  const profileInput = document.querySelector<HTMLInputElement>('input[name="profile"]:checked');
  const scopeInput = document.querySelector<HTMLInputElement>('input[name="scope"]:checked');
  const profile = profileInput?.value;
  const scope = scopeInput?.value;
  if (!isW2fImportProfile(profile) || !isW2fImportScope(scope)) return;
  state = {
    ...state,
    selection: {
      ...state.selection,
      profile,
      scope,
      selectedSectionIds:
        scope === "selected-sections" && state.preview
          ? selectionForPreview(state.selection, state.preview).selectedSectionIds
          : state.selection.selectedSectionIds,
      tokenPolicy: "literal",
    },
  };
  renderSections(state.preview);
  postToMain({ type: "W2F_IMPORT_SELECTION", selection: state.selection });
}

function acceptBytes(descriptor: W2fFileIntakeDescriptor, bytes: Uint8Array): void {
  currentBytes = Uint8Array.from(bytes);
  state = {
    ...state,
    descriptor,
    preview: null,
    selection: createDefaultImportSelection(),
    error: null,
  };
  renderFile(descriptor);
  renderSections(null);
  importButton.disabled = true;
  parserBoundary.hidden = false;
  setProgress({
    stage: "awaiting-secure-parser",
    completed: 1,
    total: 1,
    label: "Ready for secure validation",
    detail: "Archive contents remain unopened until NODE-23 Secure Parser validates them.",
  });
  postToMain({ type: "W2F_INTAKE_METADATA", descriptor });
}

async function readUiFile(file: File, source: "choose" | "ui-drop"): Promise<void> {
  try {
    assertWtfIntakeCandidate(file.name, file.size);
    state = {
      ...state,
      progress: { stage: "reading", completed: 0, total: 1, label: `Reading ${file.name}` },
    };
    progressLabel.textContent = state.progress.label;
    progressDetail.textContent = "Local file bytes stay inside the plugin runtime.";
    progressBar.max = 1;
    progressBar.value = 0;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const descriptor = createFileIntakeDescriptor({
      source,
      fileName: file.name,
      mimeType: file.type,
      byteLength: bytes.byteLength,
    });
    acceptBytes(descriptor, bytes);
  } catch (error) {
    setError("W2F_E_INTAKE_UI_FILE", error instanceof Error ? error.message : String(error));
  }
}

function applyParserPreview(preview: W2fParserPreview): void {
  if (!state.descriptor || preview.intakeId !== state.descriptor.intakeId) return;
  state = {
    ...state,
    preview,
    selection: selectionForPreview(state.selection, preview),
    error: null,
  };
  parserBoundary.hidden = true;
  setProgress({
    stage: "preview-ready",
    completed: 1,
    total: 1,
    label: "Ready to import",
    detail: `${preview.renderNodeCount.toLocaleString()} render nodes · ${preview.sectionOutline.length} sections`,
  });
  renderSections(preview);
  importButton.disabled = false;
}

chooseButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void readUiFile(file, "choose");
});

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.dataset.dragging = "true";
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, () => delete dropZone.dataset.dragging);
}
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file) void readUiFile(file, "ui-drop");
});

for (const input of document.querySelectorAll<HTMLInputElement>(
  'input[name="profile"], input[name="scope"]',
)) {
  input.addEventListener("change", updateSelectionFromControls);
}

importButton.addEventListener("click", () => {
  if (!state.preview || !currentBytes) return;
  postToMain({ type: "W2F_IMPORT_SELECTION", selection: state.selection });
  setError(
    "W2F_E_RENDERER_NOT_IMPLEMENTED",
    "Secure parsing begins in NODE-23 and rendering begins in NODE-24/25; NODE-22 intentionally does not render untrusted bytes.",
  );
});
cancelButton.addEventListener("click", () => {
  currentBytes = null;
  postToMain({ type: "W2F_CANCEL_IMPORT" });
});
closeButton.addEventListener("click", () => postToMain({ type: "W2F_CLOSE_PLUGIN" }));

window.addEventListener("message", (event: MessageEvent) => {
  const candidate = event.data?.pluginMessage;
  if (!isMainMessage(candidate)) return;
  const payload = candidate.payload;
  switch (payload.type) {
    case "W2F_SHELL_INFO":
      return;
    case "W2F_FILE_BYTES":
      acceptBytes(payload.descriptor, payload.bytes);
      return;
    case "W2F_PARSER_PREVIEW":
      applyParserPreview(payload.preview);
      return;
    case "W2F_PROGRESS":
      setProgress(payload.progress);
      return;
    case "W2F_ERROR":
      setError(payload.code, payload.message);
      return;
  }
});

scopeGroup.disabled = false;
renderFile(null);
renderSections(null);
postToMain({ type: "W2F_UI_READY" });

void currentBytes;
void (null as unknown as W2fImportProfile);
void (null as unknown as W2fImportScope);
