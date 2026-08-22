import { describe, expect, it } from "vitest";
import {
  assignStableIdentities,
  assignStableIdentity,
  createCaptureIdentity,
  createDocumentIdentity,
  createRevisionIdentity,
  normalizeDocumentLocator,
  normalizeTextForIdentity,
} from "../src/index.js";
import type { StableIdentityNodeInput } from "../src/index.js";

function node(
  captureNodeId: string,
  overrides: Partial<StableIdentityNodeInput> = {},
): StableIdentityNodeInput {
  return {
    captureNodeId,
    documentId: "doc_fixture",
    sourceOrigin: "https://example.com/products/42",
    tagName: "button",
    role: "button",
    dataAttributes: { "data-component": "buy-button" },
    classList: ["buy-button", "flex", "px-4", "Button_root__a1b2c3d4"],
    ancestry: [
      { tagName: "main", role: "main" },
      { tagName: "section", dataAttributes: { "data-component": "product-card" } },
    ],
    structuralPosition: { siblingIndex: 1, sameKindIndex: 0, documentOrder: 12 },
    textContent: "Buy now · 2026-08-22",
    ...overrides,
  };
}

describe("stable document/capture identity", () => {
  it("normalizes HTTP locators without credentials, fragments, or tracking query parameters", () => {
    const normalized = normalizeDocumentLocator({
      sourceType: "http",
      sourceUrl:
        "HTTPS://User:Pass@Example.COM/catalog?utm_source=mail&b=2&a=1&gclid=abc#hero",
    });
    expect(normalized).toBe("http:https://example.com/catalog?a=1&b=2");
  });

  it("keeps the same document id for tracking-only URL drift", async () => {
    const left = await createDocumentIdentity({
      sourceType: "http",
      sourceUrl: "https://example.com/catalog?a=1&utm_campaign=spring#top",
      rootStructuralFingerprint: "root-v1",
    });
    const right = await createDocumentIdentity({
      sourceType: "http",
      sourceUrl: "https://EXAMPLE.com/catalog?utm_source=ad&a=1#bottom",
      rootStructuralFingerprint: "root-v1",
    });
    expect(right.documentId).toBe(left.documentId);
    expect(right.sourceFingerprint).toBe(left.sourceFingerprint);
  });

  it("separates capture identity from stable document identity", async () => {
    const document = await createDocumentIdentity({
      sourceType: "http",
      sourceUrl: "https://example.com/",
    });
    const first = await createCaptureIdentity({
      documentId: document.documentId,
      capturedAt: "2026-08-22T09:00:00+08:00",
      captureNonce: "capture-a",
    });
    const second = await createCaptureIdentity({
      documentId: document.documentId,
      capturedAt: "2026-08-22T09:00:00+08:00",
      captureNonce: "capture-b",
    });
    expect(first.captureId).not.toBe(second.captureId);
    expect(first.capturedAt).toBe("2026-08-22T01:00:00.000Z");

    const revision = await createRevisionIdentity({ document, capture: first });
    expect(revision.manifestIdentity.documentId).toBe(document.documentId);
    expect(revision.manifestIdentity.captureId).toBe(first.captureId);
    expect(revision.manifestIdentity.revisionId).toBe(revision.revisionId);
  });
});

describe("stable node identity", () => {
  it("maps the same semantic node across captures despite capture ids and volatile text numbers", async () => {
    const first = await assignStableIdentity(node("cap_node_1", { textContent: "Buy now · 2026-08-22" }));
    const second = await assignStableIdentity(node("cap_node_99", { textContent: "Buy now · 2026-08-23" }));
    expect(second.identity.id).toBe(first.identity.id);
    expect(second.signatureHash).toBe(first.signatureHash);
    expect(first.identity.evidence).toContain("stable-data-attribute");
    expect(first.identity.confidence).toBeGreaterThan(0.8);
  });

  it("ignores hydration-like ids and utility/hash classes", async () => {
    const assigned = await assignStableIdentity(
      node("node_a", {
        idAttribute: ":r123:",
        dataAttributes: {},
        classList: ["flex", "px-4", "Card_root__a1b2c3d4"],
        textContent: "",
        assetFingerprints: [],
      }),
    );
    expect(assigned.signals.stableIdAttribute).toBeUndefined();
    expect(assigned.signals.meaningfulClasses).toEqual([]);
    expect(assigned.signals.usesStructuralFallback).toBe(true);
    expect(assigned.identity.confidence).toBeLessThanOrEqual(0.69);
  });

  it("normalizes dynamic numeric content without erasing semantic text", () => {
    expect(normalizeTextForIdentity("Cart (12) · Updated 2026/08/22")).toBe("cart (#) · updated #");
  });

  it("deterministically disambiguates same-signature siblings using structural position", async () => {
    const assignments = await assignStableIdentities([
      node("node_1", { structuralPosition: { siblingIndex: 0, sameKindIndex: 0 }, textContent: "" }),
      node("node_2", { structuralPosition: { siblingIndex: 1, sameKindIndex: 1 }, textContent: "" }),
    ]);
    expect(assignments[0]!.identity.id).not.toBe(assignments[1]!.identity.id);
    expect(assignments[0]!.identity.evidence).toContain(
      "collision-disambiguated-by-structural-position",
    );
  });
});
