// lib/placeIndex.js — SERVER-ONLY. Reads the permanent wf_place_ids index (written
// by lib/serverCache.upsertPlaceIds on every successful server-proxy search).
//
// This index is the first ALLOWLIST for durable /places/[id] pages: an id that a
// real search has put in wf_place_ids gets a page. A second allowlist — a
// publish-ready Atlas card in data/atlas/editorial-cards.json — also opens
// /places/{id}, built from copy we already hold, with NO Google call.
// Any other id -> 404 with NO Google call, so a crawler enumerating Place-ID
// space costs one cheap Supabase read, never quota.
//
// SITEMAP MEMBERSHIP (2026-09-23 SEO recovery). listIndexedIds() used to union
// the 500 most-recently-SEARCHED wf_place_ids (order=seen_at.desc) with the
// Atlas + GUIDES allowlists. That set churns with whatever a crawler or a
// reader most recently typed (Salt Lake City, a VA hospital, Buffalo — none
// Wayfind territory) and most of those searched-only ids have no durable
// content, so they render noindex the moment they're indexed at all: the
// sitemap listed URLs the page itself refused to index. listIndexedIds() now
// returns only DURABLY ELIGIBLE ids — Atlas publish-ready cards, GUIDES picks
// with a substantive blurb, and verified wf_editorial_servable rows with a
// real why_here — the exact same set lib/placeData.js isIndexable() would
// say yes to. See lib/placeEligibility.js for the shared predicate.
import { sbEnv } from "./serverCache";
import { listPublishReadyAtlasIds, unionIndexedAndAtlasIds, atlasPlaceFor } from "./atlasPlaceAllowlist";
import { listGuidePlaceIds, guidePlaceFor, guidePlaceHasSubstantiveDetail } from "./guidePlaceIndex";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { EDITORIAL_WHY_MIN_LEN, hasSubstantiveWayfindText, placeDurableEligibility } from "./placeEligibility.js";

// The skeleton row for an id, or null when it's not in the index (=> not allowlisted).
// Fields: place_id, name, lat, lng, category (nullable), signals { rating, reviews }.
export async function getSkeleton(id) {
  const s = sbEnv();
  if (!s || !id) return null;
  try {
    const r = await fetchDeadline(`${s.url}/rest/v1/wf_place_ids?place_id=eq.${encodeURIComponent(id)}&select=place_id,name,lat,lng,category,signals&limit=1`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    }, DB_DEADLINE_MS);
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch { return null; }
}

// The verified wf_editorial_servable row for one place_id, or null. Server-
// only, Supabase-only (NO Google), and fully fail-soft: any missing env,
// non-OK response, or thrown error returns null — loadPlace() must never
// 500 or lose an otherwise-eligible Atlas/guide page because this one extra
// join hiccuped. Reads the GATED VIEW (lib/editorialSource.js), never the
// raw wf_editorial table, and re-asserts verified=is.true itself even
// though the view already filters on it — belt and suspenders costs one
// query param, and this is the one signal isIndexable() partly rests on.
// ONE column list for BOTH editorial reads (the render-time read below and
// the sitemap-membership read in listVerifiedEditorialIds). They drifted
// once: the render read asked for a `name` column wf_editorial_servable does
// not have, PostgREST answered 400, the fail-soft path returned null, and
// every editorial-only id the sitemap listed rendered noindex (59 of 500 on
// the first preview). Sharing the list makes the two reads agree by
// construction.
export const EDITORIAL_SERVABLE_SELECT = "place_id,why_here,local_tip,best_time";

