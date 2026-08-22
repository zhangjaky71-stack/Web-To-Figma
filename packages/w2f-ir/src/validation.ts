import { isSha256, validateRect, validateTokenGraph } from "@w2f/w2f-schema";
import { WTF_IR_VERSION } from "./types.js";
import type {
  WtfIrBundle,
  WtfIrValidationError,
  WtfIrValidationResult,
  WtfSourceNode,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function add(
  errors: WtfIrValidationError[],
  path: string,
  code: string,
  message: string,
): void {
  errors.push({ path, code, message });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateConfidence(
  value: unknown,
  errors: WtfIrValidationError[],
  path: string,
): void {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    add(errors, path, "WTF_IR_CONFIDENCE_INVALID", "confidence must be within 0..1");
  }
}

function collectUniqueIds(
  values: readonly unknown[],
  getId: (value: Record<string, unknown>) => unknown,
  errors: WtfIrValidationError[],
  path: string,
  code: string,
): Set<string> {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(value)) {
      add(errors, itemPath, code, "entry must be an object");
      return;
    }
    const id = getId(value);
    if (!isNonEmptyString(id)) {
      add(errors, `${itemPath}.id`, code, "id must be a non-empty string");
      return;
    }
    if (ids.has(id)) {
      add(errors, `${itemPath}.id`, code, `duplicate id: ${id}`);
      return;
    }
    ids.add(id);
  });
  return ids;
}

