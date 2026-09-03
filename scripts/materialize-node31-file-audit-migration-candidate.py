import json
from pathlib import Path

ROOT = Path(".")
OLD_AUDIT = ROOT / "docs/qa/results/NODE-31_P0_AUDIT_882.json"
NEW_AUDIT = ROOT / "docs/qa/results/NODE-31_P0_AUDIT_1017.json"
MANIFEST = ROOT / "docs/qa/NODE-31_RC_EVIDENCE_V1.json"
VALIDATOR = ROOT / "scripts/validate-node-31-p0.mjs"

FILE_EVIDENCE = "docs/qa/results/NODE-31_FILE_PROTOCOL_RUNTIME_EVIDENCE_1017.json"
FILE_HARNESS = "scripts/run-node-31-file-protocol-runtime.mjs"
FILE_FIXTURE = "qa/corpus/node31/p0/file-protocol-runtime.html"
FILE_MANIFEST_STANDARD = "apps/browser-extension/static/manifest.json"
FILE_MANIFEST_HIFI = "apps/browser-extension/static/manifest.high-fidelity.json"
FILE_SOURCE_RUNTIME = "apps/browser-extension/src/runtime/source-runtime.ts"
FILE_SERVICE_WORKER = "apps/browser-extension/src/runtime/service-worker.ts"
FILE_SNAPSHOT_STORE = "apps/browser-extension/src/runtime/snapshot-store.ts"

BRANCH_HEAD = "0d569a8c57649fe7385eda2c5a780534491aa51d"
MERGE_REF = "ec8fa8a141bc7fb9ae8c63b24ad161d452501805"
BASE = "28b52dc3e0d3074bf76205c8deb324a06dfe9e23"

# Generate the new fail-closed audit from the last validated audit.
audit = json.loads(OLD_AUDIT.read_text())
audit["auditedAgainstBranchHead"] = BRANCH_HEAD
audit["ci"] = {
    "runNumber": 1017,
    "runId": 33609522169,
    "jobId": 100181125296,
    "branchHead": BRANCH_HEAD,
    "mergeRef": MERGE_REF,
    "base": BASE,
    "conclusion": "PASS",
    "qualityChecks": {
        "node31Validator": "PASS",
        "node31CorpusValidator": "PASS",
        "node31P0Validator": "PASS",
        "lint": "PASS",
        "typecheck": "PASS",
        "tests": "PASS",
        "build": "PASS",
        "fileProtocolRuntime": "PASS",
        "browserRuntime": "PASS",
        "standardCaptureRuntime": "PASS",
        "visualStateRuntime": "PASS",
        "pluginUiChooseFileRuntime": "PASS",
        "pluginCanvasDropRuntime": "PASS",
        "format": "PASS",
    },
}

file_entry = next(
    (entry for entry in audit.get("capture", []) if entry.get("id") == "file-protocol-explicit-permission"),
    None,
)
if not file_entry:
    raise SystemExit("file-protocol-explicit-permission audit entry missing")
file_entry["status"] = "PASS"
file_entry["sourceArtifacts"] = [
    FILE_MANIFEST_STANDARD,
    FILE_MANIFEST_HIFI,
    FILE_SOURCE_RUNTIME,
    FILE_SERVICE_WORKER,
    FILE_SNAPSHOT_STORE,
    FILE_FIXTURE,
    FILE_HARNESS,
    FILE_EVIDENCE,
]
file_entry["reason"] = (
    "Permanent read-only exact-head CI #1017 runs the final High Fidelity unpacked extension in real "
    "Chrome 151, explicitly toggles Chrome extension file access off then on, loads a real versioned "
    "file:// fixture, wakes the final MV3 worker through the Chrome extensions Inspect UI, routes the "
    "production source/capture messages to the prevalidated file tab, completes the production "
    "high-fidelity full-page job, and reads the persisted RawSnapshot from the service-worker-origin "
    "IndexedDB. The persisted snapshot preserves the real file URL/title and an editable descendant "
    "text node under the proof element. The harness explicitly forbids --allow-file-access-from-files."
)
audit["blockingUnavailableCount"] = 2
audit["blockingUnavailableIds"] = [
    "geometry-preserving-correction-policy",
    "raster-text-only-when-policy-justifies",
]
NEW_AUDIT.write_text(json.dumps(audit, indent=2) + "\n")

