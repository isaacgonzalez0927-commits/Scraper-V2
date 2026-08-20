import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSystemPrompt,
  buildUserPrompt,
  finalBody,
  MAX_WORDS,
  prospectReady,
  sendableProblems,
  SERE,
  validateDraft,
  type Product,
} from "../lib/outreach/copy";
import {
  isWinner,
  nextVariant,
  pickWinners,
  scoreEmail,
  variantStats,
} from "../lib/outreach/learn";
import {
  circuitBreaker,
  LIMITS,
  pauseSeconds,
  planRun,
  sendingDay,
  sendingWindow,
  STEADY_CAP,
  warmupCap,
} from "../lib/outreach/guard";
import { mapLastEvent } from "../lib/outreach/poll";
import { rootDomain, senderProblems } from "../lib/outreach/send";
import type { Prospect, SentEmail } from "../lib/outreach/types";

function prospect(over: Partial<Prospect> = {}): Prospect {
  return {
    id: 1,
    company: "Harbor Air",
    contact: "Elena Vasquez",
    email: "elena@harborair.example",
    trade: "hvac",
    city: "Fort Myers",
    website: "harborair.example",
    fact: "your site takes service calls by phone only, no request form",
    source: "test",
    unsubscribedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

function sent(over: Partial<SentEmail> = {}): SentEmail {
  return {
    id: 1,
    prospectId: 1,
    product: "sere",
    variant: "a",
    subject: "phone-only service calls",
    body: "Saw your service calls come in by phone only.",
    approvedAt: "2026-08-02T00:00:00.000Z",
    providerId: "re_1",
    sentAt: "2026-08-02T00:00:00.000Z",
    openedDemoAt: null,
    repliedAt: null,
    signedUpAt: null,
    bouncedAt: null,
    complainedAt: null,
    createdAt: "2026-08-02T00:00:00.000Z",
    trade: "hvac",
    city: "Fort Myers",
    fact: "phone only",
    ...over,
  };
}

const product: Product = { ...SERE, postalAddress: "1840 Fowler St, Fort Myers, FL 33901" };

test("a prospect without a researched fact is not emailable", () => {
  assert.deepEqual(prospectReady(prospect()), []);
  const thin = prospectReady(prospect({ fact: "hvac" }));
  assert.equal(thin.length, 1);
  assert.match(thin[0], /specific fact/i);
  assert.match(prospectReady(prospect({ email: "nope" }))[0], /email address/i);
  assert.match(
    prospectReady(prospect({ unsubscribedAt: "2026-08-10T00:00:00.000Z" }))[0],
    /asked out/i,
  );
});

test("the validator rejects the slop a small model reaches for", () => {
  const good = {
    subject: "phone-only service calls",
    body:
      "Elena — your site only takes service calls by phone. Sere keeps the " +
      "jobs and invoices in one book so the number on screen matches the bank. " +
      "Want to poke at a real shop with sample work in it?",
  };
  assert.deepEqual(validateDraft(good, prospect()), []);

  const cliche = validateDraft(
    { subject: "hello", body: "I hope this email finds you well. Phone only, right?" },
    prospect(),
  );
  assert.ok(cliche.some((p) => /bulk-email phrase/i.test(p)));

  const shouty = validateDraft({ ...good, subject: "Grow your HVAC business now!" }, prospect());
  assert.ok(shouty.some((p) => /exclamation/i.test(p)));

  const callAsk = validateDraft(
    { subject: "phone-only calls", body: "Your calls are phone only. Can we hop on a call?" },
    prospect(),
  );
  assert.ok(callAsk.some((p) => /asks for a call/i.test(p)));

  const generic = validateDraft(
    { subject: "software for you", body: "We build tools that help businesses do more." },
    prospect(),
  );
  assert.ok(generic.some((p) => /does not use the fact/i.test(p)));

  const wrongName = validateDraft(
    { subject: "phone-only calls", body: "Hi Marcus, your calls are phone only today." },
    prospect(),
  );
  assert.ok(wrongName.some((p) => /Marcus/.test(p)));

  const longBody = validateDraft(
    { subject: "phone-only calls", body: `phone ${"word ".repeat(MAX_WORDS + 5)}` },
    prospect(),
  );
  assert.ok(longBody.some((p) => new RegExp(`over ${MAX_WORDS}`).test(p)));

  const twoQuestions = validateDraft(
    { subject: "phone-only calls", body: "Phone only, right? Want a look?" },
    prospect(),
  );
  assert.ok(twoQuestions.some((p) => /questions in the body/i.test(p)));
});

test("the prompt hands over the fact and the winners, and nothing else to invent", () => {
  const system = buildSystemPrompt(product);
  assert.ok(system.includes(String(MAX_WORDS)));
  assert.match(system, /never invent/i);
  assert.match(system, /do not ask for a call/i);

  const winner = sent({ repliedAt: "2026-08-03T00:00:00.000Z", subject: "that worked" });
  const user = buildUserPrompt(prospect(), [winner]);
  assert.ok(user.includes("phone only, no request form"));
  assert.ok(user.includes("that worked"));
  assert.ok(user.includes("Elena"));

  const alone = buildUserPrompt(prospect(), []);
  assert.ok(!alone.includes("got replies"));
});

test("the footer carries the opt-out and postal address, not the model", () => {
  const body = finalBody({ subject: "x", body: "Phone only today." }, product);
  assert.ok(body.includes(product.unsubscribeHint));
  assert.ok(body.includes(product.postalAddress));
  assert.deepEqual(sendableProblems(body, product), []);

  const noAddress = { ...product, postalAddress: "" };
  const problems = sendableProblems(finalBody({ subject: "x", body: "y" }, noAddress), noAddress);
  assert.ok(problems.some((p) => /postal address/i.test(p)));
});

test("outcomes are scored so a signup outranks a reply and a complaint is fatal", () => {
  assert.equal(scoreEmail(sent()), 0);
  assert.ok(scoreEmail(sent({ signedUpAt: "x" })) > scoreEmail(sent({ repliedAt: "x" })));
  assert.ok(scoreEmail(sent({ repliedAt: "x" })) > scoreEmail(sent({ openedDemoAt: "x" })));
  assert.ok(scoreEmail(sent({ complainedAt: "x" })) < 0);
  assert.equal(scoreEmail(sent({ sentAt: null, repliedAt: "x" })), 0);

  assert.equal(isWinner(sent({ repliedAt: "x" })), true);
  assert.equal(isWinner(sent({ openedDemoAt: "x" })), false);
  assert.equal(
    isWinner(sent({ signedUpAt: "x", complainedAt: "x" })),
    false,
    "an email that drew a complaint is never an example",
  );
});

test("retrieval prefers the same trade, then the stronger outcome", () => {
  const history = [
    sent({ id: 1, trade: "salon", signedUpAt: "x", subject: "salon signup" }),
    sent({ id: 2, trade: "hvac", repliedAt: "x", subject: "hvac reply" }),
    sent({ id: 3, trade: "hvac", signedUpAt: "x", subject: "hvac signup" }),
    sent({ id: 4, trade: "hvac", subject: "hvac silence" }),
    sent({ id: 5, trade: "hvac", complainedAt: "x", repliedAt: "x", subject: "hvac complaint" }),
  ];
  const picked = pickWinners(history, { trade: "hvac", city: "Fort Myers" }, 3);
  assert.deepEqual(
    picked.map((email) => email.subject),
    ["hvac signup", "hvac reply", "salon signup"],
  );
  assert.ok(!picked.some((email) => email.subject === "hvac silence"));
  assert.ok(!picked.some((email) => email.subject === "hvac complaint"));
  assert.deepEqual(pickWinners([], { trade: "hvac", city: "" }), []);
});

test("variants get a fair sample before the winner takes over", () => {
  assert.equal(nextVariant([], ["a", "b"]), "a");

  const aOnly = Array.from({ length: 20 }, (_, i) => sent({ id: i, variant: "a" }));
  assert.equal(nextVariant(aOnly, ["a", "b"], 20), "b", "b has never been tried");

  const both = [
    ...Array.from({ length: 20 }, (_, i) => sent({ id: i, variant: "a" })),
    ...Array.from({ length: 20 }, (_, i) =>
      sent({ id: 100 + i, variant: "b", repliedAt: i < 4 ? "x" : null }),
    ),
  ];
  assert.equal(nextVariant(both, ["a", "b"], 20), "b", "b actually got replies");

  const stats = variantStats(both);
  assert.equal(stats[0].variant, "b");
  assert.equal(stats[0].sent, 20);
  assert.equal(stats[0].replied, 4);
  assert.ok(Math.abs(stats[0].replyRate - 0.2) < 1e-9);
});

test("a new domain ramps instead of blasting", () => {
  assert.equal(warmupCap(1), 20);
  assert.equal(warmupCap(3), 20);
  assert.equal(warmupCap(4), 40);
  assert.equal(warmupCap(30), 200);
  assert.equal(warmupCap(60), STEADY_CAP);
  for (let day = 2; day <= 60; day += 1) {
    assert.ok(warmupCap(day) >= warmupCap(day - 1), `cap must never drop (day ${day})`);
  }
});

test("the day counter and the daily cap come from what actually got sent", () => {
  const now = new Date("2026-08-20T18:00:00.000Z");
  assert.equal(sendingDay([], now), 1, "a fresh domain is on day one");

  const history = [
    sent({ id: 1, sentAt: "2026-08-18T10:00:00.000Z" }),
    sent({ id: 2, sentAt: "2026-08-20T09:00:00.000Z" }),
    sent({ id: 3, sentAt: "2026-08-20T11:00:00.000Z" }),
  ];
  assert.equal(sendingDay(history, now), 3);

  const window = sendingWindow(history, now);
  assert.equal(window.day, 3);
  assert.equal(window.dailyCap, 20);
  assert.equal(window.sentToday, 2, "only today's sends count against today");
  assert.equal(window.remaining, 18);
});

test("complaints stop sending, and no threshold trips on a tiny sample", () => {
  const clean = Array.from({ length: 50 }, (_, i) =>
    sent({ id: i, sentAt: `2026-08-20T10:00:${String(i % 60).padStart(2, "0")}.000Z` }),
  );
  assert.equal(circuitBreaker(clean).tripped, false);
  assert.equal(circuitBreaker([]).tripped, false);

  const oneComplaint = [...clean];
  oneComplaint[0] = sent({ id: 0, sentAt: "2026-08-20T10:00:00.000Z", complainedAt: "x" });
  assert.equal(
    circuitBreaker(oneComplaint).tripped,
    false,
    "one complaint is bad luck, not yet a pattern",
  );

  const twoComplaints = [...oneComplaint];
  twoComplaints[1] = sent({ id: 1, sentAt: "2026-08-20T10:00:01.000Z", complainedAt: "x" });
  const tripped = circuitBreaker(twoComplaints);
  assert.equal(tripped.tripped, true);
  assert.ok(tripped.reasons.some((r) => /complaints/i.test(r)));
  assert.equal(LIMITS.absoluteComplaints, 2);

  const bouncy = Array.from({ length: 40 }, (_, i) =>
    sent({ id: i, sentAt: "2026-08-20T10:00:00.000Z", bouncedAt: i < 4 ? "x" : null }),
  );
  const bounceTrip = circuitBreaker(bouncy);
  assert.equal(bounceTrip.tripped, true);
  assert.ok(bounceTrip.reasons.some((r) => /bounce rate/i.test(r)));
});

test("an autonomous run sends nothing when it is unsafe or capped out", () => {
  const now = new Date("2026-08-20T18:00:00.000Z");

  const fresh = planRun([], { now });
  assert.equal(fresh.send, 20, "day one cap");
  assert.equal(fresh.breaker.tripped, false);

  const batched = planRun([], { batch: 5, now });
  assert.equal(batched.send, 5, "an explicit batch stays under the cap");

  const capped = Array.from({ length: 20 }, (_, i) =>
    sent({ id: i, sentAt: "2026-08-20T09:00:00.000Z" }),
  );
  const noRoom = planRun(capped, { now });
  assert.equal(noRoom.send, 0);
  assert.ok(noRoom.notes.some((note) => /cap/i.test(note)));

  const unsafe = [
    sent({ id: 1, sentAt: "2026-08-20T09:00:00.000Z", complainedAt: "x" }),
    sent({ id: 2, sentAt: "2026-08-20T09:01:00.000Z", complainedAt: "x" }),
  ];
  const stopped = planRun(unsafe, { now });
  assert.equal(stopped.send, 0);
  assert.equal(stopped.breaker.tripped, true);
});

test("sends are paced apart, never fired in a burst", () => {
  assert.equal(pauseSeconds(1), 0);
  assert.ok(pauseSeconds(20) >= 20);
  assert.ok(pauseSeconds(200) >= 20, "a big batch still waits between sends");
  assert.ok(pauseSeconds(2) <= 120);
});

test("provider delivery events map onto the outcomes the breakers read", () => {
  assert.equal(mapLastEvent("bounced"), "bounced");
  assert.equal(mapLastEvent("complained"), "complained");
  assert.equal(mapLastEvent("Delivered"), "delivered");
  assert.equal(mapLastEvent("opened"), "delivered");
  assert.equal(mapLastEvent("clicked"), "delivered");
  assert.equal(mapLastEvent("sent"), "pending");
  assert.equal(mapLastEvent("delivery_delayed"), "pending");
  assert.equal(mapLastEvent(""), "unknown");
  assert.equal(mapLastEvent("something_new"), "unknown");
});

test("cold mail may not share a domain or a provider key with invoice mail", () => {
  assert.equal(rootDomain("hi@mail.sere.cash"), "sere.cash");
  assert.equal(rootDomain("hi@sere.cash"), "sere.cash");
  assert.equal(rootDomain("nope"), "");

  const transactional = { apiKey: "re_warm", fromEmail: "billing@sere.cash" };
  const clean = {
    apiKey: "re_cold",
    fromEmail: "isaac@getsere.com",
    fromName: "Isaac",
    replyTo: "",
  };
  assert.deepEqual(senderProblems(clean, transactional), []);

  const sameDomain = senderProblems(
    { ...clean, fromEmail: "isaac@mail.sere.cash" },
    transactional,
  );
  assert.ok(sameDomain.some((p) => /same domain/i.test(p)));

  const sameKey = senderProblems({ ...clean, apiKey: "re_warm" }, transactional);
  assert.ok(sameKey.some((p) => /same provider key/i.test(p)));

  assert.match(senderProblems(null, transactional)[0], /not configured/i);
});
