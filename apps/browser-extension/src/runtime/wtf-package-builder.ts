import type { AssetCapture } from "@w2f/asset-resolver";
import type { RawCaptureTarget, RawSnapshot } from "@w2f/capture-core";
import type { CompositingAnalysisResult } from "@w2f/compositing-engine";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import type { EnvironmentCapture } from "@w2f/environment-capture";
import type { PixelGroundTruthCapture } from "@w2f/pixel-ground-truth";
import type { ResponsiveInferenceResult } from "@w2f/responsive-inference";
import {
  createCaptureIdentity,
  createDocumentIdentity,
  createRevisionIdentity,
} from "@w2f/stable-identity";
import type {
  WtfAssetsPayload,
  WtfCaptureEnvironment,
  WtfDiagnostic,
  WtfDiagnosticsPayload,
  WtfDocumentPayload,
  WtfResponsivePayload,
  WtfSourceGraph,
  WtfSourceNode,
  WtfStatesPayload,
  WtfStylesPayload,
} from "@w2f/w2f-ir";
import { WTF_IR_VERSION } from "@w2f/w2f-ir";
import {
  WTF_DEFAULT_ENTRYPOINTS,
  type CaptureTarget,
  type WtfFeatureSet,
  type WtfRevision,
} from "@w2f/w2f-schema";
import {
  packageWtf,
  type WtfPackagePayload,
  type WtfPackageResult,
  type WtfPackagerInput,
} from "@w2f/wtf-packager";
import { buildResponsiveStableNodeEvidence } from "./responsive-capture-runtime.js";

export interface WtfPackageEvidence {
  jobId: string;
  snapshot: RawSnapshot;
  css: CssCascadeCapture;
  environment: EnvironmentCapture;
  assets: AssetCapture;
  pixel: PixelGroundTruthCapture;
  compositing: CompositingAnalysisResult;
  responsive?: ResponsiveInferenceResult;
}

function sourceType(url: string): "http" | "file" | "unknown" {
  if (/^https?:/i.test(url)) return "http";
  if (/^file:/i.test(url)) return "file";
  return "unknown";
}

function captureTarget(target: RawCaptureTarget): CaptureTarget {
  return target.type === "region"
    ? { type: "region", bounds: { ...target.bounds } }
    : { type: "document" };
}

function sourceGraph(
  snapshot: RawSnapshot,
  revision: WtfRevision,
  css: CssCascadeCapture,
  assets: AssetCapture,
  stableNodes: Awaited<ReturnType<typeof buildResponsiveStableNodeEvidence>>,
): WtfSourceGraph {
  const styled = new Set(css.cascade.nodes.map((node) => node.sourceNodeId));
  const stableByCapture = new Map(stableNodes.map((node) => [node.captureNodeId, node]));
  const assetRefs = new Map<string, string[]>();
  for (const asset of assets.assets) {
    for (const sourceNodeId of asset.sourceNodeIds) {
      const refs = assetRefs.get(sourceNodeId) ?? [];
      refs.push(asset.record.id);
      assetRefs.set(sourceNodeId, refs);
    }
  }
  const nodes: WtfSourceNode[] = snapshot.nodes.map((node) => {
    const refs = [...new Set(assetRefs.get(node.captureNodeId) ?? [])].sort();
    const stable = stableByCapture.get(node.captureNodeId);
    return {
      captureNodeId: node.captureNodeId,
      ...(stable
        ? {
            stableIdentity: {
              id: stable.stableNodeId,
              confidence: stable.confidence,
              evidence: [`signature-hash:${stable.signatureHash}`],
            },
          }
        : {}),
      kind: node.kind,
      relationships: { ...node.relationships },
      frameContext: { ...node.frameContext },
      childCaptureNodeIds: [...node.childCaptureNodeIds],
      ...(node.source.tagName ? { tagName: node.source.tagName } : {}),
      ...(node.source.namespace ? { namespace: node.source.namespace } : {}),
      ...(node.source.role ? { role: node.source.role } : {}),
      ...(node.source.attributes ? { attributes: { ...node.source.attributes } } : {}),
      ...(node.source.sourceSelector ? { sourceSelector: node.source.sourceSelector } : {}),
      ...(node.source.pseudoType ? { pseudoType: node.source.pseudoType } : {}),
      ...(node.textContent !== undefined ? { textContent: node.textContent } : {}),
      ...(node.geometry
        ? {
            geometry: {
              bounds: { ...node.geometry.bounds },
              ...(node.geometry.scrollContainerId
                ? { scrollContainerId: node.geometry.scrollContainerId }
                : {}),
              ...(typeof node.paintOrder === "number" ? { paintOrder: node.paintOrder } : {}),
            },
          }
        : {}),
      ...(styled.has(node.captureNodeId) ? { styleRef: `style:${node.captureNodeId}` } : {}),
      ...(refs.length > 0 ? { assetRefs: refs } : {}),
    };
  });
  return {
    rootCaptureNodeId: snapshot.rootCaptureNodeId,
    nodes,
    scrollContainers: snapshot.scrollContainers.map((item) => ({ ...item })),
    revision,
  };
}

