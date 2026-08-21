# W2F Known Limitations

**Status:** ACTIVE PRODUCT CONTRACT  
**Applies to:** V2 Baseline + V2.1 Addendum  
**Package format:** `.wtf`

This document records differences that are inherent to translating a browser rendering state into Figma. These limitations must be reported honestly and handled through native reconstruction, emulation, diagnostics, or minimal raster fallback.

## 1. Browser renderer and Figma renderer are different systems

Chromium and Figma do not implement the same layout, text-shaping, paint, compositing, scrolling, and runtime model.

Therefore W2F does not promise universal 100% pixel-perfect and fully editable conversion for every webpage.

## 2. JavaScript runtime is not transferred

W2F captures rendered state and semantic evidence. It does not transfer arbitrary website JavaScript, React/Vue runtime state machines, network clients, event handlers, analytics, application stores, service workers, or browser runtime behavior into Figma.

## 3. Full Page is not whole-site crawling

A Full Page capture means the current rendered document or primary application scroll root. It does not automatically capture every route, hidden tab, modal state, paginated page, or application state.

## 4. Figma plugin activation requirement

A `.wtf` file can be chosen from the W2F plugin UI and can be dropped onto the Figma canvas while the plugin is running.

W2F V2 does not require an operating-system file association that launches the Figma plugin automatically when the plugin is not active.

## 5. Cross-origin/browser protected content

Cross-origin iframe content, sandboxed frames, protected browser pages, extension pages, DRM/protected media, or other restricted content may be inaccessible to Standard capture.

W2F must not bypass browser security controls. Defined fallback/diagnostics are acceptable.

## 6. Shadow DOM visibility

Open Shadow DOM can be inspected through supported browser APIs. Closed Shadow DOM may not be available to Standard capture and may require platform-specific/high-fidelity evidence or fallback.

## 7. Browser-native controls

Native form controls may differ by platform, browser version, OS and theme. W2F may reconstruct them semantically or use visual fallback when exact browser-native chrome cannot be reproduced as Figma-native editable layers.

## 8. Fonts

A web page can use fonts that are not available inside the user's Figma environment.

W2F cannot assume arbitrary remote webfont bytes can be used as an editable Figma font. The plugin may:

- use an exact available font;
- map to a configured alternative;
- correct geometry;
- rasterize affected text in a high-fidelity profile when justified.

Font substitution must be reported.

## 9. Text shaping differences

Complex scripts, variable fonts, ligatures, emoji, CJK, RTL, vertical text, hyphenation and browser-specific shaping may render differently in Figma even with similar font metadata.

W2F mitigates this with browser text fragments and multiple text render strategies but does not guarantee byte-for-byte glyph raster equivalence.

## 10. Responsive runtime differences

Figma Auto Layout/Grid/constraints are not a full CSS media-query or container-query runtime.

W2F can capture responsive evidence, infer local sizing behavior, reconstruct supported layouts, and report breakpoint structural variants. It does not guarantee that every CSS breakpoint behavior remains executable as an identical dynamic runtime inside Figma.

## 11. CSS layout edge cases

The following may require emulation, absolute geometry, wrapper frames, or fallback:

- complex margin collapse;
- advanced Grid/subgrid behavior;
- complex named grid areas;
- overlapping grid/flex arrangements;
- unusual writing modes;
- deeply coupled percentage/intrinsic sizing;
- browser-specific layout behavior.

## 12. Complex compositing

Effects such as:

- `mix-blend-mode`;
- `backdrop-filter`;
- complex filters;
- masks;
- isolation;
- nested opacity/compositing;

can depend on content outside the individual node. The safe raster fallback boundary may therefore be larger than the visually unsupported node itself.

## 13. CSS image/paint features

W2F can recognize more CSS image types than Figma can represent natively. Unsupported or inaccurate cases may be rasterized or emulated rather than silently dropped.

## 14. Canvas

The internal drawing commands/state of arbitrary Canvas 2D content are not guaranteed to become editable Figma vectors. V2 may capture canvas output as a raster fallback unless a specific converter exists.

## 15. WebGL

Arbitrary WebGL scenes/shaders/textures are not converted into editable Figma vectors in V2. Visual raster fallback is the baseline behavior.

## 16. Video

