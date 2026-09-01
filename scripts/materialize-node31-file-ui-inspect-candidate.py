from pathlib import Path

path = Path("scripts/run-node-31-file-protocol-runtime.mjs")
text = path.read_text()

old = '''  console.log("NODE-31 file protocol: starting final MV3 worker from registered extension root scope");
  await browserClient.send("ServiceWorker.enable");
  await browserClient.send("ServiceWorker.startWorker", { scopeURL: extensionScopeUrl });'''
new = '''  console.log("NODE-31 file protocol: opening Chrome extensions UI for real inspect-view interaction");
  const management = await createPageSession(
    browserClient,
    "chrome://extensions/",
    "Chrome extensions manager for worker inspection",
  );
  const managementClient = management.client;
  await waitFor(
    managementClient,
    `document.querySelector("extensions-manager") !== null`,
    "Chrome extensions manager custom element did not initialize",
  );

  const deepElementExpression = `(() => {
    const visit = (root, result = []) => {
      for (const element of root.querySelectorAll("*")) {
        result.push(element);
        if (element.shadowRoot) visit(element.shadowRoot, result);
      }
      return result;
    };
    return visit(document);
  })()`;

  const devModeEnabled = await evaluate(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const toolbar = elements.find((element) => element.tagName === "EXTENSIONS-TOOLBAR");
      if (!toolbar) return { ready: false, reason: "toolbar-missing" };
      if (toolbar.inDevMode === true) return { ready: true, changed: false };
      const toggle = toolbar.shadowRoot?.querySelector("#devMode");
      if (!toggle) return { ready: false, reason: "dev-mode-toggle-missing" };
      toggle.click();
      return { ready: true, changed: true };
    })()`,
  );
  assert(devModeEnabled?.ready === true, `Unable to enable Chrome extensions developer mode: ${devModeEnabled?.reason}`);

  await waitFor(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const toolbar = elements.find((element) => element.tagName === "EXTENSIONS-TOOLBAR");
      return toolbar?.inDevMode === true;
    })()`,
    "Chrome extensions UI did not enter developer mode",
  );

  await waitFor(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const item = elements.find(
        (element) => element.tagName === "EXTENSIONS-ITEM" && element.data?.id === ${JSON.stringify(extensionId)},
      );
      if (!item) return false;
      const views = item.data?.views ?? [];
      const hasWorker = views.some(
        (view) => view.type === "EXTENSION_SERVICE_WORKER_BACKGROUND" ||
          String(view.url ?? "").endsWith("/runtime/service-worker.js"),
      );
      return hasWorker && !!item.shadowRoot?.querySelector("#inspect-views a");
    })()`,
    "Chrome extensions UI did not expose the inactive Web-To-Figma service-worker inspect view",
  );

  const inspectClick = await evaluate(
    managementClient,
    `(() => {
      const elements = ${deepElementExpression};
      const item = elements.find(
        (element) => element.tagName === "EXTENSIONS-ITEM" && element.data?.id === ${JSON.stringify(extensionId)},
      );
      if (!item) return { clicked: false, reason: "extension-item-missing" };
      const views = item.data?.views ?? [];
      const workerView = views.find(
        (view) => view.type === "EXTENSION_SERVICE_WORKER_BACKGROUND" ||
          String(view.url ?? "").endsWith("/runtime/service-worker.js"),
      );
      const link = item.shadowRoot?.querySelector("#inspect-views a");
      if (!workerView || !link) {
        return { clicked: false, reason: "inspect-link-missing", views };
      }
      link.click();
      return {
        clicked: true,
        view: {
          url: workerView.url,
          type: workerView.type,
          renderProcessId: workerView.renderProcessId,
          renderViewId: workerView.renderViewId,
        },
      };
    })()`,
  );
  assert(
    inspectClick?.clicked === true,
    `Chrome extensions UI worker inspect click failed: ${inspectClick?.reason ?? "unknown"}`,
  );'''

if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("Chrome extensions UI inspect replacement anchor missing")

old_error = '''      `Final extension service worker did not start from registered root scope ${extensionScopeUrl}. Targets: ${JSON.stringify(summary)}`,'''
new_error = '''      `Final extension service worker did not start after Chrome extensions UI inspect click. Targets: ${JSON.stringify(summary)}`,'''
if old_error in text:
    text = text.replace(old_error, new_error, 1)

active_anchor = '''  assert(
    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,
    "Final MV3 service worker did not retain explicitly enabled file access",
  );

  const activeTab = await evaluate('''
active_replacement = '''  assert(
    (await evaluate(extensionClient, `chrome.extension.isAllowedFileSchemeAccess()`)) === true,
    "Final MV3 service worker did not retain explicitly enabled file access",
  );

  await browserClient.send("Target.activateTarget", { targetId: primary.targetId });
  await delay(100);

  const activeTab = await evaluate('''
if active_anchor in text:
    text = text.replace(active_anchor, active_replacement, 1)
elif active_replacement not in text:
    raise SystemExit("active file-tab restoration anchor missing")

text = text.replace(
    '          "extension-service-worker-starts-from-registered-root-scope",',
    '          "chrome-extensions-ui-inspect-click-starts-inactive-extension-service-worker",',
    1,
)
text = text.replace(
    '          "chrome-management-open-devtools-starts-inactive-extension-service-worker",',
    '          "chrome-extensions-ui-inspect-click-starts-inactive-extension-service-worker",',
    1,
)

path.write_text(text)
print("NODE-31 Chrome extensions UI service-worker inspect candidate materialized in working tree.")