function validateDirectedTree(
  rootId: string,
  childMap: ReadonlyMap<string, readonly string[]>,
  errors: WtfIrValidationError[],
  path: string,
): void {
  if (!childMap.has(rootId)) {
    add(errors, `${path}.root`, "WTF_IR_ROOT_MISSING", `root ${rootId} does not exist`);
    return;
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      add(errors, path, "WTF_IR_GRAPH_CYCLE", `cycle detected at ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const children = childMap.get(id) ?? [];
    for (const childId of children) {
      if (!childMap.has(childId)) {
        add(errors, path, "WTF_IR_CHILD_MISSING", `child ${childId} does not exist`);
        continue;
      }
      visit(childId);
    }
    visiting.delete(id);
    visited.add(id);
  };

  visit(rootId);
  if (visited.size !== childMap.size) {
    const unreachable = [...childMap.keys()].filter((id) => !visited.has(id));
    add(
      errors,
      path,
      "WTF_IR_GRAPH_UNREACHABLE",
      `tree contains unreachable nodes: ${unreachable.join(", ")}`,
    );
  }
}

function validateGeometry(
  value: unknown,
  errors: WtfIrValidationError[],
  path: string,
): void {
  if (!isRecord(value)) {
    add(errors, path, "WTF_IR_GEOMETRY_INVALID", "geometry must be an object");
    return;
  }
  const boundsResult = validateRect(value.bounds);
  if (!boundsResult.ok) {
    for (const error of boundsResult.errors) {
      add(errors, `${path}.bounds${error.path === "$" ? "" : error.path.slice(1)}`, error.code, error.message);
    }
  }
  if (value.paintOrder !== undefined && !Number.isSafeInteger(value.paintOrder)) {
    add(errors, `${path}.paintOrder`, "WTF_IR_PAINT_ORDER_INVALID", "paintOrder must be an integer");
  }
}

function validateSourceGraph(
  value: unknown,
  errors: WtfIrValidationError[],
): {
  sourceIds: Set<string>;
  stableIds: Set<string>;
  styleRefs: Set<string>;
  assetRefs: Set<string>;
} {
  const sourceIds = new Set<string>();
  const stableIds = new Set<string>();
  const styleRefs = new Set<string>();
  const assetRefs = new Set<string>();
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    add(errors, "$.sourceGraph", "WTF_IR_SOURCE_GRAPH_INVALID", "sourceGraph.nodes must be an array");
    return { sourceIds, stableIds, styleRefs, assetRefs };
  }

  const childMap = new Map<string, readonly string[]>();
  value.nodes.forEach((nodeValue, index) => {
    const path = `$.sourceGraph.nodes[${index}]`;
    if (!isRecord(nodeValue)) {
      add(errors, path, "WTF_IR_SOURCE_NODE_INVALID", "source node must be an object");
      return;
    }
    const id = nodeValue.captureNodeId;
    if (!isNonEmptyString(id)) {
      add(errors, `${path}.captureNodeId`, "WTF_IR_SOURCE_ID_INVALID", "captureNodeId must be non-empty");
      return;
    }
    if (sourceIds.has(id)) {
      add(errors, `${path}.captureNodeId`, "WTF_IR_SOURCE_ID_DUPLICATE", `duplicate source id: ${id}`);
      return;
    }
    sourceIds.add(id);
    const children = Array.isArray(nodeValue.childCaptureNodeIds)
      ? nodeValue.childCaptureNodeIds.filter(isNonEmptyString)
      : [];
    if (!Array.isArray(nodeValue.childCaptureNodeIds) || children.length !== nodeValue.childCaptureNodeIds.length) {
      add(errors, `${path}.childCaptureNodeIds`, "WTF_IR_SOURCE_CHILDREN_INVALID", "children must be strings");
    }
    if (new Set(children).size !== children.length) {
      add(errors, `${path}.childCaptureNodeIds`, "WTF_IR_SOURCE_CHILD_DUPLICATE", "children must be unique");
    }
    childMap.set(id, children);

    if (nodeValue.geometry !== undefined) validateGeometry(nodeValue.geometry, errors, `${path}.geometry`);
    if (isNonEmptyString(nodeValue.styleRef)) styleRefs.add(nodeValue.styleRef);
    if (Array.isArray(nodeValue.assetRefs)) {
      for (const assetId of nodeValue.assetRefs) {
        if (isNonEmptyString(assetId)) assetRefs.add(assetId);
        else add(errors, `${path}.assetRefs`, "WTF_IR_ASSET_REF_INVALID", "asset refs must be strings");
      }
    }

    const stableIdentity = nodeValue.stableIdentity;
    if (stableIdentity !== undefined) {
      if (!isRecord(stableIdentity) || !isNonEmptyString(stableIdentity.id)) {
        add(errors, `${path}.stableIdentity`, "WTF_IR_STABLE_ID_INVALID", "stable identity must have an id");
      } else {
        if (stableIds.has(stableIdentity.id)) {
          add(errors, `${path}.stableIdentity.id`, "WTF_IR_STABLE_ID_DUPLICATE", `duplicate stable id: ${stableIdentity.id}`);
        }
        stableIds.add(stableIdentity.id);
        validateConfidence(stableIdentity.confidence, errors, `${path}.stableIdentity.confidence`);
      }
    }

    const fingerprint = nodeValue.structuralFingerprint;
    if (fingerprint !== undefined && isRecord(fingerprint)) {
      validateConfidence(fingerprint.confidence, errors, `${path}.structuralFingerprint.confidence`);
    }
  });

  if (!isNonEmptyString(value.rootCaptureNodeId)) {
    add(errors, "$.sourceGraph.rootCaptureNodeId", "WTF_IR_SOURCE_ROOT_INVALID", "source root must be non-empty");
  } else {
    validateDirectedTree(value.rootCaptureNodeId, childMap, errors, "$.sourceGraph");
  }

  for (const [index, nodeValue] of value.nodes.entries()) {
    if (!isRecord(nodeValue) || !isRecord(nodeValue.relationships)) continue;
    const path = `$.sourceGraph.nodes[${index}].relationships`;
    for (const field of ["sourceParentId", "composedParentId", "assignedSlotId", "shadowHostId"] as const) {
      const ref = nodeValue.relationships[field];
      if (ref !== undefined && (!isNonEmptyString(ref) || !sourceIds.has(ref))) {
        add(errors, `${path}.${field}`, "WTF_IR_SOURCE_RELATION_MISSING", `${field} must reference a source node`);
      }
    }
  }

  if (!Array.isArray(value.scrollContainers)) {
    add(errors, "$.sourceGraph.scrollContainers", "WTF_IR_SCROLL_CONTAINERS_INVALID", "scrollContainers must be an array");
  } else {
    value.scrollContainers.forEach((item, index) => {
      const path = `$.sourceGraph.scrollContainers[${index}]`;
      if (!isRecord(item) || !isNonEmptyString(item.sourceNodeId) || !sourceIds.has(item.sourceNodeId)) {
        add(errors, `${path}.sourceNodeId`, "WTF_IR_SCROLL_NODE_MISSING", "scroll container must reference a source node");
        return;
      }
      for (const field of ["scrollWidth", "scrollHeight", "clientWidth", "clientHeight", "scrollLeft", "scrollTop"] as const) {
        if (!isFiniteNumber(item[field])) {
          add(errors, `${path}.${field}`, "WTF_IR_SCROLL_GEOMETRY_INVALID", `${field} must be finite`);
        }
      }
    });
  }

  if (!isRecord(value.revision)) {
    add(errors, "$.sourceGraph.revision", "WTF_IR_REVISION_INVALID", "revision must be an object");
  } else {
    for (const field of ["documentId", "captureId", "revisionId", "sourceFingerprint", "capturedAt"] as const) {
      if (!isNonEmptyString(value.revision[field])) {
        add(errors, `$.sourceGraph.revision.${field}`, "WTF_IR_REVISION_FIELD_INVALID", `${field} must be non-empty`);
      }
    }
  }

  return { sourceIds, stableIds, styleRefs, assetRefs };
}

function validateRenderTree(
  value: unknown,
  sourceIds: ReadonlySet<string>,
  errors: WtfIrValidationError[],
): { renderIds: Set<string>; assetRefs: Set<string>; diagnosticRefs: Set<string> } {
  const renderIds = new Set<string>();
  const assetRefs = new Set<string>();
  const diagnosticRefs = new Set<string>();
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    add(errors, "$.renderTree", "WTF_IR_RENDER_TREE_INVALID", "renderTree.nodes must be an array");
    return { renderIds, assetRefs, diagnosticRefs };
  }

  const childMap = new Map<string, readonly string[]>();
  value.nodes.forEach((nodeValue, index) => {
    const path = `$.renderTree.nodes[${index}]`;
    if (!isRecord(nodeValue) || !isNonEmptyString(nodeValue.id)) {
      add(errors, `${path}.id`, "WTF_IR_RENDER_ID_INVALID", "render id must be non-empty");
      return;
    }
    if (renderIds.has(nodeValue.id)) {
      add(errors, `${path}.id`, "WTF_IR_RENDER_ID_DUPLICATE", `duplicate render id: ${nodeValue.id}`);
      return;
    }
    renderIds.add(nodeValue.id);
    const children = Array.isArray(nodeValue.childIds) ? nodeValue.childIds.filter(isNonEmptyString) : [];
    if (!Array.isArray(nodeValue.childIds) || children.length !== nodeValue.childIds.length) {
      add(errors, `${path}.childIds`, "WTF_IR_RENDER_CHILDREN_INVALID", "childIds must be strings");
    }
    if (new Set(children).size !== children.length) {
      add(errors, `${path}.childIds`, "WTF_IR_RENDER_CHILD_DUPLICATE", "childIds must be unique");
    }
    childMap.set(nodeValue.id, children);

    if (!Array.isArray(nodeValue.sourceNodeIds) || nodeValue.sourceNodeIds.length === 0) {
      add(errors, `${path}.sourceNodeIds`, "WTF_IR_RENDER_SOURCE_EMPTY", "render nodes must map to source nodes");
    } else {
      for (const sourceId of nodeValue.sourceNodeIds) {
        if (!isNonEmptyString(sourceId) || !sourceIds.has(sourceId)) {
          add(errors, `${path}.sourceNodeIds`, "WTF_IR_RENDER_SOURCE_MISSING", `unknown source node: ${String(sourceId)}`);
        }
      }
    }
    validateGeometry(nodeValue.geometry, errors, `${path}.geometry`);
    if (isRecord(nodeValue.renderDecision)) {
      validateConfidence(nodeValue.renderDecision.confidence, errors, `${path}.renderDecision.confidence`);
    } else {
      add(errors, `${path}.renderDecision`, "WTF_IR_RENDER_DECISION_INVALID", "render decision is required");
    }
    if (isRecord(nodeValue.layout) && isRecord(nodeValue.layout.decision)) {
      validateConfidence(nodeValue.layout.decision.confidence, errors, `${path}.layout.decision.confidence`);
    } else {
      add(errors, `${path}.layout`, "WTF_IR_LAYOUT_INVALID", "layout decision is required");
    }
    if (!isRecord(nodeValue.paint) || !isFiniteNumber(nodeValue.paint.opacity) || nodeValue.paint.opacity < 0 || nodeValue.paint.opacity > 1) {
      add(errors, `${path}.paint.opacity`, "WTF_IR_OPACITY_INVALID", "paint opacity must be within 0..1");
    }
    if (Array.isArray(nodeValue.assetRefs)) {
      for (const assetId of nodeValue.assetRefs) {
        if (isNonEmptyString(assetId)) assetRefs.add(assetId);
        else add(errors, `${path}.assetRefs`, "WTF_IR_ASSET_REF_INVALID", "asset refs must be strings");
      }
    }
    if (Array.isArray(nodeValue.diagnosticIds)) {
      for (const diagnosticId of nodeValue.diagnosticIds) {
        if (isNonEmptyString(diagnosticId)) diagnosticRefs.add(diagnosticId);
      }
    }
  });

  if (!isNonEmptyString(value.rootId)) {
    add(errors, "$.renderTree.rootId", "WTF_IR_RENDER_ROOT_INVALID", "render root must be non-empty");
  } else {
    validateDirectedTree(value.rootId, childMap, errors, "$.renderTree");
  }

  for (const [index, nodeValue] of value.nodes.entries()) {
    if (!isRecord(nodeValue)) continue;
    if (nodeValue.parentId !== undefined && (!isNonEmptyString(nodeValue.parentId) || !renderIds.has(nodeValue.parentId))) {
      add(errors, `$.renderTree.nodes[${index}].parentId`, "WTF_IR_RENDER_PARENT_MISSING", "parentId must reference a render node");
    }
  }

  return { renderIds, assetRefs, diagnosticRefs };
}

export function validateWtfIrBundle(value: unknown): WtfIrValidationResult<WtfIrBundle> {
  const errors: WtfIrValidationError[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [{ path: "$", code: "WTF_IR_BUNDLE_INVALID", message: "IR bundle must be an object" }],
    };
  }

  const document = value.document;
  if (!isRecord(document)) {
    add(errors, "$.document", "WTF_IR_DOCUMENT_INVALID", "document payload must be an object");
  } else {
    if (document.irVersion !== WTF_IR_VERSION) {
      add(errors, "$.document.irVersion", "WTF_IR_VERSION_UNSUPPORTED", `IR version must be ${WTF_IR_VERSION}`);
    }
    for (const field of ["documentId", "captureId", "revisionId", "sourceFingerprint", "sourceGraphRootId", "renderTreeRootId"] as const) {
      if (!isNonEmptyString(document[field])) {
        add(errors, `$.document.${field}`, "WTF_IR_DOCUMENT_FIELD_INVALID", `${field} must be non-empty`);
      }
    }
  }

  const source = validateSourceGraph(value.sourceGraph, errors);
  const render = validateRenderTree(value.renderTree, source.sourceIds, errors);

  const styleIds = isRecord(value.styles) && Array.isArray(value.styles.styles)
    ? collectUniqueIds(value.styles.styles, (item) => item.id, errors, "$.styles.styles", "WTF_IR_STYLE_ID_INVALID")
    : new Set<string>();
  if (styleIds.size === 0 && (!isRecord(value.styles) || !Array.isArray(value.styles.styles))) {
    add(errors, "$.styles", "WTF_IR_STYLES_INVALID", "styles payload must contain an array");
  }
  for (const styleRef of source.styleRefs) {
    if (!styleIds.has(styleRef)) add(errors, "$.sourceGraph", "WTF_IR_STYLE_REF_MISSING", `unknown style ref: ${styleRef}`);
  }

  const assetIds = isRecord(value.assets) && Array.isArray(value.assets.assets)
    ? collectUniqueIds(value.assets.assets, (item) => item.id, errors, "$.assets.assets", "WTF_IR_ASSET_ID_INVALID")
    : new Set<string>();
  if (!isRecord(value.assets) || !Array.isArray(value.assets.assets) || !Array.isArray(value.assets.referenceTiles)) {
    add(errors, "$.assets", "WTF_IR_ASSETS_INVALID", "assets payload must contain assets/referenceTiles arrays");
  } else {
    value.assets.assets.forEach((asset, index) => {
      if (!isRecord(asset)) return;
      if (asset.sha256 !== undefined && (typeof asset.sha256 !== "string" || !isSha256(asset.sha256))) {
        add(errors, `$.assets.assets[${index}].sha256`, "WTF_IR_ASSET_HASH_INVALID", "asset sha256 must be canonical");
      }
    });
  }
  for (const assetRef of [...source.assetRefs, ...render.assetRefs]) {
    if (!assetIds.has(assetRef)) add(errors, "$.assets", "WTF_IR_ASSET_REF_MISSING", `unknown asset ref: ${assetRef}`);
  }

  const stateIds = isRecord(value.states) && Array.isArray(value.states.states)
    ? collectUniqueIds(value.states.states, (item) => item.id, errors, "$.states.states", "WTF_IR_STATE_ID_INVALID")
    : new Set<string>();
  if (!isRecord(value.states) || !Array.isArray(value.states.states)) {
    add(errors, "$.states", "WTF_IR_STATES_INVALID", "states payload must contain an array");
  } else {
    value.states.states.forEach((state, index) => {
      if (!isRecord(state) || !isNonEmptyString(state.rootNodeId) || !source.sourceIds.has(state.rootNodeId)) {
        add(errors, `$.states.states[${index}].rootNodeId`, "WTF_IR_STATE_ROOT_MISSING", "state root must reference a source node");
      }
    });
  }

  const environmentIds = new Set<string>();
  if (isRecord(document) && Array.isArray(document.environments)) {
    for (const [index, environment] of document.environments.entries()) {
      const path = `$.document.environments[${index}]`;
      if (!isRecord(environment) || !isNonEmptyString(environment.id)) {
        add(errors, `${path}.id`, "WTF_IR_ENV_ID_INVALID", "environment id must be non-empty");
        continue;
      }
      if (environmentIds.has(environment.id)) add(errors, `${path}.id`, "WTF_IR_ENV_ID_DUPLICATE", `duplicate environment id: ${environment.id}`);
      environmentIds.add(environment.id);
      for (const field of ["viewportWidth", "viewportHeight", "dpr", "pageZoom"] as const) {
        if (!isFiniteNumber(environment[field]) || environment[field] <= 0) {
          add(errors, `${path}.${field}`, "WTF_IR_ENV_GEOMETRY_INVALID", `${field} must be positive and finite`);
        }
      }
    }
    if (!Array.isArray(document.environmentRefs)) {
      add(errors, "$.document.environmentRefs", "WTF_IR_ENV_REFS_INVALID", "environmentRefs must be an array");
    } else {
      for (const ref of document.environmentRefs) {
        if (!isNonEmptyString(ref) || !environmentIds.has(ref)) {
          add(errors, "$.document.environmentRefs", "WTF_IR_ENV_REF_MISSING", `unknown environment ref: ${String(ref)}`);
        }
      }
    }
  }

  if (!isRecord(value.responsive) || !Array.isArray(value.responsive.snapshots) || !Array.isArray(value.responsive.rules) || !Array.isArray(value.responsive.mediaRules) || !Array.isArray(value.responsive.containerQueries)) {
    add(errors, "$.responsive", "WTF_IR_RESPONSIVE_INVALID", "responsive payload arrays are required");
  } else {
    const snapshotIds = collectUniqueIds(value.responsive.snapshots, (item) => item.id, errors, "$.responsive.snapshots", "WTF_IR_SNAPSHOT_ID_INVALID");
    value.responsive.snapshots.forEach((snapshot, index) => {
      const path = `$.responsive.snapshots[${index}]`;
      if (!isRecord(snapshot)) return;
      if (!isNonEmptyString(snapshot.rootNodeId) || !source.sourceIds.has(snapshot.rootNodeId)) {
        add(errors, `${path}.rootNodeId`, "WTF_IR_SNAPSHOT_ROOT_MISSING", "snapshot root must reference a source node");
      }
      if (!isNonEmptyString(snapshot.environmentRef) || !environmentIds.has(snapshot.environmentRef)) {
        add(errors, `${path}.environmentRef`, "WTF_IR_SNAPSHOT_ENV_MISSING", "snapshot environment must exist");
      }
      if (snapshot.stateRef !== undefined && (!isNonEmptyString(snapshot.stateRef) || !stateIds.has(snapshot.stateRef))) {
        add(errors, `${path}.stateRef`, "WTF_IR_SNAPSHOT_STATE_MISSING", "snapshot state must exist");
      }
    });
    value.responsive.rules.forEach((rule, index) => {
      const path = `$.responsive.rules[${index}]`;
      if (!isRecord(rule)) return;
      validateConfidence(rule.confidence, errors, `${path}.confidence`);
      if (!isNonEmptyString(rule.targetStableNodeId) || !source.stableIds.has(rule.targetStableNodeId)) {
        add(errors, `${path}.targetStableNodeId`, "WTF_IR_RESPONSIVE_TARGET_MISSING", "responsive target stable id must exist");
      }
      if (Array.isArray(rule.ranges)) {
        for (const range of rule.ranges) {
          if (!isRecord(range) || !Array.isArray(range.snapshotIds)) continue;
          for (const snapshotId of range.snapshotIds) {
            if (!isNonEmptyString(snapshotId) || !snapshotIds.has(snapshotId)) {
              add(errors, `${path}.ranges`, "WTF_IR_RESPONSIVE_SNAPSHOT_MISSING", `unknown snapshot id: ${String(snapshotId)}`);
            }
          }
        }
      }
    });
  }

  const diagnosticIds = isRecord(value.diagnostics) && Array.isArray(value.diagnostics.diagnostics)
    ? collectUniqueIds(value.diagnostics.diagnostics, (item) => item.id, errors, "$.diagnostics.diagnostics", "WTF_IR_DIAGNOSTIC_ID_INVALID")
    : new Set<string>();
  if (!isRecord(value.diagnostics) || !Array.isArray(value.diagnostics.diagnostics)) {
    add(errors, "$.diagnostics", "WTF_IR_DIAGNOSTICS_INVALID", "diagnostics payload must contain an array");
  } else {
    value.diagnostics.diagnostics.forEach((diagnostic, index) => {
      const path = `$.diagnostics.diagnostics[${index}]`;
      if (!isRecord(diagnostic) || !isNonEmptyString(diagnostic.code) || !isNonEmptyString(diagnostic.message)) {
        add(errors, path, "WTF_IR_DIAGNOSTIC_INVALID", "diagnostic code/message are required");
        return;
      }
      if (Array.isArray(diagnostic.sourceNodeIds)) {
        for (const id of diagnostic.sourceNodeIds) {
          if (!isNonEmptyString(id) || !source.sourceIds.has(id)) add(errors, `${path}.sourceNodeIds`, "WTF_IR_DIAGNOSTIC_SOURCE_MISSING", `unknown source id: ${String(id)}`);
        }
      }
      if (Array.isArray(diagnostic.renderNodeIds)) {
        for (const id of diagnostic.renderNodeIds) {
          if (!isNonEmptyString(id) || !render.renderIds.has(id)) add(errors, `${path}.renderNodeIds`, "WTF_IR_DIAGNOSTIC_RENDER_MISSING", `unknown render id: ${String(id)}`);
        }
      }
    });
  }
  for (const diagnosticRef of render.diagnosticRefs) {
    if (!diagnosticIds.has(diagnosticRef)) add(errors, "$.renderTree", "WTF_IR_DIAGNOSTIC_REF_MISSING", `unknown diagnostic ref: ${diagnosticRef}`);
  }

  const tokenResult = validateTokenGraph(value.tokens);
  if (!tokenResult.ok) {
    for (const error of tokenResult.errors) {
      add(errors, `$.tokens${error.path === "$" ? "" : error.path.slice(1)}`, error.code, error.message);
    }
  }

  if (isRecord(document) && isRecord(value.sourceGraph) && isRecord(value.renderTree)) {
    if (document.sourceGraphRootId !== value.sourceGraph.rootCaptureNodeId) {
      add(errors, "$.document.sourceGraphRootId", "WTF_IR_SOURCE_ROOT_MISMATCH", "document/source graph roots differ");
    }
    if (document.renderTreeRootId !== value.renderTree.rootId) {
      add(errors, "$.document.renderTreeRootId", "WTF_IR_RENDER_ROOT_MISMATCH", "document/render tree roots differ");
    }
    if (isRecord(value.sourceGraph.revision)) {
      for (const field of ["documentId", "captureId", "revisionId", "sourceFingerprint"] as const) {
        if (document[field] !== value.sourceGraph.revision[field]) {
          add(errors, `$.document.${field}`, "WTF_IR_REVISION_MISMATCH", `${field} differs from source revision`);
        }
      }
    }
  }

  return errors.length === 0
    ? { ok: true, value: value as unknown as WtfIrBundle }
    : { ok: false, errors };
}

export function getSourceNodeById(
  graph: WtfIrBundle["sourceGraph"],
  captureNodeId: string,
): WtfSourceNode | undefined {
  return graph.nodes.find((node) => node.captureNodeId === captureNodeId);
}
