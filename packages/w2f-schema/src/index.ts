export const WTF_FILE_EXTENSION = ".wtf" as const;
export const WTF_MIME_TYPE = "application/x-wtf" as const;
export const WTF_FORMAT_VERSION = "2.0.0" as const;
export const WTF_SCHEMA_VERSION = "2.0.0" as const;
export const WTF_ASSET_CODEC_VERSION = "1" as const;
export const WTF_CONTAINER_KIND = "w2f-portable-document" as const;

export const WTF_GEOMETRY_PRECISION_POLICY = {
  storage: "ieee-754-double",
  captureRounding: "forbidden",
  serialization: "json-number",
} as const;

export const WTF_DEFAULT_ENTRYPOINTS = {
  document: "document.json",
  sourceGraph: "source-graph.json",
  renderTree: "render-tree.json",
  styles: "styles.json",
  assets: "assets.json",
  responsive: "responsive.json",
  states: "states.json",
  diagnostics: "diagnostics.json",
  tokens: "tokens.json",
  sourceCascade: "source/cascade.json",
  sourceMetadata: "source/metadata.json",
} as const;

export const WTF_REQUIRED_PAYLOAD_PATHS = Object.values(WTF_DEFAULT_ENTRYPOINTS);

export const WTF_KNOWN_FEATURES = [
  "source-graph",
  "render-tree",
  "stable-identity",
  "responsive-snapshots",
  "states",
  "pixel-ground-truth",
  "raster-tiles",
  "token-graph",
  "structural-fingerprints",
  "revision-metadata",
  "scroll-roots",
  "composed-tree",
  "precise-geometry",
] as const;

export type WtfKnownFeature = (typeof WTF_KNOWN_FEATURES)[number];

export type WtfTokenKind =
  | "color"
  | "number"
  | "dimension"
  | "spacing"
  | "radius"
  | "opacity"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "shadow"
  | "gradient"
  | "string"
  | "unknown";

export interface WtfTokenScope {
  sourceNodeId?: string;
  stylesheetRef?: string;
  selector?: string;
}

export interface WtfToken {
  id: string;
  name: string;
  kind: WtfTokenKind;
  rawValue: string;
  resolvedValue?: unknown;
  scope: WtfTokenScope;
  references: string[];
  source: {
    type: "css-custom-property" | "inline-variable" | "derived";
  };
  confidence: number;
}

export interface WtfTokenUsage {
  tokenId: string;
  sourceNodeId: string;
  property: string;
  authoredValue: string;
  resolvedValue: string;
}

export interface WtfTokenGraph {
  tokens: WtfToken[];
  usages: WtfTokenUsage[];
}

export interface StructuralFingerprint {
  semanticHash: string;
  layoutHash: string;
  paintHash?: string;
  combinedHash: string;
  confidence: number;
}

export interface NodeRevisionHashes {
  contentHash?: string;
  geometryHash?: string;
  layoutHash?: string;
  paintHash?: string;
  assetHash?: string;
  hierarchyHash?: string;
}

export interface WtfRevision {
  documentId: string;
  captureId: string;
  revisionId: string;
  parentRevisionId?: string;
  sourceFingerprint: string;
  capturedAt: string;
}

