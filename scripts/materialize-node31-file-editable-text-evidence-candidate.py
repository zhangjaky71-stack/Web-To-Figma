from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  assert(\n    snapshot?.nodes?.some(\n      (node) =>\n        node.source?.attributes?.["data-node31-role"] === "file-protocol-proof" &&\n        node.textContent?.includes("NODE-31 explicit file URL permission runtime proof"),\n    ),\n    "Persisted file snapshot is missing editable fixture text",\n  );'''

new = '''  const snapshotNodeById = new Map(\n    (snapshot?.nodes ?? []).map((node) => [node.captureNodeId, node]),\n  );\n  const proofElement = (snapshot?.nodes ?? []).find(\n    (node) =>\n      node.kind === "element" &&\n      node.source?.attributes?.["data-node31-role"] === "file-protocol-proof",\n  );\n  assert(proofElement, "Persisted file snapshot is missing the proof element node");\n\n  const descendantIds = [...(proofElement.childCaptureNodeIds ?? [])];\n  let editableTextNode = null;\n  while (descendantIds.length > 0) {\n    const descendantId = descendantIds.shift();\n    const descendant = snapshotNodeById.get(descendantId);\n    if (!descendant) continue;\n    if (\n      descendant.kind === "text" &&\n      (descendant.textContent?.includes("NODE-31 explicit file URL permission runtime proof") ||\n        descendant.text?.value?.includes("NODE-31 explicit file URL permission runtime proof"))\n    ) {\n      editableTextNode = descendant;\n      break;\n    }\n    descendantIds.push(...(descendant.childCaptureNodeIds ?? []));\n  }\n  assert(\n    editableTextNode,\n    "Persisted file snapshot proof element is missing its editable descendant text node",\n  );'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("editable text evidence assertion anchor missing")

path.write_text(text)
print("NODE-31 editable RawSnapshot text-structure evidence candidate materialized in working tree.")