# Point the RC evidence manifest at the new audit while remaining fail-closed.
manifest = json.loads(MANIFEST.read_text())
manifest["p0"]["status"] = "UNAVAILABLE"
manifest["p0"]["evidenceArtifact"] = str(NEW_AUDIT)
manifest["p0"]["blockingUnavailableCount"] = 2
manifest["p0"]["note"] = (
    "P0 audit remains fail-closed. Permanent read-only exact-head CI #1017 directly proves successful "
    "production file:// capture after explicit Chrome extension file-access permission, including the "
    "final High Fidelity worker/source routing, production capture adapter, service-worker-origin "
    "IndexedDB persistence, and editable RawSnapshot text structure. Two font-policy items remain "
    "UNAVAILABLE: geometry-preserving font correction policy and raster-text policy justification."
)
MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

# Strengthen the validator so the 2-blocker state cannot pass without exact File protocol evidence.
text = VALIDATOR.read_text()

def replace_once(old: str, new: str, label: str):
    global text
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f"validator anchor missing: {label}")

replace_once(
    'const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_882.json";',
    'const auditPath = "docs/qa/results/NODE-31_P0_AUDIT_1017.json";',
    "audit path",
)
replace_once(
    'const visualStateEvidencePath = "docs/qa/results/NODE-31_VISUAL_STATE_RUNTIME_EVIDENCE_882.json";\n',
    'const visualStateEvidencePath = "docs/qa/results/NODE-31_VISUAL_STATE_RUNTIME_EVIDENCE_882.json";\n'
    'const fileProtocolEvidencePath = "docs/qa/results/NODE-31_FILE_PROTOCOL_RUNTIME_EVIDENCE_1017.json";\n',
    "file evidence path",
)
replace_once(
    'const visualStateBuiltArtifactPath = "apps/browser-extension/dist/runtime/visual-state-runtime.js";\n',
    'const visualStateBuiltArtifactPath = "apps/browser-extension/dist/runtime/visual-state-runtime.js";\n'
    'const fileProtocolHarnessPath = "scripts/run-node-31-file-protocol-runtime.mjs";\n'
    'const fileProtocolFixturePath = "qa/corpus/node31/p0/file-protocol-runtime.html";\n'
    'const fileProtocolManifestPath = "apps/browser-extension/static/manifest.json";\n'
    'const fileProtocolHighFidelityManifestPath =\n'
    '  "apps/browser-extension/static/manifest.high-fidelity.json";\n'
    'const fileProtocolSourceRuntimePath = "apps/browser-extension/src/runtime/source-runtime.ts";\n'
    'const fileProtocolServiceWorkerPath = "apps/browser-extension/src/runtime/service-worker.ts";\n'
    'const fileProtocolSnapshotStorePath = "apps/browser-extension/src/runtime/snapshot-store.ts";\n',
    "file source constants",
)
replace_once(
    'const expectedBlockingIds = [\n  "file-protocol-explicit-permission",\n  "geometry-preserving-correction-policy",\n  "raster-text-only-when-policy-justifies",\n].sort();',
    'const expectedBlockingIds = [\n  "geometry-preserving-correction-policy",\n  "raster-text-only-when-policy-justifies",\n].sort();',
    "blocking ids",
)
replace_once(
    'const expectedVisualStateAssertions = [\n',
    'const expectedFileProtocolAssertions = [\n'
    '  "built-manifest-declares-file-scheme-host-permission",\n'
    '  "unpacked-extension-loaded-through-modern-cdp-in-real-chrome",\n'
    '  "chrome-management-state-explicitly-disables-file-access",\n'
    '  "chrome-management-state-explicitly-enables-file-access",\n'
    '  "real-file-url-fixture-loads-after-explicit-permission",\n'
    '  "trusted-chrome-extensions-ui-inspect-click-starts-inactive-extension-service-worker",\n'
    '  "inspected-high-fidelity-worker-resumes-and-exposes-required-extension-apis",\n'
    '  "final-service-worker-resolves-real-file-tab-for-message-injection",\n'
    '  "production-message-injection-targets-prevalidated-file-tab-id",\n'
    '  "file-tab-extension-world-dispatches-production-runtime-messages",\n'
    '  "production-source-capability-resolves-active-file-tab-ready",\n'
    '  "production-full-page-job-completes-on-file-url",\n'
    '  "completed-job-preserves-file-source-and-page-url",\n'
    '  "completed-job-uses-high-fidelity-cdp-capture-adapter",\n'
    '  "completed-job-persists-raw-snapshot",\n'
    '  "service-worker-origin-indexeddb-exposes-persisted-raw-snapshot",\n'
    '  "persisted-raw-snapshot-preserves-file-url-and-title",\n'
    '  "persisted-raw-snapshot-preserves-editable-text-structure",\n'
    '].sort();\n\n'
    'const expectedVisualStateAssertions = [\n',
    "file assertion set",
)
replace_once(
    '  visualStateEvidencePath,\n  runtimeHarnessPath,',
    '  visualStateEvidencePath,\n  fileProtocolEvidencePath,\n  fileProtocolHarnessPath,\n'
    '  fileProtocolFixturePath,\n  fileProtocolManifestPath,\n'
    '  fileProtocolHighFidelityManifestPath,\n  fileProtocolSourceRuntimePath,\n'
    '  fileProtocolServiceWorkerPath,\n  fileProtocolSnapshotStorePath,\n  runtimeHarnessPath,',
    "required files",
)
replace_once(
    'const visualStateEvidence = readJson(visualStateEvidencePath);\n',
    'const visualStateEvidence = readJson(visualStateEvidencePath);\n'
    'const fileProtocolEvidence = readJson(fileProtocolEvidencePath);\n',
    "file evidence read",
)

