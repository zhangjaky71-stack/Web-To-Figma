import {
  evaluateNode31MeasurementArtifact,
  type W2fNode31MeasurementArtifact,
} from "@w2f/figma-renderer";
import { parseWtfPackage, type WtfParsedPackage } from "@w2f/wtf-parser";
import { createNode31DesktopEvidenceArchive } from "./node31-desktop-archive.js";
import { createNode31DesktopEvidenceBundle } from "./node31-desktop-evidence.js";
import { detectNode31FigmaDesktopHost } from "./node31-desktop-host.js";
import {
  node31MeasurementMessage,
  W2F_NODE31_MEASUREMENT_PROTOCOL,
  W2F_NODE31_MEASUREMENT_PROTOCOL_VERSION,
  type W2fNode31DesktopMeasurementResult,
  type W2fNode31MainToUiPayload,
  type W2fNode31SelectedRootInfo,
} from "./node31-measurement-protocol.js";
import { node29PixelQaReference } from "./qa-payload.js";
import { runNode29VisualQa } from "./visual-qa-ui.js";

declare const __W2F_NODE31_BRANCH_HEAD__: string;

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`NODE31_E_UI_ELEMENT: missing #${id}`);
  return value as T;
}

const wtfInput = element<HTMLInputElement>("node31-wtf-file");
const measurementInput = element<HTMLInputElement>("node31-measurement-file");
const wtfLabel = element<HTMLDivElement>("node31-wtf-label");
const measurementLabel = element<HTMLDivElement>("node31-measurement-label");
const hostLabel = element<HTMLDivElement>("node31-host-label");
const selectionLabel = element<HTMLDivElement>("node31-selection-label");
const statusLabel = element<HTMLDivElement>("node31-status");
const measureButton = element<HTMLButtonElement>("node31-measure");
const refreshButton = element<HTMLButtonElement>("node31-refresh");
const closeButton = element<HTMLButtonElement>("node31-close");

const host = detectNode31FigmaDesktopHost({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
});

let parsed: WtfParsedPackage | null = null;
let wtfBytes: Uint8Array | null = null;
let wtfSha256 = "";
let baseArtifact: W2fNode31MeasurementArtifact | null = null;
let selection: W2fNode31SelectedRootInfo | null = null;
let measuring = false;

function post(payload: unknown): void {
  parent.postMessage({ pluginMessage: node31MeasurementMessage(payload) }, "*");
}

function setStatus(message: string, kind: "info" | "ok" | "error" = "info"): void {
  statusLabel.textContent = message;
  statusLabel.dataset.kind = kind;
}

function bytesFromArrayBuffer(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isMeasurementArtifact(value: unknown): value is W2fNode31MeasurementArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === "1.0.0" &&
    record.evidenceType === "node31-fidelity-measurement" &&
    typeof record.sample === "object" &&
    record.sample !== null &&
    typeof record.provenance === "object" &&
    record.provenance !== null &&
    typeof record.pipeline === "object" &&
    record.pipeline !== null &&
    typeof record.metrics === "object" &&
    record.metrics !== null &&
    Array.isArray(record.antiCheatingViolations)
  );
}

function identityMatchesSelection(): boolean {
  if (!parsed || !selection?.ok) return false;
  const document = parsed.ir.document;
  return (
    selection.documentId === document.documentId &&
    selection.captureId === document.captureId &&
    selection.revisionId === document.revisionId &&
    selection.sourceFingerprint === document.sourceFingerprint
  );
}

function refreshState(): void {
  hostLabel.textContent = host.isDesktop
    ? `Desktop verified · ${host.platform || "unknown platform"}`
    : `Desktop unavailable · ${host.reason}`;
  hostLabel.dataset.ok = String(host.isDesktop);

  if (!selection) {
    selectionLabel.textContent = "Selection not inspected yet";
  } else if (!selection.ok) {
    selectionLabel.textContent = selection.reason ?? "Selection is not a W2F import root";
  } else {
    selectionLabel.textContent = `${selection.nodeName ?? "W2F root"} · ${selection.nodeId ?? ""}${
      parsed ? (identityMatchesSelection() ? " · source identity matched" : " · source identity mismatch") : ""
    }`;
  }

  const partialPipelineReady = Boolean(
    baseArtifact &&
      baseArtifact.pipeline.browserCapture.status === "PASS" &&
      baseArtifact.pipeline.wtfPackage.status === "PASS" &&
      baseArtifact.pipeline.secureParse.status === "PASS",
  );
  const exactHead = Boolean(
    baseArtifact &&
      /^[a-f0-9]{40}$/.test(__W2F_NODE31_BRANCH_HEAD__) &&
      baseArtifact.provenance.branchHead === __W2F_NODE31_BRANCH_HEAD__,
  );
  const pairedWtf = Boolean(
    baseArtifact && wtfSha256 && baseArtifact.pipeline.wtfPackage.sha256 === wtfSha256,
  );
  measureButton.disabled = !(
    host.isDesktop &&
    parsed &&
    baseArtifact &&
    selection?.ok &&
    identityMatchesSelection() &&
    partialPipelineReady &&
    exactHead &&
    pairedWtf &&
    !measuring
  );
}

