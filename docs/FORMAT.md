# W2F Portable Export Format

The Web-To-Figma product/project name remains **W2F**.

The portable file exported by the browser capture extension and imported by the Figma plugin is standardized as:

```text
File extension: .wtf
MIME type: application/x-wtf
Format version: 2.0.0
Schema version: 2.0.0
```

Examples:

```text
page-name.wtf
landing-page-20260821-182800.wtf
```

The normative V2 protocol is defined by:

```text
docs/WTF_FILE_SPEC_V2.md
packages/w2f-schema
```

Figma file intake must accept `.wtf` and reject obsolete export-package extensions unless a future migration policy explicitly adds backward compatibility.

Internal package/module identifiers such as `w2f-schema`, `w2f-ir`, `w2f-codecs`, plugin-data keys such as `w2f.nodeId`, and the `W2F` product name are not file extensions and therefore remain unchanged.

`.wtf` is a data-only portable package. It must not be treated as executable content.
