from pathlib import Path

path = Path("apps/browser-extension/src/runtime/service-worker.ts")
text = path.read_text()

replacements = [
    (
        '''async function startShellJob(\n  mode: Exclude<CaptureJobMode, "responsive">,\n): Promise<CaptureJobState> {''',
        '''async function startShellJob(\n  mode: Exclude<CaptureJobMode, "responsive">,\n  preferredTab?: chrome.tabs.Tab,\n): Promise<CaptureJobState> {''',
    ),
    (
        '''    const sourceResolution = await resolveActiveTabSource();\n    const { capability, descriptor, tabId, tab } = sourceResolution;''',
        '''    const sourceResolution = await resolveActiveTabSource(preferredTab);\n    const { capability, descriptor, tabId, tab } = sourceResolution;''',
    ),
    (
        '''async function startResponsiveJob(request: ResponsiveCaptureRequest): Promise<CaptureJobState> {''',
        '''async function startResponsiveJob(\n  request: ResponsiveCaptureRequest,\n  preferredTab?: chrome.tabs.Tab,\n): Promise<CaptureJobState> {''',
    ),
    (
        '''async function handleShellRequest(request: W2fShellRequest): Promise<W2fShellResponse> {''',
        '''async function handleShellRequest(\n  request: W2fShellRequest,\n  preferredTab?: chrome.tabs.Tab,\n): Promise<W2fShellResponse> {''',
    ),
    (
        '''    case "W2F_GET_SOURCE_CAPABILITY":\n      return shellSuccess(request.type, (await resolveActiveTabSource()).capability);''',
        '''    case "W2F_GET_SOURCE_CAPABILITY":\n      return shellSuccess(request.type, (await resolveActiveTabSource(preferredTab)).capability);''',
    ),
    (
        '''    case "W2F_START_JOB":\n      return shellSuccess(request.type, await startShellJob(request.mode));''',
        '''    case "W2F_START_JOB":\n      return shellSuccess(request.type, await startShellJob(request.mode, preferredTab));''',
    ),
    (
        '''    case "W2F_START_RESPONSIVE_JOB":\n      return shellSuccess(request.type, await startResponsiveJob(request.capture));''',
        '''    case "W2F_START_RESPONSIVE_JOB":\n      return shellSuccess(\n        request.type,\n        await startResponsiveJob(request.capture, preferredTab),\n      );''',
    ),
    (
        '''chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {\n  if (!isW2fShellRequest(message)) return false;\n  void handleShellRequest(message)''',
        '''chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {\n  if (!isW2fShellRequest(message)) return false;\n  void handleShellRequest(message, sender.tab)''',
    ),
]

for old, new in replacements:
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f"sender-tab routing anchor missing: {old.splitlines()[0]}")

# startResponsiveJob contains its own source resolution, so replace the next remaining no-arg call.
old = '''    const sourceResolution = await resolveActiveTabSource();\n    const { capability, descriptor, tabId, tab } = sourceResolution;'''
new = '''    const sourceResolution = await resolveActiveTabSource(preferredTab);\n    const { capability, descriptor, tabId, tab } = sourceResolution;'''
if old in text:
    text = text.replace(old, new, 1)
elif text.count(new) < 2:
    raise SystemExit("responsive sender-tab source resolution anchor missing")

path.write_text(text)
print("NODE-31 sender-tab production routing candidate materialized in working tree.")