export async function getVerifiedEditorial(id) {
  const s = sbEnv();
  if (!s || !id) return null;
  try {
    const r = await fetchDeadline(
      `${s.url}/rest/v1/wf_editorial_servable?place_id=eq.${encodeURIComponent(id)}&verified=is.true&select=${EDITORIAL_SERVABLE_SELECT}&limit=1`,
      { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" },
      DB_DEADLINE_MS,
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return (Array.isArray(rows) ? rows[0] : null) || null;
  } catch { return null; }
}

// Rows (place_id, name, category) newest-first, capped. Kept for any caller
// that still wants the raw recently-searched set; the /places directory hub
// itself now renders from listEligiblePlaces() below, not this.
export async function listIndexedPlaces(limit = 500) {
  const s = sbEnv();
  if (!s) return [];
  try {
    const n = Math.min(Math.max(limit, 1), 1000);
    const r = await fetchDeadline(`${s.url}/rest/v1/wf_place_ids?select=place_id,name,category&order=seen_at.desc&limit=${n}`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    }, DB_DEADLINE_MS);
    if (!r.ok) return [];
    return (await r.json()).filter((x) => x && x.place_id && x.name);
  } catch { return []; }
}

// Publish-ready Atlas ids narrowed to the ones that actually clear
// placeDurableEligibility on their own (name + a real address — Atlas-590
// never carries lat/lng). A handful of cards (e.g. SeaWorld Orlando, ICON
// Park) have rich sourced copy but no address in the source TSV/card at
// all — real content, but no location we can state, so the page itself
// would render with no address and no map link. Listing it in the sitemap
// would be exactly the mismatch this file exists to prevent; the card stays
// visible (loadPlace() still renders it, unindexed) until it has one.
function eligibleAtlasIds() {
  return listPublishReadyAtlasIds().filter((id) => {
    const atlas = atlasPlaceFor(id);
    return placeDurableEligibility({ name: atlas && atlas.name, lat: null, lng: null, address: atlas && atlas.address, atlas, guide: null, editorial: null });
  });
}

// GUIDES-linked placeIds narrowed to the ones that clear placeDurableEligibility
// on the guide rung alone (same shape mergePlacePage would build for a
// guide-only merge: name + guide's own lat/lng, no address — GUIDES never
// contributes a street address, only a city). A GUIDES pick with no blurb, a
// stub-length one, or with no coordinates at all (some non-food-city guides
// carry only a city name, not lat/lng) is fine to SHOW — loadPlace() still
// renders it — but is not fine to proactively list in a sitemap, because it
// is not durably eligible on its own.
function eligibleGuidePlaceIds() {
  return listGuidePlaceIds().filter((id) => {
    const guide = guidePlaceFor(id);
    return placeDurableEligibility({ name: guide && guide.name, lat: guide && guide.lat, lng: guide && guide.lng, address: null, atlas: null, guide, editorial: null });
  });
}

// Batched wf_place_ids identity read for a list of ids — the one thing a
// verified-editorial row does NOT carry on its own (wf_editorial_servable
// has no lat/lng/address column). Fail-soft: any problem returns [], and the
// caller (listVerifiedEditorialIds / listEligiblePlaces) simply gets no
// identity for that batch rather than throwing. Capped defensively — this is
// only ever called with the (small) set of ids a Supabase query already
// returned, never an unbounded list.
// Chunked (the old single `in.(...)` read silently capped at 500 ids and
// built a very long URL). `tables` MUST mirror where loadPlace() itself reads
// identity for that kind of id, or the sitemap and robots disagree:
// curated guide/Atlas ids -> wf_place_ids (getSkeleton); verified editorial
// ids -> wf_place_ids then wf_inventory (getInventoryIdentity).
const IDENTITY_CHUNK = 150;
async function identityChunk(s, table, chunk) {
  try {
    const r = await fetchDeadline(
      `${s.url}/rest/v1/${table}?select=place_id,name,lat,lng,category&place_id=in.(${chunk.map(encodeURIComponent).join(",")})`,
      { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" },
      DB_DEADLINE_MS,
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows.filter((x) => x && x.place_id) : [];
  } catch { return []; }
}
async function placeIdentityRows(ids, tables = ["wf_place_ids"]) {
  const list = Array.isArray(ids) ? [...new Set(ids.filter(Boolean))].slice(0, 2000) : [];
  const s = sbEnv();
  if (!s || !list.length) return [];
  const found = new Map();
  for (const table of tables) {
    const todo = list.filter((id) => !found.has(id));
    for (let i = 0; i < todo.length; i += IDENTITY_CHUNK) {
      for (const row of await identityChunk(s, table, todo.slice(i, i + IDENTITY_CHUNK))) {
        // Keep the first row that can actually state identity.
        const prev = found.get(row.place_id);
        if (!prev || (!Number.isFinite(prev.lat) && Number.isFinite(row.lat))) found.set(row.place_id, row);
      }
    }
  }
  return [...found.values()];
}

// place_ids of every VERIFIED wf_editorial_servable row whose why_here clears
// EDITORIAL_WHY_MIN_LEN, narrowed to the ones we can also state an identity
// for (wf_place_ids has a name + lat/lng row for that id). Two Supabase
// reads, both fail-soft: no env / a bad response / a thrown error at either
// step returns [] rather than 500ing the sitemap build. An editorial id that
// clears the content bar but has no identity row stays OUT — loadPlace()
// still tries wf_place_ids at request time, this is only the PROACTIVE
// sitemap-membership list.
export async function listVerifiedEditorialIds() {
  const s = sbEnv();
  if (!s) return [];
  try {
    const r = await fetchDeadline(
      `${s.url}/rest/v1/wf_editorial_servable?verified=is.true&select=${EDITORIAL_SERVABLE_SELECT}&order=place_id.asc&limit=2000`,
      { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" },
      DB_DEADLINE_MS,
    );
    if (!r.ok) return [];
    const rows = await r.json();
    const withText = (Array.isArray(rows) ? rows : []).filter(
      (e) => e && e.place_id && typeof e.why_here === "string" && e.why_here.trim().length >= EDITORIAL_WHY_MIN_LEN,
    );
    if (!withText.length) return [];
    // Same two sources loadPlace() reads for an editorial id.
    const identity = await placeIdentityRows(withText.map((e) => e.place_id), ["wf_place_ids", "wf_inventory"]);
    const withIdentity = new Set(
      // Both coordinates, exactly as hasStatableIdentity() demands of the page.
      identity.filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lng)).map((x) => x.place_id),
    );
    // Sorted so listIndexedIds()'s `limit` slice keeps the same editorial ids
    // build to build, whatever order Supabase returned them in.
    return withText.map((e) => e.place_id).filter((id) => withIdentity.has(id)).sort();
  } catch { return []; }
}

// Curated ids (Atlas cards, GUIDES picks) that DO hold substantive Wayfind
// copy but were held back only because the card/guide record itself carries
// no location (Atlas-590 never has lat/lng; several non-food guides name only
// a city). loadPlace() resolves identity from wf_place_ids at request time
// (getSkeleton), so when that same row carries a name and coordinates the
// rendered page IS durably eligible and belongs in the sitemap. Without this
// rung ~170 substantive guide picks would silently drop out of the sitemap
// even though their pages index.
function curatedHeldBackForIdentity() {
  const out = [];
  for (const id of listPublishReadyAtlasIds()) {
    const atlas = atlasPlaceFor(id);
    if (!atlas || !hasSubstantiveWayfindText({ atlas })) continue;
    if (placeDurableEligibility({ name: atlas.name, lat: null, lng: null, address: atlas.address, atlas, guide: null, editorial: null })) continue;
    out.push({ id, name: atlas.name || null, address: atlas.address || null, atlas, guide: null });
  }
  for (const id of listGuidePlaceIds()) {
    const guide = guidePlaceFor(id);
    if (!guide || !guidePlaceHasSubstantiveDetail(guide)) continue;
    if (placeDurableEligibility({ name: guide.name, lat: guide.lat, lng: guide.lng, address: null, atlas: null, guide, editorial: null })) continue;
    out.push({ id, name: guide.name || null, address: null, atlas: null, guide });
  }
  return out;
}

// PURE. Which held-back curated candidates become durably eligible once the
// wf_place_ids identity row loadPlace() will read for them is applied. The
// same predicate the page uses, fed the same identity the page will see.
export function curatedIdsWithResolvedIdentity(candidates, identityRows) {
  const rows = new Map((Array.isArray(identityRows) ? identityRows : []).filter((r) => r && r.place_id).map((r) => [String(r.place_id), r]));
  const out = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const row = c && rows.get(String(c.id));
    if (!row) continue;
    const lat = typeof row.lat === "number" ? row.lat : null;
    const lng = typeof row.lng === "number" ? row.lng : null;
    if (placeDurableEligibility({ name: c.name || row.name, lat, lng, address: c.address, atlas: c.atlas, guide: c.guide, editorial: null })) out.push(String(c.id));
  }
  return out.sort();
}

async function curatedIdsEligibleViaIdentityRows() {
  const candidates = curatedHeldBackForIdentity();
  if (!candidates.length) return [];
  const rows = await placeIdentityRows(candidates.map((c) => c.id));
  return curatedIdsWithResolvedIdentity(candidates, rows);
}

// Durably eligible ids (for generateStaticParams + the sitemap): the union of
// publish-ready Atlas card ids, GUIDES picks with a substantive blurb, and
// verified-editorial ids whose identity we can state. Deliberately does NOT
// include the raw searched wf_place_ids set (see the module header) — a
// searched-only place still RENDERS at /places/{id} via dynamicParams (Google
// may still enrich it), it just is not proactively listed here or noindexed
// there, and it is not force-crawled by the sitemap either.
//
// Returned SORTED (plain string sort on the id) so the set — and therefore
// the sitemap — is stable build to build for the same underlying content,
// never shuffled by whatever order Supabase happened to return rows in.
export async function listIndexedIds(limit = 500) {
  const atlasIds = eligibleAtlasIds();
  const guideIds = eligibleGuidePlaceIds();
  const resolvedIds = await curatedIdsEligibleViaIdentityRows();
  const curated = unionIndexedAndAtlasIds(unionIndexedAndAtlasIds(atlasIds, guideIds), resolvedIds);
  const editorialIds = await listVerifiedEditorialIds();
  const united = unionIndexedAndAtlasIds(curated, editorialIds);
  // Membership is the FULL eligible set. The old `limit` slice kept only
  // ~50 of 720 verified editorial ids once the curated set passed ~450, so
  // the pages carrying Wayfind's own local tips mostly never reached the
  // sitemap. `limit` stays for call-site compatibility; 5000 is a hard cap
  // (well under the 50,000-URL sitemap limit).
  void limit;
  return [...new Set(united)].sort().slice(0, 5000);
}

// Ids to PRERENDER at build (generateStaticParams): the in-memory curated
// Atlas + GUIDES set only, no fetch. Editorial and identity-resolved pages
// render on demand (dynamicParams) and are then cached by ISR, so a build
// never fans out hundreds of extra Supabase reads.
export function listPrerenderIds() {
  return unionIndexedAndAtlasIds(eligibleAtlasIds(), eligibleGuidePlaceIds()).sort();
}

// The /places directory hub: DURABLY ELIGIBLE ids only (the same set
// listIndexedIds() puts in the sitemap), resolved to a display name+category
// and sorted alphabetically by name, capped. Previously this page rendered
// straight off listIndexedPlaces() — whatever a crawler most recently
// searched, name+category only, never checked for eligibility — so the
// directory itself (a page meant to be indexed) could link to pages the site
// was simultaneously telling Google not to index.
export async function listEligiblePlaces(limit = 200) {
  const ids = await listIndexedIds(limit);
  if (!ids.length) return [];
  const named = [];
  const unresolved = [];
  for (const id of ids) {
    const atlas = atlasPlaceFor(id);
    const guide = guidePlaceFor(id);
    const name = (atlas && atlas.name) || (guide && guide.name) || null;
    if (name) named.push({ place_id: id, name, category: (atlas && atlas.category) || (guide && guide.category) || null });
    else unresolved.push(id);
  }
  if (unresolved.length) {
    const rows = await placeIdentityRows(unresolved, ["wf_place_ids", "wf_inventory"]);
    for (const r of rows) {
      if (r.name) named.push({ place_id: r.place_id, name: r.name, category: r.category || null });
    }
  }
  return named.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}
