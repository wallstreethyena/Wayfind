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
    sellingOut: !!r.selling_out,
    city: r.city,
  };
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

  // hide-empty chip counts (over the full market set, before the chip filter)
  const chipCounts = { all: rows.length, [SELLING_OUT_KEY]: rows.filter((r) => r.selling_out).length };
  for (const c of CATEGORIES) chipCounts[c.key] = rows.filter((r) => Array.isArray(r.categories) && r.categories.includes(c.key)).length;

  // filter by active chip
  let view = rows;
  const active = cat || "all";
  if (active !== "all") {
    if (active === SELLING_OUT_KEY) view = rows.filter((r) => r.selling_out);
    else if (CATEGORY_BY_KEY[active]) view = rows.filter((r) => Array.isArray(r.categories) && r.categories.includes(active));
  }

  const ranked = rankExperiences(view.map(rowToCard));
  const total = ranked.length;
  const lim = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const pg = Math.max(Number(page) || 0, 0);
  const items = ranked.slice(pg * lim, pg * lim + lim);
  return { dark: false, items, total, chipCounts, markets: destIds, hasMore: (pg + 1) * lim < total, page: pg };
}
