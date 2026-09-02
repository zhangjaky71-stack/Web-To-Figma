from pathlib import Path

path = Path('scripts/validate-node-31-p0.mjs')
text = path.read_text()
anchor = '\nif (audit) {'
index = text.find(anchor)
if index < 0:
    raise SystemExit('audit validation block missing')
prefix = text[:index]
suffix = text[index:]
replacements = [
    (
        'audit.auditedAgainstBranchHead === "0d569a8c57649fe7385eda2c5a780534491aa51d"',
        'audit.auditedAgainstBranchHead === "5bb72a8e34f0ab2b78dea4dbf12bc2d7f85192dc"',
    ),
    ('"P0 audit must stay anchored to exact-head CI #1017"', '"P0 audit must stay anchored to exact-head CI #1034"'),
    ('audit.ci?.runNumber === 1017', 'audit.ci?.runNumber === 1034'),
    ('"P0 audit must identify CI #1017"', '"P0 audit must identify CI #1034"'),
    ('audit.ci?.runId === 33609522169', 'audit.ci?.runId === 33618824110'),
    ('audit.ci?.jobId === 100181125296', 'audit.ci?.jobId === 100210838008'),
    (
        'audit.ci?.branchHead === "0d569a8c57649fe7385eda2c5a780534491aa51d"',
        'audit.ci?.branchHead === "5bb72a8e34f0ab2b78dea4dbf12bc2d7f85192dc"',
    ),
    (
        'audit.ci?.mergeRef === "ec8fa8a141bc7fb9ae8c63b24ad161d452501805"',
        'audit.ci?.mergeRef === "5c32e4076c8c5c68cc11e4adbc20d554193552c0"',
    ),
]
for old, new in replacements:
    if old in suffix:
        suffix = suffix.replace(old, new, 1)
    elif new not in suffix:
        raise SystemExit(f'audit anchor missing: {old}')

path.write_text(prefix + suffix)
print('NODE-31 font geometry audit CI anchor candidate fixed.')
