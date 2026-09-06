import { describe, expect, it } from "vitest";
import {
  isNode31UiToMainMessage,
  node31MeasurementMessage,
} from "../src/node31-measurement-protocol.js";

function validMeasureMessage() {
  return node31MeasurementMessage({
    type: "NODE31_MEASURE" as const,
    request: {
      sampleId: "landing-page",
      renderTree: { rootId: "root", nodes: [], sections: [] },
      assets: [],
      expectedIdentity: {
        documentId: "doc",
        captureId: "capture",
        revisionId: "revision",
        sourceFingerprint: "source-fingerprint",
        rootRenderNodeId: "root",
      },
      reference: {
        id: "full-page:current",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        dpr: 1,
        tiles: [
          {
            id: "tile-1",
            path: "references/tile-1.png",
            viewportId: "full-page:current",
            bounds: { x: 0, y: 0, width: 1440, height: 900 },
            dpr: 1,
            sha256: "a".repeat(64),
          },
        ],
      },
    },
  });
}

describe("NODE-31 Desktop measurement protocol", () => {
  it("accepts a bounded measurement request with source identity and reference tiles", () => {
    expect(isNode31UiToMainMessage(validMeasureMessage())).toBe(true);
  });

  it("rejects malformed reference tile digests", () => {
    const message = validMeasureMessage();
    message.payload.request.reference.tiles[0]!.sha256 = "fake";
    expect(isNode31UiToMainMessage(message)).toBe(false);
  });

  it("rejects missing exact source identity fields", () => {
    const message = validMeasureMessage();
    message.payload.request.expectedIdentity.sourceFingerprint = "";
    expect(isNode31UiToMainMessage(message)).toBe(false);
  });

  it("rejects unrelated plugin messages", () => {
    expect(
      isNode31UiToMainMessage({
        protocol: "w2f-figma-plugin",
        version: 1,
        payload: { type: "W2F_UI_READY" },
      }),
    ).toBe(false);
  });
});
