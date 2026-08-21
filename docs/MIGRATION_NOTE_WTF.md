# `.wtf` Format Migration Note

All implementation work from NODE-00 onward must use `.wtf` as the portable export/import file extension.

Required implementation behavior:

- Browser full-page export → `*.wtf`
- Browser selected-region export → `*.wtf`
- Figma file picker → accept `.wtf`
- Figma canvas drop handler → detect `.wtf`
- Portable format MIME → `application/x-wtf`
- File-spec examples, tests, fixtures, error messages, docs and release notes → `.wtf`

The product name `W2F`, schema package names, source mappings and plugin-data namespace remain `W2F`/`w2f`.