async function loadWtf(file: File): Promise<void> {
  try {
    const bytes = bytesFromArrayBuffer(await file.arrayBuffer());
    const [nextParsed, digest] = await Promise.all([parseWtfPackage(bytes), sha256(bytes)]);
    const reference = node29PixelQaReference(nextParsed);
    if (!reference) throw new Error("WTF package has no complete full-page Pixel Ground Truth reference");
    parsed = nextParsed;
    wtfBytes = bytes;
    wtfSha256 = digest;
    wtfLabel.textContent = `${file.name} · ${bytes.byteLength.toLocaleString()} bytes · ${digest.slice(0, 12)}…`;
    setStatus("WTF secure parse complete. Load the matching partial measurement sidecar.", "ok");
  } catch (cause) {
    parsed = null;
    wtfBytes = null;
    wtfSha256 = "";
    wtfLabel.textContent = "WTF rejected";
    setStatus(cause instanceof Error ? cause.message : String(cause), "error");
  } finally {
    refreshState();
  }
}

async function loadMeasurement(file: File): Promise<void> {
  try {
    const text = await file.text();
    const value: unknown = JSON.parse(text);
    if (!isMeasurementArtifact(value)) throw new Error("Not a NODE-31 measurement artifact");
    const report = evaluateNode31MeasurementArtifact(value);
    if (report.failures.length > 0) {
      throw new Error(`Partial measurement has contract failures: ${report.failures.join("; ")}`);
    }
    if (
      value.pipeline.browserCapture.status !== "PASS" ||
      value.pipeline.wtfPackage.status !== "PASS" ||
      value.pipeline.secureParse.status !== "PASS"
    ) {
      throw new Error("Partial measurement must contain real PASS browser/WTF/secure-parse provenance");
    }
    if (value.provenance.branchHead !== __W2F_NODE31_BRANCH_HEAD__) {
      throw new Error(
        `Exact-head mismatch: sidecar ${value.provenance.branchHead}, Desktop harness ${__W2F_NODE31_BRANCH_HEAD__}`,
      );
    }
    baseArtifact = value;
    measurementLabel.textContent = `${file.name} · ${value.sample.id} · partial ${report.status}`;
    setStatus("Partial measurement validated. Select the matching imported W2F root Frame.", "ok");
  } catch (cause) {
    baseArtifact = null;
    measurementLabel.textContent = "Measurement sidecar rejected";
    setStatus(cause instanceof Error ? cause.message : String(cause), "error");
  } finally {
    refreshState();
  }
}

