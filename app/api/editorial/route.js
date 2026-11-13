// app/api/editorial/route.js — v6.37 EDITORIAL NOTES. Serves the owner's
// three-part editorial voice (Vibe Check / Why Go / Best Move) for a place
// by name. The 288-place data module (lib/editorial.js, ~160 KB) stays
// SERVER-ONLY behind this route so the client bundle gains zero bytes —
// the Detail sheet fetches one tiny JSON per opened place instead (same
// pattern as /api/insider). Cached at the edge for a day: editorial copy
// only changes on deploy.
//
// v6.42 — the 93 publish-ready Atlas cards carry the DEEPER Wayfind voice
// (Best For / Why It Stands Out / Insider Move / The Story / Fun Fact / Heads
// Up), keyed by Google place_id. When the Detail sheet passes ?id=<place_id>
// AND we hold a card for it, the richer card WINS and maps into the SAME shape
// the existing "Wayfind take" block already renders — one editorial block per
// place, never a double render. Still server-only: the 241 KB card set is
// bundled behind this route and never reaches the client.
import { NextResponse } from "next/server";
import { editorialFor, EDITORIAL_COUNT } from "../../../lib/editorial";
import atlasCards from "../../../data/atlas/editorial-cards.json";
import firstPartyLedger from "../../../data/first-party-actions.json";
import firstPartyOverrides from "../../../data/first-party-action-overrides.json";
import ownedTruthLedger from "../../../data/owned-place-truth.json";
import { mapWfEditorial } from "../../../lib/editorialRule";
import { cardToEditorial, resolveAtlasId, atlasCardForName } from "../../../lib/atlasCards";
import { editorialNameCandidates } from "../../../lib/editorialLookup";
import { approveCandidate } from "../../../lib/placeServable";
import { guideDescriptionFor } from "../../../lib/guideDescriptionFills";
import { siteTodayStr } from "../../../lib/siteTime";
import { filterEligibleVenueEvents } from "../../../lib/gamePlan";
import { firstPartyActionsForPlace } from "../../../lib/firstPartyActionStore";
import { parseEditorialHours } from "../../../lib/editorialHoursParser";
import { resolveAdmissionTruth, resolveOwnedTruthFallback as resolveOwnedTruthFromStore } from "../../../lib/ownedPlaceTruth";

const FPA_STORES = {
  places: (firstPartyLedger && firstPartyLedger.places) || {},
  overrides: (firstPartyOverrides && firstPartyOverrides.places) || {},
};

const OWNED_TRUTH_PLACES = (ownedTruthLedger && ownedTruthLedger.places) || {};

export function resolveOwnedTruthFallback(placeId, name, fpa = null) {
  return resolveOwnedTruthFromStore(placeId, name, fpa, OWNED_TRUTH_PLACES);
}

export const dynamic = "force-dynamic";

// CACHE BOUNDED BY THE PROMISE (2026-09-05). These were s-maxage=86400 with
// stale-while-revalidate=604800: a day of edge caching plus SEVEN DAYS of stale
// serving. Every tier now depends on live inventory status, and a cached
// response cannot re-check anything — so a "you should go here" computed while
// a venue was open could be replayed for a week after it shut. That is the same
// class of failure as the tiers that never checked at all, just with a timer on
// it. 5 minutes fresh, 5 more stale, bounds the worst case to ~10 minutes.
// The status lookup itself is cache: "no-store" (lib/placeServable) — caching
// the safety check would defeat the whole gate.
const HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" };
// A REFUSAL is never cached. If a place is reopened or a status is corrected,
// the fix must take effect on the next request, not after an edge TTL.
const HEADERS_REFUSED = { "Cache-Control": "no-store" };

const CARD_BY_ID = new Map();
for (const c of atlasCards) if (c && c.placeId) CARD_BY_ID.set(c.placeId, c);

// v6.54: the fleet writes wf_editorial continuously — cache one hour (was a
// day), long SWR, so new verified rows surface without a deploy.
const HEADERS_LIVE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" };

const EVENT_SELECT =
  "event_id,event_name,short_title,slug,start_date,end_date,start_time,end_time," +
  "schedule_note,event_status,venue,city,place_id,is_free,price_min,price_max," +
  "price_band,admission_offer,ticket_status,official_ticket_url,official_event_url," +
  "card_hook,insider_tip,parking_tip,duration_recommendation,pairing,wayfind_verdict," +
  "source_tier,verification_confidence,link_ok";

async function wfEditorialFor(id) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!base || !anon || !id) return null;
  try {
    const r = await fetch(base + "/rest/v1/wf_editorial_servable?place_id=eq." + encodeURIComponent(id) + "&verified=is.true&limit=1", {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      // no-store, not revalidate:3600. This read is gated on live inventory
      // status; an hour-old copy is exactly what the gate exists to prevent.
      cache: "no-store",
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return mapWfEditorial(Array.isArray(rows) ? rows[0] : null);
  } catch { return null; }
}

async function wfInventoryCardFor(id) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!base || !anon || !id) return null;
  try {
    const r = await fetch(base + "/rest/v1/wf_inventory?select=place_id,name,editorial_card&place_id=eq." + encodeURIComponent(id) + "&limit=1", {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !row.editorial_card || typeof row.editorial_card !== "object") return null;
    const mapped = cardToEditorial(row.editorial_card);
    return mapped && (mapped.why || mapped.vibe || mapped.knownFor || mapped.insiderMove) ? { editorial: mapped, name: row.name } : null;
  } catch { return null; }
}

