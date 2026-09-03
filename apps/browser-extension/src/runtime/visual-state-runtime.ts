export interface VisualStateFreezeReceipt {
  version: "1.0.0";
  transactionId: string;
  status: "frozen";
  animationCount: number;
  pausedAnimationCount: number;
  mediaCount: number;
  pausedMediaCount: number;
  idempotent: boolean;
}

export interface VisualStateRestoreReceipt {
  version: "1.0.0";
  transactionId: string;
  status: "restored";
  restoredAnimationCount: number;
  restoredMediaCount: number;
  resumeFailureCount: number;
}

type VisualStateAnimationEntry = {
  animation: Animation;
  shouldResume: boolean;
};

type VisualStateMediaEntry = {
  element: HTMLMediaElement;
  shouldResume: boolean;
};

type VisualStatePageState = {
  transactionId: string;
  animations: VisualStateAnimationEntry[];
  media: VisualStateMediaEntry[];
};

type VisualStatePageGlobal = typeof globalThis & {
  __W2F_VISUAL_STATE_FREEZE_V1__?: VisualStatePageState;
};

export type VisualStateActionExecutor = (
  action: "freeze" | "restore",
  tabId: number,
  transactionId: string,
) => Promise<unknown>;

export async function freezeVisualStateInPage(
  transactionId: string,
): Promise<VisualStateFreezeReceipt> {
  if (typeof transactionId !== "string" || transactionId.trim().length === 0) {
    throw new Error("Visual-state freeze requires a non-empty transaction id");
  }

  const pageGlobal = globalThis as VisualStatePageGlobal;
  const existing = pageGlobal.__W2F_VISUAL_STATE_FREEZE_V1__;
  if (existing) {
    if (existing.transactionId !== transactionId) {
      throw new Error(`Visual state is already frozen by transaction ${existing.transactionId}`);
    }
    return {
      version: "1.0.0",
      transactionId,
      status: "frozen",
      animationCount: existing.animations.length,
      pausedAnimationCount: existing.animations.filter((entry) => entry.shouldResume).length,
      mediaCount: existing.media.length,
      pausedMediaCount: existing.media.filter((entry) => entry.shouldResume).length,
      idempotent: true,
    };
  }

  const animations: VisualStateAnimationEntry[] = document.getAnimations().map((animation) => ({
    animation,
    shouldResume: animation.playState === "running",
  }));

  const mediaElements: HTMLMediaElement[] = [];
  const roots: ParentNode[] = [document];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (!root) continue;
    for (const media of root.querySelectorAll("audio, video")) {
      mediaElements.push(media as HTMLMediaElement);
    }
    for (const element of root.querySelectorAll("*")) {
      if (element instanceof Element && element.shadowRoot) {
        roots.push(element.shadowRoot);
      }
    }
  }
  const media: VisualStateMediaEntry[] = mediaElements.map((element) => ({
    element,
    shouldResume: !element.paused && !element.ended,
  }));

  let pausedAnimationCount = 0;
  let pausedMediaCount = 0;
  try {
    for (const entry of animations) {
      if (!entry.shouldResume) continue;
      entry.animation.pause();
      pausedAnimationCount += 1;
    }
    for (const entry of media) {
      if (!entry.shouldResume) continue;
      entry.element.pause();
      pausedMediaCount += 1;
    }
  } catch (error) {
    for (const entry of animations) {
      if (!entry.shouldResume || entry.animation.playState !== "paused") continue;
      try {
        entry.animation.play();
      } catch {
        // Best-effort rollback before surfacing the freeze failure.
      }
    }
    for (const entry of media) {
      if (!entry.shouldResume || !entry.element.paused || entry.element.ended) continue;
      void entry.element.play().catch(() => undefined);
    }
    throw error;
  }

  pageGlobal.__W2F_VISUAL_STATE_FREEZE_V1__ = {
    transactionId,
    animations,
    media,
  };

  await Promise.allSettled(
    animations
      .filter((entry) => entry.shouldResume)
      .map(async (entry) => {
        await entry.animation.ready;
      }),
  );

  return {
    version: "1.0.0",
    transactionId,
    status: "frozen",
    animationCount: animations.length,
    pausedAnimationCount,
    mediaCount: media.length,
    pausedMediaCount,
    idempotent: false,
  };
}

