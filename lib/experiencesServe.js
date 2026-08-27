// lib/experiencesServe.js — SERVER-ONLY read of wf_experiences for the client
// rail. Resolves the user's market (metro/city or lat/lng + distance rung) to
// the relevant Viator dest(s), reads the cached rows, computes hide-empty chip
// counts, filters by the active chip, ranks, and paginates.
//
// FAIL-SOFT: if the service env is missing, the table doesn't exist yet, or the
// read errors, it returns { dark: true, items: [] } — the rail simply doesn't
// render. It never throws and never 500s (the rail "ships dark" until the
// migration + cron have run). Affiliate-only: never reads Score/ranking.
import { DESTS, DEST_BY_ID, CATEGORIES, CATEGORY_BY_KEY, SELLING_OUT_KEY, metroToDest, destsWithin, rankExperiences, fmtDuration } from "./experiencesData.js";
import { dropDeadLinkRows } from "./experienceLinkHealth.js";
import { CONCEPTS, isConcept } from "./experienceConcepts.js";

function rowToCard(r) {
  return {
    code: r.product_code,
    provider: r.provider || "viator",
    title: r.title,
    url: r.product_url,                       // raw Viator productUrl; pid-wrapped at render via lib/affiliates
    image: r.image || null,
    rating: typeof r.rating === "number" ? r.rating : null,
    reviews: typeof r.reviews === "number" ? r.reviews : 0,
    fromPrice: typeof r.from_price === "number" ? r.from_price : null,
    duration: fmtDuration(r.duration_min),
    categories: Array.isArray(r.categories) ? r.categories : [],
    // v8.71 — the harvested tags RESOLVED TO LABELS, server-side. The card
    // renders these as its category chips, and doing the lookup here rather
    // than in the client keeps lib/experiencesData's CATEGORIES table out of
    // the home bundle (check-bundle headroom is a few KB, and a label map is
    // not worth any of it). Unknown keys drop rather than render raw — a chip
    // reading "water" is worse than one fewer chip.
    chips: (Array.isArray(r.categories) ? r.categories : [])
      .map((k) => CATEGORY_BY_KEY[k])
      .filter(Boolean)
      .slice(0, 3)
      .map((c) => ({ key: c.key, icon: c.icon, label: c.label })),
    sellingOut: !!r.selling_out,
    city: r.city,
  };
}

/**
 * PURE. Apply the active browse chip to a set of wf_experiences rows.
 *
 * Exported and pure so scripts/check-subfilter-experience-coverage.mjs can CALL
 * it against real row shapes instead of regexing this file — the rest of
 * serveExperiences needs Supabase and cannot be exercised offline, and a
 * presence check over the source would pass on any of the three bugs below.
 *
 * Accepts three shapes of `active`:
 *   "all"                       every row
 *   SELLING_OUT_KEY             the demand chip
 *   "museums" | "a,b,c"         the UNION of those catalogue keys
 *
 * Two rules do the real work:
 *
 *   Unknown keys are DROPPED, and a value that resolves to no real catalogue
 *   returns ZERO rows, never all of them. That is the v6.99 spa fix (owner:
 *   "spa and wellness links make no sense", with a screenshot of kayak/manatee/
 *   dolphin tours under Spa & Wellness) — "spa" is not a Viator catalogue, it
 *   used to match neither branch, fall through, and return every row unfiltered,
 *   which the caller could not distinguish from a genuine match.
 *
 *   A COMMA-JOINED list unions its catalogues, because one key cannot describe
 *   a chip. "Outdoors" is nature AND adventure AND kayaking
 *   (lib/browseCommerceMap.js); mapping it to `adventure` alone hid 35 nature
 *   and 37 kayaking Sarasota products from the chip that should have shown them.
 *   The single-key case is just the one-element case of this, not a second path.
 */
