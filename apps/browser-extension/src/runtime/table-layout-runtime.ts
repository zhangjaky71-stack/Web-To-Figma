import { analyzeTableLayout, type TableLayoutResult } from "@w2f/table-layout-engine";
import type { RawSnapshot } from "@w2f/capture-core";
import type { CssCascadeCapture } from "@w2f/css-cascade";
import { readCssCascadeCapture } from "./css-cascade-store.js";
import { readRawSnapshot } from "./snapshot-store.js";

export function analyzeSnapshotTables(
  snapshot: RawSnapshot,
  cascade: CssCascadeCapture,
): TableLayoutResult {
  return analyzeTableLayout({ snapshot, cascade });
}

export async function analyzePersistedTables(jobId: string): Promise<TableLayoutResult> {
  const [snapshot, cascade] = await Promise.all([
    readRawSnapshot(jobId),
    readCssCascadeCapture(jobId),
  ]);
  if (!snapshot) throw new Error(`Table Layout Engine requires RawSnapshot for ${jobId}`);
  if (!cascade) throw new Error(`Table Layout Engine requires CssCascadeCapture for ${jobId}`);
  return analyzeSnapshotTables(snapshot, cascade);
}