export async function restoreVisualStateInPage(
  transactionId: string,
): Promise<VisualStateRestoreReceipt> {
  if (typeof transactionId !== "string" || transactionId.trim().length === 0) {
    throw new Error("Visual-state restore requires a non-empty transaction id");
  }

  const pageGlobal = globalThis as VisualStatePageGlobal;
  const state = pageGlobal.__W2F_VISUAL_STATE_FREEZE_V1__;
  if (!state) {
    throw new Error("Visual state is not frozen");
  }
  if (state.transactionId !== transactionId) {
    throw new Error(
      `Visual state belongs to transaction ${state.transactionId}, not ${transactionId}`,
    );
  }

  delete pageGlobal.__W2F_VISUAL_STATE_FREEZE_V1__;

  let restoredAnimationCount = 0;
  let restoredMediaCount = 0;
  let resumeFailureCount = 0;

  for (const entry of state.animations) {
    if (!entry.shouldResume || entry.animation.playState !== "paused") continue;
    try {
      entry.animation.play();
      restoredAnimationCount += 1;
    } catch {
      resumeFailureCount += 1;
    }
  }

  const mediaResumePromises: Promise<void>[] = [];
  for (const entry of state.media) {
    if (
      !entry.shouldResume ||
      !entry.element.isConnected ||
      !entry.element.paused ||
      entry.element.ended
    ) {
      continue;
    }
    try {
      const playResult = entry.element.play();
      mediaResumePromises.push(
        Promise.resolve(playResult)
          .then(() => {
            restoredMediaCount += 1;
          })
          .catch(() => {
            resumeFailureCount += 1;
          }),
      );
    } catch {
      resumeFailureCount += 1;
    }
  }
  await Promise.all(mediaResumePromises);

  return {
    version: "1.0.0",
    transactionId,
    status: "restored",
    restoredAnimationCount,
    restoredMediaCount,
    resumeFailureCount,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFreezeReceipt(value: unknown, transactionId: string): value is VisualStateFreezeReceipt {
  return (
    isRecord(value) &&
    value.version === "1.0.0" &&
    value.status === "frozen" &&
    value.transactionId === transactionId &&
    typeof value.animationCount === "number" &&
    typeof value.pausedAnimationCount === "number" &&
    typeof value.mediaCount === "number" &&
    typeof value.pausedMediaCount === "number" &&
    typeof value.idempotent === "boolean"
  );
}

function isRestoreReceipt(
  value: unknown,
  transactionId: string,
): value is VisualStateRestoreReceipt {
  return (
    isRecord(value) &&
    value.version === "1.0.0" &&
    value.status === "restored" &&
    value.transactionId === transactionId &&
    typeof value.restoredAnimationCount === "number" &&
    typeof value.restoredMediaCount === "number" &&
    typeof value.resumeFailureCount === "number"
  );
}

async function executeVisualStateAction(
  action: "freeze" | "restore",
  tabId: number,
  transactionId: string,
): Promise<unknown> {
  if (action === "freeze") {
    const injection = {
      target: { tabId },
      world: "MAIN",
      func: freezeVisualStateInPage,
      args: [transactionId] as [string],
    } as const;
    const results = await chrome.scripting.executeScript(
      injection as unknown as {
        target: { tabId: number };
        func: typeof freezeVisualStateInPage;
        args: [string];
      },
    );
    return results[0]?.result;
  }
  const injection = {
    target: { tabId },
    world: "MAIN",
    func: restoreVisualStateInPage,
    args: [transactionId] as [string],
  } as const;
  const results = await chrome.scripting.executeScript(
    injection as unknown as {
      target: { tabId: number };
      func: typeof restoreVisualStateInPage;
      args: [string];
    },
  );
  return results[0]?.result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function withFrozenVisualState<T>(
  tabId: number,
  operation: () => Promise<T>,
  execute: VisualStateActionExecutor = executeVisualStateAction,
): Promise<T> {
  const transactionId = `w2f-visual-${crypto.randomUUID()}`;
  const freezeReceipt = await execute("freeze", tabId, transactionId);
  if (!isFreezeReceipt(freezeReceipt, transactionId)) {
    throw new Error("Visual-state freeze returned an invalid receipt");
  }

  let result!: T;
  let operationFailed = false;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  let restoreFailed = false;
  let restoreError: unknown;
  try {
    const restoreReceipt = await execute("restore", tabId, transactionId);
    if (!isRestoreReceipt(restoreReceipt, transactionId)) {
      throw new Error("Visual-state restore returned an invalid receipt");
    }
    if (restoreReceipt.resumeFailureCount > 0) {
      throw new Error(
        `Visual-state restore reported ${restoreReceipt.resumeFailureCount} resume failure(s)`,
      );
    }
  } catch (error) {
    restoreFailed = true;
    restoreError = error;
  }

  if (operationFailed && restoreFailed) {
    throw new Error(
      `Capture failed (${errorMessage(operationError)}) and visual-state restoration also failed (${errorMessage(restoreError)})`,
    );
  }
  if (operationFailed) throw operationError;
  if (restoreFailed) throw restoreError;
  return result;
}