function captureEnvironment(
  evidence: EnvironmentCapture,
  overrides?: {
    id?: string;
    viewport?: { width: number; height: number; dpr: number };
  },
): WtfCaptureEnvironment {
  const environment = evidence.environment;
  return {
    id: overrides?.id ?? `env:${evidence.snapshotId}`,
    browserName: environment.browserName,
    browserVersion: environment.browserVersion,
    platform: environment.platform,
    language: environment.language,
    direction: environment.direction,
    colorScheme: environment.colorScheme,
    reducedMotion: environment.reducedMotion,
    viewportWidth: overrides?.viewport?.width ?? environment.viewportWidth,
    viewportHeight: overrides?.viewport?.height ?? environment.viewportHeight,
    dpr: overrides?.viewport?.dpr ?? environment.dpr,
    pageZoom: environment.pageZoom ?? 1,
    ...(environment.cssZoom !== undefined ? { cssZoom: environment.cssZoom } : {}),
  };
}

function responsiveEnvironmentRef(snapshotId: string): string {
  return `env:responsive:${encodeURIComponent(snapshotId)}`;
}

function responsivePayload(
  environment: EnvironmentCapture,
  responsive: ResponsiveInferenceResult | undefined,
): WtfResponsivePayload {
  if (responsive) {
    return {
      ...responsive.payload,
      snapshots: responsive.payload.snapshots.map((snapshot) => ({
        ...snapshot,
        viewport: { ...snapshot.viewport },
        environmentRef: responsiveEnvironmentRef(snapshot.id),
      })),
    };
  }
  return {
    snapshots: [],
    rules: [],
    mediaRules: environment.mediaRules.map((rule) => ({
      query: rule.query,
      activeInSnapshotIds: [...rule.activeInSnapshotIds],
      affectedProperties: [...rule.affectedProperties],
    })),
    containerQueries: [],
  };
}

