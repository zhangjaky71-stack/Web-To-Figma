# NODE-12 — Exit Gate Evidence

## Final candidate

The NODE-12 formal read-only Exit Gate is evaluated only after the temporary write-enabled bootstrap workflow has been removed from the branch.

Candidate baseline before this evidence commit:

```text
98baec5a1c643d620bf528c5245d4682fb959511
```

That candidate includes:

- removal of `.github/workflows/node-12-bootstrap.yml`;
- canonical Browser package validation for the Environment sidecar;
- `@w2f/environment-capture` production build normalization with `rootDir: "src"`, producing the package entry at `dist/index.js` expected by workspace consumers;
- the authoritative workspace lockfile and canonical formatting produced by the controlled bootstrap;
- NODE-12 foundation, runtime, persistence, media/container evidence and compatibility tests.

The previous CI failure on `91b9f7b0c4e1e9eb0082dbd54836f0004e5d7fd6` is superseded because that commit still emitted the new package beneath `dist/src`, while the package export expected `dist/index.js`.

This evidence commit intentionally triggers the standard repository CI against the final tree with no write-enabled NODE-12 workflow present. NODE-12 is eligible for Ready/squash merge only if that read-only frozen-lockfile run passes foundation validation, install, lint, typecheck, tests, both Browser build profiles and format validation.
