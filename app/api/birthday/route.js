export const runtime = "nodejs";

// Location-aware Birthday inventory. This endpoint never performs a live
// Places search: it composes the seven rails from Wayfind's owned inventory,
// and every qualitative category is evidence-gated in lib/birthdayIntent.

import { birthdayAttributesFor } from "../../../lib/birthdayAttributes.js";
import { distMeters, invRowToPlace, serveInventoryByPlaceIds } from "../../../lib/inventoryServe.js";
import { fetchOwnedPool } from "../../../lib/ownedPool.js";
import { NET_DEADLINE_MS } from "../../../lib/fetchDeadline.js";
import { BIRTHDAY_WIDEN_MI, BIRTHDAY_RAIL_ORDER, birthdayRailMembership, composeBirthdayRails } from "../../../lib/birthdayIntent.js";
import { BIRTHDAY_REWARD_PLACE_IDS, birthdayRewardFor } from "../../../lib/birthdayRewards.js";
import { completeAnswersOnly, fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import { cgetMany } from "../../../lib/serverCache.js";
import { PHOTO_REF_RX, isOwnedPhotoUrl, photoCacheKey } from "../../../lib/placePhotoServe.js";
import { windowRailAnswer } from "../../../lib/railResponse.js";
import { pageOneRail } from "../../../lib/railPage.js";

const RAIL_PHOTO_W = 640; // must match BirthdayRails' /api/photo?w= so the cache key is the same one that route writes
const PHOTO_CACHE_STALE_MS = 60 * 60 * 24 * 30 * 1000;

// attachCachedPhotos — PERF (owner, 2026-09-01: "the load time on these place
// cards is very long"). Measured from Parrish over cellular: the rail JSON
// itself is cached (fast-cache + CDN) and returns in ~150ms warm, but every
// card image then paid TWO round trips — /api/photo (a cold Vercel function,
// ~700ms, that only looks up the 30-day photo cache and 302s) and then the
// googleusercontent bytes. Fifteen cards, two hops each, on a two-bar signal.
//
// This reads the SAME 30-day photo cache the /api/photo route writes — one
// batched cgetMany for every ref in the rails, inside the rail computation
// that is itself cached for an hour — and puts the final image URL straight
// on the place, so <img src> goes to Google in one hop. It NEVER spends: a
// ref that is not in the cache is left alone and the card falls back to the
// /api/photo route exactly as before (which is where the ledger lives).
// Only owned googleusercontent URLs are attached (isOwnedPhotoUrl), so a
// stock or fallback URL can never be laundered into a place card here.
async function attachCachedPhotos(rails) {
  const refs = [];
  for (const rail of rails || []) for (const p of rail.places || []) {
    if (!p.photo && p.photoRef && PHOTO_REF_RX.test(p.photoRef)) refs.push(p.photoRef);
  }
  if (!refs.length) return rails;
  let hits;
  try {
    hits = await cgetMany(refs.map((ref) => photoCacheKey(ref, RAIL_PHOTO_W)), { staleMs: PHOTO_CACHE_STALE_MS });
  } catch {
    return rails; // cache unreachable: the cards still load, one hop slower
  }
  for (const rail of rails || []) for (const p of rail.places || []) {
    if (p.photo || !p.photoRef) continue;
    const hit = hits.get(photoCacheKey(p.photoRef, RAIL_PHOTO_W));
    const uri = hit && hit.v && typeof hit.v.uri === "string" ? hit.v.uri : null;
    if (uri && isOwnedPhotoUrl(uri)) p.photo = uri;
  }
  return rails;
}
function json(body, status = 200, cache = "public, s-maxage=3600, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

function priceNum(level) {
  const values = [
    "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE",
    "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE",
  ];
  return typeof level === "number" ? level : Math.max(0, values.indexOf(level));
}

function toBirthdayPlace(raw, origin) {
  const id = String(raw?.id || "");
  const name = String(raw?.displayName?.text || raw?.name || "").trim();
  const lat = Number(raw?.location?.latitude ?? raw?.lat);
  const lng = Number(raw?.location?.longitude ?? raw?.lng);
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const photoRef = raw?.photo_ref || raw?.photos?.[0]?.name || null;
  const place = {
    id, name, lat, lng,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    reviews: Number(raw.userRatingCount || raw.reviews || 0),
    types: Array.isArray(raw.types) ? raw.types : [],
    primaryType: raw.primaryType || raw.primary_type || null,
    priceLevel: raw.priceLevel ?? raw.priceNum ?? null,
    priceNum: priceNum(raw.priceLevel ?? raw.priceNum),
    editorial: raw?.editorialSummary?.text || raw?.editorial || null,
    photo: raw.photo_url || raw.photoUrl || null,
    photoRef,
    distMi: Math.round((distMeters(origin.lat, origin.lng, lat, lng) / 1609.34) * 10) / 10,
    _wfInventory: true,
  };
  const reward = birthdayRewardFor(id, new Date(), name);
  if (reward) place._birthdayReward = reward;
  const attributes = birthdayAttributesFor(id);
  if (attributes) place._birthdayAttributes = attributes;
  return place;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  const full = searchParams.get("full") === "1";
  // WO11 paging contract — see app/api/night-out/route.js.
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: "lat and lng are required" }, 400, "no-store");
  }

  const key = `birthday:v2:${geoCell(lat)}:${geoCell(lng)}`;
  try {
    const cached = await fastCachedRail(key, async () => {
      const radiusM = BIRTHDAY_WIDEN_MI * 1609.34;
      const origin = { lat, lng };
      const exactRead = { failLoud: true, deadlineMs: NET_DEADLINE_MS };

      /**
       * v8.98 — THE SIX EVIDENCE-GATED RAILS ASK BEFORE THE COST BOUND.
       *
       * These two reads used to be `serveFromInventory("food"/"nightlife", …,
       * BROWSE_INVENTORY_N)`: the top 400 of each broad category by Wayfind
       * Score, with the narrow questions — is there a PRIVATE DINING ROOM, is
       * this a ROOFTOP, is it BEACHFRONT, is it genuinely UPSCALE — asked
       * afterwards in composeBirthdayRails. Those are evidence-gated predicates
       * that only a small slice of any food pool can satisfy, and they were
       * competing for 400 slots against every ordinary well-reviewed restaurant
       * within 27 miles. Measured near Parrish, that box holds 2,417 food rows,
       * so a real private-dining room ranked #500 never reached the question.
       *
       * Same failure class as the cafés (v8.49) and Night Out (v8.97b):
       * "identity ∩ anchor top-N is thin BY CONSTRUCTION" (lib/browseInventory.js).
       *
       * The predicate handed to the reader is birthdayRailMembership itself, so
       * this file still holds no second opinion about what makes a birthday
       * venue. The gifts rail is NOT part of it — a reward is admitted by exact
       * place id below, never by a rail predicate.
       *
       * Unchanged: the 27-mile radius, `primaryOnly`, the photo requirement, and
       * composeBirthdayRails' ranking.
       */
      const birthdayClaims = (place) => BIRTHDAY_RAIL_ORDER.find((id) => {
        try { return birthdayRailMembership(id, place); } catch (e) { return false; }
      }) || null;

      // One bounded attempt per read. Retrying the same cold query doubled the
      // wait and made a 6s miss look like a broken page.
      const [pool, rewards] = await Promise.all([
        fetchOwnedPool(lat, lng, {
          categories: ["food", "nightlife"],
          radiusMi: BIRTHDAY_WIDEN_MI,
          primaryOnly: true,
          deadlineMs: NET_DEADLINE_MS,
          toPlace: (row, o) => toBirthdayPlace(invRowToPlace(row), o),
          identity: birthdayClaims,
        }),
        serveInventoryByPlaceIds(BIRTHDAY_REWARD_PLACE_IDS, lat, lng, radiusM, exactRead),
      ]);

      const seen = new Set();
      const places = [];
      // Rewards first: a governed birthday gift is admitted by id and must never
      // be displaced by a dedupe against a broad row of the same place.
      for (const raw of rewards.map((r) => toBirthdayPlace(r, origin)).concat(pool.places)) {
        const place = raw;
        if (!place || seen.has(place.id)) continue;
        seen.add(place.id);
        if (!place.photo && !place.photoRef) continue;
        places.push(place);
      }
      const composed = composeBirthdayRails(places);
      if (composed && Array.isArray(composed.rails)) await attachCachedPhotos(composed.rails);
      // A partial owned pool (food read but nightlife failed, or the reverse)
      // must not be cached as this town's answer — see completeAnswersOnly.
      return { ...composed, degraded: !!pool.stats.degraded, sourceStats: pool.stats };
    }, {
      name: "birthday-rails",
      usable: completeAnswersOnly((value) => Array.isArray(value.rails) && value.rails.some((rail) => rail.places?.length)),
    });
    const total = cached.value.rails.reduce((sum, rail) => sum + rail.places.length, 0);
    const headers = {
      "cache-control": total && !cached.value.degraded ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
      "x-wayfind-fast-cache": cached.state,
    };
    if (railId) {
      const paged = pageOneRail(cached.value.rails, railId, { page, size });
      if (!paged) return Response.json({ error: "unknown rail" }, { status: 404, headers: { "cache-control": "no-store" } });
      return Response.json({ rail: railId, ...paged }, { status: 200, headers });
    }
    return Response.json(windowRailAnswer(cached.value, full), { status: 200, headers });
  } catch (error) {
    console.error("[api/birthday] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Birthday inventory is temporarily unavailable" }, 503, "no-store");
  }
}
