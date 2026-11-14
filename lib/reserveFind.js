// lib/reserveFind.js - "find me another table": up to 3 OPERATIONAL restaurants from owned inventory.
// Deterministic. Nothing here is a model guess and nothing invents availability:
//   - a Wayfind partner is offered for a given day/time/party ONLY when wf_reserve_slots returned a start
//     time within 60 minutes of the request (those real times come back as `times`);
//   - an OpenTable pick never carries times or any claim of openings: it is a handoff.
import { wayfindScore } from "./wayfindScore.js";
import { toDisplayScore } from "./score.js";
import { partnerVisible, normSlot, cleanDate, cleanTime, cleanPartySize } from "./reserve.js";
import { assertOpenTableApiOff } from "./reservePath.js";

export const FIND_MAX_PICKS = 3;
export const FIND_SLOT_WINDOW_MINUTES = 60;
const BOOKABLE = new Set(["wayfind", "opentable"]);
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const lc = (v, re) => (typeof v === "string" && re.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);

export function rowScore(row) {
  const s = row && row.signals && typeof row.signals === "object" ? row.signals : {};
  return toDisplayScore(wayfindScore(typeof s.rating === "number" ? s.rating : null, typeof s.reviews === "number" ? s.reviews : 0));
}
const miles = (a, b) => {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;
  const r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};

/** Normalize the request. Anything invalid is dropped, not guessed. */
export function cleanFindRequest(body, today) {
  const b = body && typeof body === "object" ? body : {};
  const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const query = typeof b.query === "string" ? b.query.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return {
    query: /^[\p{L}\p{N} '&.-]{2,60}$/u.test(query) ? query : null,
    cuisine: lc(b.cuisine, /^[a-z][a-z -]{1,30}$/),
    placeId: typeof b.placeId === "string" && /^[A-Za-z0-9_-]{5,200}$/.test(b.placeId) ? b.placeId : null,
    date: today ? cleanDate(b.date, today) : null,
    time: cleanTime(b.time),
    party: cleanPartySize(b.party, 20),
    lat: num(b.lat, -90, 90), lng: num(b.lng, -180, 180),
    metro: lc(b.metro, /^[a-z0-9-]{2,40}$/),
  };
}

/**
 * repository needs: getInventoryPlace, searchRestaurants, listVisiblePartners, listPlatformLinks, slots.
 * Returns {ok:true, picks:[{placeId,name,locality,cuisines,score,path,times?}]}.
 */
export async function findTables({ repository, env = {}, request }) {
  assertOpenTableApiOff(env);
  const r = request;
  let { cuisine, metro } = r;
  let exclude = null;
  if (r.placeId) {
    const seed = await repository.getInventoryPlace(r.placeId);
    if (!seed) return { ok: true, picks: [] };
    exclude = seed.place_id;
    cuisine = cuisine || (Array.isArray(seed.cuisines) && seed.cuisines.length ? lc(seed.cuisines[0], /^[a-z][a-z -]{1,30}$/) : null);
    metro = metro || (typeof seed.metro === "string" ? lc(seed.metro, /^[a-z0-9-]{2,40}$/) : null);
    // Similar means the same cuisine in the same metro. No cuisine on file: nothing honest to match.
    if (!cuisine) return { ok: true, picks: [] };
  }
  const near = { metro, lat: r.lat, lng: r.lng };
  const queryAsCuisine = !cuisine && r.query ? lc(r.query, /^[a-z][a-z -]{1,30}$/) : null;
  const searches = [];
  if (cuisine) searches.push(repository.searchRestaurants({ ...near, cuisine }));
  else {
    if (queryAsCuisine) searches.push(repository.searchRestaurants({ ...near, cuisine: queryAsCuisine }));
    if (r.query) searches.push(repository.searchRestaurants({ ...near, nameLike: r.query }));
    if (!searches.length) searches.push(repository.searchRestaurants({ ...near }));
  }
  const seen = new Map();
  for (const rows of await Promise.all(searches)) for (const row of rows || []) if (row && row.place_id && row.place_id !== exclude && row.status === "OPERATIONAL" && !seen.has(row.place_id)) seen.set(row.place_id, row);
  const rows = [...seen.values()];
  if (!rows.length) return { ok: true, picks: [] };

  const [partners, links] = await Promise.all([
    repository.listVisiblePartners(env.VERCEL_ENV === "production" ? ["live"] : ["live", "demo"]),
    repository.listPlatformLinks(rows.map((x) => x.place_id).slice(0, 200)),
  ]);
  const partnerById = new Map((partners || []).filter((p) => partnerVisible(p, env)).map((p) => [p.place_id, p]));
  const linked = new Set((links || []).filter((l) => l && l.active !== false && /^[0-9]{1,9}$/.test(String(l.external_id ?? ""))).map((l) => l.place_id));

  const origin = { lat: r.lat, lng: r.lng };
  const wantsSlot = Boolean(r.date && r.time && r.party);
  const cands = [];
  for (const row of rows) {
    const partner = partnerById.get(row.place_id);
    const base = { placeId: row.place_id, name: row.name, locality: row.locality || null, cuisines: Array.isArray(row.cuisines) ? row.cuisines : [], score: rowScore(row), _d: miles(origin, row) };
    if (partner) {
      if (wantsSlot) {
        if (r.party > partner.max_party) continue;
        let open;
        try { open = await repository.slots(row.place_id, r.date, r.party); } catch { continue; } // can not verify: not offered
        const want = mins(r.time);
        const times = [...new Set((open || []).map(normSlot).filter(Boolean))].filter((t) => Math.abs(mins(t) - want) <= FIND_SLOT_WINDOW_MINUTES).sort();
        if (!times.length) continue;
        cands.push({ ...base, path: "wayfind", times });
      } else cands.push({ ...base, path: "wayfind" });
    } else if (linked.has(row.place_id)) cands.push({ ...base, path: "opentable" });
    else cands.push({ ...base, path: "none" });
  }
  cands.sort((a, b) => (BOOKABLE.has(b.path) ? 1 : 0) - (BOOKABLE.has(a.path) ? 1 : 0)
    || (b.score ?? -1) - (a.score ?? -1) || a._d - b._d || (a.placeId < b.placeId ? -1 : 1));
  return { ok: true, picks: cands.slice(0, FIND_MAX_PICKS).map(({ _d, ...pick }) => pick) };
}
