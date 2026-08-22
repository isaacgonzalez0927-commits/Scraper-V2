/** iPhone path: a link today, a thin App Store wrapper later. */
export const IPHONE_PATH = "/iphone";
export const IPHONE_OPEN_HREF = "/login";
export const IPHONE_DEMO_HREF = "/demo";
export const IPHONE_START_URL = "https://www.sere.cash";
/** Fill this when the App Store listing is live. Empty means use the web link. */
export const IPHONE_STORE_URL = "";

export function iphoneCopy(): string[] {
  return [
    "The same shop you run on the computer. Jobs, invoices, and cash that actually landed.",
    "Sign in with the account you already have.",
    "Keep Sere on the home screen from Safari.",
  ];
}

export function iphoneHomeScreenSteps(): string[] {
  return [
    "Open this page in Safari.",
    "Tap Share.",
    "Tap Add to Home Screen.",
  ];
}