export interface ScrollContainerInfo {
  sourceNodeId: string;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
  overflowX: string;
  overflowY: string;
  isDocumentScrollRoot: boolean;
  isPrimaryApplicationScrollRoot: boolean;
  parentScrollContainerId?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CaptureTarget =
  | { type: "document" }
  | { type: "scroll-root"; sourceNodeId: string }
  | { type: "region"; bounds: Rect };

export interface NodeRelationships {
  sourceParentId?: string;
  composedParentId?: string;
  renderParentId?: string;
  assignedSlotId?: string;
  shadowHostId?: string;
}

export interface WtfResponsiveSnapshotRef {
  id: string;
  viewport: {
    width: number;
    height: number;
    dpr: number;
  };
  rootNodeId: string;
  environmentRef: string;
  stateRef?: string;
}

export interface WtfStateSnapshotRef {
  id: string;
  name: string;
  rootNodeId: string;
}

export interface WtfReferenceTileDescriptor {
  id: string;
  path: string;
  viewportId: string;
  bounds: Rect;
  dpr: number;
  sha256: string;
}

export interface WtfCompatibilityInfo {
  formatVersion: string;
  schemaVersion: string;
  writerVersion: string;
  minReaderVersion: string;
  assetCodecVersion: string;
  capabilities: string[];
}

export interface WtfFeatureSet {
  required: string[];
  optional: string[];
}

export type WtfFileRole =
  | "document"
  | "source-graph"
  | "render-tree"
  | "styles"
  | "assets-index"
  | "responsive"
  | "states"
  | "diagnostics"
  | "token-graph"
  | "source-cascade"
  | "source-metadata"
  | "reference-tiles-index"
  | "reference-tile"
  | "asset"
  | "preview"
  | "fallback"
  | "extension";

export interface WtfFileDescriptor {
  path: string;
  role: WtfFileRole | string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
}

export interface WtfEntrypoints {
  document: string;
  sourceGraph: string;
  renderTree: string;
  styles: string;
  assets: string;
  responsive: string;
  states: string;
  diagnostics: string;
  tokens: string;
  sourceCascade: string;
  sourceMetadata: string;
  referenceTiles?: string;
}

export interface WtfDocumentIdentity {
  documentId: string;
  captureId: string;
  sourceFingerprint: string;
  capturedAt: string;
  revisionId?: string;
  parentRevisionId?: string;
}

export interface WtfSecurityLimits {
  maxArchiveBytes: number;
  maxEntryBytes: number;
  maxJsonBytes: number;
  maxAssetBytes: number;
  maxEntries: number;
  maxPathLength: number;
  maxCompressionRatio: number;
}

export const WTF_HARD_SECURITY_LIMITS: Readonly<WtfSecurityLimits> = Object.freeze({
  maxArchiveBytes: 1_073_741_824,
  maxEntryBytes: 268_435_456,
  maxJsonBytes: 134_217_728,
  maxAssetBytes: 536_870_912,
  maxEntries: 100_000,
  maxPathLength: 1024,
  maxCompressionRatio: 200,
});

export interface WtfSignatureDescriptor {
  algorithm: string;
  keyId?: string;
  value: string;
}

export interface WtfManifest {
  kind: typeof WTF_CONTAINER_KIND;
  compatibility: WtfCompatibilityInfo;
  identity: WtfDocumentIdentity;
  captureTarget: CaptureTarget;
  entrypoints: WtfEntrypoints;
  features: WtfFeatureSet;
  files: WtfFileDescriptor[];
  security: {
    limits: WtfSecurityLimits;
  };
  signature?: WtfSignatureDescriptor;
}

export interface WtfChecksums {
  algorithm: "sha256";
  files: Record<string, string>;
}

export interface WtfContainerEntry {
  path: string;
  mediaType: string;
  uncompressedSize: number;
  compressedSize?: number;
}

export interface WtfValidationError {
  path: string;
  code: string;
  message: string;
}

export type WtfValidationResult<T> =
  { ok: true; value: T } | { ok: false; errors: WtfValidationError[] };

export interface WtfReaderSupport {
  readerVersion: string;
  supportedCapabilities: readonly string[];
  supportedFeatures: readonly string[];
}

export interface WtfCompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addError(errors: WtfValidationError[], path: string, code: string, message: string): void {
  errors.push({ path, code, message });
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function parseSemver(value: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return [major, minor, patch];
}

export function compareSemver(left: string, right: string): number | null {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    const leftPart = a[index];
    const rightPart = b[index];
    if (leftPart === undefined || rightPart === undefined) return null;
    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }
  return 0;
}

export function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function collectPortablePathErrors(
  path: string,
  maxLength: number,
  target: string,
  errors: WtfValidationError[],
): void {
  if (path.length === 0) {
    addError(errors, target, "WTF_PATH_EMPTY", "portable path must not be empty");
    return;
  }
  if (path.length > maxLength) {
    addError(errors, target, "WTF_PATH_TOO_LONG", "portable path exceeds the configured limit");
  }
  if (path.includes("\0") || path.includes("\\")) {
    addError(
      errors,
      target,
      "WTF_PATH_INVALID_CHAR",
      "portable path contains an invalid character",
    );
  }
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    addError(errors, target, "WTF_PATH_ABSOLUTE", "portable path must be relative");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    addError(
      errors,
      target,
      "WTF_PATH_TRAVERSAL",
      "portable path must be normalized without traversal",
    );
  }
  if (/^[\u0000-\u001f\u007f]/.test(path) || /[\u0000-\u001f\u007f]/.test(path)) {
    addError(errors, target, "WTF_PATH_CONTROL_CHAR", "portable path contains a control character");
  }
}

