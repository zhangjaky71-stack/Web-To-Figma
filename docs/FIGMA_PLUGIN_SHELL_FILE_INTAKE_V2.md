# Figma Plugin Shell & File Intake V2

**Status:** NODE-22 normative implementation contract  
**Baseline:** V2 Baseline + V2.1 Addendum  
**Portable file:** `.wtf` (`application/x-wtf`)

## 1. Scope

NODE-22 creates the loadable W2F for Figma shell and the boundary that accepts a local `.wtf` without trusting archive contents.

It implements:

- Figma main sandbox + UI iframe;
- Choose File;
- UI file drop;
- Canvas Drop while the plugin is active;
- versioned main ↔ UI messages;
- file-intake and progress state;
- High Fidelity / Balanced / Design Friendly RenderProfile selection;
- Whole Page / Selected Sections import scope;
- section outline contract;
- literal token import policy;
- handoff fields for revision metadata and stable source mapping.

NODE-22 does **not** unzip, migrate, validate checksums, sanitize SVG, resolve Figma capabilities, or render a scene.

## 2. Figma runtime split

### main

The main sandbox owns host-only Figma APIs:

- `figma.showUI(...)`;
- `figma.on("drop", ...)`;
- `DropFile.getBytesAsync()` for files dropped on Canvas;
- Canvas placement coordinates;
- future Figma node creation/selection/viewport operations.

The sandbox never assumes browser DOM/File APIs.

### UI

The UI iframe owns browser APIs needed for local intake:

- `<input type="file">` Choose File;
- UI drag/drop;
- `File.arrayBuffer()`;
- progress and import-policy controls;
- section outline presentation.

No network access is requested. The manifest declares `allowedDomains: ["none"]`.

## 3. Intake convergence

All entry paths produce the same logical object:

```text
W2fFileIntakeDescriptor
+ raw Uint8Array
```

Sources are:

```text
choose
ui-drop
canvas-drop
```

Choose File / UI Drop keep bytes in the UI. Canvas Drop is read by main using the Figma Drop API and forwarded to UI through the versioned protocol.

The shell only checks filename/byte-count intake constraints. Archive contents remain unopened.

## 4. Secure parser boundary

After bytes are available, NODE-22 stops at:

```text
awaiting-secure-parser
```

NODE-23 is exclusively responsible for:

- ZIP structure;
- schema/version validation;
- ZIP bomb limits;
- ZIP slip/path validation;
- duplicate paths;
- checksums;
- SVG sanitization;
- migration.

This prevents the shell from becoming a second, weaker parser.

## 5. Versioned protocol

Every main/UI message uses:

```text
protocol = w2f-figma-plugin
version = 1
payload = typed union
```

Important messages:

```text
W2F_UI_READY
W2F_SHELL_INFO
W2F_FILE_BYTES
W2F_INTAKE_METADATA
W2F_PARSER_PREVIEW
W2F_IMPORT_SELECTION
W2F_PROGRESS
W2F_CANCEL_IMPORT
W2F_ERROR
```

Unversioned or unknown UI→main messages are rejected.

## 6. Progress contract

The shell reserves the complete import trajectory while only executing its own early stages:

```text
idle
reading
awaiting-secure-parser
validating
migrating
preview-ready
importing
finalizing
done
failed
cancelled
```

NODE-23 and later NODEs extend behavior behind these already-versioned stages instead of inventing parallel UI state.

## 7. RenderProfile policy

Profiles follow V2:

### High Fidelity

Prioritize visual preservation and safe fallback.

### Balanced

Default profile; balance fidelity and editability.

### Design Friendly

Prefer cleaner editable structure and stronger wrapper/decorative simplification where later renderer policy allows it.

All profiles consume the same `.wtf`. They are renderer policy, not file variants.

## 8. Partial import

Import scope is independent from RenderProfile:

```text
Whole Page
Selected Sections
```

Selected Sections is driven by the Render Tree section model. `W2fSectionOutlineItem` carries stable section ids plus render-node and stable-source references.

NODE-22 does not derive sections from untrusted bytes. The UI populates the outline only after NODE-23 emits a validated `W2fParserPreview`.

## 9. V2.1 preservation requirements

The parser preview / future import plan explicitly reserves:

- revision metadata (`documentId`, `captureId`, optional revision ids);
- stable source mapping counts and section `sourceStableIds`;
- token usage count;
- `tokenPolicy: "literal"`.

Literal Import is mandatory in V2.1 first release: token relations remain preserved in `.wtf`, but Figma uses actual resolved values until a future Variable Mapper is implemented.

## 10. Canvas Drop product boundary

Canvas Drop is available only while W2F is running. A `.wtf` file dropped into Figma cannot be required to wake a dormant plugin like an operating-system file association.

The plugin panel therefore tells users to keep W2F open before dropping `.wtf` on Canvas.

## 11. Local-first constraints

NODE-22:

- performs no upload;
- performs no automatic network fetch;
- does not execute HTML/JS from `.wtf`;
- does not persist raw file bytes to network-backed storage;
- does not read cookies/localStorage/sessionStorage.

## 12. Exit gate

NODE-22 passes when:

- the Figma manifest points to a bundled main and UI;
- main/UI package builds without bare imports;
- Choose File, UI Drop and Canvas Drop are represented;
- protocol and progress contracts are tested;
- Balanced / High Fidelity / Design Friendly are present;
- Whole Page / Selected Sections and outline contract are present;
- Literal Import, revision metadata and stable source mapping are preserved in handoff types;
- NODE-23 parser responsibilities are not implemented early;
- repository-wide CI is green.
