/**
 * Who Sere is actually for, expressed as a filter.
 *
 * Ported from RideBy's lead-filter.ts, where the buyer is an HOA management
 * company. Sere's buyer is a one-to-five-truck local trade shop, so the same
 * machinery points at a different target.
 *
 * Size signal is Google review count. A shop with 600 reviews is a regional
 * operation that already runs ServiceTitan; one with 20 is the owner answering
 * his own phone, which is exactly who needs a book. Missing review counts do
 * NOT pass — Places omits the field sometimes, and letting that through is how
 * you end up emailing a national franchise.
 *
 * Nothing is deleted. A rejected company is stored as disqualified with the
 * reason, so a re-run cannot resurrect it and the log stays honest.
 */

export type LeadCandidate = {
  name: string;
  website?: string | null;
  city?: string | null;
  /** Google Places userRatingCount. */
  reviewCount?: number | null;
};

export type LeadFilterResult = { ok: boolean; reason?: string };

/** Soft ceiling on Google reviews. Tunable, defaults to 150. */
export function maxReviewCount(): number {
  const raw = Number(process.env.NEXUS_MAX_REVIEW_COUNT ?? 150);
  if (!Number.isFinite(raw) || raw < 1) return 150;
  return Math.floor(raw);
}

/**
 * National trade franchises and roll-ups. These have corporate software and a
 * procurement process; they are not buying a $39 book from a cold email.
 */
const BLOCKED_NAME_PATTERNS: RegExp[] = [
  /\bone hour (heating|air)\b/i,
  /\broto-?rooter\b/i,
  /\bmr\.? (rooter|electric|handyman|appliance)\b/i,
  /\bbenjamin franklin plumbing\b/i,
  /\bmister sparky\b/i,
  /\baire serv\b/i,
  /\bservice experts\b/i,
  /\bars\/rescue rooter\b/i,
  /\bhorizon services\b/i,
  /\bleaffilter\b/i,
  /\bterminix\b/i,
  /\btruegreen\b/i,
  /\btrugreen\b/i,
  /\bservpro\b/i,
  /\bservicemaster\b/i,
  /\bchemdry\b/i,
  /\bmolly maid\b/i,
  /\bmerry maids\b/i,
  /\bjan-?pro\b/i,
  /\bthe grounds guys\b/i,
  /\bweed man\b/i,
  /\bmidas\b/i,
  /\bjiffy lube\b/i,
  /\bvalvoline\b/i,
  /\bfirestone complete\b/i,
  /\bpep boys\b/i,
  /\bmeineke\b/i,
  /\baamco\b/i,
  /\bgreat clips\b/i,
  /\bsport clips\b/i,
  /\bsupercuts\b/i,
  /\bhome depot\b/i,
  /\blowe'?s\b/i,
  /\bservicetitan\b/i,
  /\bhousecall pro\b/i,
  /\bjobber\b/i,
];

const BLOCKED_DOMAINS = [
  "onehourheatandair.com",
  "rotorooter.com",
  "mrrooter.com",
  "benjaminfranklinplumbing.com",
  "mistersparky.com",
  "aireserv.com",
  "serviceexperts.com",
  "ars.com",
  "horizonservices.com",
  "terminix.com",
  "trugreen.com",
  "servpro.com",
  "servicemaster.com",
  "mollymaid.com",
  "merrymaids.com",
  "jan-pro.com",
  "groundsguys.com",
  "weedman.com",
  "midas.com",
  "jiffylube.com",
  "valvoline.com",
  "pepboys.com",
  "meineke.com",
  "aamco.com",
  "greatclips.com",
  "supercuts.com",
  "servicetitan.com",
  "housecallpro.com",
  "getjobber.com",
];

/**
 * Directories and marketplaces. A listing page is not a shop, and emailing
 * info@yelp.com helps nobody.
 */
const BLOCKED_HOSTS = [
  "yelp.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "thumbtack.com",
  "bbb.org",
  "facebook.com",
  "instagram.com",
  "nextdoor.com",
  "porch.com",
  "houzz.com",
  "yellowpages.com",
  "mapquest.com",
  "indeed.com",
  "linkedin.com",
];

export function hostOf(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function endsWithDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isDirectoryHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return BLOCKED_HOSTS.some((blocked) => endsWithDomain(host, blocked));
}

/**
 * @param cityHint the city we asked Places for, so Houston results do not come
 * back for an Austin query.
 */
export function filterLead(candidate: LeadCandidate, cityHint?: string): LeadFilterResult {
  const name = (candidate.name || "").trim();
  if (!name) return { ok: false, reason: "No business name." };

  for (const pattern of BLOCKED_NAME_PATTERNS) {
    if (pattern.test(name)) {
      return { ok: false, reason: `National brand or franchise: ${name}.` };
    }
  }

  const host = hostOf(candidate.website || "");
  if (host) {
    if (BLOCKED_DOMAINS.some((domain) => endsWithDomain(host, domain))) {
      return { ok: false, reason: `National brand domain: ${host}.` };
    }
    if (BLOCKED_HOSTS.some((blocked) => endsWithDomain(host, blocked))) {
      return { ok: false, reason: `Directory listing, not a shop site: ${host}.` };
    }
  }

  // Deliberately strict: an unknown review count is treated as a fail.
  const reviews = candidate.reviewCount;
  if (reviews == null || !Number.isFinite(reviews)) {
    return { ok: false, reason: "No review count from Places, so size is unknown." };
  }
  const ceiling = maxReviewCount();
  if (reviews > ceiling) {
    return { ok: false, reason: `${reviews} Google reviews is over the ${ceiling} ceiling — too big.` };
  }

  if (cityHint) {
    const wanted = cityHint.split(",")[0].trim().toLowerCase();
    const got = (candidate.city || "").trim().toLowerCase();
    if (wanted && got && got !== wanted) {
      return { ok: false, reason: `Places returned ${candidate.city}, not ${cityHint}.` };
    }
  }

  return { ok: true };
}

/** Trades Sere personalizes for, and the Places queries that find them. */
export const TRADE_QUERIES: ReadonlyArray<{ trade: string; query: string }> = [
  { trade: "hvac", query: "hvac contractor" },
  { trade: "plumbing", query: "plumber" },
  { trade: "electrical", query: "electrician" },
  { trade: "landscaping", query: "lawn care service" },
  { trade: "cleaning", query: "house cleaning service" },
  { trade: "roofing", query: "roofing contractor" },
  { trade: "auto", query: "auto repair shop" },
  { trade: "salon", query: "hair salon" },
  { trade: "general", query: "general contractor" },
];

/** Guesses the trade from the query that found them, so the copy uses their words. */
export function tradeFromQuery(query: string): string {
  const q = query.toLowerCase();
  for (const entry of TRADE_QUERIES) {
    if (q.includes(entry.query)) return entry.trade;
  }
  if (/hvac|air condition|heating/.test(q)) return "hvac";
  if (/plumb/.test(q)) return "plumbing";
  if (/electric/.test(q)) return "electrical";
  if (/lawn|landscap/.test(q)) return "landscaping";
  if (/clean|maid/.test(q)) return "cleaning";
  if (/roof/.test(q)) return "roofing";
  if (/auto|mechanic|tire/.test(q)) return "auto";
  if (/salon|barber|hair/.test(q)) return "salon";
  return "general";
}