export function validatePortablePath(
  path: string,
  maxLength = WTF_HARD_SECURITY_LIMITS.maxPathLength,
): WtfValidationResult<string> {
  const errors: WtfValidationError[] = [];
  collectPortablePathErrors(path, maxLength, "$", errors);
  return errors.length === 0 ? { ok: true, value: path } : { ok: false, errors };
}

function validateCompatibility(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value)) {
    addError(errors, path, "WTF_COMPATIBILITY_TYPE", "compatibility must be an object");
    return;
  }
  const versionFields = [
    "formatVersion",
    "schemaVersion",
    "writerVersion",
    "minReaderVersion",
  ] as const;
  for (const field of versionFields) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "string" || parseSemver(fieldValue) === null) {
      addError(errors, `${path}.${field}`, "WTF_VERSION_INVALID", `${field} must be x.y.z semver`);
    }
  }
  if (typeof value.assetCodecVersion !== "string" || value.assetCodecVersion.length === 0) {
    addError(
      errors,
      `${path}.assetCodecVersion`,
      "WTF_ASSET_CODEC_VERSION_INVALID",
      "assetCodecVersion must be a non-empty string",
    );
  }
  if (!isStringArray(value.capabilities) || hasDuplicates(value.capabilities)) {
    addError(
      errors,
      `${path}.capabilities`,
      "WTF_CAPABILITIES_INVALID",
      "capabilities must be a unique string array",
    );
  }
  if (typeof value.formatVersion === "string") {
    const parsed = parseSemver(value.formatVersion);
    if (parsed && parsed[0] !== 2) {
      addError(
        errors,
        `${path}.formatVersion`,
        "WTF_FORMAT_MAJOR_UNSUPPORTED",
        "NODE-02 requires W2F format major version 2",
      );
    }
  }
  if (typeof value.schemaVersion === "string") {
    const parsed = parseSemver(value.schemaVersion);
    if (parsed && parsed[0] !== 2) {
      addError(
        errors,
        `${path}.schemaVersion`,
        "WTF_SCHEMA_MAJOR_UNSUPPORTED",
        "NODE-02 requires W2F schema major version 2",
      );
    }
  }
}

function validateIdentity(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value)) {
    addError(errors, path, "WTF_IDENTITY_TYPE", "identity must be an object");
    return;
  }
  for (const field of ["documentId", "captureId", "sourceFingerprint"] as const) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) {
      addError(errors, `${path}.${field}`, "WTF_IDENTITY_VALUE", `${field} must be non-empty`);
    }
  }
  if (
    typeof value.capturedAt !== "string" ||
    value.capturedAt.length === 0 ||
    Number.isNaN(Date.parse(value.capturedAt))
  ) {
    addError(
      errors,
      `${path}.capturedAt`,
      "WTF_CAPTURED_AT_INVALID",
      "capturedAt must be a valid timestamp",
    );
  }
  for (const field of ["revisionId", "parentRevisionId"] as const) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && (typeof fieldValue !== "string" || fieldValue.length === 0)) {
      addError(errors, `${path}.${field}`, "WTF_REVISION_ID_INVALID", `${field} must be non-empty`);
    }
  }
}