Video playback/runtime is not transferred. V2 may capture a representative frame based on the selected current visual state.

## 17. Animation and motion

CSS animation, JavaScript animation, Lottie runtime, video motion and browser transitions are captured as a defined visual state. V2 does not guarantee editable Figma motion reconstruction.

## 18. Infinite scroll

Infinite pages cannot be fully captured without an explicit finite boundary. W2F must ask for/choose a bounded strategy such as current content, N additional screens, or region capture.

## 19. Virtualized lists

A virtualized list may logically contain thousands of records while rendering only tens of DOM rows. V2 baseline does not promise automatic recovery of all logical records. It captures supported rendered state and reports the virtualization limitation.

## 20. Hidden UI states

Inactive tabs, collapsed accordions, unopened modals, hover/focus/active states and alternative variants are not automatically enumerated in the current V2 state capture.

## 21. Local-site JavaScript/runtime restrictions

A local site selected through `file://` or folder access may depend on server APIs, CORS behavior, bundler/dev-server assumptions or runtime routes that do not function as a standalone local file tree. W2F captures what the browser can actually render in the selected environment.

## 22. CSS authored-source availability

Computed CSS is always the current rendering truth available to the page, but authored rule provenance may be partially inaccessible because of stylesheet origin/security/browser API constraints.

When authored evidence is unavailable, W2F must lower inference confidence rather than invent source rules.

## 23. Container-query execution in Figma

Container-query conditions can be captured and used as responsive evidence, but Figma cannot be assumed to execute arbitrary CSS `@container` rules dynamically.

## 24. Sticky/fixed behavior

Figma does not reproduce browser scrolling behavior identically. W2F preserves sticky/fixed source metadata and resolved geometry, then maps to the closest useful Figma constraints/layout representation.

## 25. Scroll containers

Nested application scroll roots can be captured and modeled, but Figma is not a browser scroll-layout engine. The imported design represents structure/layout state rather than identical browser scrolling runtime.

## 26. Third-party assets

Resources can fail because of authentication, CORS, signed URL expiry, referrer checks or network unavailability. W2F must report the failure and use a permitted fallback when available.

## 27. Asset licensing

Technical capture capability does not grant redistribution rights. Users are responsible for appropriate rights to content they capture and reuse. Font/image licensing may restrict embedding or redistribution.

## 28. Package size

Large pages with many assets, pixel references and raster fallback tiles may produce large `.wtf` files. W2F uses compression, deduplication and limits, but does not promise tiny package sizes for arbitrarily large pages.

## 29. Figma document size/performance

Very large captures can exceed practical Figma editing comfort even when technically importable. W2F may recommend section import, Balanced/Design Friendly mode or simplification for 20k–50k+ render-node captures.

## 30. Pixel-perfect score versus editability

A raster screenshot can look perfect but is not an acceptable substitute for supported native structure. The acceptance contract explicitly prevents raster-only implementations from passing product quality gates.

## 31. Stable identity is probabilistic in ambiguous DOMs

Stable node identity uses source/semantic/structural evidence. Pages with repeated anonymous structures and highly dynamic DOM generation may produce lower-confidence identities. Low confidence must be surfaced.

## 32. Incremental update is not P0

V2 stores stable identity and revision metadata to enable future updates, but automatic update/three-way merge of an existing Figma import is not a V2 P0 release requirement.

## 33. Automatic component generation is not P0

Structural fingerprints can identify component candidates, but V2 does not require converting all repeated structures into Figma Components/Instances automatically.

## 34. Automatic Figma Variable generation is not P0

Token Graph data is preserved, but automatic creation/matching of Figma Variables is a later design-system-aware import capability.

## 35. Print media

V2 defaults to screen rendering state. Complete `@media print` capture is not a core release requirement.

## 36. Platform/API evolution

Chrome DevTools Protocol and Figma Plugin APIs evolve. W2F isolates platform-specific behavior behind adapters/capability resolvers, but platform changes may require compatibility updates.

## 37. Compatibility policy

A known limitation is acceptable only if:

- it is documented;
- the implementation emits the promised fallback/diagnostic;
- the feature is not declared fully supported elsewhere;
- the limitation does not violate a P0 acceptance gate.

Silent data loss is not an acceptable limitation strategy.
