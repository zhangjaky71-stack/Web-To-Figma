interface W2fChromeEvent<TListener extends (...args: never[]) => unknown> {
  addListener(listener: TListener): void;
}

declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
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
    }

    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }

  namespace scripting {
    function executeScript(injection: {
      target: { tabId: number };
      files: string[];
    }): Promise<unknown[]>;
  }
}
