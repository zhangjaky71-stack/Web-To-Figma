import { describe, expect, it } from "vitest";
import {
  getBrowserCdpCaptureAdapterVersion,
  getBrowserExtensionAppId,
  getBrowserExtensionShellVersion,
  getBrowserRawSnapshotVersion,
  getBrowserRegionSelectionVersion,
  getBrowserSourceProvidersVersion,
  getBrowserStableIdentityAlgorithmVersion,
  getBrowserStandardCaptureAdapterVersion,
  getBrowserWtfIrVersion,
  getBrowserWtfSchemaVersion,
} from "../src/index.js";

describe("browser extension foundation", () => {
  it("exposes a stable app id", () => {
    expect(getBrowserExtensionAppId()).toBe("w2f-browser-extension");
  });

  it("uses the shared W2F V2 schema", () => {
    expect(getBrowserWtfSchemaVersion()).toBe("2.0.0");
  });

  it("uses the shared W2F V2 semantic IR", () => {
    expect(getBrowserWtfIrVersion()).toBe("2.0.0");
  });

  it("uses the shared NODE-04 stable identity algorithm", () => {
    expect(getBrowserStableIdentityAlgorithmVersion()).toBe("1.0.0");
  });

  it("uses the shared NODE-06 source-provider contract", () => {
    expect(getBrowserSourceProvidersVersion()).toBe("1.0.0");
  });

  it("exposes the NODE-07 region-selection contract", () => {
    expect(getBrowserRegionSelectionVersion()).toBe("1.0.0");
  });

  it("uses the shared NODE-08/09 adapter-neutral capture contracts", () => {
    expect(getBrowserRawSnapshotVersion()).toBe("1.0.0");
    expect(getBrowserStandardCaptureAdapterVersion()).toBe("1.0.0");
    expect(getBrowserCdpCaptureAdapterVersion()).toBe("1.0.0");
  });

  it("advances the Browser shell protocol for NODE-09", () => {
    expect(getBrowserExtensionShellVersion()).toBe("1.3.0");
  });
});
