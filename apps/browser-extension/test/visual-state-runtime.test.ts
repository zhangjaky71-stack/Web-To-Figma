import { describe, expect, it, vi } from "vitest";
import {
  withFrozenVisualState,
  type VisualStateActionExecutor,
  type VisualStateFreezeReceipt,
  type VisualStateRestoreReceipt,
} from "../src/runtime/visual-state-runtime.js";

function freezeReceipt(transactionId: string): VisualStateFreezeReceipt {
  return {
    version: "1.0.0",
    transactionId,
    status: "frozen",
    animationCount: 2,
    pausedAnimationCount: 1,
    mediaCount: 1,
    pausedMediaCount: 1,
    idempotent: false,
  };
}

function restoreReceipt(transactionId: string): VisualStateRestoreReceipt {
  return {
    version: "1.0.0",
    transactionId,
    status: "restored",
    restoredAnimationCount: 1,
    restoredMediaCount: 1,
    resumeFailureCount: 0,
  };
}

describe("visual-state capture transaction", () => {
  it("freezes before capture and restores after success", async () => {
    const executor = vi.fn<VisualStateActionExecutor>(async (action, _tabId, transactionId) =>
      action === "freeze" ? freezeReceipt(transactionId) : restoreReceipt(transactionId),
    );
    const operation = vi.fn(async () => "captured");

    await expect(withFrozenVisualState(7, operation, executor)).resolves.toBe("captured");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls[0]?.[0]).toBe("freeze");
    expect(executor.mock.calls[1]?.[0]).toBe("restore");
    expect(executor.mock.calls[0]?.[2]).toBe(executor.mock.calls[1]?.[2]);
  });

  it("restores visual state when capture throws", async () => {
    const executor = vi.fn<VisualStateActionExecutor>(async (action, _tabId, transactionId) =>
      action === "freeze" ? freezeReceipt(transactionId) : restoreReceipt(transactionId),
    );

    await expect(
      withFrozenVisualState(
        9,
        async () => {
          throw new Error("capture exploded");
        },
        executor,
      ),
    ).rejects.toThrow("capture exploded");
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls[1]?.[0]).toBe("restore");
  });

  it("fails closed when restoration reports a resume failure", async () => {
    const executor = vi.fn<VisualStateActionExecutor>(async (action, _tabId, transactionId) => {
      if (action === "freeze") return freezeReceipt(transactionId);
      return { ...restoreReceipt(transactionId), resumeFailureCount: 1 };
    });

    await expect(withFrozenVisualState(11, async () => "captured", executor)).rejects.toThrow(
      "Visual-state restore reported 1 resume failure",
    );
  });

  it("does not run capture when the freeze receipt is invalid", async () => {
    const executor = vi.fn<VisualStateActionExecutor>(async () => ({ status: "invalid" }));
    const operation = vi.fn(async () => "captured");

    await expect(withFrozenVisualState(13, operation, executor)).rejects.toThrow(
      "Visual-state freeze returned an invalid receipt",
    );
    expect(operation).not.toHaveBeenCalled();
    expect(executor).toHaveBeenCalledTimes(1);
  });
});
