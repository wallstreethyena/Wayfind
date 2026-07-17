// app/api/viator/experiences/route.js — THE EXPERIENCES ENGINE (v6.42, staging).
// A metro-wide, category-DEEP pull of real bookable Viator products — jet skis,
// airboats, parasail, kayak, fishing charters, food tours — geo-locked to the
// market's verified Viator destination id and merged into ONE deduped,
// categorized pool of HUNDREDS. Fixes the /api/viator/tours limits: one generic
// city query, capped at 20, then sliced to 8. This is a BREADTH engine (browse
// experiences), NOT the per-place booking CTA (that keeps its single-place gate).
//
// Uses the same server-side VIATOR_API_KEY + the same freetext endpoint +
// response shape + city-mode geo-lock as /api/viator/tours. Viator freetext
// search is free product discovery, so the fan-out costs latency (paid once per
// metro per cache window via warm-mem + edge cache), not money.
//
// NEW ROUTE, inert until called — adds no live behavior to the app. A client
// surface that consumes it ships separately, behind its own flag.
export const runtime = "nodejs";

import { MARKETS } from "../../../../lib/destinations";
import { EXP_CATEGORIES, buildPool } from "../../../../lib/experiencesEngine";

const getKey = () => ((process.env["VIATOR_API_KEY"] || "").trim());

const mem = new Map();
const TTL = 6 * 3600 * 1000;

async function pooled(items, worker, size = 6) {
  const out = []; let i = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx], idx); }
  });
  await Promise.all(runners);
  return out;
}

async function viatorFreetext(KEY, searchTerm, count, signal) {
  const res = await fetch("https://api.viator.com/partner/search/freetext", {
    method: "POST", signal,
    headers: { "exp-api-key": KEY, "Accept": "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" },
    body: JSON.stringify({ searchTerm, currency: "USD", searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count } }] }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const dest = (searchParams.get("dest") || "").trim().toLowerCase();
  const market = dest && MARKETS[dest] ? MARKETS[dest] : null;
  const cityName = market ? market.label : (searchParams.get("city") || "").trim().slice(0, 60);
  const destId = ((market && market.viator && market.viator.id) || searchParams.get("destId") || "").replace(/^d/i, "").toLowerCase();
  const cat = (searchParams.get("cat") || "").trim().toLowerCase();
  const perTerm = Math.min(Math.max(parseInt(searchParams.get("perTerm") || "30", 10) || 30, 5), 50);
  const cap = Math.min(Math.max(parseInt(searchParams.get("cap") || "180", 10) || 180, 10), 300);
  if (!cityName || !destId) return Response.json({ items: [], categories: [] });

  const regionTokens = cityName.toLowerCase().split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.length >= 4);
  const cats = cat ? EXP_CATEGORIES.filter((c) => c.key === cat) : EXP_CATEGORIES;

  const ck = `${destId}|${cat || "all"}|${perTerm}|${cap}`;
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) return Response.json(hit.payload, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });

  const KEY = getKey();
  if (!KEY) return Response.json({ items: [], categories: [], note: "viator key not configured" });

  const jobs = [];
  for (const c of cats) for (const term of c.terms) jobs.push({ category: c.key, term });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const resultSets = await pooled(jobs, async ({ category, term }) => {
      try { return { category, results: await viatorFreetext(KEY, `${cityName} ${term}`, perTerm, ctrl.signal) }; }
      catch (e) { return { category, results: [] }; }
    }, 6);

    const pool = buildPool(resultSets, destId, regionTokens).slice(0, cap);
    const counts = {};
    for (const it of pool) counts[it.category] = (counts[it.category] || 0) + 1;
    const categories = EXP_CATEGORIES.filter((c) => !cat || c.key === cat).map((c) => ({ key: c.key, label: c.label, icon: c.icon, count: counts[c.key] || 0 })).filter((c) => c.count > 0);

    const payload = { dest: dest || null, destId: "d" + destId, city: cityName, total: pool.length, categories, items: pool };
    try { console.log(JSON.stringify({ tag: "experiences_engine", dest, destId, jobs: jobs.length, total: pool.length, byCat: counts })); } catch (e) {}
    mem.set(ck, { payload, exp: Date.now() + TTL });
    return Response.json(payload, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch (e) {
    return Response.json({ items: [], categories: [] });
  } finally { clearTimeout(timer); }
}
