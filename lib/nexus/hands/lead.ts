/**
 * The Lead hand: Google Places → companies worth emailing.
 *
 * Ported from RideBy's hands/lead.ts. Places costs money per call, so one city
 * and one trade per job, results are deduped on place id, and anything the ICP
 * filter rejects is still written down as disqualified with the reason. Nothing
 * is silently dropped. A re-run must not resurrect a national franchise.
 */

import { and, eq, sql } from "drizzle-orm";
import { db, nowISO } from "../../db";
import { nexusCompanies } from "../../schema";
import { filterLead, isDirectoryHost, tradeFromQuery } from "../lead-filter";
import { enqueueJob, logAction } from "../jobs";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

export function isPlacesConfigured(): boolean {
  return Boolean((process.env.GOOGLE_PLACES_API_KEY || "").trim());
}

type PlaceResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  userRatingCount?: number;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
};

function cityOf(place: PlaceResult): { city: string; state: string } {
  const parts = place.addressComponents || [];
  const city =
    parts.find((p) => p.types?.includes("locality"))?.longText ||
    parts.find((p) => p.types?.includes("postal_town"))?.longText ||
    "";
  const state =
    parts.find((p) => p.types?.includes("administrative_area_level_1"))?.shortText || "";
  return { city, state };
}

export type LeadSearchResult = {
  found: number;
  stored: number;
  disqualified: number;
  duplicates: number;
  reasons: string[];
};

/**
 * @param query e.g. "hvac contractor in Fort Myers FL"
 * @param cityHint the city we asked for, so out-of-area results get rejected
 */
export async function runLeadSearch(
  query: string,
  options: { cityHint?: string; maxResults?: number } = {},
): Promise<LeadSearchResult> {
  const apiKey = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set, so lead search cannot run.");
  const wanted = Math.min(20, Math.max(1, options.maxResults ?? 20));

  const response = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.userRatingCount",
        "places.addressComponents",
      ].join(","),
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: wanted }),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    places?: PlaceResult[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Places returned ${response.status}.`);
  }

  const places = payload.places || [];
  const trade = tradeFromQuery(query);
  const result: LeadSearchResult = {
    found: places.length,
    stored: 0,
    disqualified: 0,
    duplicates: 0,
    reasons: [],
  };

  for (const place of places) {
    const placeId = (place.id || "").trim();
    const name = place.displayName?.text?.trim() || "";
    if (!placeId || !name) continue;

    const [existing] = await db()
      .select({ id: nexusCompanies.id })
      .from(nexusCompanies)
      .where(eq(nexusCompanies.placeId, placeId));
    if (existing) {
      result.duplicates += 1;
      continue;
    }

    const { city, state } = cityOf(place);
    const website = isDirectoryHost(place.websiteUri || "") ? "" : place.websiteUri || "";
    const verdict = filterLead(
      { name, website, city, reviewCount: place.userRatingCount ?? null },
      options.cityHint,
    );
    const stamp = nowISO();

    const [row] = await db()
      .insert(nexusCompanies)
      .values({
        placeId,
        name,
        website,
        phone: place.nationalPhoneNumber || "",
        address: place.formattedAddress || "",
        city,
        state,
        trade,
        reviewCount: place.userRatingCount ?? 0,
        source: "places",
        searchQuery: query,
        stage: verdict.ok ? "new" : "disqualified",
        disqualifiedReason: verdict.ok ? "" : verdict.reason || "Filtered.",
        researchStatus: verdict.ok ? "pending" : "skipped",
        createdAt: stamp,
        updatedAt: stamp,
      })
      .returning({ id: nexusCompanies.id });

    if (!verdict.ok) {
      result.disqualified += 1;
      if (verdict.reason && !result.reasons.includes(verdict.reason)) {
        result.reasons.push(verdict.reason);
      }
      continue;
    }

    result.stored += 1;
    // A company with no website cannot be researched, so there is no fact to
    // open with and it will never be draftable. Kept, not emailed.
    if (row && website) {
      await enqueueJob(
        "research.company",
        { companyId: row.id },
        { dedupeKey: `research:${row.id}` },
      );
    }
  }

  await logAction({
    action: "lead.search",
    entityType: "query",
    detail: `${query} → ${result.stored} kept, ${result.disqualified} filtered, ${result.duplicates} already known`,
  });
  return result;
}

/** How many usable leads are left before Nova has to open a new city. */
export async function leadRunway(): Promise<{
  ready: number;
  researching: number;
  needsResearch: number;
  contacted: number;
  disqualified: number;
  cities: string[];
}> {
  const rows = await db()
    .select({ stage: nexusCompanies.stage, count: sql<number>`count(*)` })
    .from(nexusCompanies)
    .groupBy(nexusCompanies.stage);
  const byStage: Record<string, number> = {};
  for (const row of rows) byStage[row.stage] = Number(row.count);

  const cityRows = await db()
    .selectDistinct({ city: nexusCompanies.city })
    .from(nexusCompanies)
    .where(and(eq(nexusCompanies.stage, "ready")));

  return {
    ready: byStage.ready || 0,
    researching: byStage.researching || 0,
    needsResearch: byStage.new || 0,
    contacted: byStage.contacted || 0,
    disqualified: byStage.disqualified || 0,
    cities: cityRows.map((row) => row.city).filter(Boolean).slice(0, 12),
  };
}
