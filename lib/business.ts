/**
 * Each shop picks a trade at signup. Copy, starter services, empty states,
 * and site/equipment fields follow that choice so a salon is not asked for
 * a technician and an HVAC condenser serial.
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

export type TradeFieldOn = "customer" | "job" | "both";

export type TradeField = {
  key: string;
  label: string;
  on: TradeFieldOn;
  placeholder?: string;
  help?: string;
};

export type Details = Record<string, string>;

export type TradeProfile = {
  key: BusinessType;
  name: string;
  short: string;
  signupHint: string;
  worker: string;
  workers: string;
  job: string;
  jobs: string;
  newJob: string;
  customer: string;
  customers: string;
  newCustomer: string;
  jobTitleLabel: string;
  jobPlaceholder: string;
  workLabel: string;
  siteLabel: string;
  siteNote: string;
  sinceLabel: string;
  companyLabel: string;
  notesPlaceholder: string;
  jobNotesPlaceholder: string;
  costNote: string;
  costPlaceholder: string;
  overviewSub: string;
  jobsSub: string;
  customersSub: string;
  invoicesSub: string;
  paymentsSub: string;
  emptyJobs: string;
  emptyCustomers: string;
  emptyOverview: string;
  newJobSub: string;
  newCustomerSub: string;
  customerFieldsTitle: string;
  customerFieldsNote: string;
  jobFieldsTitle: string;
  jobFieldsNote: string;
  searchHint: string;
  defaultNotes: string;
  suggestions: readonly string[];
  costCategories: readonly string[];
  services: readonly (readonly [string, string, number])[];
  fields: readonly TradeField[];
};

function field(
  key: string,
  label: string,
  on: TradeFieldOn,
  placeholder = "",
  help = "",
): TradeField {
  return { key, label, on, placeholder, help };
}

const CORE_COSTS = [
  "materials",
  "equipment",
  "labor",
  "subcontractors",
  "miscellaneous",
] as const;

export const TRADES: Record<BusinessType, TradeProfile> = {
  hvac: {
    key: "hvac",
    name: "HVAC",
    short: "heating and cooling",
    signupHint: "Calls, equipment on the house, seasonal tune-ups.",
    worker: "Technician",
    workers: "technicians",
    job: "Job",
    jobs: "Jobs",
    newJob: "New job",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Job title",
    jobPlaceholder: "No-cool, 3-ton changeout",
    workLabel: "What is wrong / what to do",
    siteLabel: "Service address",
    siteNote: "The house or rooftop, not the billing office.",
    sinceLabel: "Customer since",
    companyLabel: "Company",
    notesPlaceholder: "Gate code, dogs, HOA, who has the filter stash",
    jobNotesPlaceholder: "Superheat, static, what you left running",
    costNote: "Log the condenser, drier, and hours so profit is real.",
    costPlaceholder: "3-ton condenser, line set, nitrogen",
    overviewSub: "What came in, what is still out, and what is on the board.",
    jobsSub: "Installs, no-cools, and follow-ups.",
    customersSub: "Houses you take care of, what they have paid, what they owe.",
    invoicesSub: "Tune-ups and changeouts. Paid only when the balance hits zero.",
    paymentsSub: "Card, check, and membership cash that actually landed.",
    emptyJobs: "Schedule the next no-cool, or log a walk-in as in progress.",
    emptyCustomers: "Add the house. Equipment, filter size, and warranty can wait.",
    emptyOverview: "Add a house, book a call, or send a tune-up invoice.",
    newJobSub: "Pick the house, then say if it is a no-cool, a tune-up, or a changeout.",
    newCustomerSub: "A name is enough. Filter size and serials can wait.",
    customerFieldsTitle: "Equipment on this house",
    customerFieldsNote: "The next tech should not have to crawl to find this.",
    jobFieldsTitle: "This visit",
    jobFieldsNote: "What you pulled, charged, and left behind.",
    searchHint: "Search customers, jobs, invoices",
    defaultNotes:
      "Thank you for trusting us with your system. " +
      "Payment is due within the terms on this invoice.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled jobs"],
    costCategories: CORE_COSTS,
    services: [
      ["Diagnostic visit", "Same-day inspection", 12900],
      ["AC tune-up", "Seasonal clean and check", 18900],
      ["Capacitor replacement", "Parts and labor", 28500],
      ["3-ton AC replacement", "Equipment, line set, startup", 780000],
      ["Smart thermostat install", "Install and program", 34900],
      ["Evaporator coil clean", "Indoor coil, condensate", 27500],
      ["After-hours call", "Evenings and weekends", 18900],
      ["Filter subscription visit", "Leave six filters", 4900],
    ],
    fields: [
      field("outdoor_brand", "Outdoor unit brand / model", "customer", "Carrier 24ACC6"),
      field("outdoor_serial", "Outdoor serial", "customer", "On the data plate"),
      field("indoor_brand", "Air handler / furnace", "customer", "Carrier FV4C"),
      field("filter_size", "Filter size", "customer", "16x25x1"),
      field("thermostat", "Thermostat", "customer", "Nest, Honeywell"),
      field("warranty_until", "Parts warranty until", "customer", "2028-06"),
      field("membership", "Membership", "customer", "Comfort Club, none"),
      field("refrigerant", "Refrigerant", "both", "R-410A, R-22"),
      field("filter_changed", "Filter changed", "job", "Yes, 16x25x1 left"),
      field("charge_lbs", "Charge added", "job", "1.2 lb"),
    ],
  },
  plumbing: {
    key: "plumbing",
    name: "Plumbing",
    short: "plumbing",
    signupHint: "Leaks, water heaters, cameras, and emergency calls.",
    worker: "Plumber",
    workers: "plumbers",
    job: "Call",
    jobs: "Calls",
    newJob: "New call",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Call",
    jobPlaceholder: "Water heater replacement",
    workLabel: "What is leaking / what to replace",
    siteLabel: "Service address",
    siteNote: "Where the water is. Shutoff notes live on the customer.",
    sinceLabel: "Customer since",
    companyLabel: "Company",
    notesPlaceholder: "Main shutoff, water heater age, HOA, crawl vs slab",
    jobNotesPlaceholder: "Camera findings, parts left, drywall cut",
    costNote: "Heater, fittings, and hours. Warranty claims need the serial.",
    costPlaceholder: "50-gal gas heater, expansion tank",
    overviewSub: "Calls on the board, invoices out, and cash that landed.",
    jobsSub: "Leaks, installs, cameras, and after-hours.",
    customersSub: "Houses and buildings, what they paid, what they still owe.",
    invoicesSub: "Service calls and installs. Paid when the balance hits zero.",
    paymentsSub: "Card, check, and cash that actually arrived.",
    emptyJobs: "Book the next leak, heater, or camera.",
    emptyCustomers: "Add the house. Shutoff and heater details can wait.",
    emptyOverview: "Add a house, book a call, or invoice a heater.",
    newJobSub: "Pick the customer, then say leak, drain, or install.",
    newCustomerSub: "A name is enough. Shutoff and heater year can wait.",
    customerFieldsTitle: "This house",
    customerFieldsNote: "Shutoff and heater so the next call is faster.",
    jobFieldsTitle: "This call",
    jobFieldsNote: "What you found in the line and what you left.",
    searchHint: "Search customers, calls, invoices",
    defaultNotes:
      "Thank you for calling us. Payment is due within the terms on this invoice.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled calls"],
    costCategories: CORE_COSTS,
    services: [
      ["Service call", "Diagnostic, first hour", 14900],
      ["Drain clearing", "Main line, cable or jet", 22500],
      ["Water heater install", "40–50 gal, parts and labor", 185000],
      ["Camera inspection", "Line video and locate", 27500],
      ["Faucet install", "Fixture supplied or ours", 18500],
      ["Toilet install", "Remove and set", 24500],
      ["After-hours leak", "Evenings and weekends", 24900],
      ["Backflow test", "Annual certification", 12500],
    ],
    fields: [
      field("shutoff", "Main shutoff", "customer", "Front hose bib, meter pit"),
      field("water_heater", "Water heater", "customer", "Rheem 50 gal, 2018"),
      field("heater_serial", "Heater serial", "customer"),
      field("pipe", "Pipe", "customer", "Copper, PEX, galvanized"),
      field("backflow", "Backflow device", "customer", "None, at meter"),
      field("sewer", "Sewer / septic", "customer", "City, septic tank rear"),
      field("camera_findings", "Camera findings", "job", "Roots at 42 ft"),
      field("parts_left", "Parts left on site", "job", "None, wax ring"),
    ],
  },
  electrical: {
    key: "electrical",
    name: "Electrical",
    short: "electrical",
    signupHint: "Panels, outlets, lighting, and permits.",
    worker: "Electrician",
    workers: "electricians",
    job: "Job",
    jobs: "Jobs",
    newJob: "New job",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Job title",
    jobPlaceholder: "200A panel upgrade",
    workLabel: "What to pull, add, or inspect",
    siteLabel: "Service address",
    siteNote: "Panel location and meter number live on the customer.",
    sinceLabel: "Customer since",
    companyLabel: "Company",
    notesPlaceholder: "Panel in garage, HOA, buried vs overhead",
    jobNotesPlaceholder: "Circuit IDs, torque, inspection number",
    costNote: "Panel, breakers, and permit fees so the quote holds.",
    costPlaceholder: "200A panel, 20 breakers, permit",
    overviewSub: "Jobs booked, billed, and waiting on payment.",
    jobsSub: "Service calls, rewires, and inspections.",
    customersSub: "Houses and panels you know, paid and still owed.",
    invoicesSub: "Calls and upgrades. Paid when the balance hits zero.",
    paymentsSub: "Card, check, and cash that actually arrived.",
    emptyJobs: "Schedule a panel, outlet, or lighting job.",
    emptyCustomers: "Add the house. Panel size and year can wait.",
    emptyOverview: "Add a house, book a panel, or send an invoice.",
    newJobSub: "Pick the customer, then say panel, lighting, or troubleshooting.",
    newCustomerSub: "A name is enough. Panel amps and year can wait.",
    customerFieldsTitle: "This service",
    customerFieldsNote: "Panel and meter so you are not guessing in the dark.",
    jobFieldsTitle: "This job",
    jobFieldsNote: "Permit and what you landed in the panel.",
    searchHint: "Search customers, jobs, invoices",
    defaultNotes:
      "Thank you for your business. Payment is due within the terms on this invoice.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled jobs"],
    costCategories: CORE_COSTS,
    services: [
      ["Service call", "Troubleshoot, first hour", 15900],
      ["Outlet / switch", "Device and labor", 18500],
      ["Ceiling fan / light", "Swap, box check", 24500],
      ["EV charger install", "Level 2, circuit and permit", 185000],
      ["Panel upgrade", "200A, parts and labor", 240000],
      ["Whole-home surge", "At the panel", 65000],
      ["Generator interlock", "Transfer and labeling", 125000],
      ["Permit / inspection", "Pass-through", 25000],
    ],
    fields: [
      field("panel_amps", "Panel", "customer", "150A, 200A, Federal Pacific"),
      field("panel_year", "Panel year", "customer", "1998, unknown"),
      field("meter", "Meter number", "customer"),
      field("service", "Service", "customer", "Overhead, underground"),
      field("generator", "Generator / solar", "customer", "None, 22kW standby"),
      field("permit", "Permit #", "job", "EL-2026-4412"),
      field("inspection", "Inspection", "job", "Rough passed 8/12"),
      field("circuits_added", "Circuits added", "job", "EV, kitchen 20A"),
    ],
  },
  landscaping: {
    key: "landscaping",
    name: "Landscaping",
    short: "lawn and landscape",
    signupHint: "Routes, mow days, installs, and seasonal cleanups.",
    worker: "Crew lead",
    workers: "crew",
    job: "Visit",
    jobs: "Visits",
    newJob: "New visit",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Visit",
    jobPlaceholder: "Weekly mow, Palmetto Ct",
    workLabel: "What the crew should do",
    siteLabel: "Property",
    siteNote: "Gate, dogs, and mow day live on the customer.",
    sinceLabel: "Customer since",
    companyLabel: "Company / HOA",
    notesPlaceholder: "Lockbox, irrigation box, who texts about dogs",
    jobNotesPlaceholder: "Clippings, extra bags, irrigation heads broken",
    costNote: "Mulch, plants, and crew hours on installs.",
    costPlaceholder: "8 yards mulch, 20 3-gal shrubs",
    overviewSub: "Routes, invoices, and what is still owed.",
    jobsSub: "Mows, installs, and one-off cleanups.",
    customersSub: "Properties on the route, paid and still owed.",
    invoicesSub: "Weekly visits and installs. Paid when the balance hits zero.",
    paymentsSub: "Card, ACH, and cash that actually landed.",
    emptyJobs: "Add the next property or a seasonal install.",
    emptyCustomers: "Add the property. Lot size and gate code can wait.",
    emptyOverview: "Add a property, put a mow on the route, or invoice a month.",
    newJobSub: "Pick the property, then mow, cleanup, or install.",
    newCustomerSub: "A name is enough. Gate code and mow day can wait.",
    customerFieldsTitle: "This property",
    customerFieldsNote: "So the crew is not guessing at the gate.",
    jobFieldsTitle: "This visit",
    jobFieldsNote: "Extras the weekly rate does not cover.",
    searchHint: "Search properties, visits, invoices",
    defaultNotes:
      "Thank you for trusting us with your property. Payment is due as noted.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled visits"],
    costCategories: CORE_COSTS,
    services: [
      ["Lawn visit", "Mow, edge, blow", 7500],
      ["Bi-weekly mow", "Same, every other week", 8500],
      ["Seasonal cleanup", "Leaf, bed, haul", 25000],
      ["Mulch install", "Materials and labor", 48000],
      ["Shrub trim", "Hedge and shape", 16500],
      ["Irrigation check", "Start-up or wet check", 12500],
      ["Sod install", "Materials and labor", 85000],
      ["Holiday lights", "Hang and take down", 35000],
    ],
    fields: [
      field("lot_size", "Lot / turf", "customer", "1/4 acre, 8k sq ft"),
      field("mow_day", "Mow day", "customer", "Tuesday route"),
      field("gate_code", "Gate / lockbox", "customer", "4412, lockbox on hose"),
      field("dogs", "Dogs / pets", "customer", "Two labs, crate them"),
      field("irrigation", "Irrigation", "customer", "Hunter, 6 zones"),
      field("hoa", "HOA rules", "customer", "Clippings off driveway"),
      field("extra_work", "Extra this visit", "job", "Haul 4 bags, treat fire ants"),
      field("plants_in", "Material installed", "job", "3 palmettos, 4 yards"),
    ],
  },
  cleaning: {
    key: "cleaning",
    name: "Cleaning",
    short: "cleaning",
    signupHint: "Recurring stops, move-outs, and supply notes.",
    worker: "Cleaner",
    workers: "team",
    job: "Stop",
    jobs: "Stops",
    newJob: "New stop",
    customer: "Client",
    customers: "Clients",
    newCustomer: "New client",
    jobTitleLabel: "Stop",
    jobPlaceholder: "Deep clean, 3 bed",
    workLabel: "What to clean / skip",
    siteLabel: "Home",
    siteNote: "Alarm, pets, and supplies live on the client.",
    sinceLabel: "Client since",
    companyLabel: "Company",
    notesPlaceholder: "Wifi, parking, who is home, kids' rooms off limits",
    jobNotesPlaceholder: "Inside oven, fridge, windows — extras this visit",
    costNote: "Product and extra hours on move-outs.",
    costPlaceholder: "Two cleaners, 5 hours",
    overviewSub: "Today's stops, invoices sent, and cash collected.",
    jobsSub: "Recurring cleans and one-time deep cleans.",
    customersSub: "Homes on the book, paid and still owed.",
    invoicesSub: "Weekly stops and move-outs. Paid when the balance hits zero.",
    paymentsSub: "Card and cash that actually arrived.",
    emptyJobs: "Add a recurring stop or a move-out clean.",
    emptyCustomers: "Add the home. Bedrooms and pets can wait.",
    emptyOverview: "Add a client, put a stop on the calendar, or send an invoice.",
    newJobSub: "Pick the client, then standard, deep, or move-out.",
    newCustomerSub: "A name is enough. Bedrooms and alarm can wait.",
    customerFieldsTitle: "This home",
    customerFieldsNote: "So the team is not guessing at the door.",
    jobFieldsTitle: "This stop",
    jobFieldsNote: "Extras beyond the usual checklist.",
    searchHint: "Search clients, stops, invoices",
    defaultNotes: "Thank you. Payment is due within the terms on this invoice.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled stops"],
    costCategories: ["materials", "labor", "miscellaneous"],
    services: [
      ["Standard clean", "Recurring, 2–3 hours", 16000],
      ["Deep clean", "One time, whole home", 28000],
      ["Move-out clean", "Empty home, extras", 35000],
      ["Add-on fridge", "Inside fridge", 4500],
      ["Add-on oven", "Inside oven", 4500],
      ["Windows interior", "Ground floor", 8500],
      ["Office clean", "Small suite", 14000],
      ["Airbnb turnover", "Same-day reset", 17500],
    ],
    fields: [
      field("bedrooms", "Beds / baths", "customer", "3 / 2"),
      field("sqft", "Sq ft", "customer", "1,800"),
      field("pets", "Pets", "customer", "Cat, no dogs"),
      field("alarm", "Alarm / lockbox", "customer", "Code 4412, no alarm"),
      field("supplies", "Supplies", "customer", "We bring, they provide"),
      field("frequency", "Frequency", "customer", "Every other Friday"),
      field("extras", "Extras this stop", "job", "Inside oven, baseboards"),
      field("laundry", "Laundry", "job", "None, two loads"),
    ],
  },
  roofing: {
    key: "roofing",
    name: "Roofing",
    short: "roofing",
    signupHint: "Squares, material, claims, and replacements.",
    worker: "Foreman",
    workers: "crew",
    job: "Job",
    jobs: "Jobs",
    newJob: "New job",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Job title",
    jobPlaceholder: "Full shingle replacement",
    workLabel: "Repair, replace, or inspect",
    siteLabel: "Property",
    siteNote: "Pitch, squares, and the claim number live on the job.",
    sinceLabel: "Customer since",
    companyLabel: "Company / adjuster",
    notesPlaceholder: "HOA color, dumpster spot, dogs, HOA dump rules",
    jobNotesPlaceholder: "Dry-in date, layers found, photos for the claim",
    costNote: "Squares, dumpster, and crew so the claim and the quote match.",
    costPlaceholder: "32 squares shingles, dumpster, felt",
    overviewSub: "Jobs in progress, billed work, and outstanding balances.",
    jobsSub: "Repairs, replacements, and inspections.",
    customersSub: "Roofs you have walked, paid and still owed.",
    invoicesSub: "Repairs and replacements. Paid when the balance hits zero.",
    paymentsSub: "Draws, insurance checks, and card that landed.",
    emptyJobs: "Log an inspection or a replacement.",
    emptyCustomers: "Add the house. Squares and year can wait.",
    emptyOverview: "Add a house, book a walk, or invoice a repair.",
    newJobSub: "Pick the house, then inspection, leak, or replacement.",
    newCustomerSub: "A name is enough. Material and year can wait.",
    customerFieldsTitle: "This roof",
    customerFieldsNote: "What is up there before you climb.",
    jobFieldsTitle: "This job",
    jobFieldsNote: "Claim, squares, and what you tore off.",
    searchHint: "Search customers, jobs, invoices",
    defaultNotes:
      "Thank you for the work. Payment is due within the terms on this invoice.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled jobs"],
    costCategories: CORE_COSTS,
    services: [
      ["Roof inspection", "Report and photos", 25000],
      ["Leak repair", "Labor and flashing", 65000],
      ["Pipe jack / boot", "Replace and seal", 18500],
      ["Full replacement", "Tear-off, materials, labor", 1250000],
      ["Insurance supplement", "Reinspect and paperwork", 0],
      ["Gutter install", "Seamless, hang", 185000],
      ["Emergency tarp", "Dry-in after a storm", 85000],
      ["Skylight replace", "Unit and flashing", 145000],
    ],
    fields: [
      field("squares", "Squares", "both", "28, 32"),
      field("material", "Material", "customer", "Arch shingle, metal, tile"),
      field("pitch", "Pitch", "customer", "6/12, 4/12"),
      field("roof_year", "Year installed", "customer", "2011"),
      field("layers", "Layers", "customer", "One, two"),
      field("claim", "Claim / adjuster", "job", "State Farm 44-A, Dana"),
      field("color", "Color / HOA", "job", "Charcoal, HOA approved"),
      field("dry_in", "Dry-in date", "job", "2026-08-22"),
    ],
  },
  auto: {
    key: "auto",
    name: "Auto repair",
    short: "auto repair",
    signupHint: "Work orders, VIN, mileage, and the bay.",
    worker: "Mechanic",
    workers: "technicians",
    job: "Work order",
    jobs: "Work orders",
    newJob: "New work order",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Work order",
    jobPlaceholder: "Front brakes, 2018 Camry",
    workLabel: "Concern / authorized work",
    siteLabel: "Drop-off / lot",
    siteNote: "VIN and plate live on the customer. Mileage on the work order.",
    sinceLabel: "Customer since",
    companyLabel: "Fleet / company",
    notesPlaceholder: "Preferred shop hours, loaner, fleet PO rules",
    jobNotesPlaceholder: "Test drive notes, wait vs drop, keys on board 4",
    costNote: "Parts and hours against the authorization.",
    costPlaceholder: "Pads, rotors, 1.5 hours",
    overviewSub: "Work orders, invoices, and what is still on the lot.",
    jobsSub: "In the bay, waiting on parts, ready for pickup.",
    customersSub: "People and fleets, what they paid, what they owe.",
    invoicesSub: "RO to invoice. Paid when the balance hits zero.",
    paymentsSub: "Card, fleet, and cash that actually landed.",
    emptyJobs: "Open a work order for the next vehicle.",
    emptyCustomers: "Add the customer. Year, make, and VIN can wait.",
    emptyOverview: "Add a customer, open a work order, or invoice a RO.",
    newJobSub: "Pick the customer, then the concern and the vehicle.",
    newCustomerSub: "A name is enough. VIN and plate can wait.",
    customerFieldsTitle: "This vehicle",
    customerFieldsNote: "So you are not writing the VIN off a dirty plate.",
    jobFieldsTitle: "This RO",
    jobFieldsNote: "Mileage and what they authorized today.",
    searchHint: "Search customers, work orders, invoices",
    defaultNotes:
      "Thank you for your business. Payment is due upon completion unless noted.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled work orders"],
    costCategories: ["materials", "labor", "subcontractors", "miscellaneous"],
    services: [
      ["Diagnostic", "Scan and inspect", 14900],
      ["Oil change", "Full synthetic, filter", 8900],
      ["Brake pads", "Axle, parts and labor", 42000],
      ["Front / rear brakes", "Pads and rotors, axle", 65000],
      ["Alignment", "Four wheel", 12900],
      ["Battery", "Test, replace, program", 24500],
      ["AC recharge", "Evacuate and charge", 18900],
      ["State inspection", "Safety / emissions", 4500],
    ],
    fields: [
      field("year", "Year", "customer", "2018"),
      field("make_model", "Make / model", "customer", "Toyota Camry SE"),
      field("vin", "VIN", "customer", "17 characters"),
      field("plate", "Plate", "customer", "FL ABC-1234"),
      field("color", "Color", "customer", "Silver"),
      field("mileage", "Mileage", "job", "84,210"),
      field("concern", "Concern", "job", "Grinds on left front"),
      field("auth", "Authorized up to", "job", "$600 unless we call"),
    ],
  },
  salon: {
    key: "salon",
    name: "Salon & spa",
    short: "salon",
    signupHint: "Appointments, color formulas, and who they see.",
    worker: "Stylist",
    workers: "stylists",
    job: "Appointment",
    jobs: "Appointments",
    newJob: "New appointment",
    customer: "Client",
    customers: "Clients",
    newCustomer: "New client",
    jobTitleLabel: "Appointment",
    jobPlaceholder: "Color and cut, Maya",
    workLabel: "Service",
    siteLabel: "Chair / suite",
    siteNote: "Most visits are in-shop. Fill this only for a house call.",
    sinceLabel: "Client since",
    companyLabel: "How they found you",
    notesPlaceholder: "Kids' names, usual chat, who referred them",
    jobNotesPlaceholder: "Formula used today, processing time, next visit",
    costNote: "Color and extras that are not in the service price.",
    costPlaceholder: "Two tubes color, toner",
    overviewSub: "Appointments, invoices, and what is still owed.",
    jobsSub: "On the book today and still to confirm.",
    customersSub: "Clients, what they have paid, what they still owe.",
    invoicesSub: "The visit. Paid when the balance hits zero — usually today.",
    paymentsSub: "Card and cash that actually landed. Tips are a line too.",
    emptyJobs: "Add the next color, cut, or treatment.",
    emptyCustomers: "Add the client. Formula and allergies can wait.",
    emptyOverview: "Add a client, book a chair, or take payment.",
    newJobSub: "Pick the client, then the service and the stylist.",
    newCustomerSub: "A name is enough. Formula and allergies can wait.",
    customerFieldsTitle: "This client",
    customerFieldsNote: "So any stylist can pick up the book.",
    jobFieldsTitle: "This visit",
    jobFieldsNote: "What you actually put on today.",
    searchHint: "Search clients, appointments, invoices",
    defaultNotes:
      "Thank you. Gratuity is not included. Payment is due at the visit.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled appointments"],
    costCategories: ["materials", "labor", "miscellaneous"],
    services: [
      ["Cut", "Signature cut", 8500],
      ["Blowout", "Wash and style", 6500],
      ["Single-process color", "All-over color", 14000],
      ["Highlights", "Foil or balayage", 18500],
      ["Color correction", "By consult", 25000],
      ["Keratin / treatment", "Smoothing service", 22000],
      ["Bridal trial", "Style trial", 12500],
      ["Add-on gloss", "Toner / gloss", 4500],
    ],
    fields: [
      field("stylist", "Preferred stylist", "customer", "Maya"),
      field("formula", "Color formula", "customer", "6N + 7G, 20 vol"),
      field("allergies", "Allergies / scalp", "customer", "None, PPD sensitive"),
      field("last_visit", "Last visit", "customer", "2026-07-12, cut only"),
      field("notes_pref", "Preferences", "customer", "Layers, no bangs"),
      field("formula_today", "Formula today", "job", "Same, 15 min extra"),
      field("add_ons", "Add-ons", "job", "Gloss, brow"),
      field("next_booked", "Rebooked", "job", "6 weeks, Oct 2"),
    ],
  },
  general: {
    key: "general",
    name: "General contractor",
    short: "contracting",
    signupHint: "Projects, change orders, deposits, and punch lists.",
    worker: "Lead",
    workers: "crew",
    job: "Project",
    jobs: "Projects",
    newJob: "New project",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Project",
    jobPlaceholder: "Kitchen remodel",
    workLabel: "Scope",
    siteLabel: "Job site",
    siteNote: "Permit and access live on the project.",
    sinceLabel: "Customer since",
    companyLabel: "Company",
    notesPlaceholder: "HOA, dumpster spot, who signs change orders",
    jobNotesPlaceholder: "Selections pending, inspection date, extras",
    costNote: "Subs, material, and draws so the deposit is not a guess.",
    costPlaceholder: "Cabinet deposit, plumber draw",
    overviewSub: "Projects, billed work, and cash that actually landed.",
    jobsSub: "Builds, remodels, and punch lists.",
    customersSub: "Owners and properties, paid and still owed.",
    invoicesSub: "Draws and finals. Paid when the balance hits zero.",
    paymentsSub: "Deposits, draws, and cash that actually arrived.",
    emptyJobs: "Start a remodel or a small repair.",
    emptyCustomers: "Add the owner. Permit and site notes can wait.",
    emptyOverview: "Add a customer, open a project, or send a deposit invoice.",
    newJobSub: "Pick the owner, then the scope and the site.",
    newCustomerSub: "A name is enough. Permit and access can wait.",
    customerFieldsTitle: "This owner / site",
    customerFieldsNote: "Who signs and how you get on site.",
    jobFieldsTitle: "This project",
    jobFieldsNote: "Permit, deposit, and what is in scope.",
    searchHint: "Search customers, projects, invoices",
    defaultNotes:
      "Thank you for the project. Payment is due within the terms on this invoice.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled projects"],
    costCategories: CORE_COSTS,
    services: [
      ["Site visit", "Estimate, no charge if awarded", 0],
      ["Handyman hour", "Labor", 9500],
      ["Project deposit", "To start work", 100000],
      ["Progress draw", "Per schedule", 0],
      ["Change order", "Out of scope", 0],
      ["Punch list", "Close-out labor", 0],
      ["Permit / fees", "Pass-through", 0],
      ["Dumpster / haul", "Pass-through", 65000],
    ],
    fields: [
      field("access", "Access / lockbox", "customer", "Garage pad 4412"),
      field("hoa", "HOA / rules", "customer", "Work 8–5, dumpster side"),
      field("decision_maker", "Who signs", "customer", "Both owners, email"),
      field("permit", "Permit #", "job", "BLD-2026-118"),
      field("scope", "In scope", "job", "Kitchen, not baths"),
      field("deposit", "Deposit terms", "job", "40% to start, 40% drywall"),
      field("selections", "Selections due", "job", "Tile by Aug 29"),
      field("punch", "Punch / retainage", "job", "10% until walk-through"),
    ],
  },
  other: {
    key: "other",
    name: "Local service",
    short: "your trade",
    signupHint: "Jobs, customers, and cash — in your words.",
    worker: "Lead",
    workers: "team",
    job: "Job",
    jobs: "Jobs",
    newJob: "New job",
    customer: "Customer",
    customers: "Customers",
    newCustomer: "New customer",
    jobTitleLabel: "Job title",
    jobPlaceholder: "Service visit",
    workLabel: "Work to perform",
    siteLabel: "Service address",
    siteNote: "Only needed when the work happens somewhere else.",
    sinceLabel: "Customer since",
    companyLabel: "Company",
    notesPlaceholder: "Gate code, preferences, who to call",
    jobNotesPlaceholder: "What you found, what you left",
    costNote: "Materials, labor, and anything you bought for the job.",
    costPlaceholder: "Parts and two hours",
    overviewSub: "What you billed, collected, and still have on the board.",
    jobsSub: "Scheduled work and jobs in progress.",
    customersSub: "Who you work for, what they paid, what they owe.",
    invoicesSub: "An invoice is paid only when the balance reaches zero.",
    paymentsSub: "Cash that actually arrived. Voided lines drop out of reports.",
    emptyJobs: "Add the next job for a customer.",
    emptyCustomers: "Add the first one. A job and an invoice can follow.",
    emptyOverview: "Add a customer, schedule a job, or send an invoice.",
    newJobSub: "Pick the customer, then say what the work is.",
    newCustomerSub: "A name is all that is required. The rest can wait.",
    customerFieldsTitle: "This customer",
    customerFieldsNote: "Whatever the next visit needs to know.",
    jobFieldsTitle: "This job",
    jobFieldsNote: "Site notes that do not belong in the title.",
    searchHint: "Search customers, jobs, invoices",
    defaultNotes:
      "Thank you for your business. Payment is due within the terms on this invoice.",
    suggestions: ["What's on today", "Who still owes me", "Unscheduled jobs"],
    costCategories: CORE_COSTS,
    services: [
      ["Service visit", "On site", 12500],
      ["Labor hour", "Standard rate", 9500],
      ["Materials", "Pass through", 0],
      ["After-hours visit", "Evenings and weekends", 17500],
      ["Estimate", "Written quote", 0],
      ["Follow-up visit", "Warranty or punch", 0],
    ],
    fields: [
      field("site_notes", "Site notes", "customer", "Gate, parking, contact"),
      field("access", "Access", "customer", "Lockbox, meet on site"),
      field("billing_notes", "Billing notes", "customer", "PO required, Net 15"),
      field("scope", "Scope this visit", "job", "What was asked"),
      field("follow_up", "Follow-up", "job", "Parts on order, return Friday"),
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

export function tradeFieldsFor(
  value: string | null | undefined,
  on: TradeFieldOn | "customer" | "job",
): TradeField[] {
  return tradeCopy(value).fields.filter((item) => item.on === on || item.on === "both");
}

export function parseDetails(raw: string | null | undefined): Details {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Details = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
      else if (typeof value === "number" && Number.isFinite(value)) out[key] = String(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeDetails(details: Details): string {
  const clean: Details = {};
  for (const [key, value] of Object.entries(details)) {
    const trimmed = (value || "").trim();
    if (trimmed) clean[key] = trimmed;
  }
  return JSON.stringify(clean);
}

export function collectDetails(form: FormData, fields: readonly TradeField[]): Details {
  const out: Details = {};
  for (const item of fields) {
    const value = String(form.get(`detail_${item.key}`) || "").trim();
    if (value) out[item.key] = value;
  }
  return out;
}

export function mergeDetails(
  existing: Details,
  fields: readonly TradeField[],
  incoming: Details,
): Details {
  const next = { ...existing };
  for (const item of fields) {
    if (incoming[item.key]) next[item.key] = incoming[item.key];
    else delete next[item.key];
  }
  return next;
}

export function filledDetails(
  details: Details,
  fields: readonly TradeField[],
): [string, string][] {
  return fields
    .map((item) => [item.label, details[item.key] || ""] as [string, string])
    .filter(([, value]) => Boolean(value));
}

export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one.toLowerCase() : many.toLowerCase()}`;
}
