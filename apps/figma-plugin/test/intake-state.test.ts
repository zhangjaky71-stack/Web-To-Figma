import { describe, expect, it } from "vitest";
import {
  assertWtfIntakeCandidate,
  createDefaultImportSelection,
  createFileIntakeDescriptor,
  createIdleProgress,
  normalizeSelectedSections,
  selectionForPreview,
  transitionProgress,
} from "../src/intake-state.js";
import type { W2fParserPreview } from "../src/protocol.js";

function preview(): W2fParserPreview {
  return {
    intakeId: "intake_test",
    title: "Fixture",
    renderNodeCount: 12,
    assetCount: 2,
    referenceCount: 1,
    sectionOutline: [
      {
        id: "hero",
        name: "Hero",
        depth: 0,
        renderNodeIds: ["r1"],
        sourceStableIds: ["s1"],
        defaultSelected: true,
      },
      {
        id: "pricing",
        name: "Pricing",
        depth: 0,
        renderNodeIds: ["r2"],
        sourceStableIds: ["s2"],
        defaultSelected: false,
      },
    ],
    revision: { documentId: "doc", captureId: "cap", revisionId: "rev" },
    stableSourceMappingCount: 2,
    tokenUsageCount: 4,
    tokenPolicy: "literal",
  };
}

describe("NODE-22 file intake", () => {
  it("accepts .wtf metadata without opening the archive", () => {
    const descriptor = createFileIntakeDescriptor({
      source: "choose",
      fileName: "Example.wtf",
      mimeType: "application/x-wtf",
      byteLength: 4096,
    });
    expect(descriptor.fileName).toBe("Example.wtf");
    expect(descriptor.byteLength).toBe(4096);
    expect(descriptor.intakeId).toMatch(/^intake_[0-9a-f]{8}_4096$/);
  });

  it("rejects non-WTF filenames and files over the frozen archive ceiling", () => {
    expect(() => assertWtfIntakeCandidate("page.zip", 1)).toThrow(/W2F_E_FILE_EXTENSION/);
    expect(() => assertWtfIntakeCandidate("page.wtf", 1024 * 1024 * 1024 + 1)).toThrow(
      /W2F_E_FILE_TOO_LARGE/,
    );
  });

  it("keeps progress transitions explicit", () => {
    const reading = transitionProgress(createIdleProgress(), {
      stage: "reading",
      completed: 0,
      total: 1,
      label: "Reading",
    });
    const waiting = transitionProgress(reading, {
      stage: "awaiting-secure-parser",
      completed: 1,
      total: 1,
      label: "Waiting",
    });
    expect(waiting.stage).toBe("awaiting-secure-parser");
    expect(() =>
      transitionProgress(waiting, { stage: "done", completed: 1, total: 1, label: "Done" }),
    ).toThrow(/W2F_E_IMPORT_STATE/);
  });

  it("defaults to Balanced + Whole Page + Literal Import", () => {
    expect(createDefaultImportSelection()).toEqual({
      profile: "balanced",
      scope: "whole-page",
      selectedSectionIds: [],
      tokenPolicy: "literal",
    });
  });

  it("uses section defaults and rejects section ids outside the parser preview", () => {
    const value = preview();
    expect(selectionForPreview(createDefaultImportSelection(), value).selectedSectionIds).toEqual([
      "hero",
    ]);
    expect(normalizeSelectedSections(value, ["pricing", "missing", "pricing"])).toEqual([
      "pricing",
    ]);
  });
});