function downloadJson(name: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function finishMeasurement(result: W2fNode31DesktopMeasurementResult): Promise<void> {
  if (!parsed || !baseArtifact || !wtfBytes) throw new Error("Measurement inputs were cleared");
  if (result.sampleId !== baseArtifact.sample.id) {
    throw new Error(`Measurement sample mismatch: ${result.sampleId} vs ${baseArtifact.sample.id}`);
  }
  const reference = node29PixelQaReference(parsed);
  if (!reference) throw new Error("Pixel Ground Truth reference disappeared after secure parse");
  const visual = await runNode29VisualQa(parsed, {
    referenceId: reference.id,
    tiles: result.tiles,
  });
  if (visual.report.status === "UNAVAILABLE") {
    throw new Error(`Figma Desktop visual comparison unavailable: ${visual.detail}`);
  }

  const evidence = await createNode31DesktopEvidenceBundle({
    baseArtifact,
    host: {
      isDesktop: host.isDesktop,
      apiVersion: result.host.apiVersion,
      editorType: result.host.editorType,
      userAgent: host.userAgent,
      platform: host.platform,
    },
    intakeId: `${baseArtifact.sample.id}:${baseArtifact.pipeline.wtfPackage.sha256?.slice(0, 16) ?? "wtf"}`,
    rootNodeId: result.rootNodeId,
    createdNodeCount: result.createdNodeCount,
    mappedRenderNodeCount: result.mappedRenderNodeCount,
    importStartedAt: result.measurementStartedAt,
    importCompletedAt: result.measurementCompletedAt,
    structureQa: result.structureQa,
    visualQa: visual.report,
    referenceId: reference.id,
    tiles: result.tiles,
  });
  const archive = createNode31DesktopEvidenceArchive({
    sampleId: baseArtifact.sample.id,
    sourceSha256: baseArtifact.sample.sourceSha256,
    files: evidence.files,
  });
  const safeSample = baseArtifact.sample.id.replace(/[^a-zA-Z0-9._-]+/g, "-");
  downloadJson(`${safeSample}.node31-desktop-evidence.json`, archive);

  const report = evidence.completion.report;
  setStatus(
    `Desktop evidence exported · artifact ${report.status} · visual ${(visual.report.metrics.normalizedSimilarity * 100).toFixed(2)}% · structure ${(result.structureQa.metrics.structureScore * 100).toFixed(2)}% · editable ${(result.structureQa.metrics.editableAreaRatio * 100).toFixed(2)}% · raster ${(result.structureQa.metrics.rasterAreaRatio * 100).toFixed(2)}%. RC thresholds are evaluated after evidence ingest.`,
    report.failures.length > 0 ? "error" : "ok",
  );
}

function isMainMessage(
  value: unknown,
): value is { payload: W2fNode31MainToUiPayload } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (
    message.protocol !== W2F_NODE31_MEASUREMENT_PROTOCOL ||
    message.version !== W2F_NODE31_MEASUREMENT_PROTOCOL_VERSION ||
    typeof message.payload !== "object" ||
    message.payload === null ||
    Array.isArray(message.payload)
  ) {
    return false;
  }
  return typeof (message.payload as Record<string, unknown>).type === "string";
}

wtfInput.addEventListener("change", () => {
  const file = wtfInput.files?.[0];
  if (file) void loadWtf(file);
});
measurementInput.addEventListener("change", () => {
  const file = measurementInput.files?.[0];
  if (file) void loadMeasurement(file);
});
refreshButton.addEventListener("click", () => post({ type: "NODE31_REFRESH_SELECTION" }));
closeButton.addEventListener("click", () => post({ type: "NODE31_CLOSE" }));
measureButton.addEventListener("click", () => {
  if (!parsed || !baseArtifact || !selection?.ok) return;
  const reference = node29PixelQaReference(parsed);
  if (!reference) return;
  measuring = true;
  refreshState();
  setStatus("Exporting the selected Figma root and comparing real Desktop pixels…");
  post({
    type: "NODE31_MEASURE",
    request: {
      sampleId: baseArtifact.sample.id,
      renderTree: parsed.ir.renderTree,
      assets: parsed.ir.assets.assets,
      expectedIdentity: {
        documentId: parsed.ir.document.documentId,
        captureId: parsed.ir.document.captureId,
        revisionId: parsed.ir.document.revisionId,
        sourceFingerprint: parsed.ir.document.sourceFingerprint,
        rootRenderNodeId: parsed.ir.renderTree.rootId,
      },
      reference,
    },
  });
});

window.addEventListener("message", (event: MessageEvent) => {
  const candidate = event.data?.pluginMessage;
  if (!isMainMessage(candidate)) return;
  const payload = candidate.payload;
  switch (payload.type) {
    case "NODE31_SELECTION":
      selection = payload.selection;
      refreshState();
      return;
    case "NODE31_MEASUREMENT_RESULT":
      measuring = false;
      void finishMeasurement(payload.result)
        .catch((cause) => setStatus(cause instanceof Error ? cause.message : String(cause), "error"))
        .finally(refreshState);
      return;
    case "NODE31_ERROR":
      measuring = false;
      setStatus(`${payload.code}: ${payload.message}`, "error");
      refreshState();
      return;
  }
});

hostLabel.textContent = host.reason;
refreshState();
post({ type: "NODE31_UI_READY" });