visual_boundary_old = '''  assertArrayEquals(\n    visualStateEvidence.notProvenByThisArtifact,\n    expectedBlockingIds,\n    "Visual-state not-proven boundary mismatch",\n  );\n}\n\nif (pluginUiEvidence) {'''
visual_boundary_new = '''  assertArrayEquals(\n    visualStateEvidence.notProvenByThisArtifact,\n    ["file-protocol-explicit-permission", ...expectedBlockingIds],\n    "Visual-state not-proven boundary mismatch",\n  );\n}\n\nif (fileProtocolEvidence) {\n  assert(fileProtocolEvidence.version === "1.0.0", "File protocol evidence version mismatch");\n  assert(\n    fileProtocolEvidence.evidenceType === "node31-file-protocol-runtime-evidence",\n    "File protocol evidenceType mismatch",\n  );\n  assert(fileProtocolEvidence.status === "PASS", "File protocol evidence must PASS");\n  assert(fileProtocolEvidence.ci?.runNumber === 1017, "File protocol evidence must identify CI #1017");\n  assert(fileProtocolEvidence.ci?.runId === 33609522169, "File protocol run id mismatch");\n  assert(fileProtocolEvidence.ci?.jobId === 100181125296, "File protocol job id mismatch");\n  assert(\n    fileProtocolEvidence.ci?.branchHead === "0d569a8c57649fe7385eda2c5a780534491aa51d",\n    "File protocol branch head mismatch",\n  );\n  assert(\n    fileProtocolEvidence.ci?.mergeRef === "ec8fa8a141bc7fb9ae8c63b24ad161d452501805",\n    "File protocol merge ref mismatch",\n  );\n  assert(\n    fileProtocolEvidence.ci?.base === "28b52dc3e0d3074bf76205c8deb324a06dfe9e23",\n    "File protocol base mismatch",\n  );\n  assert(\n    fileProtocolEvidence.ci?.tokenPermissions?.contents === "read",\n    "File protocol evidence must come from read-only CI",\n  );\n  assertQualityChecks(\n    fileProtocolEvidence,\n    [\n      "node31Validator",\n      "node31CorpusValidator",\n      "node31P0Validator",\n      "lint",\n      "typecheck",\n      "tests",\n      "build",\n      "fileProtocolRuntime",\n      "browserRuntime",\n      "standardCaptureRuntime",\n      "visualStateRuntime",\n      "pluginUiChooseFileRuntime",\n      "pluginCanvasDropRuntime",\n      "format",\n    ],\n    "File protocol evidence",\n  );\n  assert(\n    fileProtocolEvidence.environment?.chrome === "Chrome/151.0.7922.173",\n    "File protocol Chrome mismatch",\n  );\n  assert(fileProtocolEvidence.environment?.node === "v24.19.0", "File protocol Node mismatch");\n  assert(fileProtocolEvidence.environment?.pnpm === "11.22.0", "File protocol pnpm mismatch");\n  assert(\n    fileProtocolEvidence.harnessArtifact === fileProtocolHarnessPath,\n    "File protocol harness mismatch",\n  );\n  assertIncludesAll(\n    fileProtocolEvidence.sourceArtifacts,\n    [\n      fileProtocolManifestPath,\n      fileProtocolHighFidelityManifestPath,\n      fileProtocolSourceRuntimePath,\n      fileProtocolServiceWorkerPath,\n      fileProtocolSnapshotStorePath,\n      fileProtocolFixturePath,\n    ],\n    "File protocol source",\n  );\n  assert(\n    fileProtocolEvidence.runtimeResult?.version === "1.9.0",\n    "File protocol runtime version mismatch",\n  );\n  assert(\n    fileProtocolEvidence.runtimeResult?.captureProfile === "high-fidelity",\n    "File protocol capture profile mismatch",\n  );\n  assertArrayEquals(\n    fileProtocolEvidence.runtimeResult?.assertions,\n    expectedFileProtocolAssertions,\n    "File protocol assertion set mismatch",\n  );\n  assertArrayEquals(\n    fileProtocolEvidence.provesP0Items,\n    ["file-protocol-explicit-permission"],\n    "File protocol proven P0 set mismatch",\n  );\n  assertArrayEquals(\n    fileProtocolEvidence.notProvenByThisArtifact,\n    expectedBlockingIds,\n    "File protocol not-proven boundary mismatch",\n  );\n  assertArrayEquals(\n    fileProtocolEvidence.prohibitedShortcutFlags,\n    ["--allow-file-access-from-files"],\n    "File protocol prohibited shortcut mismatch",\n  );\n}\n\nif (pluginUiEvidence) {'''
replace_once(visual_boundary_old, visual_boundary_new, "file evidence validation")

