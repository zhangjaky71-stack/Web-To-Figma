interface W2fChromeEvent<TListener extends (...args: never[]) => unknown> {
  addListener(listener: TListener): void;
}

declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
    }

    interface Manifest {
      manifest_version: number;
      permissions?: string[];
      name?: string;
      version?: string;
    }

    const onInstalled: W2fChromeEvent<(details: { reason: string }) => void>;
    const onMessage: W2fChromeEvent<
      (
        message: unknown,
        sender: MessageSender,
        sendResponse: (response: unknown) => void,
      ) => boolean | void
    >;

    function sendMessage(message: unknown): Promise<unknown>;
    function openOptionsPage(): Promise<void>;
    function getManifest(): Manifest;
  }

  namespace extension {
    function isAllowedFileSchemeAccess(): Promise<boolean>;
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | readonly string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | readonly string[]): Promise<void>;
    }

    const local: StorageArea;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      windowId?: number;
    }

    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
    function captureVisibleTab(
      windowId?: number,
      options?: { format?: "png" | "jpeg"; quality?: number },
    ): Promise<string>;
  }

  namespace downloads {
    interface DownloadOptions {
      url: string;
      filename?: string;
      conflictAction?: "uniquify" | "overwrite" | "prompt";
      saveAs?: boolean;
    }

    function download(options: DownloadOptions): Promise<number>;
  }

  namespace scripting {
    interface InjectionResult<T> {
      frameId: number;
      result?: T;
      error?: string;
    }

    function executeScript(injection: {
      target: { tabId: number };
      files: string[];
    }): Promise<InjectionResult<unknown>[]>;

    function executeScript<TArgs extends unknown[], TResult>(injection: {
      target: { tabId: number };
      func: (...args: TArgs) => TResult;
      args: TArgs;
    }): Promise<InjectionResult<TResult>[]>;
  }
}
