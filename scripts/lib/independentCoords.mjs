// scripts/lib/independentCoords.mjs — PURE decision logic for DATA PASS B
// (2026-10-15): which non-Google coordinates may be written into
// wf_inventory.independent_coords, and how the reviewed SQL looks.
// No network, no database. Used by scripts/backfill-coords-independent.mjs and
// locked by scripts/test-independent-coords-pass.mjs.
//
// TWO SOURCES, BOTH FREE, BOTH LICENSED FOR PERMANENT STORAGE:
//
//   wikidata        Wikidata item coordinate (P625). CC0 1.0: no attribution,
//                   no caching limit (https://www.wikidata.org/wiki/Wikidata:Licensing).
//                   Reached through the place_id -> Wikipedia article match the
//                   popularity provider already stored (wf_place_popularity,
//                   source 'wikipedia'), then the article's wikibase_item.
//   official_venue  The venue address an editor typed from the organiser's /
//                   venue's own published page (wf_events.address, with
//                   source_url + source_type), geocoded by the US Census Bureau
//                   geocoder (a US Government work: public domain, keyless).
//
// THE MATCH MUST BE LAWFUL, NOT ONLY THE COORDINATE. Google Places content may
// be cached 30 days (place_id indefinitely). So:
//   * The join key is always place_id (permitted indefinitely) or a link a
//     Wayfind editor made (wf_events.place_id).
//   * A Google coordinate is NEVER copied and NEVER used as evidence once it is
//     past its 30-day window. A Wikidata match is written only when a Google
//     coordinate that is drawable RIGHT NOW (row refreshed <= 30 d ago, or a
//     wf_place_ids sighting <= 30 d old) independently corroborates it within
//     corroborationLimitM(). No permitted corroboration -> HOLD (re-run later;
//     the generator is idempotent), never "use the old coordinate anyway".
//     The popularity match itself ran its 80-mile geo gate against whatever
//     Google coordinate the row had then, which for most rows was already past
//     30 days, so that gate is not accepted as evidence here.
//   * The stored entry carries only the licensed coordinate, the source ids and
//     the corroboration verdict (kind, observation time, distance). It never
//     carries a Google coordinate.
//   * An event address that looks like a Google formattedAddress (", USA"
//     suffix) is refused: its provenance cannot be shown to be the venue's own.

export const WIKIDATA_METHOD = "wikidata-p625-via-wikipedia-match";
export const OFFICIAL_ADDRESS_METHOD = "census-geocoder-official-address";
export const GOOGLE_WINDOW_DAYS = 30;
const DAY_MS = 86400000;
export const MATCH_CONFIDENCE_FLOOR = 0.55; // lib/popularity.js CONFIDENCE_FLOOR
export const WIKIDATA_DISAMBIGUATION_QID = "Q4167410";
export const CONFLICTING_ADDRESS_M = 150;

// Wide places (parks, attractions, beaches) have centroids that sit far from a
// business-style pin; storefronts must agree tightly.
const WIDE_CATEGORIES = new Set(["attractions", "beach", "activities"]);
export function corroborationLimitM(category, source = "wikidata") {
  const wide = WIDE_CATEGORIES.has(String(category || "").toLowerCase());
  if (source === "official_venue") return wide ? 1500 : 400; // Census interpolates along the street segment
  return wide ? 1500 : 250;
}

// Event source types that name the organiser, venue, ticketing or a public
// tourism/government body: the address came from the party that runs the place.
export const OFFICIAL_ADDRESS_SOURCE_TYPES = new Set([
  "official-organizer", "official-venue", "official", "official-ticketing", "visitor-bureau", "government",
  "organizer-with-corroboration", "tourism-authority", "official-tourism", "official_tourism", "tourism-bureau",
  "official-operator", "official-registration", "official-government-calendar", "tourism-board", "venue",
]);

