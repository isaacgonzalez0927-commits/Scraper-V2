import assert from "node:assert/strict";
import { test } from "node:test";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "../lib/legal";

function bodies(sections: { body: string[] }[]): string {
  return sections.flatMap((section) => section.body).join("\n");
}

test("the Terms say what Sere is not, and do not force arbitration", () => {
  const text = bodies(TERMS_SECTIONS);
  assert.match(text, /not a bank/i);
  assert.match(text, /not give tax, legal, or accounting advice/i);
  assert.match(text, /restricted keys/i);
  assert.match(text, /Desk mode/i);
  assert.match(text, /Sandbox/i);
  assert.match(text, /parent or legal guardian/i);
  assert.match(text, /no arbitration clause/i);
  assert.match(text, /no class-action waiver/i);
  assert.match(text, /Florida/i);
  assert.match(text, /do not paste your own OpenAI key/i);
  assert.match(text, /\$3\.00 of model use/i);
  assert.match(text, /does not do cold outreach/i);
  assert.equal(text.includes("—"), false);
});

test("the Privacy Policy does not sell shop data and names processor keys", () => {
  const text = bodies(PRIVACY_SECTIONS);
  assert.match(text, /do not sell/i);
  assert.match(text, /encrypted/i);
  assert.match(text, /children under 13/i);
  assert.match(text, /session cookie/i);
  assert.equal(text.includes("—"), false);
});
