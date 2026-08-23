import {
  WTF_FORMAT_VERSION,
  WTF_SCHEMA_VERSION,
  compareSemver,
  type WtfManifest,
} from "@w2f/w2f-schema";
import { WtfParserError, type WtfMigrationReport } from "./types.js";

function major(version: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

export function migrateCompatibleV2(manifest: WtfManifest): WtfMigrationReport {
  const fromFormatVersion = manifest.compatibility.formatVersion;
  const fromSchemaVersion = manifest.compatibility.schemaVersion;
  const formatMajor = major(fromFormatVersion);
  const schemaMajor = major(fromSchemaVersion);
  if (formatMajor !== 2 || schemaMajor !== 2) {
    throw new WtfParserError({
      code: "WTF_PARSER_MIGRATION_UNSUPPORTED",
      path: "$.manifest.compatibility",
      message: `no migration path exists from format ${fromFormatVersion} / schema ${fromSchemaVersion}`,
    });
  }

  const formatComparison = compareSemver(fromFormatVersion, WTF_FORMAT_VERSION);
  const schemaComparison = compareSemver(fromSchemaVersion, WTF_SCHEMA_VERSION);
  if (formatComparison === null || schemaComparison === null) {
    throw new WtfParserError({
      code: "WTF_PARSER_MIGRATION_UNSUPPORTED",
      path: "$.manifest.compatibility",
      message: "format/schema versions must be valid semantic versions before migration",
    });
  }

  if (fromFormatVersion === WTF_FORMAT_VERSION && fromSchemaVersion === WTF_SCHEMA_VERSION) {
    return {
      fromFormatVersion,
      fromSchemaVersion,
      toFormatVersion: WTF_FORMAT_VERSION,
      toSchemaVersion: WTF_SCHEMA_VERSION,
      migrated: false,
      steps: [],
    };
  }

  return {
    fromFormatVersion,
    fromSchemaVersion,
    toFormatVersion: WTF_FORMAT_VERSION,
    toSchemaVersion: WTF_SCHEMA_VERSION,
    migrated: true,
    steps: [
      "v2-compatible-pass-through",
      formatComparison > 0 || schemaComparison > 0
        ? "preserve-unknown-optional-metadata"
        : "normalize-legacy-v2-reader-model",
    ],
  };
}
