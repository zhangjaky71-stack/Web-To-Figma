# NODE-18 — Table Layout Engine

## Objective

Implement the V2 table-specific layout stage after NODE-17 base layout analysis and before NODE-19 render-tree optimization.

## Inputs

```text
RawSnapshot
CssCascadeCapture
```

The engine must not access the live DOM.

## Outputs

```text
TableLayoutResult
  tables[]
    rowGroups[]
    rows[]
    cells[]
    occupancy[]
    rowTracks[]
    columnTracks[]
    caption?
    borderCollapse
    borderSpacing
    tableLayout
    strategyHint
    decision
    diagnostics[]
```

## Implemented scope

- `table` roots;
- `thead` / `tbody` / `tfoot` row groups;
- anonymous direct table rows;
- `tr` rows;
- `td` / `th` cells;
- `caption` and `caption-side`;
- `rowspan`, including `rowspan="0"` to the remaining captured rows;
- `colspan`;
- deterministic occupied-slot reconstruction;
- conflict and malformed-span diagnostics;
- Browser geometry-derived row/column tracks;
- computed `border-collapse`, `border-spacing`, `table-layout` evidence;
- renderer-neutral strategy hints;
- Browser IndexedDB sidecar persistence;
- Standard + High Fidelity packaged runtime validation.

## Non-goals

- wrapper elimination and semantic render-tree optimization — NODE-19;
- compositing/raster fallback promotion — NODE-20;
- `.wtf` packaging — NODE-21;
- final Figma Grid/Auto Layout/Absolute rendering — NODE-25/27/28.

## Exit Gate

NODE-18 is complete only when:

1. package lint/typecheck/tests pass;
2. regular and span table fixtures pass;
3. malformed spans fail visibly;
4. Standard and CDP capture retain table computed CSS properties;
5. Browser table sidecar runtime/store tests pass;
6. Standard and High Fidelity extension package validators pass;
7. NODE-18 foundation guardrail is permanently wired;
8. temporary bootstrap/finalization files are absent from the final tree;
9. exact-head read-only frozen-lockfile CI passes.
