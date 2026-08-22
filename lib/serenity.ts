/** The shop intelligence. Shown as Serenity. Internals may still say nova. */
export const SERENITY_NAME = "Serenity";
export const SERENITY_PATH = "/serenity";
export const SERENITY_IOS_UA = "Sere-iOS";

export function isSereIosUserAgent(userAgent: string): boolean {
  return /Sere-iOS/i.test(userAgent);
}