replace_once(
    '    audit.auditedAgainstBranchHead === "913373bc7afd1d4add7165c693c2e69f10342181",\n    "P0 audit must stay anchored to exact-head CI #882",\n  );\n  assert(audit.ci?.runNumber === 882, "P0 audit must identify CI #882");\n  assert(audit.ci?.runId === 33160065371, "P0 audit run id mismatch");\n  assert(audit.ci?.jobId === 98812093098, "P0 audit job id mismatch");\n  assert(\n    audit.ci?.branchHead === "913373bc7afd1d4add7165c693c2e69f10342181",\n    "P0 audit branch head mismatch",\n  );\n  assert(\n    audit.ci?.mergeRef === "44f486945309acd3ab488c4418fc5eee3ec2519e",\n    "P0 audit merge ref mismatch",\n  );',
    '    audit.auditedAgainstBranchHead === "0d569a8c57649fe7385eda2c5a780534491aa51d",\n    "P0 audit must stay anchored to exact-head CI #1017",\n  );\n  assert(audit.ci?.runNumber === 1017, "P0 audit must identify CI #1017");\n  assert(audit.ci?.runId === 33609522169, "P0 audit run id mismatch");\n  assert(audit.ci?.jobId === 100181125296, "P0 audit job id mismatch");\n  assert(\n    audit.ci?.branchHead === "0d569a8c57649fe7385eda2c5a780534491aa51d",\n    "P0 audit branch head mismatch",\n  );\n  assert(\n    audit.ci?.mergeRef === "ec8fa8a141bc7fb9ae8c63b24ad161d452501805",\n    "P0 audit merge ref mismatch",\n  );',
    "audit exact head",
)
replace_once(
    '      "build",\n      "browserRuntime",',
    '      "build",\n      "fileProtocolRuntime",\n      "browserRuntime",',
    "audit file quality check",
)
replace_once(
    '  const requiredPassProvenance = new Map([\n',
    '  const requiredPassProvenance = new Map([\n'
    '    [\n'
    '      "file-protocol-explicit-permission",\n'
    '      [\n'
    '        fileProtocolManifestPath,\n'
    '        fileProtocolHighFidelityManifestPath,\n'
    '        fileProtocolSourceRuntimePath,\n'
    '        fileProtocolServiceWorkerPath,\n'
    '        fileProtocolSnapshotStorePath,\n'
    '        fileProtocolFixturePath,\n'
    '        fileProtocolHarnessPath,\n'
    '        fileProtocolEvidencePath,\n'
    '      ],\n'
    '    ],\n',
    "file audit provenance",
)
replace_once(
    '  assert(audit.blockingUnavailableCount === 3, "P0 audit must retain exactly 3 blockers");',
    '  assert(audit.blockingUnavailableCount === 2, "P0 audit must retain exactly 2 blockers");',
    "audit blocker count",
)
replace_once(
    '    assert(manifest.p0?.blockingUnavailableCount === 3, "manifest P0 blocker count must be 3");',
    '    assert(manifest.p0?.blockingUnavailableCount === 2, "manifest P0 blocker count must be 2");',
    "manifest blocker count",
)

VALIDATOR.write_text(text)
print("NODE-31 File protocol P0 audit migration candidate materialized in working tree.")