function validateRectInto(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value)) {
    addError(errors, path, "WTF_RECT_TYPE", "rect must be an object");
    return;
  }
  for (const field of ["x", "y", "width", "height"] as const) {
    if (typeof value[field] !== "number" || !Number.isFinite(value[field])) {
      addError(errors, `${path}.${field}`, "WTF_GEOMETRY_NONFINITE", `${field} must be finite`);
    }
  }
  if (typeof value.width === "number" && value.width < 0) {
    addError(errors, `${path}.width`, "WTF_GEOMETRY_NEGATIVE_SIZE", "width must be non-negative");
  }
  if (typeof value.height === "number" && value.height < 0) {
    addError(errors, `${path}.height`, "WTF_GEOMETRY_NEGATIVE_SIZE", "height must be non-negative");
  }
}

export function validateRect(value: unknown): WtfValidationResult<Rect> {
  const errors: WtfValidationError[] = [];
  validateRectInto(value, errors, "$");
  return errors.length === 0 ? { ok: true, value: value as Rect } : { ok: false, errors };
}

function validateCaptureTarget(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value) || typeof value.type !== "string") {
    addError(errors, path, "WTF_CAPTURE_TARGET_INVALID", "captureTarget must have a valid type");
    return;
  }
  if (value.type === "document") return;
  if (value.type === "scroll-root") {
    if (typeof value.sourceNodeId !== "string" || value.sourceNodeId.length === 0) {
      addError(
        errors,
        `${path}.sourceNodeId`,
        "WTF_SCROLL_ROOT_ID_INVALID",
        "scroll-root target requires sourceNodeId",
      );
    }
    return;
  }
  if (value.type === "region") {
    validateRectInto(value.bounds, errors, `${path}.bounds`);
    return;
  }
  addError(errors, `${path}.type`, "WTF_CAPTURE_TARGET_UNKNOWN", "unknown capture target type");
}

function validateEntrypoints(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value)) {
    addError(errors, path, "WTF_ENTRYPOINTS_TYPE", "entrypoints must be an object");
    return;
  }
  for (const [field, expected] of Object.entries(WTF_DEFAULT_ENTRYPOINTS)) {
    const actual = value[field];
    if (actual !== expected) {
      addError(
        errors,
        `${path}.${field}`,
        "WTF_ENTRYPOINT_DRIFT",
        `${field} must use the canonical path ${expected}`,
      );
    }
  }
  if (value.referenceTiles !== undefined) {
    if (typeof value.referenceTiles !== "string") {
      addError(
        errors,
        `${path}.referenceTiles`,
        "WTF_REFERENCE_TILES_PATH_INVALID",
        "referenceTiles must be a portable path",
      );
    } else {
      collectPortablePathErrors(
        value.referenceTiles,
        WTF_HARD_SECURITY_LIMITS.maxPathLength,
        `${path}.referenceTiles`,
        errors,
      );
    }
  }
}

function validateFeatures(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value)) {
    addError(errors, path, "WTF_FEATURES_TYPE", "features must be an object");
    return;
  }
  const required = value.required;
  const optional = value.optional;
  if (!isStringArray(required) || hasDuplicates(required)) {
    addError(
      errors,
      `${path}.required`,
      "WTF_REQUIRED_FEATURES_INVALID",
      "required features must be a unique string array",
    );
  }
  if (!isStringArray(optional) || hasDuplicates(optional)) {
    addError(
      errors,
      `${path}.optional`,
      "WTF_OPTIONAL_FEATURES_INVALID",
      "optional features must be a unique string array",
    );
  }
  if (isStringArray(required) && isStringArray(optional)) {
    const optionalSet = new Set(optional);
    if (required.some((feature) => optionalSet.has(feature))) {
      addError(
        errors,
        path,
        "WTF_FEATURE_OVERLAP",
        "a feature cannot be both required and optional",
      );
    }
    for (const coreFeature of ["source-graph", "render-tree", "precise-geometry"]) {
      if (!required.includes(coreFeature)) {
        addError(
          errors,
          `${path}.required`,
          "WTF_CORE_FEATURE_MISSING",
          `required features must include ${coreFeature}`,
        );
      }
    }
  }
}