export function validLatLng(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export function haversineM(a, b) {
  const R = 6371000, r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Only Google coordinates that are inside their 30-day window at `now` may be
// used as corroboration. Anything older (or undated, or future-dated) is
// dropped here, so a stale export can never smuggle expired content in.
export function permittedCorroborations(fresh, now) {
  const out = [];
  for (const f of Array.isArray(fresh) ? fresh : []) {
    if (!f || !validLatLng(f.lat, f.lng)) continue;
    const t = Date.parse(f.observed_at);
    if (!Number.isFinite(t) || t > now || now - t > GOOGLE_WINDOW_DAYS * DAY_MS) continue;
    out.push(f);
  }
  return out;
}

function corroborate(point, fresh, limitM, now) {
  const ok = permittedCorroborations(fresh, now);
  if (!ok.length) return { verdict: "none" };
  let best = null;
  for (const f of ok) {
    const d = haversineM(point, f);
    if (!best || d < best.d) best = { d, f };
  }
  const evidence = { corroboration: `google_places-${best.f.kind}`, corroboration_observed_at: best.f.observed_at, distance_m: Math.round(best.d), limit_m: limitM };
  return best.d <= limitM ? { verdict: "agree", evidence } : { verdict: "disagree", evidence };
}

// match: { place_id, title, confidence, fetched_at, category, served, fresh:[{kind,lat,lng,observed_at}] }
// wd:    { qid, disambiguation, dissolved, coords:[{lat,lng,rank}] } | null
export function classifyWikidata(match, wd, now, harvestedAt) {
  const r = (decision, reason, extra = {}) => ({ decision, reason, place_id: match.place_id, ...extra });
  if (!match.served) return r("reject", "not-served");
  if (!(Number(match.confidence) >= MATCH_CONFIDENCE_FLOOR)) return r("reject", "low-match-confidence");
  if (!wd || !wd.qid) return r("reject", "no-wikidata-item");
  if (wd.disambiguation) return r("reject", "disambiguation");
  if (wd.dissolved) return r("reject", "dissolved-or-demolished");
  const coords = (wd.coords || []).filter((c) => validLatLng(c.lat, c.lng));
  if (!coords.length) return r("reject", wd.wikipediaHasCoords ? "wikidata-no-coordinate-wikipedia-has" : "wikidata-no-coordinate");
  const preferred = coords.filter((c) => c.rank === "preferred");
  const pool = preferred.length ? preferred : coords.filter((c) => c.rank !== "deprecated");
  if (!pool.length) return r("reject", "wikidata-no-coordinate");
  if (pool.some((c) => haversineM(c, pool[0]) > 200)) return r("reject", "ambiguous-coordinate");
  const point = { lat: pool[0].lat, lng: pool[0].lng };
  const limit = corroborationLimitM(match.category, "wikidata");
  const c = corroborate(point, match.fresh, limit, now);
  if (c.verdict === "none") return r("hold", "no-permitted-corroboration", { qid: wd.qid });
  if (c.verdict === "disagree") return r("reject", "corroboration-distance", { qid: wd.qid, evidence: c.evidence });
  return r("write", "corroborated", {
    entry: {
      source: "wikidata", lat: point.lat, lng: point.lng, observed_at: harvestedAt, attribution: null,
      verified: true, method: WIKIDATA_METHOD, ref: wd.qid, license: "CC0-1.0",
      evidence: { wikipedia_title: match.title, match_confidence: Number(match.confidence), match_fetched_at: match.fetched_at, ...c.evidence },
    },
  });
}

export function looksLikeGoogleFormattedAddress(a) {
  return /,\s*(USA|United States)\s*$/i.test(String(a || ""));
}

function houseNumber(a) {
  const m = /^\s*(\d+)/.exec(String(a || ""));
  return m ? m[1] : null;
}

// group: { place_id, category, served, fresh:[...], events:[{event_id,address,city,source_type,source_url,census:{lat,lng,matchedAddress,tigerLineId}|null}] }
export function classifyOfficialAddress(group, now, harvestedAt) {
  const r = (decision, reason, extra = {}) => ({ decision, reason, place_id: group.place_id, ...extra });
  if (!group.served) return r("reject", "not-served");
  const usable = [];
  const why = [];
  for (const e of group.events || []) {
    if (!OFFICIAL_ADDRESS_SOURCE_TYPES.has(e.source_type)) { why.push("non-official-address-source"); continue; }
    if (looksLikeGoogleFormattedAddress(e.address)) { why.push("google-formatted-address"); continue; }
    if (!houseNumber(e.address)) { why.push("no-street-number"); continue; }
    if (!e.census || !validLatLng(e.census.lat, e.census.lng)) { why.push("no-census-match"); continue; }
    if (houseNumber(e.census.matchedAddress) !== houseNumber(e.address)) { why.push("census-house-number-differs"); continue; }
    usable.push(e);
  }
  if (!usable.length) return r("reject", why[0] || "no-official-address");
  for (const e of usable) if (haversineM(e.census, usable[0].census) > CONFLICTING_ADDRESS_M) return r("reject", "conflicting-official-addresses");
  const e = usable[0];
  const limit = corroborationLimitM(group.category, "official_venue");
  const c = corroborate(e.census, group.fresh, limit, now);
  if (c.verdict === "disagree") return r("reject", "corroboration-distance", { evidence: c.evidence });
  return r("write", c.verdict === "agree" ? "corroborated" : "editor-linked-official-address", {
    entry: {
      source: "official_venue", lat: e.census.lat, lng: e.census.lng, observed_at: harvestedAt, attribution: null,
      verified: true, method: OFFICIAL_ADDRESS_METHOD, ref: e.event_id, license: "public-domain (US Census Bureau geocoder; address from the venue/organiser page)",
      evidence: {
        address: e.address, source_url: e.source_url, source_type: e.source_type,
        census_matched_address: e.census.matchedAddress, tiger_line_id: e.census.tigerLineId || null,
        ...(c.verdict === "agree" ? c.evidence : { corroboration: "none-available" }),
      },
    },
  });
}

// ── SQL ──────────────────────────────────────────────────────────────────────
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Forward: for each (place_id, entry), append the entry ONLY when the row has
// no entry with the same source+method yet (idempotent, re-runnable). Never
// touches lat/lng/refreshed_at, never removes an element, never creates a row.
// Asserts afterwards that every listed place_id that still exists carries
// exactly one entry for that source+method.
export function forwardSql(writes, { title, header = "" } = {}) {
  if (!writes.length) throw new Error("forwardSql: nothing to write");
  const seen = new Set();
  const values = writes.map((w) => {
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(w.place_id)) throw new Error(`bad place_id ${w.place_id}`);
    const k = w.place_id + "|" + w.entry.source + "|" + w.entry.method;
    if (seen.has(k)) throw new Error(`duplicate write ${k}`);
    seen.add(k);
    if (w.entry.source === "google_places") throw new Error("forwardSql: a google_places entry can never be written by this pass");
    if (!validLatLng(w.entry.lat, w.entry.lng)) throw new Error(`bad coordinate for ${w.place_id}`);
    return `  (${sqlStr(w.place_id)}, ${sqlStr(JSON.stringify(w.entry))}::jsonb)`;
  });
  return `-- ${title}
${header}-- No explicit BEGIN/COMMIT: applied as ONE request (scripts/apply-migration.mjs /
-- the Management API), which Postgres runs as one implicit transaction, so the
-- assertion below rolls the whole pass back on failure.

create temp table _wf_ic_pass (place_id text primary key, entry jsonb not null);
insert into _wf_ic_pass (place_id, entry) values
${values.join(",\n")};

update public.wf_inventory t
   set independent_coords = coalesce(case when jsonb_typeof(t.independent_coords) = 'array' then t.independent_coords end, '[]'::jsonb)
                            || jsonb_build_array(p.entry)
  from _wf_ic_pass p
 where t.place_id = p.place_id
   and not exists (
     select 1 from jsonb_array_elements(coalesce(case when jsonb_typeof(t.independent_coords) = 'array' then t.independent_coords end, '[]'::jsonb)) e
      where e->>'source' = p.entry->>'source' and e->>'method' = p.entry->>'method');

do $$
declare bad int;
begin
  select count(*) into bad
    from _wf_ic_pass p join public.wf_inventory t using (place_id)
   where (select count(*) from jsonb_array_elements(t.independent_coords) e
           where e->>'source' = p.entry->>'source' and e->>'method' = p.entry->>'method') <> 1;
  if bad > 0 then raise exception 'independent_coords pass: % row(s) do not carry exactly one entry for this source+method', bad; end if;
end $$;

drop table _wf_ic_pass;
`;
}

// Reverse: removes exactly the entries this pass's source+method wrote, for
// exactly the listed place_ids; an array left empty goes back to NULL.
export function reverseSql(writes, { title } = {}) {
  const pairs = [...new Set(writes.map((w) => `${w.entry.source}|${w.entry.method}`))];
  if (pairs.length !== 1) throw new Error("reverseSql: one source+method per file");
  const [source, method] = pairs[0].split("|");
  const ids = writes.map((w) => `  (${sqlStr(w.place_id)})`).join(",\n");
  return `-- ${title}
-- REVERSE of the forward pass: removes only entries with source=${sqlStr(source)}
-- and method=${sqlStr(method)} from the listed rows. Nothing else changes.
begin;

create temp table _wf_ic_rev (place_id text primary key) on commit drop;
insert into _wf_ic_rev (place_id) values
${ids};

update public.wf_inventory t
   set independent_coords = nullif(coalesce((
         select jsonb_agg(e) from jsonb_array_elements(t.independent_coords) e
          where not (e->>'source' = ${sqlStr(source)} and e->>'method' = ${sqlStr(method)})), '[]'::jsonb), '[]'::jsonb)
  from _wf_ic_rev r
 where t.place_id = r.place_id
   and jsonb_typeof(t.independent_coords) = 'array'
   and exists (select 1 from jsonb_array_elements(t.independent_coords) e
                where e->>'source' = ${sqlStr(source)} and e->>'method' = ${sqlStr(method)});

commit;
`;
}
