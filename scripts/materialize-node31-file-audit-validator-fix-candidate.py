from pathlib import Path

path = Path("scripts/validate-node-31-p0.mjs")
text = path.read_text()

runtime_start = text.find("if (runtimeEvidence) {")
runtime_end = text.find("if (fontEvidence) {", runtime_start)
if runtime_start < 0 or runtime_end < 0:
    raise SystemExit("browser runtime evidence validation block missing")
runtime_block = text[runtime_start:runtime_end]
runtime_block = runtime_block.replace(
    '      "build",\n      "fileProtocolRuntime",\n      "browserRuntime",',
    '      "build",\n      "browserRuntime",',
    1,
)
text = text[:runtime_start] + runtime_block + text[runtime_end:]

audit_start = text.find("if (audit) {")
audit_end = text.find("if (failures.length > 0)", audit_start)
if audit_start < 0 or audit_end < 0:
    raise SystemExit("P0 audit validation block missing")
audit_block = text[audit_start:audit_end]
old = '      "build",\n      "browserRuntime",'
new = '      "build",\n      "fileProtocolRuntime",\n      "browserRuntime",'
if old in audit_block:
    audit_block = audit_block.replace(old, new, 1)
elif new not in audit_block:
    raise SystemExit("P0 audit quality-check anchor missing")
text = text[:audit_start] + audit_block + text[audit_end:]

path.write_text(text)
print("NODE-31 File protocol audit validator quality-check targeting corrected.")