function validateSecurityLimits(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value)) {
    addError(errors, path, "WTF_SECURITY_LIMITS_TYPE", "security limits must be an object");
    return;
  }
  for (const key of Object.keys(WTF_HARD_SECURITY_LIMITS) as (keyof WtfSecurityLimits)[]) {
    const candidate = value[key];
    const hardLimit = WTF_HARD_SECURITY_LIMITS[key];
    if (!isPositiveFiniteNumber(candidate) || !Number.isSafeInteger(candidate)) {
      addError(
        errors,
        `${path}.${key}`,
        "WTF_SECURITY_LIMIT_INVALID",
        `${key} must be a positive safe integer`,
      );
      continue;
    }
    if (candidate > hardLimit) {
      addError(
        errors,
        `${path}.${key}`,
        "WTF_SECURITY_LIMIT_TOO_HIGH",
        `${key} cannot exceed the reader hard limit`,
      );
    }
  }
}

function validateFiles(value: unknown, errors: WtfValidationError[], path: string): Set<string> {
  const paths = new Set<string>();
  if (!Array.isArray(value)) {
    addError(errors, path, "WTF_FILES_TYPE", "files must be an array");
    return paths;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      addError(errors, itemPath, "WTF_FILE_DESCRIPTOR_TYPE", "file descriptor must be an object");
      return;
    }
    if (typeof item.path !== "string") {
      addError(errors, `${itemPath}.path`, "WTF_FILE_PATH_TYPE", "file path must be a string");
    } else {
      collectPortablePathErrors(
        item.path,
        WTF_HARD_SECURITY_LIMITS.maxPathLength,
        `${itemPath}.path`,
        errors,
      );
      if (item.path === "manifest.json" || item.path === "checksums.json") {
        addError(
          errors,
          `${itemPath}.path`,
          "WTF_RESERVED_FILE_IN_PAYLOAD",
          "manifest.json and checksums.json are reserved container entries",
        );
      }
      if (paths.has(item.path)) {
        addError(errors, `${itemPath}.path`, "WTF_DUPLICATE_FILE", "file path must be unique");
      }
      paths.add(item.path);
    }
    if (typeof item.role !== "string" || item.role.length === 0) {
      addError(errors, `${itemPath}.role`, "WTF_FILE_ROLE_INVALID", "file role must be non-empty");
    }
    if (typeof item.mediaType !== "string" || item.mediaType.length === 0) {
      addError(
        errors,
        `${itemPath}.mediaType`,
        "WTF_FILE_MEDIA_TYPE_INVALID",
        "mediaType must be non-empty",
      );
    }
    if (!isSafeNonNegativeInteger(item.sizeBytes)) {
      addError(
        errors,
        `${itemPath}.sizeBytes`,
        "WTF_FILE_SIZE_INVALID",
        "sizeBytes must be a non-negative safe integer",
      );
    }
    if (typeof item.sha256 !== "string" || !isSha256(item.sha256)) {
      addError(
        errors,
        `${itemPath}.sha256`,
        "WTF_SHA256_INVALID",
        "sha256 must be 64 lowercase hex characters",
      );
    }
  });
  return paths;
}

function validateSignature(value: unknown, errors: WtfValidationError[], path: string): void {
  if (!isRecord(value)) {
    addError(errors, path, "WTF_SIGNATURE_TYPE", "signature must be an object");
    return;
  }
  for (const field of ["algorithm", "value"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      addError(errors, `${path}.${field}`, "WTF_SIGNATURE_INVALID", `${field} must be non-empty`);
    }
  }
  if (value.keyId !== undefined && (typeof value.keyId !== "string" || value.keyId.length === 0)) {
    addError(errors, `${path}.keyId`, "WTF_SIGNATURE_KEY_INVALID", "keyId must be non-empty");
  }
}

