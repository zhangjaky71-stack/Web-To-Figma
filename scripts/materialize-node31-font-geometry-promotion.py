from pathlib import Path
import json

ROOT = Path('.')
OLD_AUDIT = ROOT / 'docs/qa/results/NODE-31_P0_AUDIT_1017.json'
NEW_AUDIT = ROOT / 'docs/qa/results/NODE-31_P0_AUDIT_1034.json'
MANIFEST = ROOT / 'docs/qa/NODE-31_RC_EVIDENCE_V1.json'
VALIDATOR = ROOT / 'scripts/validate-node-31-p0.mjs'
GEOMETRY_EVIDENCE = 'docs/qa/results/NODE-31_FONT_GEOMETRY_RUNTIME_EVIDENCE_1034.json'
GEOMETRY_HARNESS = 'scripts/run-node-31-font-geometry-runtime.mjs'
GEOMETRY_SOURCE = 'apps/figma-plugin/src/font-diagnostics.ts'
RASTER_ID = 'raster-text-only-when-policy-justifies'
GEOMETRY_ID = 'geometry-preserving-correction-policy'


def dump_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


audit = json.loads(OLD_AUDIT.read_text())
audit['auditedAgainstBranchHead'] = '5bb72a8e34f0ab2b78dea4dbf12bc2d7f85192dc'
audit['ci'] = {
    'runNumber': 1034,
    'runId': 33618824110,
    'jobId': 100210838008,
    'branchHead': '5bb72a8e34f0ab2b78dea4dbf12bc2d7f85192dc',
    'mergeRef': '5c32e4076c8c5c68cc11e4adbc20d554193552c0',
    'base': '28b52dc3e0d3074bf76205c8deb324a06dfe9e23',
    'conclusion': 'PASS',
    'qualityChecks': {
        'node31Validator': 'PASS',
        'node31CorpusValidator': 'PASS',
        'node31P0Validator': 'PASS',
        'lint': 'PASS',
        'typecheck': 'PASS',
        'tests': 'PASS',
        'build': 'PASS',
        'fileProtocolRuntime': 'PASS',
        'browserRuntime': 'PASS',
        'standardCaptureRuntime': 'PASS',
        'visualStateRuntime': 'PASS',
        'pluginUiChooseFileRuntime': 'PASS',
        'pluginCanvasDropRuntime': 'PASS',
        'fontGeometryRuntime': 'PASS',
        'format': 'PASS',
    },
}

geometry = None
for item in audit.get('fontAcceptance', []):
    if item.get('id') == GEOMETRY_ID:
        geometry = item
        break
if geometry is None:
    raise SystemExit('geometry P0 item missing from source audit')
geometry['status'] = 'PASS'
geometry['sourceArtifacts'] = [GEOMETRY_SOURCE, GEOMETRY_HARNESS, GEOMETRY_EVIDENCE]
geometry['reason'] = (
    'Permanent read-only exact-head CI #1034 executes the production font geometry correction policy '
    'against a deterministic narrow TextNode metric simulator, verifies the final built plugin bundle contains '
    'the production geometry diagnostic markers, measures fallback drift before correction, applies only bounded '
    '0.85–1.15 substituted-range font-size correction when drift exceeds 2%, remeasures after correction, restores '
    'the exact fixed text bounds, and fails closed as attempted-unvalidated when the tolerance cannot be reached. '
    'The evidence explicitly does not claim Figma Desktop font rasterization or metric parity, and geometry failure '
    'does not authorize raster text.'
)
audit['blockingUnavailableCount'] = 1
audit['blockingUnavailableIds'] = [RASTER_ID]
dump_json(NEW_AUDIT, audit)

manifest = json.loads(MANIFEST.read_text())
manifest['p0']['status'] = 'UNAVAILABLE'
manifest['p0']['evidenceArtifact'] = str(NEW_AUDIT).replace('\\', '/')
manifest['p0']['blockingUnavailableCount'] = 1
manifest['p0']['note'] = (
    'P0 audit remains fail-closed. Permanent read-only exact-head CI #1017 proves explicit file:// permission and '
    'production capture, and permanent read-only exact-head CI #1034 proves the bounded geometry-preserving font '
    'correction policy against a deterministic narrow TextNode metric simulator plus final plugin bundle markers. '
    'Only raster-text policy justification remains UNAVAILABLE.'
)
dump_json(MANIFEST, manifest)

