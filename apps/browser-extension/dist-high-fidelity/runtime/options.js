import { LocalFolderProvider, } from "./source-providers/index.js";
import { isW2fShellResponse, } from "./protocol.js";
function element(id) {
    const value = document.getElementById(id);
    if (!value)
        throw new Error(`Missing options element: ${id}`);
    return value;
}
const shellVersion = element("shell-version");
const sourceSummary = element("source-summary");
const localFolderInput = element("local-folder-input");
const localFolderSummary = element("local-folder-summary");
const permissionSummary = element("permission-summary");
const jobSummary = element("job-summary");
const refreshButton = element("refresh-status");
const localFolderProvider = new LocalFolderProvider();
async function sendRequest(request) {
    const response = await chrome.runtime.sendMessage(request);
    if (!isW2fShellResponse(response))
        throw new Error("Invalid extension shell response");
    return response;
}
function isShellInfo(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return (typeof record.shellVersion === "string" &&
        record.manifestVersion === 3 &&
        record.captureImplemented === false);
}
function isSourceCapability(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return (typeof record.provider === "string" &&
        typeof record.supported === "boolean" &&
        typeof record.available === "boolean" &&
        typeof record.code === "string" &&
        typeof record.reason === "string");
}
function isJob(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const record = value;
    return typeof record.jobId === "string" && typeof record.status === "string";
}
function summarizeCapability(capability) {
    if (!capability)
        return "Source capability unavailable.";
    const state = capability.available ? "ready" : capability.supported ? "blocked" : "unsupported";
    const action = capability.requiredUserAction ? ` · action: ${capability.requiredUserAction}` : "";
    return `${capability.provider} · ${state} · ${capability.reason}${action}`;
}
function buildLocalFolderSelection(files) {
    const selected = Array.from(files);
    if (selected.length === 0)
        throw new Error("No files were selected");
    const parsed = selected.map((file) => {
        const normalized = file.webkitRelativePath.replaceAll("\\", "/");
        const segments = normalized.split("/").filter(Boolean);
        if (segments.length < 2) {
            throw new Error("Folder selection did not provide root-relative paths");
        }
        return {
            file,
            rootName: segments[0],
            relativePath: segments.slice(1).join("/"),
        };
    });
    const rootName = parsed[0].rootName;
    if (parsed.some((entry) => entry.rootName !== rootName)) {
        throw new Error("Selected files do not share one folder root");
    }
    const entries = parsed.map(({ file, relativePath }) => ({
        relativePath,
        size: file.size,
        ...(file.type ? { mediaType: file.type } : {}),
        lastModified: file.lastModified,
    }));
    const paths = entries.map((entry) => entry.relativePath).sort();
    const documentPath = paths.find((path) => path.toLowerCase() === "index.html") ??
        paths.find((path) => path.toLowerCase().endsWith("/index.html")) ??
        paths.find((path) => /\.html?$/i.test(path));
    if (!documentPath)
        throw new Error("Selected folder contains no HTML entry document");
    return {
        rootId: `session-${crypto.randomUUID()}`,
        rootName,
        documentPath,
        entries,
    };
}
async function refresh() {
    const [infoResponse, sourceResponse, jobResponse] = await Promise.all([
        sendRequest({ type: "W2F_GET_SHELL_INFO" }),
        sendRequest({ type: "W2F_GET_SOURCE_CAPABILITY" }),
        sendRequest({ type: "W2F_GET_JOB_STATE" }),
    ]);
    if (!infoResponse.ok)
        throw new Error(infoResponse.error);
    if (!sourceResponse.ok)
        throw new Error(sourceResponse.error);
    if (!jobResponse.ok)
        throw new Error(jobResponse.error);
    const info = isShellInfo(infoResponse.data) ? infoResponse.data : null;
    const sourceCapability = isSourceCapability(sourceResponse.data) ? sourceResponse.data : null;
    const job = isJob(jobResponse.data) ? jobResponse.data : null;
    shellVersion.textContent = info
        ? `Shell ${info.shellVersion} · Manifest V${info.manifestVersion}`
        : "Unknown";
    sourceSummary.textContent = summarizeCapability(sourceCapability);
    permissionSummary.textContent =
        "Install-time permissions remain activeTab, scripting, storage. file:// access is checked explicitly through Chrome and local-folder access requires a direct user folder selection.";
    jobSummary.textContent = job
        ? `${job.status} · ${job.mode} · ${job.source?.provider ?? "no source"} · ${job.phase}`
        : "No capture shell job yet.";
}
localFolderInput.addEventListener("change", () => {
    try {
        const files = localFolderInput.files;
        if (!files)
            throw new Error("No local folder file list is available");
        const input = buildLocalFolderSelection(files);
        const capability = localFolderProvider.getCapability(input);
        if (!capability.available) {
            localFolderSummary.textContent = summarizeCapability(capability);
            return;
        }
        const opened = localFolderProvider.open(input);
        localFolderSummary.textContent = `${opened.descriptor.displayName} · ${opened.entries.size} files · entry ${opened.documentPath} · local-folder source ready for later capture nodes`;
    }
    catch (error) {
        localFolderSummary.textContent = error instanceof Error ? error.message : String(error);
    }
});
refreshButton.addEventListener("click", () => void refresh());
void refresh().catch((error) => {
    jobSummary.textContent = error instanceof Error ? error.message : String(error);
});
//# sourceMappingURL=options.js.map