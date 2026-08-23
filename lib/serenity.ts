/**
 * Serenity is the shop intelligence: board, books, jobs, cash.
 * She is not Nova. Nova is the operator's cold outreach bot.
 */
export const SERENITY_NAME = "Serenity";
export const SERENITY_PATH = "/serenity";
export const SERENITY_IOS_UA = "Sere-iOS";

export function isSereIosUserAgent(userAgent: string): boolean {
  return /Sere-iOS/i.test(userAgent);
}
