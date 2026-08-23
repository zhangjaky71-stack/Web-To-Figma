import type { WtfIrBundle } from "@w2f/w2f-ir";
import type { WtfChecksums, WtfManifest } from "@w2f/w2f-schema";

export const WTF_PARSER_VERSION = "1.0.0" as const;
export const WTF_PARSER_READER_VERSION = "1.0.0" as const;

export const WTF_PARSER_SUPPORTED_CAPABILITIES = [
  "source-tree",
  "composed-tree",
  "render-tree",
  "geometry-double-precision",
  "revision-hashes",
  "scroll-roots",
  "token-graph",
  "stable-identity",
  "structural-fingerprints",
  "pixel-ground-truth",
  "raster-tiles",
  "responsive-snapshots",
] as const;

export type WtfParserErrorCode =
  | "WTF_PARSER_ARCHIVE_TOO_LARGE"
  | "WTF_PARSER_ZIP_SIGNATURE"
  | "WTF_PARSER_ZIP_TRUNCATED"
  | "WTF_PARSER_ZIP_MULTIDISK"
  | "WTF_PARSER_ZIP64_UNSUPPORTED"
  | "WTF_PARSER_ZIP_ENCRYPTED"
  | "WTF_PARSER_ZIP_FLAG_UNSUPPORTED"
  | "WTF_PARSER_ZIP_METHOD_UNSUPPORTED"
  | "WTF_PARSER_ZIP_CRC_MISMATCH"
  | "WTF_PARSER_ZIP_SIZE_MISMATCH"
  | "WTF_PARSER_ZIP_DUPLICATE_PATH"
  | "WTF_PARSER_ZIP_PATH_INVALID"
  | "WTF_PARSER_ZIP_ENTRY_LIMIT"
  | "WTF_PARSER_ZIP_TOTAL_LIMIT"
  | "WTF_PARSER_ZIP_RATIO_LIMIT"
  | "WTF_PARSER_REQUIRED_ENTRY"
  | "WTF_PARSER_JSON_UTF8"
  | "WTF_PARSER_JSON_PARSE"
  | "WTF_PARSER_MANIFEST_INVALID"
  | "WTF_PARSER_CHECKSUMS_INVALID"
  | "WTF_PARSER_CONTAINER_INVALID"
  | "WTF_PARSER_COMPATIBILITY"
  | "WTF_PARSER_CHECKSUM_MISMATCH"
  | "WTF_PARSER_IR_INVALID"
  | "WTF_PARSER_ASSET_POLICY"
  | "WTF_PARSER_NESTED_ARCHIVE"
  | "WTF_PARSER_SVG_UNSAFE"
  | "WTF_PARSER_MIGRATION_UNSUPPORTED";

export interface WtfParserIssue {
  code: WtfParserErrorCode | string;
  path: string;
  message: string;
}

export class WtfParserError extends Error {
  readonly issues: readonly WtfParserIssue[];

  constructor(issue: WtfParserIssue | readonly WtfParserIssue[]) {
    const issues = Array.isArray(issue) ? issue : [issue];
    super(issues.map((item) => `${item.code} ${item.path}: ${item.message}`).join("\n"));
    this.name = "WtfParserError";
    this.issues = issues;
  }
}

export interface WtfZipEntryMetadata {
  path: string;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  dataOffset: number;
}

export interface WtfSecureZipArchive {
  readonly bytes: Uint8Array;
  readonly entries: readonly WtfZipEntryMetadata[];
  readonly entriesByPath: ReadonlyMap<string, WtfZipEntryMetadata>;
  read(path: string): Promise<Uint8Array>;
}

export interface WtfMigrationReport {
  fromFormatVersion: string;
  fromSchemaVersion: string;
  toFormatVersion: string;
  toSchemaVersion: string;
  migrated: boolean;
  steps: string[];
}

export interface WtfParsedSectionPreview {
  id: string;
  name: string;
  depth: number;
  parentId?: string;
  renderNodeIds: string[];
  sourceStableIds: string[];
  defaultSelected: boolean;
}

export interface WtfParsedPreview {
  sourceUrl?: string;
  title?: string;
  renderNodeCount: number;
  assetCount: number;
  referenceCount: number;
  sectionOutline: WtfParsedSectionPreview[];
  revision: {
    documentId: string;
    captureId: string;
    revisionId?: string;
    parentRevisionId?: string;
  };
  stableSourceMappingCount: number;
  tokenUsageCount: number;
  tokenPolicy: "literal";
}

export interface WtfParsedPackage {
  manifest: WtfManifest;
  checksums: WtfChecksums;
  ir: WtfIrBundle;
  jsonPayloads: ReadonlyMap<string, unknown>;
  binaryPayloads: ReadonlyMap<string, Uint8Array>;
  sanitizedSvgPayloads: ReadonlyMap<string, string>;
  migration: WtfMigrationReport;
  preview: WtfParsedPreview;
}

export interface WtfParseOptions {
  readerVersion?: string;
  supportedCapabilities?: readonly string[];
  supportedFeatures?: readonly string[];
  allowDeflate?: boolean;
}