text = VALIDATOR.read_text()
text = text.replace(
    'const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_1017.json";',
    'const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_1034.json";',
    1,
)
file_evidence_anchor = (
    'const fileProtocolEvidencePath = "docs/qa/results/NODE-31_FILE_PROTOCOL_RUNTIME_EVIDENCE_1017.json";'
)
geometry_evidence_decl = (
    file_evidence_anchor
    + '\nconst fontGeometryEvidencePath = '
    + '"docs/qa/results/NODE-31_FONT_GEOMETRY_RUNTIME_EVIDENCE_1034.json";'
)
if 'const fontGeometryEvidencePath' not in text:
    if file_evidence_anchor not in text:
        raise SystemExit('font geometry evidence declaration anchor missing')
    text = text.replace(file_evidence_anchor, geometry_evidence_decl, 1)

old_blockers = '''const expectedBlockingIds = [\n  "geometry-preserving-correction-policy",\n  "raster-text-only-when-policy-justifies",\n].sort();'''
new_blockers = '''const expectedBlockingIds = ["raster-text-only-when-policy-justifies"].sort();\nconst historicalFontPolicyNotProvenIds = [\n  "geometry-preserving-correction-policy",\n  "raster-text-only-when-policy-justifies",\n].sort();'''
if old_blockers in text:
    text = text.replace(old_blockers, new_blockers, 1)
elif new_blockers not in text:
    raise SystemExit('expectedBlockingIds anchor missing')

visual_old = '["file-protocol-explicit-permission", ...expectedBlockingIds],\n    "Visual-state not-proven boundary mismatch",'
visual_new = '["file-protocol-explicit-permission", ...historicalFontPolicyNotProvenIds],\n    "Visual-state not-proven boundary mismatch",'
if visual_old in text:
    text = text.replace(visual_old, visual_new, 1)

file_old = 'fileProtocolEvidence.notProvenByThisArtifact,\n    expectedBlockingIds,\n    "File protocol not-proven boundary mismatch",'
file_new = 'fileProtocolEvidence.notProvenByThisArtifact,\n    historicalFontPolicyNotProvenIds,\n    "File protocol not-proven boundary mismatch",'
if file_old in text:
    text = text.replace(file_old, file_new, 1)

visual_assertions_anchor = '''const expectedVisualStateAssertions = [\n'''
geometry_assertions = '''const expectedFontGeometryAssertions = [\n  "production-policy-version-is-1.0.0",\n  "final-plugin-bundle-contains-geometry-policy-markers",\n  "fallback-natural-height-measured-before-correction",\n  "drift-over-two-percent-triggers-correction",\n  "correction-scale-bounded-between-0.85-and-1.15",\n  "only-substituted-range-font-size-adjusted",\n  "successful-correction-remeasured-within-two-percent",\n  "successful-correction-restores-exact-fixed-bounds",\n  "uncorrectable-drift-emits-attempted-unvalidated",\n  "uncorrectable-drift-restores-exact-fixed-bounds",\n  "geometry-failure-does-not-authorize-raster-text",\n  "within-tolerance-drift-does-not-rescale-text",\n].sort();\n\n'''
if 'const expectedFontGeometryAssertions' not in text:
    if visual_assertions_anchor not in text:
        raise SystemExit('geometry assertions insertion anchor missing')
    text = text.replace(visual_assertions_anchor, geometry_assertions + visual_assertions_anchor, 1)

require_anchor = '  fileProtocolEvidencePath,\n  fileProtocolHarnessPath,'
if '  fontGeometryEvidencePath,\n' not in text:
    if require_anchor not in text:
        raise SystemExit('geometry evidence require anchor missing')
    text = text.replace(require_anchor, '  fileProtocolEvidencePath,\n  fontGeometryEvidencePath,\n  fileProtocolHarnessPath,', 1)

read_anchor = 'const fileProtocolEvidence = readJson(fileProtocolEvidencePath);'
if 'const fontGeometryEvidence = readJson(fontGeometryEvidencePath);' not in text:
    if read_anchor not in text:
        raise SystemExit('geometry evidence read anchor missing')
    text = text.replace(
        read_anchor,
        read_anchor + '\nconst fontGeometryEvidence = readJson(fontGeometryEvidencePath);',
        1,
    )

