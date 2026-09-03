import "./service-worker.js";

const FULL_PAGE_CAPTURE_COMMAND = "capture-full-page";

type CommandChrome = typeof chrome & {
  commands: {
    onCommand: {
      addListener(listener: (command: string, tab: chrome.tabs.Tab) => void): void;
    };
  };
};

(chrome as CommandChrome).commands.onCommand.addListener((command, tab) => {
  if (command !== FULL_PAGE_CAPTURE_COMMAND || typeof tab.id !== "number") return;

  void chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: () => {
        void chrome.runtime
          .sendMessage({ type: "W2F_START_JOB", mode: "full-page" })
          .catch((error: unknown) => console.error("W2F command capture failed", error));
        return { started: true };
      },
      args: [],
    })
    .catch((error: unknown) => console.error("W2F command injection failed", error));
});