export function validateWtfManifest(value: unknown): WtfValidationResult<WtfManifest> {
  const errors: WtfValidationError[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [{ path: "$", code: "WTF_MANIFEST_TYPE", message: "manifest must be an object" }],
    };
  }
  if (value.kind !== WTF_CONTAINER_KIND) {
    addError(errors, "$.kind", "WTF_MANIFEST_KIND", `kind must be ${WTF_CONTAINER_KIND}`);
  }
  validateCompatibility(value.compatibility, errors, "$.compatibility");
  validateIdentity(value.identity, errors, "$.identity");
  validateCaptureTarget(value.captureTarget, errors, "$.captureTarget");
  validateEntrypoints(value.entrypoints, errors, "$.entrypoints");
  validateFeatures(value.features, errors, "$.features");
  const files = validateFiles(value.files, errors, "$.files");
  if (!isRecord(value.security)) {
    addError(errors, "$.security", "WTF_SECURITY_TYPE", "security must be an object");
  } else {
    validateSecurityLimits(value.security.limits, errors, "$.security.limits");
  }
  if (value.signature !== undefined) validateSignature(value.signature, errors, "$.signature");

  for (const requiredPath of WTF_REQUIRED_PAYLOAD_PATHS) {
    if (!files.has(requiredPath)) {
      addError(
        errors,
        "$.files",
        "WTF_REQUIRED_PAYLOAD_MISSING",
        `manifest file inventory is missing ${requiredPath}`,
      );
    }
  }

  if (isRecord(value.entrypoints) && typeof value.entrypoints.referenceTiles === "string") {
    if (!files.has(value.entrypoints.referenceTiles)) {
      addError(
        errors,
        "$.entrypoints.referenceTiles",
        "WTF_REFERENCE_TILES_ENTRY_MISSING",
        "reference tile index must exist in the file inventory",
      );
    }
  }

  return errors.length === 0
    ? { ok: true, value: value as unknown as WtfManifest }
    : { ok: false, errors };
}

export function validateChecksums(
  value: unknown,
  manifest: WtfManifest,
): WtfValidationResult<WtfChecksums> {
  const errors: WtfValidationError[] = [];
  if (!isRecord(value) || value.algorithm !== "sha256" || !isRecord(value.files)) {
    return {
      ok: false,
      errors: [
        {
          path: "$",
          code: "WTF_CHECKSUMS_INVALID",
          message: "checksums must declare sha256 and a files object",
        },
      ],
    };
  }
  const checksums = value.files;
  const expected = new Map(manifest.files.map((file) => [file.path, file.sha256]));
  for (const [path, hash] of expected) {
    if (checksums[path] !== hash) {
      addError(
        errors,
        `$.files.${path}`,
        "WTF_CHECKSUM_MISMATCH",
        "checksum must match the manifest inventory",
      );
    }
  }
  for (const [path, hash] of Object.entries(checksums)) {
    if (!expected.has(path)) {
      addError(
        errors,
        `$.files.${path}`,
        "WTF_CHECKSUM_EXTRA",
        "checksum references an unknown file",
      );
    }
    if (typeof hash !== "string" || !isSha256(hash)) {
      addError(
        errors,
        `$.files.${path}`,
        "WTF_CHECKSUM_FORMAT",
        "checksum must be 64 lowercase hex characters",
      );
    }
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as WtfChecksums }
    : { ok: false, errors };
}

function entryLimitForPath(path: string, limits: WtfSecurityLimits): number {
  if (path.endsWith(".json")) return Math.min(limits.maxEntryBytes, limits.maxJsonBytes);
  if (path.startsWith("assets/") || path.startsWith("fallback/") || path.startsWith("preview/")) {
    return Math.min(limits.maxEntryBytes, limits.maxAssetBytes);
  }
  return limits.maxEntryBytes;
}

