import type { W2fPerformanceSample } from "./node30-types.js";

export interface W2fPerformanceBenchmarkContext {
  id: string;
  benchmarkEnvironment: string;
  renderNodeCount: number;
  chunkingSupported: boolean;
  progressSupported: boolean;
  userWarningShown: boolean;
  sectionOrSimplifiedStrategyOffered: boolean;
  explicitConfirmationObtained: boolean;
}

export interface W2fPerformanceBenchmarkResult {
  sample: W2fPerformanceSample;
  errorMessage?: string;
}

export interface W2fPerformanceClock {
  now(): number;
}

const DEFAULT_CLOCK: W2fPerformanceClock = {
  now: () => (typeof performance === "undefined" ? Date.now() : performance.now()),
};

export async function measurePerformanceBenchmark(
  context: W2fPerformanceBenchmarkContext,
  task: () => Promise<void> | void,
  clock: W2fPerformanceClock = DEFAULT_CLOCK,
): Promise<W2fPerformanceBenchmarkResult> {
  const startedAt = clock.now();
  try {
    await task();
    const finishedAt = clock.now();
    return {
      sample: {
        ...context,
        durationMs: Math.max(0, finishedAt - startedAt),
        completed: true,
        crashed: false,
      },
    };
  } catch (error) {
    const finishedAt = clock.now();
    return {
      sample: {
        ...context,
        durationMs: Math.max(0, finishedAt - startedAt),
        completed: false,
        crashed: true,
      },
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