function documentEnvironments(
  primary: WtfCaptureEnvironment,
  responsive: WtfResponsivePayload,
): WtfCaptureEnvironment[] {
  const environments = new Map<string, WtfCaptureEnvironment>([[primary.id, primary]]);
  for (const snapshot of responsive.snapshots) {
    if (environments.has(snapshot.environmentRef)) continue;
    environments.set(snapshot.environmentRef, {
      ...primary,
      id: snapshot.environmentRef,
      viewportWidth: snapshot.viewport.width,
      viewportHeight: snapshot.viewport.height,
      dpr: snapshot.viewport.dpr,
    });
  }
  const responsiveEnvironments = [...environments.values()]
    .filter((environment) => environment.id !== primary.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  return [primary, ...responsiveEnvironments];
}

function diagnostic(
  domain: WtfDiagnostic["domain"],
  code: string,
  message: string,
  index: number,
  sourceNodeId?: string,
): WtfDiagnostic {
  return {
    id: `diag:${domain.toLowerCase()}:${index}:${code}`,
    code,
    domain,
    severity: "warning",
    message,
    ...(sourceNodeId ? { sourceNodeIds: [sourceNodeId] } : {}),
  };
}

function diagnosticsPayload(evidence: WtfPackageEvidence): WtfDiagnosticsPayload {
  const diagnostics: WtfDiagnostic[] = [];
  let index = 0;
  const add = (
    domain: WtfDiagnostic["domain"],
    code: string,
    message: string,
    sourceNodeId?: string,
  ) => {
    diagnostics.push(diagnostic(domain, code, message, index, sourceNodeId));
    index += 1;
  };
  for (const item of evidence.snapshot.diagnostics)
    add("CAPTURE", item.code, item.message, item.sourceNodeId);
  for (const item of evidence.css.diagnostics)
    add("CSS", item.code, item.message, item.sourceNodeId);
  for (const item of evidence.environment.diagnostics)
    add("CAPTURE", item.code, item.message, item.sourceNodeId);
  for (const item of evidence.assets.diagnostics)
    add("ASSET", item.code, item.message, item.sourceNodeId);
  for (const item of evidence.pixel.diagnostics)
    add("RENDER", item.code, item.message, item.sourceNodeId);
  for (const item of evidence.compositing.diagnostics) {
    const renderNodeId = item.renderNodeIds?.[0];
    const sourceNodeId =
      item.sourceNodeIds?.[0] ??
      (renderNodeId
        ? evidence.compositing.tree.nodes.find((node) => node.id === renderNodeId)?.sourceNodeIds[0]
        : undefined);
    add("COMPOSITING", item.code, item.message, sourceNodeId);
  }
  for (const item of evidence.responsive?.diagnostics ?? [])
    add("RESPONSIVE", item.code, item.message);
  return { diagnostics };
}

function portableAssets(evidence: WtfPackageEvidence): {
  index: WtfAssetsPayload;
  binaries: WtfPackagePayload[];
} {
  const binaries: WtfPackagePayload[] = [];
  const assets = evidence.assets.assets.map((asset) => {
    const path = asset.record.embeddedPath;
    if (!path) throw new Error(`resolved asset ${asset.record.id} has no embeddedPath`);
    binaries.push({
      path,
      role: "asset",
      mediaType: asset.record.mediaType,
      bytes: Uint8Array.from(asset.bytes),
    });
    return { ...asset.record, embeddedPath: path };
  });
  for (const resource of evidence.pixel.tileResources) {
    binaries.push({
      path: resource.path,
      role: "reference-tile",
      mediaType: resource.mediaType,
      bytes: Uint8Array.from(resource.bytes),
    });
  }
  return {
    index: {
      assets,
      referenceTiles: evidence.pixel.references.flatMap((reference) => reference.tiles),
    },
    binaries,
  };
}

function featureEvidence(
  evidence: WtfPackageEvidence,
  source: WtfSourceGraph,
): {
  capabilities: string[];
  features: WtfFeatureSet;
} {
  const renderNodes = evidence.compositing.tree.nodes;
  const optional = new Set<string>([
    "authored-css",
    "double-precision-geometry",
    "composed-tree",
    "revision-metadata",
  ]);
  const capabilities = new Set<string>([
    "source-tree",
    "composed-tree",
    "render-tree",
    "geometry-double-precision",
    "revision-hashes",
  ]);
  if (evidence.snapshot.scrollContainers.length > 0) {
    optional.add("scroll-roots");
    capabilities.add("scroll-roots");
  }
  if (evidence.css.tokens.tokens.length > 0 || evidence.css.tokens.usages.length > 0) {
    optional.add("token-graph");
    capabilities.add("token-graph");
  }
  if (source.nodes.some((node) => node.stableIdentity)) {
    optional.add("stable-identity");
    capabilities.add("stable-identity");
  }
  if (renderNodes.some((node) => node.componentCandidate)) {
    optional.add("structural-fingerprints");
    capabilities.add("structural-fingerprints");
  }
  if (evidence.pixel.references.length > 0) {
    optional.add("pixel-ground-truth");
    capabilities.add("pixel-ground-truth");
  }
  if (evidence.pixel.tileResources.length > 0) {
    optional.add("raster-tiles");
    capabilities.add("raster-tiles");
  }
  if ((evidence.responsive?.payload.snapshots.length ?? 0) > 0) {
    optional.add("responsive-snapshots");
    capabilities.add("responsive-snapshots");
  }
  if (evidence.compositing.boundaries.length > 0) optional.add("compositing-groups");
  if (renderNodes.some((node) => node.kind === "table")) optional.add("table-layout");
  return {
    capabilities: [...capabilities].sort(),
    features: {
      required: ["precise-geometry", "render-tree", "source-graph"],
      optional: [...optional].sort(),
    },
  };
}

export async function buildWtfPackageInput(
  evidence: WtfPackageEvidence,
): Promise<WtfPackagerInput> {
  const documentIdentity = await createDocumentIdentity({
    sourceType: sourceType(evidence.snapshot.url),
    sourceUrl: evidence.snapshot.url,
  });
  const captureIdentity = await createCaptureIdentity({
    documentId: documentIdentity.documentId,
    capturedAt: evidence.snapshot.capturedAt,
    captureNonce: evidence.jobId,
  });
  const revisionIdentity = await createRevisionIdentity({
    document: documentIdentity,
    capture: captureIdentity,
  });
  const revision: WtfRevision = {
    documentId: documentIdentity.documentId,
    captureId: captureIdentity.captureId,
    revisionId: revisionIdentity.revisionId,
    sourceFingerprint: documentIdentity.sourceFingerprint,
    capturedAt: captureIdentity.capturedAt,
  };
  const stableNodes = await buildResponsiveStableNodeEvidence(evidence.snapshot);
  const source = sourceGraph(
    evidence.snapshot,
    revision,
    evidence.css,
    evidence.assets,
    stableNodes,
  );
  const environment = captureEnvironment(evidence.environment);
  const responsive = responsivePayload(evidence.environment, evidence.responsive);
  const environments = documentEnvironments(environment, responsive);
  const document: WtfDocumentPayload = {
    irVersion: WTF_IR_VERSION,
    documentId: revision.documentId,
    captureId: revision.captureId,
    revisionId: revision.revisionId,
    sourceFingerprint: revision.sourceFingerprint,
    sourceGraphRootId: source.rootCaptureNodeId,
    renderTreeRootId: evidence.compositing.tree.rootId,
    environmentRefs: environments.map((item) => item.id),
    environments,
    animationCaptureMode: "freeze-current",
    visualState: environment.colorScheme,
  };
  const styles: WtfStylesPayload = { styles: evidence.css.styles };
  const states: WtfStatesPayload = { states: [] };
  const diagnostics = diagnosticsPayload(evidence);
  const portable = portableAssets(evidence);
  const featureSet = featureEvidence(evidence, source);
  const relationships = {
    nodes: evidence.snapshot.nodes.map((node) => ({
      captureNodeId: node.captureNodeId,
      relationships: node.relationships,
      frameContext: node.frameContext,
      ...(node.geometry?.scrollContainerId
        ? { scrollContainerId: node.geometry.scrollContainerId }
        : {}),
    })),
    scrollContainers: evidence.snapshot.scrollContainers,
  };
  const revisions = {
    revisions: [revision],
    renderNodes: evidence.compositing.tree.nodes.flatMap((node) =>
      node.revisionHashes ? [{ renderNodeId: node.id, hashes: node.revisionHashes }] : [],
    ),
  };
  const referenceTilesPath =
    evidence.pixel.references.length > 0 ? "references/index.json" : undefined;
  const payloads: WtfPackagePayload[] = [
    { path: WTF_DEFAULT_ENTRYPOINTS.document, role: "document", json: document },
    { path: WTF_DEFAULT_ENTRYPOINTS.sourceGraph, role: "source-graph", json: source },
    {
      path: WTF_DEFAULT_ENTRYPOINTS.renderTree,
      role: "render-tree",
      json: evidence.compositing.tree,
    },
    { path: WTF_DEFAULT_ENTRYPOINTS.styles, role: "styles", json: styles },
    { path: WTF_DEFAULT_ENTRYPOINTS.assets, role: "assets-index", json: portable.index },
    { path: WTF_DEFAULT_ENTRYPOINTS.responsive, role: "responsive", json: responsive },
    { path: WTF_DEFAULT_ENTRYPOINTS.states, role: "states", json: states },
    { path: WTF_DEFAULT_ENTRYPOINTS.diagnostics, role: "diagnostics", json: diagnostics },
    { path: WTF_DEFAULT_ENTRYPOINTS.tokens, role: "token-graph", json: evidence.css.tokens },
    {
      path: WTF_DEFAULT_ENTRYPOINTS.sourceCascade,
      role: "source-cascade",
      json: {
        version: evidence.css.version,
        adapter: evidence.css.adapter,
        cascade: evidence.css.cascade,
        unresolvedTokenUsages: evidence.css.unresolvedTokenUsages,
      },
    },
    {
      path: WTF_DEFAULT_ENTRYPOINTS.sourceMetadata,
      role: "source-metadata",
      json: {
        url: evidence.snapshot.url,
        title: evidence.snapshot.title,
        adapter: evidence.snapshot.adapter,
        frames: evidence.snapshot.frames,
        captureEnvironment: evidence.snapshot.environment,
        environmentEvidence: evidence.environment,
        compositing: {
          version: evidence.compositing.version,
          boundaries: evidence.compositing.boundaries,
          decisions: evidence.compositing.decisions,
          diagnostics: evidence.compositing.diagnostics,
        },
      },
    },
    { path: "source/relationships.json", role: "extension", json: relationships },
    { path: "revisions.json", role: "extension", json: revisions },
    ...(referenceTilesPath
      ? [
          {
            path: referenceTilesPath,
            role: "reference-tiles-index",
            json: {
              version: evidence.pixel.version,
              adapter: evidence.pixel.adapter,
              tileSizePx: evidence.pixel.tileSizePx,
              references: evidence.pixel.references,
            },
          } satisfies WtfPackagePayload,
        ]
      : []),
    ...portable.binaries,
  ];
  return {
    filenameBase: evidence.snapshot.title || "web-capture",
    identity: revisionIdentity.manifestIdentity,
    captureTarget: captureTarget(evidence.snapshot.captureTarget),
    compatibility: {
      writerVersion: "1.0.0",
      minReaderVersion: "1.0.0",
      capabilities: featureSet.capabilities,
    },
    features: featureSet.features,
    payloads,
    ...(referenceTilesPath ? { referenceTilesPath } : {}),
  };
}

export async function buildWtfPackage(evidence: WtfPackageEvidence): Promise<WtfPackageResult> {
  return packageWtf(await buildWtfPackageInput(evidence));
}
