import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleBody,
  draftSystemPrompt,
  draftUserPrompt,
  MAX_WORDS,
  readyToDraft,
  sendableProblems,
  validateDraft,
  UNSUBSCRIBE_LINE,
  type Prospect,
} from "../lib/nexus/copy";
import {
  filterLead,
  hostOf,
  isDirectoryHost,
  maxReviewCount,
  tradeFromQuery,
} from "../lib/nexus/lead-filter";
import {
  circuitBreaker,
  isWinner,
  LIMITS,
  planSends,
  scoreOutcome,
  sendingWindow,
  STEADY_CAP,
  warmupCap,
  type SentOutcome,
} from "../lib/nexus/policy";
import { deriveFact, parseDisallowedPaths } from "../lib/nexus/hands/research";
import { rootDomain, senderProblems } from "../lib/nexus/hands/send";

function prospect(over: Partial<Prospect> = {}): Prospect {
  return {
    company: "Gulf Coast Air",
    contact: "Elena Vasquez",
    trade: "hvac",
    city: "Fort Myers",
    fact: "your site takes work by phone only — no request form on it",
    ...over,
  };
}

function sent(over: Partial<SentOutcome> = {}): SentOutcome {
  return { sentAt: "2026-08-20T14:00:00.000Z", ...over };
}

test("the ICP filter keeps small local shops and drops the rest", () => {
  assert.deepEqual(filterLead({ name: "Gulf Coast Air", reviewCount: 34 }), { ok: true });

  const franchise = filterLead({ name: "One Hour Heating & Air", reviewCount: 20 });
  assert.equal(franchise.ok, false);
  assert.match(franchise.reason!, /franchise|brand/i);

  const tooBig = filterLead({ name: "Big Regional HVAC", reviewCount: maxReviewCount() + 1 });
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.reason!, /too big/i);

  // Places omits the field sometimes; letting that through is how a national
  // operation slips onto the list.
  const unknown = filterLead({ name: "Mystery Shop" });
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason!, /size is unknown/i);

  const directory = filterLead({
    name: "Some Plumber",
    website: "https://www.yelp.com/biz/some-plumber",
    reviewCount: 12,
  });
  assert.equal(directory.ok, false);
  assert.match(directory.reason!, /directory/i);

  const wrongCity = filterLead(
    { name: "Austin Air", city: "Houston", reviewCount: 10 },
    "Austin",
  );
  assert.equal(wrongCity.ok, false);
  assert.match(wrongCity.reason!, /not Austin/);
});

test("hosts and directories are recognised", () => {
  assert.equal(hostOf("https://www.gulfcoastair.com/contact"), "gulfcoastair.com");
  assert.equal(hostOf("gulfcoastair.com"), "gulfcoastair.com");
  assert.equal(hostOf("not a url"), "");
  assert.equal(isDirectoryHost("https://facebook.com/pages/x"), true);
  assert.equal(isDirectoryHost("https://gulfcoastair.com"), false);
});

test("the trade is inferred from the search that found them", () => {
  assert.equal(tradeFromQuery("hvac contractor in Fort Myers"), "hvac");
  assert.equal(tradeFromQuery("plumber in Cape Coral"), "plumbing");
  assert.equal(tradeFromQuery("hair salon in Naples"), "salon");
  assert.equal(tradeFromQuery("something odd"), "general");
});

test("a shop with no researched fact is never draftable", () => {
  assert.deepEqual(readyToDraft(prospect()), []);
  const thin = readyToDraft(prospect({ fact: "hvac" }));
  assert.equal(thin.length, 1);
  assert.match(thin[0], /specific fact/i);
});

