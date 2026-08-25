import type { WtfParsedPackage } from "@w2f/wtf-parser";
import {
  isW2fRasterReferenceEvidence,
  W2F_RASTER_REFERENCE_KINDS,
  type W2fRasterReferenceEvidence,
} from "./protocol.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface W2fRasterPayload {
  rasterReferences: W2fRasterReferenceEvidence[];
  rasterTilePayloadsByPath: Record<string, Uint8Array>;
}

export function node28RasterPayload(parsed: WtfParsedPackage): W2fRasterPayload {
  const rasterSourceNodeIds = new Set(
    parsed.ir.renderTree.nodes
      .filter((node) => node.renderStrategy === "raster")
      .flatMap((node) => node.sourceNodeIds),
  );
  if (rasterSourceNodeIds.size === 0) {
    return { rasterReferences: [], rasterTilePayloadsByPath: {} };
  }

  const referenceIndexPath = parsed.manifest.entrypoints.referenceTiles;
  if (!referenceIndexPath) {
    return { rasterReferences: [], rasterTilePayloadsByPath: {} };
  }
  const rawIndex = parsed.jsonPayloads.get(referenceIndexPath);
  if (!isRecord(rawIndex) || !Array.isArray(rawIndex.references)) {
    throw new Error("W2F_E_RASTER_REFERENCE_INDEX: validated reference index is unavailable");
  }

  const rasterReferences: W2fRasterReferenceEvidence[] = [];
  for (const candidate of rawIndex.references) {
    if (!isRecord(candidate) || typeof candidate.kind !== "string") continue;
    if (!(W2F_RASTER_REFERENCE_KINDS as readonly string[]).includes(candidate.kind)) continue;
    if (
      typeof candidate.sourceNodeId !== "string" ||
      !rasterSourceNodeIds.has(candidate.sourceNodeId)
    ) {
      continue;
    }
    if (!isW2fRasterReferenceEvidence(candidate)) {
      throw new Error(
        `W2F_E_RASTER_REFERENCE_INDEX: invalid local raster reference ${String(candidate.id ?? "unknown")}`,
      );
    }
    rasterReferences.push(candidate);
  }

  const rasterTilePayloadsByPath: Record<string, Uint8Array> = {};
  for (const reference of rasterReferences) {
    for (const tile of reference.tiles) {
      const bytes = parsed.binaryPayloads.get(tile.path);
      if (!bytes) {
        throw new Error(`W2F_E_RASTER_TILE_MISSING: ${tile.path}`);
      }
      rasterTilePayloadsByPath[tile.path] = bytes;
    }
  }

  return { rasterReferences, rasterTilePayloadsByPath };
}