async function wfCuratedEventsForPlace(placeId, placeName) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!base || !anon || (!placeId && !placeName)) return [];
  const today = siteTodayStr();
  const dateOr = `or=(end_date.gte.${today},and(end_date.is.null,start_date.gte.${today}))`;
  const headers = { apikey: anon, Authorization: "Bearer " + anon };
  const detailStub = { id: placeId || "", name: placeName || "" };
  try {
    if (placeId) {
      const r = await fetch(
        `${base}/rest/v1/wf_events?select=${EVENT_SELECT}&place_id=eq.${encodeURIComponent(placeId)}&event_status=in.(scheduled,sold_out)&${dateOr}&limit=8`,
        { headers, cache: "no-store" }
      );
      if (r.ok) {
        const rows = await r.json();
        const hit = filterEligibleVenueEvents(Array.isArray(rows) ? rows : [], detailStub);
        if (hit.length > 0) return hit;
      }
    }
    const cleanName = String(placeName || "").replace(/[,%()*]/g, " ").replace(/\s+/g, " ").trim();
    if (cleanName.length >= 5) {
      const r2 = await fetch(
        `${base}/rest/v1/wf_events?select=${EVENT_SELECT}&venue=ilike.${encodeURIComponent("*" + cleanName + "*")}&event_status=in.(scheduled,sold_out)&${dateOr}&limit=8`,
        { headers, cache: "no-store" }
      );
      if (r2.ok) {
        const rows2 = await r2.json();
        return filterEligibleVenueEvents(Array.isArray(rows2) ? rows2 : [], detailStub);
      }
    }
    return [];
  } catch { return []; }
}