test("the draft prompt speaks the prospect's trade and forbids inventing", () => {
  const system = draftSystemPrompt(prospect({ trade: "plumbing" }));
  assert.ok(system.includes("calls"), "a plumber has calls, not jobs");
  assert.match(system, /never invent/i);
  assert.match(system, /do not ask for a call/i);
  assert.ok(system.includes(String(MAX_WORDS)));

  const user = draftUserPrompt(prospect(), [
    { subject: "that worked", body: "short and true", trade: "hvac", fact: "phone only" },
  ]);
  assert.ok(user.includes("phone only — no request form"));
  assert.ok(user.includes("that worked"));
  assert.ok(user.includes("Elena"));
  assert.ok(!draftUserPrompt(prospect(), []).includes("got replies"));
});

test("the validator rejects the slop a model reaches for", () => {
  const good = {
    subject: "phone-only service calls",
    body:
      "Elena — your site only takes work by phone, no form. Sere keeps the jobs " +
      "and invoices in one book so the number on screen matches the bank. Want a " +
      "look at a real shop with work already in it?",
  };
  assert.deepEqual(validateDraft(good, prospect()), []);

  const cliche = validateDraft(
    { subject: "hello", body: "I hope this email finds you well. Phone only, right?" },
    prospect(),
  );
  assert.ok(cliche.some((p) => /bulk-email phrase/i.test(p)));
  assert.ok(
    validateDraft({ ...good, subject: "Grow your shop now!" }, prospect()).some((p) =>
      /exclamation/i.test(p),
    ),
  );
  assert.ok(
    validateDraft(
      { subject: "phone only", body: "Your site is phone only. Can we hop on a call?" },
      prospect(),
    ).some((p) => /asks for a call/i.test(p)),
  );
  assert.ok(
    validateDraft(
      { subject: "software", body: "We help businesses do more with less." },
      prospect(),
    ).some((p) => /does not use the researched fact/i.test(p)),
  );
  assert.ok(
    validateDraft(
      { subject: "phone only", body: "Hi Marcus, your site is phone only today." },
      prospect(),
    ).some((p) => /Marcus/.test(p)),
  );
});

test("the footer is assembled in code, not asked of the model", () => {
  const body = assembleBody({ subject: "x", body: "Phone only today." });
  assert.ok(body.includes(UNSUBSCRIBE_LINE));
  assert.ok(body.includes("sere.cash/demo"));
  // No postal address configured in tests, so compliance must complain.
  assert.ok(sendableProblems(body).some((p) => /postal address/i.test(p)));
});

test("a new sending domain ramps and never jumps", () => {
  assert.equal(warmupCap(1), 20);
  assert.equal(warmupCap(4), 40);
  assert.equal(warmupCap(60), STEADY_CAP);
  for (let day = 2; day <= 60; day += 1) {
    assert.ok(warmupCap(day) >= warmupCap(day - 1), `cap must not drop on day ${day}`);
  }

  const now = new Date("2026-08-20T18:00:00.000Z");
  const window = sendingWindow(
    [
      sent({ sentAt: "2026-08-18T10:00:00.000Z" }),
      sent({ sentAt: "2026-08-20T09:00:00.000Z" }),
    ],
    now,
  );
  assert.equal(window.day, 3);
  assert.equal(window.sentToday, 1, "only today counts against today");
  assert.equal(window.remaining, 19);
});

test("complaints and bounces stop the pipeline, and small samples do not", () => {
  const clean = Array.from({ length: 50 }, () => sent());
  assert.equal(circuitBreaker(clean).tripped, false);
  assert.equal(circuitBreaker([]).tripped, false);

  const one = [...clean];
  one[0] = sent({ complainedAt: "x" });
  assert.equal(circuitBreaker(one).tripped, false, "one complaint is not yet a pattern");

  const two = [...one];
  two[1] = sent({ complainedAt: "x" });
  const tripped = circuitBreaker(two);
  assert.equal(tripped.tripped, true);
  assert.equal(LIMITS.absoluteComplaints, 2);

  const bouncy = Array.from({ length: 40 }, (_, i) =>
    sent({ bouncedAt: i < 4 ? "x" : null }),
  );
  assert.ok(circuitBreaker(bouncy).reasons.some((r) => /bounce rate/i.test(r)));
});