export function filterByChip(rows, active) {
  const list = Array.isArray(rows) ? rows : [];
  const key = active || "all";
  if (key === "all") return list;
  if (key === SELLING_OUT_KEY) return list.filter((r) => r && r.selling_out);
  const parts = String(key).split(",").map((k) => k.trim()).filter(Boolean);
  // TWO KINDS OF KEY, unioned (2026-08-04).
  //
  //   HARVESTED  a lib/experiencesData CATEGORIES tag, present in categories[]
  //              because the cron found the product under that tag.
  //   DERIVED    a lib/experienceConcepts key, matched on the TITLE.
  //
  // The derived kind exists because the harvest pulls destination × tag and the
  // ground-truthed tag list has no food, nightlife, shopping or wellness tag —
  // so 35 food tours we already hold were invisible to every category filter on
  // the site. Classifying rows we have needs no re-harvest and no invented tag
  // id; adding real tags to the cron deepens the pool later.
  //
  // A `concept:` prefix keeps the namespaces from colliding: "family" is BOTH a
  // browse chip and a concept, and silently preferring one would be the kind of
  // accidental resolution this file already exists to prevent.
  const tags = parts.filter((k) => CATEGORY_BY_KEY[k]);
  const concepts = parts.filter((k) => k.startsWith("concept:")).map((k) => k.slice(8)).filter((k) => CONCEPTS[k]);
  if (!tags.length && !concepts.length) return [];
  return list.filter((r) => {
    if (!r) return false;
    if (tags.length && Array.isArray(r.categories) && tags.some((k) => r.categories.includes(k))) return true;
    if (concepts.length && concepts.some((k) => isConcept(k, r.title))) return true;
    return false;
  });
}

export async function serveExperiences({ metro, city, lat, lng, mi, cat, page, limit } = {}) {
  const { sbEnv } = await import("./serverCache.js");
  const s = sbEnv();
  if (!s) return { dark: true, reason: "no-service-env", items: [], total: 0, chipCounts: {}, markets: [] };

  // which of the 5 markets to include
  const loc = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  let destIds;
  if (loc && Number(mi) > 0) destIds = destsWithin(loc, mi);
  else {
    const d = metroToDest(metro || city) || (city ? DESTS.find((x) => x.city.toLowerCase() === String(city).toLowerCase()) : null);
    destIds = d ? [d.destId] : DESTS.map((x) => x.destId);
  }

  // fetch cached rows for those markets (select=* is deliberate — never name a
  // column that may not exist on an older table; fail soft to dark)
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const inList = destIds.map((x) => encodeURIComponent(x)).join(",");
  const url = `${s.url}/rest/v1/wf_experiences?select=*&dest_id=in.(${inList})&order=rating.desc.nullslast&limit=2000`;
  let rows = [];
  try {
    const r = await fetch(url, { headers: h, cache: "no-store" });
    if (!r.ok) return { dark: true, reason: `table-${r.status}`, items: [], total: 0, chipCounts: {}, markets: destIds };
    rows = await r.json();
  } catch (e) {
    return { dark: true, reason: "fetch-error", items: [], total: 0, chipCounts: {}, markets: destIds };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { dark: rows.length === 0, reason: rows.length === 0 ? "empty" : "shape", items: [], total: 0, chipCounts: {}, markets: destIds };
  }

  // 2026-08-26 link-health audit: a row the nightly sweep proved dead is not
  // an offer — same rule foodTours has always applied. Applied BEFORE the chip
  // counts so a count and its list keep coming from one array (v8.47.1 law).
  rows = dropDeadLinkRows(rows);

  // hide-empty chip counts (over the full market set, before the chip filter)
  const chipCounts = { all: rows.length, [SELLING_OUT_KEY]: rows.filter((r) => r.selling_out).length };
  for (const c of CATEGORIES) chipCounts[c.key] = rows.filter((r) => Array.isArray(r.categories) && r.categories.includes(c.key)).length;

  // filter by active chip — see filterByChip above for why an unknown key must
  // return zero rows rather than all of them, and why a comma-joined list is
  // unioned rather than treated as one unknown key.
  const active = cat || "all";
  const view = filterByChip(rows, active);

  const ranked = rankExperiences(view.map(rowToCard));
  const total = ranked.length;
  const lim = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const pg = Math.max(Number(page) || 0, 0);
  const items = ranked.slice(pg * lim, pg * lim + lim);
  return { dark: false, items, total, chipCounts, markets: destIds, hasMore: (pg + 1) * lim < total, page: pg };
}