export function validateContainerEntries(
  entries: readonly WtfContainerEntry[],
  manifest: WtfManifest,
): WtfValidationResult<readonly WtfContainerEntry[]> {
  const errors: WtfValidationError[] = [];
  const limits = manifest.security.limits;
  if (entries.length > limits.maxEntries) {
    addError(errors, "$", "WTF_TOO_MANY_ENTRIES", "archive entry count exceeds the declared limit");
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const payloadInventory = new Map(manifest.files.map((file) => [file.path, file]));
  const required = new Set(["manifest.json", "checksums.json", ...WTF_REQUIRED_PAYLOAD_PATHS]);
  if (manifest.entrypoints.referenceTiles) required.add(manifest.entrypoints.referenceTiles);

  entries.forEach((entry, index) => {
    const path = `$[${index}]`;
    collectPortablePathErrors(entry.path, limits.maxPathLength, `${path}.path`, errors);
    if (seen.has(entry.path)) {
      addError(errors, `${path}.path`, "WTF_DUPLICATE_ENTRY", "archive entry path must be unique");
    }
    seen.add(entry.path);
    if (!isSafeNonNegativeInteger(entry.uncompressedSize)) {
      addError(
        errors,
        `${path}.uncompressedSize`,
        "WTF_ENTRY_SIZE_INVALID",
        "uncompressedSize must be a non-negative safe integer",
      );
    } else {
      totalBytes += entry.uncompressedSize;
      if (entry.uncompressedSize > entryLimitForPath(entry.path, limits)) {
        addError(errors, path, "WTF_ENTRY_TOO_LARGE", "archive entry exceeds its size limit");
      }
    }
    if (entry.compressedSize !== undefined) {
      if (!isSafeNonNegativeInteger(entry.compressedSize)) {
        addError(
          errors,
          `${path}.compressedSize`,
          "WTF_COMPRESSED_SIZE_INVALID",
          "compressedSize must be a non-negative safe integer",
        );
      } else if (entry.uncompressedSize > 0) {
        const ratio =
          entry.compressedSize === 0
            ? Number.POSITIVE_INFINITY
            : entry.uncompressedSize / entry.compressedSize;
        if (ratio > limits.maxCompressionRatio) {
          addError(
            errors,
            path,
            "WTF_COMPRESSION_RATIO_EXCEEDED",
            "archive entry exceeds the decompression ratio limit",
          );
        }
      }
    }
    if (entry.path !== "manifest.json" && entry.path !== "checksums.json") {
      const descriptor = payloadInventory.get(entry.path);
      if (!descriptor) {
        addError(
          errors,
          `${path}.path`,
          "WTF_UNLISTED_ENTRY",
          "every payload entry must be declared in manifest.files",
        );
      } else if (descriptor.sizeBytes !== entry.uncompressedSize) {
        addError(
          errors,
          `${path}.uncompressedSize`,
          "WTF_ENTRY_SIZE_MISMATCH",
          "archive size must match the manifest file descriptor",
        );
      }
    }
  });

  if (totalBytes > limits.maxArchiveBytes) {
    addError(errors, "$", "WTF_ARCHIVE_TOO_LARGE", "archive exceeds the declared size limit");
  }
  for (const requiredPath of required) {
    if (!seen.has(requiredPath)) {
      addError(errors, "$", "WTF_REQUIRED_ENTRY_MISSING", `archive is missing ${requiredPath}`);
    }
  }
  for (const descriptor of manifest.files) {
    if (!seen.has(descriptor.path)) {
      addError(
        errors,
        "$",
        "WTF_MANIFEST_ENTRY_MISSING",
        `archive is missing manifest payload ${descriptor.path}`,
      );
    }
  }

  return errors.length === 0 ? { ok: true, value: entries } : { ok: false, errors };
}

export function checkReaderCompatibility(
  manifest: WtfManifest,
  support: WtfReaderSupport,
): WtfCompatibilityResult {
  const reasons: string[] = [];
  const format = parseSemver(manifest.compatibility.formatVersion);
  const schema = parseSemver(manifest.compatibility.schemaVersion);
  if (!format || format[0] !== 2) reasons.push("unsupported format major version");
  if (!schema || schema[0] !== 2) reasons.push("unsupported schema major version");
  const readerComparison = compareSemver(
    support.readerVersion,
    manifest.compatibility.minReaderVersion,
  );
  if (readerComparison === null) reasons.push("invalid reader or minReader semver");
  else if (readerComparison < 0) reasons.push("reader version is below minReaderVersion");

  const capabilities = new Set(support.supportedCapabilities);
  for (const capability of manifest.compatibility.capabilities) {
    if (!capabilities.has(capability))
      reasons.push(`unsupported required capability: ${capability}`);
  }
  const features = new Set(support.supportedFeatures);
  for (const feature of manifest.features.required) {
    if (!features.has(feature)) reasons.push(`unsupported required feature: ${feature}`);
  }
  return { compatible: reasons.length === 0, reasons };
}

export function validateTokenGraph(value: unknown): WtfValidationResult<WtfTokenGraph> {
  const errors: WtfValidationError[] = [];
  if (!isRecord(value) || !Array.isArray(value.tokens) || !Array.isArray(value.usages)) {
    return {
      ok: false,
      errors: [
        {
          path: "$",
          code: "WTF_TOKEN_GRAPH_INVALID",
          message: "token graph must contain tokens and usages arrays",
        },
      ],
    };
  }
  const ids = new Set<string>();
  for (const [index, token] of value.tokens.entries()) {
    const path = `$.tokens[${index}]`;
    if (!isRecord(token)) {
      addError(errors, path, "WTF_TOKEN_INVALID", "token must be an object");
      continue;
    }
    if (typeof token.id !== "string" || token.id.length === 0 || ids.has(token.id)) {
      addError(
        errors,
        `${path}.id`,
        "WTF_TOKEN_ID_INVALID",
        "token id must be unique and non-empty",
      );
    } else {
      ids.add(token.id);
    }
    if (typeof token.name !== "string" || token.name.length === 0) {
      addError(errors, `${path}.name`, "WTF_TOKEN_NAME_INVALID", "token name must be non-empty");
    }
    if (typeof token.rawValue !== "string") {
      addError(
        errors,
        `${path}.rawValue`,
        "WTF_TOKEN_RAW_VALUE_INVALID",
        "rawValue must be a string",
      );
    }
    if (!isStringArray(token.references)) {
      addError(
        errors,
        `${path}.references`,
        "WTF_TOKEN_REFERENCES_INVALID",
        "references must be strings",
      );
    }
    if (
      typeof token.confidence !== "number" ||
      !Number.isFinite(token.confidence) ||
      token.confidence < 0 ||
      token.confidence > 1
    ) {
      addError(
        errors,
        `${path}.confidence`,
        "WTF_CONFIDENCE_INVALID",
        "confidence must be within 0..1",
      );
    }
  }
  for (const [index, token] of value.tokens.entries()) {
    if (!isRecord(token) || !isStringArray(token.references)) continue;
    for (const reference of token.references) {
      if (!ids.has(reference)) {
        addError(
          errors,
          `$.tokens[${index}].references`,
          "WTF_TOKEN_REFERENCE_MISSING",
          `token reference ${reference} does not exist`,
        );
      }
    }
  }
  for (const [index, usage] of value.usages.entries()) {
    const path = `$.usages[${index}]`;
    if (!isRecord(usage)) {
      addError(errors, path, "WTF_TOKEN_USAGE_INVALID", "token usage must be an object");
      continue;
    }
    if (typeof usage.tokenId !== "string" || !ids.has(usage.tokenId)) {
      addError(errors, `${path}.tokenId`, "WTF_TOKEN_USAGE_MISSING", "usage tokenId must exist");
    }
    for (const field of ["sourceNodeId", "property", "authoredValue", "resolvedValue"] as const) {
      if (typeof usage[field] !== "string") {
        addError(errors, `${path}.${field}`, "WTF_TOKEN_USAGE_FIELD", `${field} must be a string`);
      }
    }
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as WtfTokenGraph }
    : { ok: false, errors };
}

function canonicalSerialize(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`canonical JSON rejects ${typeof value}`);
  }
  if (seen.has(value)) throw new TypeError("canonical JSON rejects cyclic values");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalSerialize(item, seen)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON accepts only plain objects and arrays");
    }
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(record[key], seen)}`);
    return `{${fields.join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalStringify(value: unknown): string {
  return canonicalSerialize(value, new Set<object>());
}
