import assert from "node:assert/strict";
import { test } from "node:test";
import { issueSessionToken, readSessionToken } from "../lib/auth";
import { iosSessionPayload } from "../lib/ios";
import { isSereIosUserAgent, SERENITY_NAME, SERENITY_PATH } from "../lib/serenity";

test("iOS session tokens round-trip the shop and user", async () => {
  const token = await issueSessionToken(7, 12);
  const session = await readSessionToken(token);
  assert.deepEqual(session, { userId: 7, organizationId: 12 });
  assert.equal(await readSessionToken("not-a-token"), null);
});

test("iOS session payload names Serenity and the shop", () => {
  const payload = iosSessionPayload({
    user: { id: 1, name: "Isaac", email: "isaac@example.com" },
    org: { id: 9, name: "Gulf Plumbing", businessType: "plumbing", operatingMode: "live" },
    access: { status: "live", frozen: false },
  });
  assert.equal(payload.assistant, SERENITY_NAME);
  assert.equal(payload.assistantPath, SERENITY_PATH);
  assert.equal(payload.shop.name, "Gulf Plumbing");
  assert.equal(payload.shop.jobsLabel, "Calls");
  assert.equal(payload.user.email, "isaac@example.com");
});

test("the iOS app identifies itself in the user agent", () => {
  assert.equal(isSereIosUserAgent("Sere-iOS/1.0"), true);
  assert.equal(isSereIosUserAgent("Mozilla/5.0"), false);
});
