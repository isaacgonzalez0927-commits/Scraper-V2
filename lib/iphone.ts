/** iPhone path: a link today, a thin App Store wrapper later. */
export const IPHONE_PATH = "/iphone";
export const IPHONE_OPEN_HREF = "/login";
export const IPHONE_DEMO_HREF = "/demo";
export const IPHONE_START_URL = "https://www.sere.cash";
/** Fill this when the App Store listing is live. Empty means use the web link. */
export const IPHONE_STORE_URL = "";

export function iphoneCopy(): string[] {
  return [
    "Sere on your iPhone is this same shop. Same login. Same book.",
    "Tap Open Sere, then sign in like you do on the computer.",
    "To keep it on the home screen, open this page in Safari, tap Share, then Add to Home Screen.",
    "When Sere is on the App Store, that listing will open this same shop inside a thin iPhone wrapper. You do not need Xcode on your Mac to use Sere today.",
  ];
}

export function iphoneHomeScreenSteps(): string[] {
  return [
    "Open this page in Safari on the iPhone.",
    "Tap the Share button.",
    "Tap Add to Home Screen, then Add.",
  ];
}
