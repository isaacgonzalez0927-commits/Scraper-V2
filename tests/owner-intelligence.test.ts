import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOwnerIntelligence,
  type IntelligenceInput,
} from "../lib/owner-intelligence";
import { invoiceReminderEmail } from "../lib/email";

type Payment = IntelligenceInput["paymentRows"][number];
type Invoice = IntelligenceInput["invoiceRows"][number];
type Customer = IntelligenceInput["customerRows"][number];
type Job = IntelligenceInput["jobRows"][number];
type Cost = IntelligenceInput["costRows"][number];
type Event = IntelligenceInput["eventRows"][number];

const customer = (patch: Partial<Customer> = {}): Customer => ({
  id: 1,
  organizationId: 1,
  name: "Maria Alvarez",
  companyName: "",
  email: "maria@example.com",
  phone: "239-555-0194",
  billingLine1: "",
  billingCity: "",
  billingState: "",
  billingPostal: "",
  serviceLine1: "",
  serviceCity: "",
  serviceState: "",
  servicePostal: "",
  notes: "",
  details: "{}",
  customerSince: "2025-01-01",
  archivedAt: null,
  createdAt: "2025-01-01T12:00:00Z",
  ...patch,
});

const job = (patch: Partial<Job> = {}): Job => ({
  id: 10,
  organizationId: 1,
  customerId: 1,
  title: "AC replacement",
  description: "",
  serviceLine1: "",
  serviceCity: "",
  serviceState: "",
  servicePostal: "",
  scheduledStart: null,
  status: "completed",
  technicianName: "Marcus",
  estimatedRevenueCents: 950000,
  actualRevenueCents: 1000000,
  estimatedCostCents: 450000,
  notes: "",
  details: "{}",
  completedAt: "2026-08-19T15:00:00Z",
  createdAt: "2026-08-01T12:00:00Z",
  ...patch,
});

const invoice = (patch: Partial<Invoice> = {}): Invoice => ({
  id: 20,
  organizationId: 1,
  customerId: 1,
  jobId: 10,
  number: "INV-1050",
  status: "paid",
  issueDate: "2026-08-01",
  dueDate: "2026-08-15",
  notes: "",
  discountCents: 0,
  taxBps: 0,
  taxCents: 0,
  subtotalCents: 1000000,
  totalCents: 1000000,
  publicToken: "token",
  sentAt: "2026-08-01T12:00:00Z",
  viewedAt: null,
  voidedAt: null,
  createdAt: "2026-08-01T12:00:00Z",
  ...patch,
});

const payment = (patch: Partial<Payment> = {}): Payment => ({
  id: 30,
  organizationId: 1,
  customerId: 1,
  invoiceId: 20,
  amountCents: 894600,
  paidOn: "2026-08-20",
  method: "card",
  reference: "cs_paid",
  notes: "Paid online through Stripe Checkout",
  voidedAt: null,
  createdAt: "2026-08-20T12:00:00Z",
  ...patch,
});

const cost = (patch: Partial<Cost> = {}): Cost => ({
  id: 40,
  organizationId: 1,
  jobId: 10,
  category: "equipment",
  description: "Condenser",
  amountCents: 500000,
  createdAt: "2026-08-19T12:00:00Z",
  ...patch,
});

const event = (patch: Partial<Event> = {}): Event => ({
  id: 50,
  organizationId: 1,
  invoiceId: 21,
  kind: "reminder",
  message: "Reminder emailed",
  amountCents: null,
  createdAt: "2026-08-20T12:00:00Z",
  ...patch,
});

test("traces payment to invoice, job, costs, and profit", () => {
  const result = buildOwnerIntelligence(
    {
      paymentRows: [payment()],
      invoiceRows: [invoice()],
      customerRows: [customer()],
      jobRows: [job()],
      costRows: [cost()],
      eventRows: [],
    },
    "2026-08-20",
  );
  assert.equal(result.collectedThisMonthCents, 894600);
  assert.equal(result.mappedToJobsCents, 894600);
  assert.equal(result.unmappedCents, 0);
  assert.equal(result.mappedJobCount, 1);
  assert.equal(result.mappedJobProfitCents, 500000);
  assert.equal(result.trails[0].source, "Stripe");
  assert.equal(result.trails[0].invoiceNumber, "INV-1050");
  assert.equal(result.trails[0].jobTitle, "AC replacement");
  assert.equal(result.trails[0].jobProfitCents, 500000);
});

test("never invents a job for cash that is not linked through an invoice", () => {
  const result = buildOwnerIntelligence(
    {
      paymentRows: [payment({ invoiceId: null, notes: "", reference: "manual" })],
      invoiceRows: [invoice()],
      customerRows: [customer()],
      jobRows: [job()],
      costRows: [cost()],
      eventRows: [],
    },
    "2026-08-20",
  );
  assert.equal(result.mappedToJobsCents, 0);
  assert.equal(result.unmappedCents, 894600);
  assert.equal(result.trails[0].jobId, null);
});

test("builds a largest-balance follow-up queue and remembers today's reminder", () => {
  const overdue = invoice({
    id: 21,
    jobId: null,
    number: "INV-1047",
    status: "overdue",
    dueDate: "2026-08-10",
    totalCents: 400000,
    subtotalCents: 400000,
  });
  const result = buildOwnerIntelligence(
    {
      paymentRows: [payment({ id: 31, invoiceId: 21, amountCents: 50000 })],
      invoiceRows: [overdue],
      customerRows: [customer()],
      jobRows: [],
      costRows: [],
      eventRows: [event()],
    },
    "2026-08-20",
  );
  assert.equal(result.overdueCents, 350000);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.followUps[0].daysOverdue, 10);
  assert.equal(result.followUps[0].remindedToday, true);
});

test("cash trend compares this week with the same days last week", () => {
  const result = buildOwnerIntelligence(
    {
      paymentRows: [
        payment({ id: 1, paidOn: "2026-08-20", amountCents: 75000 }),
        payment({ id: 2, paidOn: "2026-08-13", amountCents: 100000 }),
      ],
      invoiceRows: [invoice()],
      customerRows: [customer()],
      jobRows: [job()],
      costRows: [cost()],
      eventRows: [],
    },
    "2026-08-20",
  );
  assert.equal(result.currentWeekCents, 75000);
  assert.equal(result.priorWeekCents, 100000);
  assert.equal(result.trendPercent, -25);
});

test("reminder email names the balance, age, and pay link without threats", () => {
  const message = invoiceReminderEmail({
    shopName: "Harbor Air",
    invoiceNumber: "INV-1047",
    amountDue: "$3,500.00",
    daysOverdue: 10,
    payUrl: "https://sere.cash/p/inv/token",
  });
  assert.match(message.subject, /INV-1047 is still open/);
  assert.match(message.text, /\$3,500.00/);
  assert.match(message.text, /10 days past due/);
  assert.match(message.text, /https:\/\/sere\.cash\/p\/inv\/token/);
  assert.doesNotMatch(message.text.toLowerCase(), /collection|penalty|final notice/);
});
