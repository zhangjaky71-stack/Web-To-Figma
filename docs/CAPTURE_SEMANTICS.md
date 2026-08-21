# W2F Capture Semantics

**Status:** APPROVED FOR IMPLEMENTATION  
**Package format:** `.wtf`

## 1. Canonical capture unit

W2F captures the **Current Rendered Application State**.

This means the result describes the current route, current application state, current theme/state profile, and content that can be reached by the supported capture process at capture time.

It does not automatically mean “the entire website.”

## 2. Capture targets

W2F defines three explicit targets:

```ts
type CaptureTarget =
  | { type: "document" }
  | { type: "scroll-root"; sourceNodeId: string }
  | { type: "region"; bounds: Rect }
```

### 2.1 Document

Captures the browser document's supported rendered state.

### 2.2 Scroll root

Captures a primary or explicitly selected scrollable application container whose content extent is larger than its client viewport.

### 2.3 Region

Captures a free rectangular area while retaining intersecting nodes and necessary structural ancestors. Region capture is not a bitmap crop unless an unsupported subtree requires raster fallback.

## 3. Full Page meaning

“Full Page” is a product-level command resolved into one of:

- document capture;
- primary application scroll-root capture.

If a dominant app scroll root is detected with high confidence, the UI may expose a choice such as:

- Entire application;
- Browser document.

Full Page does not imply crawling to different routes or states.

## 4. Online sources

Online capture supports `http://` and `https://` documents subject to browser permissions and platform restrictions.

`activeTab`/host access applies to the user-initiated current-tab job. The capture job must fail clearly if navigation or permission changes invalidate access.

## 5. Offline sources

W2F supports three source-provider concepts:

- `HttpPageProvider`;
- `FileTabProvider`;
- `LocalFolderProvider`.

### 5.1 file://

`file://` access requires explicit browser extension file-URL permission. Lack of permission is a capability error, not a silent asset failure.

### 5.2 local folder

A local-folder source resolves relative HTML/CSS/image/font references against the selected site root. It is intended for local static sites with structures such as:

```text
site/
├ index.html
├ css/
├ images/
├ fonts/
└ js/
```

## 6. Rendered-state boundary

W2F V2 captures the currently represented state. It does not automatically enumerate:

- all SPA routes;
- hidden tabs;
- all accordion panels;
- all dialog states;
- all pages of paginated data;
- all carousel states;
- all hover/focus/active variants;
- all virtualized records not simultaneously represented by the supported capture flow.

Schema may preserve state metadata for future extensions.

## 7. Dynamic content stabilization

Before the semantic snapshot, the capture job should:

1. record original page state needed for cleanup;
2. freeze/pause transitions, animations and caret where practical;
3. wait for `document.fonts.ready` when available;
4. wait for layout stability using bounded heuristics;
5. perform a bounded lazy-load sweep when the capture profile requests it;
6. snapshot geometry/styles/text/assets;
7. capture pixel ground truth;
8. restore the page in a guaranteed cleanup path.

The job must not leave permanent capture styles or scroll mutations behind after normal completion/failure.

## 8. Animation semantics

Default mode is:

`freeze-current-visual-state`

Optional future/high-fidelity mode may reset supported CSS animation state before capture.

The package stores the chosen animation capture mode. W2F does not promise to transfer browser animation runtime into Figma in V2.

## 9. Lazy loading

For bounded pages, W2F may scroll/sweep to trigger lazy assets before the final snapshot.

The sweep must have limits for:

- maximum screens;
- maximum height growth;
- maximum elapsed work;
- repeated no-progress detection.

## 10. Infinite scroll

If page height continues to grow, W2F classifies the page as potentially infinite.

The product behavior must be explicit, for example:

- capture currently loaded content;
- load N more screens;
- switch to region capture.

It must not silently scroll forever.

## 11. Virtualized lists

V2 baseline behavior is:

- capture the rendered DOM/state available to the capture engine;
- emit a virtualized-list diagnostic if records are being recycled/virtualized;
- do not claim that all logical records were captured.

Advanced stitching is a future enhancement.

## 12. Scroll-root model

Each detected scroll container may store:

- source node id;
- `scrollWidth` / `scrollHeight`;
- `clientWidth` / `clientHeight`;
- current scroll offsets;
- overflow modes;
- parent scroll container;
- document-root flag;
- primary-application-root flag;
- confidence/reasons.

Sticky relationships must retain their relevant scroll/containing-block context.