export async function GET(req) {
  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "").trim();
  const rawName = String(u.searchParams.get("name") || "").slice(0, 140).trim();
  const rawAlso = String(u.searchParams.get("also") || "").slice(0, 400);
  const names = editorialNameCandidates(rawName, rawAlso);

  // PER-CANDIDATE APPROVAL (2026-09-05). The previous version ran one gate up
  // front on the request's id or its first matching name, then let tier 3 and
  // tier 4 iterate EVERY name candidate and return whichever card matched — a
  // card keyed to a DIFFERENT place than the one approved. Checking one identity
  // and serving another is not a gate.
  //
  // Now each tier resolves the editorial it is ABOUT TO RETURN to a canonical
  // place and approves THAT place. `serve` is the only way a body leaves this
  // route, so a tier cannot forget: the approval and the payload are one call.
  const refuse = (reason) => NextResponse.json({ none: true, refused: reason }, { headers: HEADERS_REFUSED });
  const todayIso = siteTodayStr();
  const resolveApprovedFpa = async (candidate) => {
    if (candidate.placeId) {
      const byCand = firstPartyActionsForPlace(candidate.placeId, todayIso, FPA_STORES);
      if (byCand) return byCand;
    }
    if (!id || id === candidate.placeId) return null;
    const fpa = firstPartyActionsForPlace(id, todayIso, FPA_STORES);
    if (!fpa) return null;
    const idVerdict = await approveCandidate({ placeId: id });
    return idVerdict.ok ? fpa : null;
  };
  const serve = async (candidate, payload, headers) => {
    const verdict = await approveCandidate(candidate);
    if (!verdict.ok) return refuse(verdict.reason);
    const [curatedEvents, fpa] = await Promise.all([
      wfCuratedEventsForPlace(candidate.placeId || id, candidate.name || rawName),
      resolveApprovedFpa(candidate),
    ]);
    let out = curatedEvents.length > 0 ? { ...payload, curatedEvents } : payload;
    let enrichedEditorial = out.editorial || null;
    if (fpa) {
      if (enrichedEditorial && !enrichedEditorial.officialWebsite && fpa.officialWebsite && fpa.officialWebsite.url) {
        enrichedEditorial = { ...enrichedEditorial, officialWebsite: fpa.officialWebsite.url };
      }
      out = { ...out, firstPartyActions: fpa };
    }
    if (enrichedEditorial) {
      const targetPlaceId = candidate.placeId || id;
      const targetVenueName = candidate.name || rawName;
      const parsedHours = parseEditorialHours(enrichedEditorial, { venueName: targetVenueName });
      const fallbackTruth = resolveOwnedTruthFallback(targetPlaceId, targetVenueName, fpa);
      const ownedHours = parsedHours && parsedHours.ok && parsedHours.periods.length > 0
        ? parsedHours
        : fallbackTruth.ownedHours;
      const rawAdmissionTruth = resolveAdmissionTruth(
        { id: targetPlaceId, name: targetVenueName },
        enrichedEditorial,
        fpa || null
      );
      const admissionTruth = rawAdmissionTruth.status !== "UNKNOWN"
        ? rawAdmissionTruth
        : (fallbackTruth.admissionTruth || rawAdmissionTruth);
      enrichedEditorial = {
        ...enrichedEditorial,
        ...(ownedHours ? { ownedHours } : {}),
        ...(admissionTruth ? { admissionTruth } : {}),
      };
      out = {
        ...out,
        editorial: enrichedEditorial,
        ...(ownedHours ? { ownedHours } : {}),
        ...(admissionTruth ? { admissionTruth } : {}),
      };
    }
    return NextResponse.json(out, { headers });
  };
  const serveActionsOnlyOrNone = async (extra = null) => {
    const fpaOnly = id ? firstPartyActionsForPlace(id, todayIso, FPA_STORES) : null;
    const { ownedHours, admissionTruth } = resolveOwnedTruthFallback(id, rawName, fpaOnly);
    if (!fpaOnly && !ownedHours && !admissionTruth) {
      return NextResponse.json({ none: true, ...(extra || {}) }, { headers: HEADERS });
    }
    const verdict = await approveCandidate({ placeId: id, name: rawName });
    if (!verdict.ok) return refuse(verdict.reason);
    const curatedEvents = await wfCuratedEventsForPlace(id, rawName);
    return NextResponse.json(
      {
        none: true,
        ...(extra || {}),
        ...(fpaOnly ? { firstPartyActions: fpaOnly } : {}),
        ...(ownedHours ? { ownedHours } : {}),
        ...(admissionTruth ? { admissionTruth } : {}),
        ...(curatedEvents.length > 0 ? { curatedEvents } : {}),
      },
      { headers: HEADERS }
    );
  };

  // Tier 1: the owner's Atlas card always wins — hand curation beats machine.
  // Same-place aliases (review-same-place.tsv) resolve to the id that holds the
  // card, so the card's OWN placeId is the identity judged, not the request's.
  const atlasId = id && (CARD_BY_ID.has(id) ? id : resolveAtlasId(id));
  if (atlasId && CARD_BY_ID.has(atlasId)) {
    const card = CARD_BY_ID.get(atlasId);
    return serve({ placeId: card.placeId || atlasId, name: card.name },
      { editorial: cardToEditorial(card) }, HEADERS);
  }

  // Tier 2: the research fleet's verified card (wf_editorial_servable). The view
  // already joins OPERATIONAL, but it does NOT know about the `excluded`
  // boolean, so the row is still approved by place_id like every other tier.
  if (id) {
    const fleet = await wfEditorialFor(id);
    if (fleet) {
      return serve({ placeId: id, name: fleet.name || rawName },
        { editorial: fleet, sources: fleet.sources || [] }, HEADERS_LIVE);
    }
    // Tier 2.5: researched Atlas card stored directly on wf_inventory.editorial_card
    // (e.g. Mote SEA, which holds a full 20-field card in wf_inventory).
    const invCard = await wfInventoryCardFor(id);
    if (invCard) {
      return serve({ placeId: id, name: invCard.name || rawName },
        { editorial: invCard.editorial }, HEADERS_LIVE);
    }
  }

  // Tier 3: Atlas by exact name — event/venue listings often arrive with a
  // different id than the card's key. Exact name only; never a fuzzy attach.
  // The card carries its own placeId, and THAT is what gets approved.
  for (const n of names) {
    const byName = atlasCardForName(atlasCards, n);
    if (byName) {
      return serve({ placeId: byName.placeId, name: byName.name || n },
        { editorial: cardToEditorial(byName) }, HEADERS);
    }
  }

  // Last tier (2026-10-13): a reviewed guide-pick description for a place that
  // holds nothing stronger. Looked up by the request's place_id only, never by
  // name, and approved against the same live-status gate as every other tier.
  // lib/guideDescriptionFills.js says what qualifies and why.
  const guideFill = id ? guideDescriptionFor(id) : null;

  if (!names.length) {
    if (guideFill) return serve({ placeId: id, name: guideFill.name || rawName }, { editorial: guideFill, sources: guideFill.sources }, HEADERS);
    return serveActionsOnlyOrNone({ count: EDITORIAL_COUNT });
  }

  // Tier 4: the 295 handwritten entries, keyed by name. The content is KEPT and
  // is what resolves the identity; it is simply withheld until that identity
  // resolves to a place we serve. An unresolved name refuses — "we cannot verify
  // it" does not establish that recommending it is safe.
  for (const n of names) {
    const e = editorialFor(n);
    if (e) return serve({ placeId: null, name: e.name || n }, { editorial: e }, HEADERS);
  }
  if (guideFill) return serve({ placeId: id, name: guideFill.name || rawName }, { editorial: guideFill, sources: guideFill.sources }, HEADERS);
  return serveActionsOnlyOrNone();
}