test("nothing sends while the kill switch is off", () => {
  const previous = process.env.NEXUS_SEND_ENABLED;
  delete process.env.NEXUS_SEND_ENABLED;
  const off = planSends([], { now: new Date("2026-08-20T18:00:00.000Z"), ignoreWindow: true });
  assert.equal(off.send, 0);
  assert.ok(off.blocked.some((b) => /NEXUS_SEND_ENABLED/.test(b)));

  process.env.NEXUS_SEND_ENABLED = "true";
  const on = planSends([], { now: new Date("2026-08-20T18:00:00.000Z"), ignoreWindow: true });
  assert.equal(on.send, 20, "day one cap");

  const unsafe = planSends([sent({ complainedAt: "x" }), sent({ complainedAt: "x" })], {
    now: new Date("2026-08-20T18:00:00.000Z"),
    ignoreWindow: true,
  });
  assert.equal(unsafe.send, 0);
  assert.equal(unsafe.breaker.tripped, true);

  if (previous === undefined) delete process.env.NEXUS_SEND_ENABLED;
  else process.env.NEXUS_SEND_ENABLED = previous;
});

test("outcomes are weighted so a signup beats a reply and a complaint is fatal", () => {
  assert.equal(scoreOutcome(sent()), 0);
  assert.ok(scoreOutcome(sent({ signedUpAt: "x" })) > scoreOutcome(sent({ repliedAt: "x" })));
  assert.ok(scoreOutcome(sent({ repliedAt: "x" })) > scoreOutcome(sent({ openedDemoAt: "x" })));
  assert.equal(scoreOutcome({ sentAt: null, repliedAt: "x" }), 0);
  assert.equal(isWinner(sent({ repliedAt: "x" })), true);
  assert.equal(isWinner(sent({ openedDemoAt: "x" })), false);
  assert.equal(
    isWinner(sent({ signedUpAt: "x", complainedAt: "x" })),
    false,
    "an email that drew a complaint is never an example",
  );
});

test("cold mail may not share a domain or provider key with invoice mail", () => {
  assert.equal(rootDomain("hi@mail.sere.cash"), "sere.cash");
  assert.equal(rootDomain("nope"), "");

  const transactional = { apiKey: "re_warm", fromEmail: "billing@sere.cash" };
  const clean = { apiKey: "re_cold", fromEmail: "isaac@getsere.com", fromName: "", replyTo: "" };
  assert.deepEqual(senderProblems(clean, transactional), []);
  assert.ok(
    senderProblems({ ...clean, fromEmail: "isaac@mail.sere.cash" }, transactional).some((p) =>
      /same domain/i.test(p),
    ),
  );
  assert.ok(
    senderProblems({ ...clean, apiKey: "re_warm" }, transactional).some((p) =>
      /same provider key/i.test(p),
    ),
  );
  assert.match(senderProblems(null, transactional)[0], /not configured/i);
});

test("research reads robots.txt and finds a checkable fact", () => {
  const robots = parseDisallowedPaths(
    ["User-agent: *", "Disallow: /admin", "Disallow: /cart", "", "User-agent: Bingbot", "Disallow: /"].join("\n"),
  );
  assert.deepEqual(robots, ["/admin", "/cart"]);
  assert.deepEqual(parseDisallowedPaths("# nothing here"), []);

  assert.match(
    deriveFact([{ path: "/", html: "<p>Give us a call today for service!</p>" }]),
    /phone only/i,
  );
  assert.match(
    deriveFact([{ path: "/contact", html: "<form><input name='msg'></form>" }]),
    /contact form but no way to actually book/i,
  );
  assert.match(
    deriveFact([{ path: "/", html: "<p>Book online now</p>" }]),
    /nowhere for them to see or pay/i,
  );
  assert.equal(deriveFact([{ path: "/", html: "<p>We fix things.</p>" }]), "");
});