geometry_validation = '''\nif (fontGeometryEvidence) {\n  assert(fontGeometryEvidence.version === "1.0.0", "Font geometry evidence version mismatch");\n  assert(\n    fontGeometryEvidence.evidenceType === "node31-font-geometry-policy-runtime-evidence",\n    "Font geometry evidenceType mismatch",\n  );\n  assert(fontGeometryEvidence.status === "PASS", "Font geometry evidence must PASS");\n  assert(fontGeometryEvidence.ci?.runNumber === 1034, "Font geometry evidence must identify CI #1034");\n  assert(fontGeometryEvidence.ci?.runId === 33618824110, "Font geometry run id mismatch");\n  assert(fontGeometryEvidence.ci?.jobId === 100210838008, "Font geometry job id mismatch");\n  assert(\n    fontGeometryEvidence.ci?.branchHead === "5bb72a8e34f0ab2b78dea4dbf12bc2d7f85192dc",\n    "Font geometry branch head mismatch",\n  );\n  assert(\n    fontGeometryEvidence.ci?.mergeRef === "5c32e4076c8c5c68cc11e4adbc20d554193552c0",\n    "Font geometry merge ref mismatch",\n  );\n  assert(\n    fontGeometryEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",\n    "Font geometry base mismatch",\n  );\n  assert(\n    fontGeometryEvidence.ci?.tokenPermissions?.contents === "read",\n    "Font geometry evidence must come from read-only CI",\n  );\n  assertQualityChecks(\n    fontGeometryEvidence,\n    [\n      "node31Validator",\n      "node31CorpusValidator",\n      "node31P0Validator",\n      "lint",\n      "typecheck",\n      "tests",\n      "build",\n      "fileProtocolRuntime",\n      "browserRuntime",\n      "standardCaptureRuntime",\n      "visualStateRuntime",\n      "pluginUiChooseFileRuntime",\n      "pluginCanvasDropRuntime",\n      "fontGeometryRuntime",\n      "format",\n    ],\n    "Font geometry evidence",\n  );\n  assert(\n    fontGeometryEvidence.productionSource === fontDiagnosticsPath,\n    "Font geometry production source mismatch",\n  );\n  assert(\n    fontGeometryEvidence.runtimeHarness === "scripts/run-node-31-font-geometry-runtime.mjs",\n    "Font geometry runtime harness mismatch",\n  );\n  assert(\n    fontGeometryEvidence.hostBoundary?.figmaApi === "simulated-text-metrics",\n    "Font geometry host boundary mismatch",\n  );\n  assert(\n    String(fontGeometryEvidence.hostBoundary?.note ?? "").includes("does not claim Figma Desktop"),\n    "Font geometry evidence must retain its Figma Desktop claim boundary",\n  );\n  assertArrayEquals(\n    fontGeometryEvidence.assertions,\n    expectedFontGeometryAssertions,\n    "Font geometry assertion set mismatch",\n  );\n  assertArrayEquals(\n    fontGeometryEvidence.provesP0Items,\n    ["geometry-preserving-correction-policy"],\n    "Font geometry proven P0 set mismatch",\n  );\n  assertArrayEquals(\n    fontGeometryEvidence.notProvenByThisArtifact,\n    ["raster-text-only-when-policy-justifies"],\n    "Font geometry not-proven boundary mismatch",\n  );\n}\n'''
if 'if (fontGeometryEvidence) {' not in text:
    audit_anchor = '\nif (audit) {'
    if audit_anchor not in text:
        raise SystemExit('geometry evidence validation insertion anchor missing')
    text = text.replace(audit_anchor, geometry_validation + audit_anchor, 1)

text = text.replace(
    'assert(audit.blockingUnavailableCount === 2, "P0 audit must retain exactly 2 blockers");',
    'assert(audit.blockingUnavailableCount === 1, "P0 audit must retain exactly 1 blocker");',
    1,
)
text = text.replace(
    'assert(manifest.p0?.blockingUnavailableCount === 2, "manifest P0 blocker count must be 2");',
    'assert(manifest.p0?.blockingUnavailableCount === 1, "manifest P0 blocker count must be 1");',
    1,
)
VALIDATOR.write_text(text)
print('NODE-31 font geometry evidence promotion candidate materialized.')