## 13. Region selection semantics

Region selection supports:

- free rectangle;
- smart edge/element snapping;
- keyboard nudge;
- auto-scroll near viewport edges;
- Escape to cancel;
- confirm action;
- optional redaction/exclusion.

Node inclusion rule:

> keep visible nodes whose rendered bounds intersect the selection, plus structural ancestors required to preserve layout/paint/clip semantics.

The region is normalized under a synthetic Selection Root with clipping metadata.

## 14. Redaction

Redacted regions/nodes are intentionally excluded or replaced according to policy.

Regardless of user redaction, the privacy baseline always excludes protected secrets such as password values and authentication material.

## 15. DOM/source semantics

The source capture distinguishes:

- Element nodes;
- Text nodes;
- supported pseudo nodes;
- open Shadow DOM;
- slots;
- same-origin iframe content where accessible;
- cross-origin/inaccessible iframe boundaries;
- form controls;
- canvas/video/WebGL placeholders/fallback metadata.

## 16. Source, composed and render parents

A node may have different relationships:

```text
sourceParentId
composedParentId
renderParentId
```

Source relations preserve author structure.

Composed relations represent browser visual composition after slot/shadow flattening.

Render relations represent the optimized Figma-oriented tree.

## 17. iframe/frame context

Nodes/resources may store:

- frame id;
- parent frame id;
- frame URL;
- origin.

Identity, CSS and asset resolution must remain frame-aware so equal selectors in different frames do not collide.

## 18. Geometry semantics

The principal W2F geometry box is the browser border box.

Where needed the IR may also retain:

- content box;
- padding box;
- margin extents;
- clip rectangles;
- transformed bounds.

Capture preserves floating-point precision. It must not round all coordinates to integers at capture time.

## 19. Scale context

Capture environment distinguishes:

- device pixel ratio;
- browser page zoom;
- CSS `zoom` where relevant;
- visual viewport scale where available.

These are not collapsed into one ambiguous scale factor.

## 20. Text semantics

W2F stores semantic text plus enough visual evidence to choose among:

- Editable;
- Balanced;
- Pixel-oriented high-fidelity reconstruction.

Text capture may include:

- source Text nodes;
- styled runs;
- line fragments;
- direction/writing information;
- baseline/inline evidence where available.

## 21. CSS semantics

Computed style is pixel truth for the current state but not sufficient for responsive inference.

W2F therefore preserves authored evidence where accessible, including:

- raw length units;
- flex/grid declarations;
- variables;
- media-query evidence;
- container-query evidence;
- winning/candidate cascade references for important properties.

Raw `%`, `vw`, `calc()`, `clamp()` and related semantics must not be prematurely replaced by only a pixel value.

## 22. Token semantics

CSS Custom Properties may form a Token Graph.

The capture stores token definition/usage/alias relationships where discoverable while retaining browser-resolved values.

V2 does not require automatic creation of Figma Variables.

## 23. Asset semantics

Assets are localized into `.wtf` where policy permits and addressed/deduplicated by content hash.

Asset provenance should distinguish sources such as:

- `img`/`picture`;
- CSS background;
- inline/external SVG;
- data/blob URL;
- canvas/video frame;
- raster fallback.

## 24. Pixel ground truth

Pixel reference is a core truth source, not decorative preview data.

At minimum a capture profile must contain a viewport reference. High-fidelity/full-page profiles may include tiled full-page references.

These references allow later renderer versions to validate against what the user actually saw at capture time.

## 25. Responsive capture

Responsive capture may produce multiple snapshots such as desktop/tablet/mobile widths.

Cross-snapshot association uses stable identity and records evidence including:

- bounds changes;
- visibility changes;
- order/parent changes;
- flex/grid mode changes;
- typography changes;
- track/column changes.

## 26. Theme semantics

V2 supports the concept of current/light/dark visual state. Default capture is current state unless the user selects another supported profile.

## 27. Protected/unavailable pages

Browser-protected schemes or inaccessible content must produce explicit errors/diagnostics. W2F does not attempt to bypass browser security boundaries.

## 28. Determinism

For deterministic fixtures in the same capture environment, normalized Source/Render structures, asset hashes, stable IDs and layout decisions must be reproducible according to `ACCEPTANCE_CONTRACT_V2.md`.

## 29. Cleanup invariant

Every capture adapter must implement cleanup as an invariant:

`prepare → capture → cleanup`

`cleanup` must run after both success and failure whenever the page was mutated for capture.
