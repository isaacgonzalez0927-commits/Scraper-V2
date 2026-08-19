/**
 * Each shop picks a trade at signup. Copy, starter services, and empty states
 * follow that choice so a salon is not asked for a technician and an HVAC
 * job title.
 */

export const BUSINESS_TYPE_KEYS = [
  "hvac",
  "plumbing",
  "electrical",
  "landscaping",
  "cleaning",
  "roofing",
  "auto",
  "salon",
  "general",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPE_KEYS)[number];

export type TradeProfile = {
  key: BusinessType;
  name: string;
  short: string;
  worker: string;
  workers: string;
  jobPlaceholder: string;
  overviewSub: string;
  jobsSub: string;
  emptyJobs: string;
  defaultNotes: string;
  services: readonly (readonly [string, string, number])[];
};

const HVAC_SERVICES = [
  ["Diagnostic visit", "Inspection", 12900],
  ["AC tune-up", "Seasonal clean", 18900],
  ["Capacitor replacement", "Parts and labor", 28500],
] as const;

export const TRADES: Record<BusinessType, TradeProfile> = {
  hvac: {
    key: "hvac",
    name: "HVAC",
    short: "heating and cooling",
    worker: "Technician",
    workers: "technicians",
    jobPlaceholder: "AC replacement",
    overviewSub: "What came in, what is still out, and what is on the board.",
    jobsSub: "Installs, service calls, and follow-ups.",
    emptyJobs: "Schedule the next call, or log a walk-in as in progress.",
    defaultNotes: "Thank you for your business. Payment is due within the terms on this invoice.",
    services: HVAC_SERVICES,
  },
  plumbing: {
    key: "plumbing",
    name: "Plumbing",
    short: "plumbing",
    worker: "Plumber",
    workers: "plumbers",
    jobPlaceholder: "Water heater replacement",
    overviewSub: "Calls on the board, invoices out, and cash that landed.",
    jobsSub: "Repairs, installs, and emergency calls.",
    emptyJobs: "Book the next leak, install, or inspection.",
    defaultNotes: "Thank you for calling us. Payment is due within the terms on this invoice.",
    services: [
      ["Service call", "Diagnostic", 14900],
      ["Drain clearing", "Main line", 22500],
      ["Water heater install", "Parts and labor", 185000],
    ],
  },
  electrical: {
    key: "electrical",
    name: "Electrical",
    short: "electrical",
    worker: "Electrician",
    workers: "electricians",
    jobPlaceholder: "Panel upgrade",
    overviewSub: "Jobs booked, billed, and waiting on payment.",
    jobsSub: "Service calls, rewires, and inspections.",
    emptyJobs: "Schedule a panel, outlet, or lighting job.",
    defaultNotes: "Thank you for your business. Payment is due within the terms on this invoice.",
    services: [
      ["Service call", "Diagnostic", 15900],
      ["Outlet install", "Labor", 18500],
      ["Panel upgrade", "Parts and labor", 240000],
    ],
  },
  landscaping: {
    key: "landscaping",
    name: "Landscaping",
    short: "lawn and landscape",
    worker: "Crew lead",
    workers: "crew",
    jobPlaceholder: "Weekly lawn service",
    overviewSub: "Routes, invoices, and what is still owed.",
    jobsSub: "Mows, installs, and one-off cleanups.",
    emptyJobs: "Add the next property or seasonal install.",
    defaultNotes: "Thank you for trusting us with your property. Payment is due as noted.",
    services: [
      ["Lawn visit", "Mow and edge", 7500],
      ["Cleanup", "Seasonal", 25000],
      ["Mulch install", "Materials and labor", 48000],
    ],
  },
  cleaning: {
    key: "cleaning",
    name: "Cleaning",
    short: "cleaning",
    worker: "Cleaner",
    workers: "team",
    jobPlaceholder: "Deep clean, 3 bed",
    overviewSub: "Today's stops, invoices sent, and cash collected.",
    jobsSub: "Recurring cleans and one-time deep cleans.",
    emptyJobs: "Add a recurring stop or a move-out clean.",
    defaultNotes: "Thank you. Payment is due within the terms on this invoice.",
    services: [
      ["Standard clean", "Recurring", 16000],
      ["Deep clean", "One time", 28000],
      ["Move-out clean", "Whole home", 35000],
    ],
  },
  roofing: {
    key: "roofing",
    name: "Roofing",
    short: "roofing",
    worker: "Foreman",
    workers: "crew",
    jobPlaceholder: "Shingle replacement",
    overviewSub: "Jobs in progress, billed work, and outstanding balances.",
    jobsSub: "Repairs, replacements, and inspections.",
    emptyJobs: "Log an inspection or a replacement.",
    defaultNotes: "Thank you for the work. Payment is due within the terms on this invoice.",
    services: [
      ["Roof inspection", "Report", 25000],
      ["Leak repair", "Labor", 65000],
      ["Full replacement", "Materials and labor", 1250000],
    ],
  },
  auto: {
    key: "auto",
    name: "Auto repair",
    short: "auto repair",
    worker: "Mechanic",
    workers: "technicians",
    jobPlaceholder: "Brake job",
    overviewSub: "Work orders, invoices, and what is still on the lot.",
    jobsSub: "Work orders in the bay and waiting on parts.",
    emptyJobs: "Open a work order for the next vehicle.",
    defaultNotes: "Thank you for your business. Payment is due upon completion unless noted.",
    services: [
      ["Diagnostic", "Scan and inspect", 14900],
      ["Oil change", "Full synthetic", 8900],
      ["Brake pads", "Axle, parts and labor", 42000],
    ],
  },
  salon: {
    key: "salon",
    name: "Salon & spa",
    short: "salon",
    worker: "Stylist",
    workers: "stylists",
    jobPlaceholder: "Color and cut",
    overviewSub: "Appointments, invoices, and what is still owed.",
    jobsSub: "Appointments on the book.",
    emptyJobs: "Add the next appointment.",
    defaultNotes: "Thank you. Gratuity is not included. Payment is due at the visit.",
    services: [
      ["Cut", "Signature cut", 8500],
      ["Color", "Single process", 14000],
      ["Blowout", "Style", 6500],
    ],
  },
  general: {
    key: "general",
    name: "General contractor",
    short: "contracting",
    worker: "Lead",
    workers: "crew",
    jobPlaceholder: "Kitchen remodel",
    overviewSub: "Jobs, billed work, and cash that actually landed.",
    jobsSub: "Projects and punch lists.",
    emptyJobs: "Start a project or a small repair.",
    defaultNotes: "Thank you for the project. Payment is due within the terms on this invoice.",
    services: [
      ["Site visit", "Estimate", 0],
      ["Handyman hour", "Labor", 9500],
      ["Project deposit", "To start work", 100000],
    ],
  },
  other: {
    key: "other",
    name: "Local service",
    short: "your trade",
    worker: "Lead",
    workers: "team",
    jobPlaceholder: "Service visit",
    overviewSub: "What you billed, collected, and still have on the board.",
    jobsSub: "Scheduled work and jobs in progress.",
    emptyJobs: "Add the next job for a customer.",
    defaultNotes: "Thank you for your business. Payment is due within the terms on this invoice.",
    services: [
      ["Service visit", "On site", 12500],
      ["Labor hour", "Standard rate", 9500],
      ["Materials", "Pass through", 0],
    ],
  },
};

export const TRADE_LIST: TradeProfile[] = BUSINESS_TYPE_KEYS.map((key) => TRADES[key]);

export function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPE_KEYS as readonly string[]).includes(value);
}

export function parseBusinessType(value: string | null | undefined): BusinessType {
  const key = (value || "").trim().toLowerCase();
  return isBusinessType(key) ? key : "general";
}

export function tradeCopy(value: string | null | undefined): TradeProfile {
  return TRADES[parseBusinessType(value)];
}
