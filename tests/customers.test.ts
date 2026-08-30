import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "../lib/csv";
import {
  mapImportedCustomer,
  matchImportedCustomer,
  parseCustomerCsv,
} from "../lib/customer-import";
import { buildCustomerTimeline, lastJobSummary } from "../lib/customer-timeline";

test("Jobber-style CSVs map a name, phone, and service street", () => {
  const mapped = mapImportedCustomer({
    "first name": "Ada",
    "last name": "Cole",
    email: "ada@example.com",
    mobile: "(239) 555-0199",
    "service address": "12 Oak St",
    city: "Fort Myers",
    state: "FL",
    zip: "33901",
    notes: "Gate 4412",
  });
  assert.equal(mapped?.name, "Ada Cole");
  assert.equal(mapped?.phone, "(239) 555-0199");
  assert.equal(mapped?.serviceLine1, "12 Oak St");
  assert.equal(mapped?.billingLine1, "12 Oak St");
  assert.equal(mapped?.notes, "Gate 4412");
});

test("quoted CSV cells and a name column round-trip into customers", () => {
  const parsed = parseCsv('Name,Email,Phone\n"Riverside, LLC",shop@example.com,2395550100\n');
  assert.equal(parsed.rows[0].name, "Riverside, LLC");
  const rows = parseCustomerCsv(
    "Customer,Street,City\nHarbor Air,16 Oak Street,Fort Myers\n,No Name,X\n",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Harbor Air");
  assert.equal(rows[0].serviceLine1, "16 Oak Street");
});

test("import matching uses email, then phone, then name plus street", () => {
  const existing = [
    { email: "ada@example.com", phone: "2395550100", name: "Ada Cole", street: "12 Oak" },
    { email: "", phone: "2395550199", name: "Ben", street: "9 Pine" },
    { email: "", phone: "", name: "Cam", street: "1 Elm" },
  ];
  assert.equal(matchImportedCustomer({ email: "ADA@example.com" }, existing), 0);
  assert.equal(matchImportedCustomer({ phone: "(239) 555-0199" }, existing), 1);
  assert.equal(matchImportedCustomer({ name: "Cam", street: "1 Elm" }, existing), 2);
  assert.equal(matchImportedCustomer({ name: "Cam", street: "Other" }, existing), -1);
  assert.equal(matchImportedCustomer({ phone: "555" }, existing), -1);
});

test("the house file timeline is newest first and keeps last job", () => {
  const items = buildCustomerTimeline({
    jobs: [
      {
        id: 1,
        title: "Old coil",
        status: "completed",
        scheduledStart: "2026-01-01T09:00:00",
        completedAt: "2026-01-01T11:00:00",
        createdAt: "2026-01-01T08:00:00",
        actualRevenueCents: 10000,
        estimatedRevenueCents: 10000,
      },
    ],
    estimates: [
      {
        id: 2,
        number: "EST-1",
        status: "sent",
        totalCents: 20000,
        createdAt: "2026-08-20T10:00:00",
        sentAt: "2026-08-20T12:00:00",
        approvedAt: null,
      },
    ],
    invoices: [],
    payments: [],
    notes: [{ id: 3, body: "Dog in backyard", createdAt: "2026-08-21T09:00:00" }],
  });
  assert.equal(items[0].kind, "note");
  assert.equal(items[1].kind, "estimate");
  assert.equal(items[2].kind, "job");
  const last = lastJobSummary([
    {
      title: "Filter",
      scheduledStart: "2026-08-01T09:00:00",
      completedAt: null,
      createdAt: "2026-07-01T09:00:00",
      status: "scheduled",
    },
    {
      title: "Coil",
      scheduledStart: "2026-07-01T09:00:00",
      completedAt: "2026-07-02T11:00:00",
      createdAt: "2026-06-01T09:00:00",
      status: "completed",
    },
  ]);
  assert.equal(last?.title, "Filter");
});
