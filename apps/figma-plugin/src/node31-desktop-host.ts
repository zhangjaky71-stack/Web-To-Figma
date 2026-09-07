export interface W2fNode31DesktopHostProbe {
  userAgent: string;
  platform: string;
}

export interface W2fNode31DesktopHostDetection extends W2fNode31DesktopHostProbe {
  isDesktop: boolean;
  reason: string;
}

/**
 * Figma Desktop embeds plugin UI in Electron. Release evidence is therefore
 * enabled only when the UI user agent identifies Electron; ordinary Chrome,
 * Safari, Firefox and automated browser harnesses remain non-Desktop.
 */
export function detectNode31FigmaDesktopHost(
  probe: W2fNode31DesktopHostProbe,
): W2fNode31DesktopHostDetection {
  const userAgent = probe.userAgent.trim();
  const platform = probe.platform.trim();
  const electron = /(?:^|\s)Electron\/\d+(?:\.\d+)*/i.test(userAgent);
  const browserOnly = /(HeadlessChrome|Chrome-Lighthouse|Playwright|Puppeteer)/i.test(userAgent);
  const isDesktop = electron && !browserOnly;
  return {
    userAgent,
    platform,
    isDesktop,
    reason: isDesktop
      ? "Electron-backed Figma plugin UI detected"
      : browserOnly
        ? "automation/browser user agent is not accepted as Figma Desktop"
        : "Electron marker is absent from plugin UI user agent",
  };
}
