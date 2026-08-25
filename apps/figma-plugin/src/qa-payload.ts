import type { WtfParsedPackage } from "@w2f/wtf-parser";
import type { Rect, WtfReferenceTileDescriptor } from "@w2f/w2f-schema";

export interface W2fQaPixelReferenceEvidence {
  id: string;
  kind: "full-page";
  viewportId: string;
  bounds: Rect;
  dpr: number;
  tiles: WtfReferenceTileDescriptor[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRect(value: unknown): value is Rect {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    value.height > 0
  );
}

function isReferenceTile(value: unknown): value is WtfReferenceTileDescriptor {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    typeof value.viewportId === "string" &&
    value.viewportId.length > 0 &&
    isRect(value.bounds) &&
    typeof value.dpr === "number" &&
    Number.isFinite(value.dpr) &&
    value.dpr > 0 &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(value.sha256)
  );
}

function fullPageReferences(parsed: WtfParsedPackage): W2fQaPixelReferenceEvidence[] {
  const indexPath = parsed.manifest.entrypoints.referenceTiles;
  if (!indexPath) return [];
  const rawIndex = parsed.jsonPayloads.get(indexPath);
  if (!isRecord(rawIndex) || !Array.isArray(rawIndex.references)) return [];

  const references: W2fQaPixelReferenceEvidence[] = [];
  for (const candidate of rawIndex.references) {
    if (
      !isRecord(candidate) ||
      candidate.kind !== "full-page" ||
      typeof candidate.id !== "string" ||
      candidate.id.length === 0 ||
      typeof candidate.viewportId !== "string" ||
      candidate.viewportId.length === 0 ||
      !isRect(candidate.bounds) ||
      typeof candidate.dpr !== "number" ||
      !Number.isFinite(candidate.dpr) ||
      candidate.dpr <= 0 ||
      !Array.isArray(candidate.tiles) ||
      candidate.tiles.length === 0 ||
      !candidate.tiles.every(isReferenceTile)
    ) {
      continue;
    }
    if (!candidate.tiles.every((tile) => parsed.binaryPayloads.has(tile.path))) continue;
    references.push({
      id: candidate.id,
      kind: "full-page",
      viewportId: candidate.viewportId,
      bounds: { ...candidate.bounds },
      dpr: candidate.dpr,
      tiles: candidate.tiles.map((tile) => ({ ...tile, bounds: { ...tile.bounds } })),
    });
  }
  return references;
}

function contains(outer: Rect, inner: Rect): boolean {
  const epsilon = 0.5;
  return (
    outer.x <= inner.x + epsilon &&
    outer.y <= inner.y + epsilon &&
    outer.x + outer.width >= inner.x + inner.width - epsilon &&
    outer.y + outer.height >= inner.y + inner.height - epsilon
  );
}

function geometryDistance(reference: W2fQaPixelReferenceEvidence, root: Rect): number {
  return (
    Math.abs(reference.bounds.x - root.x) +
    Math.abs(reference.bounds.y - root.y) +
    Math.abs(reference.bounds.width - root.width) +
    Math.abs(reference.bounds.height - root.height)
  );
}

export function node29PixelQaReference(
  parsed: WtfParsedPackage,
): W2fQaPixelReferenceEvidence | undefined {
  const root = parsed.ir.renderTree.nodes.find((node) => node.id === parsed.ir.renderTree.rootId);
  if (!root) return undefined;
  const references = fullPageReferences(parsed).filter((reference) =>
    contains(reference.bounds, root.geometry.bounds),
  );
  return references.sort((left, right) => {
    const distance =
      geometryDistance(left, root.geometry.bounds) - geometryDistance(right, root.geometry.bounds);
    if (distance !== 0) return distance;
    return left.id.localeCompare(right.id);
  })[0];
}

export function node29PixelQaReferenceById(
  parsed: WtfParsedPackage,
  referenceId: string,
): W2fQaPixelReferenceEvidence | undefined {
  return fullPageReferences(parsed).find((reference) => reference.id === referenceId);
}
