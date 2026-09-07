from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  console.log("NODE-31 file protocol: triggering real default extension action through CDP");\n  await browserClient.send("Extensions.triggerAction", {\n    id: extensionId,\n    targetId: primary.targetId,\n  });'''
new = '''  console.log("NODE-31 file protocol: resolving real tab target for default action");\n  const tabTargets = await browserClient.send("Target.getTargets", {\n    filter: [{ type: "tab", exclude: false }, { exclude: true }],\n  });\n  const actionTab = (tabTargets.targetInfos ?? []).find(\n    (target) => target.type === "tab" && target.url === fixtureUrl,\n  );\n  if (!actionTab?.targetId) {\n    const summary = (tabTargets.targetInfos ?? []).map((target) => ({\n      type: target.type,\n      url: target.url,\n      targetId: target.targetId,\n      parentId: target.parentId ?? null,\n      embedderData: target.embedderData ?? null,\n    }));\n    throw new Error(\n      `Real tab target for active file fixture was not found. Tab targets: ${JSON.stringify(summary)}`,\n    );\n  }\n  console.log("NODE-31 file protocol: triggering real default extension action through CDP tab target");\n  await browserClient.send("Extensions.triggerAction", {\n    id: extensionId,\n    targetId: actionTab.targetId,\n  });'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("default action target anchor missing")

old_assertion = '          "default-extension-action-triggered-through-cdp",\n'
new_assertion = '          "default-extension-action-triggered-on-real-tab-target-through-cdp",\n'
if old_assertion in text:
    text = text.replace(old_assertion, new_assertion, 1)
elif new_assertion not in text:
    raise SystemExit("default action evidence assertion anchor missing")

path.write_text(text)
print("NODE-31 real tab-target action candidate materialized in working tree.")
