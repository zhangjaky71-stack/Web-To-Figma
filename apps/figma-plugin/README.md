# @w2f/figma-plugin

NODE-22 loadable W2F for Figma shell.

Development package:

```text
manifest.json
  -> dist/code.js
  -> dist/ui.html
```

The shell accepts local `.wtf` bytes through Choose File, UI Drop, or active-plugin Canvas Drop and stops at the NODE-23 secure-parser boundary. It performs no network access and does not render archive contents in NODE-22.
