// app/api/partner/menu-offers/route.js — Lane B: the metro-gated,
// category:sub-keyed partner rail that feeds UnifiedBrowseCommerceRail
// INDEPENDENT of which places happen to be loaded near the map center.
//
// WHY THIS EXISTS. UnifiedBrowseCommerceRail already surfaces klook/tiqets
// pins, but ONLY for places already present in the `places` prop — a Tiqets
// museum ticket or a TicketNetwork stadium never shows under a browse chip
// unless a place card for that exact venue happened to load nearby first.
// lib/menuPartnerOffers.js is the hand-placed, hand-verified registry that
// closes that gap; this route is the thin server boundary the client rail
// calls, same shape as GET /api/deals.
//
// NO DESTINATION URLS LEAVE THIS ROUTE. Every row here is a
// { provider, id, title, image, quality10, providerLabel, subcategory,
// merchant } tuple — never partnerOfferRegistry's `destination`. The browser
// only ever gets an offer id; commerceHref()/`/api/commerce/go` is what turns
// that id into a redirect, server-side, at click time (lib/commerceProviders.js).
//
// NEVER RANKS BY PROVIDER OR COMMISSION. quality10 is wayfindScore()/10 from
// wf_inventory's rating/reviews when this offer's placeId resolves there, and
// the sentinel -1 otherwise — the SAME "-1 sorts last, never invented" rule
// UnifiedBrowseCommerceRail already applies to every other partner row
// (lib/dealsData.js's mergeVenueScores, the pin loop's wayfindScore call).
// This route does not sort at all; the client rail's own score/rankBonus sort
// is the single ranking authority (CLAUDE.md: never let a hidden term reorder
// against the visible number).
//
// READS wf_inventory WITH THE ANON KEY, read-only, same pattern as
// app/api/events/fall/route.js's `inventoryById` join — no service role, no
// write. Every row in MENU_PARTNER_OFFERS carries its own hand-verified
// `image` already (see lib/menuPartnerOffers.js's IMAGES section), so the
// wf_inventory join can only ADD a quality10 signal when a row's placeId
// happens to resolve there; it is never load-bearing for the image, and a
// Supabase outage degrades this route to quality10:-1 for every row, not to
// an empty rail.
import { menuPartnerOffersFor } from "../../../../lib/menuPartnerOffers.js";
import { supabase } from "../../../../lib/supabase.js";
import { wayfindScore } from "../../../../lib/wayfindScore.js";
import { providerLabel } from "../../../../lib/providerLabels.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_DEADLINE_MS = 3500;

function json(body, cache) {
  return Response.json(body, { headers: { "cache-control": cache } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cat = String(searchParams.get("cat") || "");
  const sub = String(searchParams.get("sub") || "all");
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  try {
    // menuPartnerOffersFor already returns [] immediately for an empty-by-law
    // chip (food:*, hotels:*, shopping:*, attractions:spa, nightlife:speakeasy,
    // nightlife:karaoke) and for missing/non-finite coordinates — this route
    // adds no second copy of that rule, it only shapes what comes back.
    const rows = menuPartnerOffersFor(cat, sub, { lat, lng });
    if (!rows.length) return json({ items: [] }, "public, s-maxage=300, stale-while-revalidate=1800");

    // Every placed row's own placeId is null today (see lib/menuPartnerOffers.js
    // header: no source in this sandbox stores a real wf_inventory place_id for
    // these offers), so this join is a no-op in practice and a real one the day
    // a row gains a verified placeId — the code path stays honest either way.
    const placeIds = [...new Set(rows.map((r) => r.placeId).filter(Boolean))];
    let inventoryById = new Map();
    if (placeIds.length && supabase) {
      try {
        const signal = AbortSignal.timeout(DB_DEADLINE_MS);
        const { data, error } = await supabase
          .from("wf_inventory")
          .select("place_id,name,photo_ref,signals")
          .in("place_id", placeIds)
          .abortSignal(signal);
        if (!error) inventoryById = new Map((data || []).map((row) => [row.place_id, row]));
      } catch {
        // Fail-soft: rows keep their own verified image; quality10 stays -1.
      }
    }

    const key = `${cat}:${sub}`;
    const items = rows
      .map((row) => {
        const inv = row.placeId ? inventoryById.get(row.placeId) : null;
        const rating = typeof inv?.signals?.rating === "number" ? inv.signals.rating : null;
        const reviews = Number(inv?.signals?.reviews || 0);
        const base = rating ? wayfindScore(rating, reviews) : null;
        const quality10 = base != null ? base / 10 : -1;
        // "Real art" rule: a row must carry EITHER its own hand-verified image
        // or a confirmed wf_inventory photo_ref. A row with neither is dropped
        // here rather than rendered with no picture — see lib/menuPartnerOffers.js
        // for how every currently-placed row already satisfies this honestly.
        const image = row.image || (inv?.photo_ref ? "/api/photo?ref=" + encodeURIComponent(inv.photo_ref) + "&w=600" : null);
        if (!image) return null;
        return {
          provider: row.provider,
          id: row.offerId,
          title: row.title,
          image,
          quality10,
          providerLabel: providerLabel(row.provider),
          subcategory: key,
          merchant: row.merchant,
          // Lane F, 2026-09-16 — the caller's UnifiedBrowseCommerceRail uses
          // this to order RESERVED (unscored) menu rows by distance; never a
          // ranking signal for scored rows. See lib/menuReserveSlots.js.
          distMi: Number.isFinite(row.distMi) ? row.distMi : null,
        };
      })
      .filter(Boolean);

    return json({ items }, "public, s-maxage=300, stale-while-revalidate=1800");
  } catch (error) {
    console.error("[api/partner/menu-offers] degraded", { message: String(error?.message || error) });
    return json({ items: [] }, "no-store");
  }
}
