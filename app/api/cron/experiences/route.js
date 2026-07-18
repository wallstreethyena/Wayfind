// app/api/cron/experiences/route.js — nightly ingest for Experiences v3. Pulls
// real bookable Viator products for the 5 Florida markets × 11 catalogs via the
// verified structured search (filtering.destination + filtering.tags), maps each
// to a wf_experiences row, and bulk-upserts through the service role. The client
// rail then reads the TABLE (fast, no per-request Viator cost).
//
// Fail-CLOSED auth (unset CRON_SECRET is NOT public). Fail-SOFT everything else
// (no key / no service env / upstream error -> ok:false with a reason, never a
// 500). Nothing here builds a product URL — product_url is the API's own value.
import { DESTS, CATEGORIES, productToRow } from "../../../../lib/experiencesData.js";
import { sbEnv } from "../../../../lib/serverCache.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = () => ((process.env.VIATOR_API_KEY || "").trim());
const VH = () => ({ "exp-api-key": KEY(), "Accept": "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" });
const PER_CATEGORY = 50;

async function searchDestTag(destId, tag) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch("https://api.viator.com/partner/products/search", {
      method: "POST", signal: ctrl.signal, headers: VH(),
      body: JSON.stringify({ filtering: { destination: String(destId), tags: [tag] }, sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" }, pagination: { start: 1, count: PER_CATEGORY }, currency: "USD" }),
    });
    if (!r.ok) return { status: r.status, products: [] };
    const d = await r.json();
    return { status: 200, products: Array.isArray(d.products) ? d.products : [] };
  } catch (e) {
    return { status: 0, products: [], error: String((e && e.message) || e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}

// bounded-concurrency runner (keeps 55 fan-out calls under maxDuration)
async function pool(thunks, limit) {
  const out = []; let i = 0;
  async function worker() { while (i < thunks.length) { const idx = i++; out[idx] = await thunks[idx](); } }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return out;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const manual = new URL(req.url).searchParams.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!KEY()) return Response.json({ ok: false, error: "no VIATOR_API_KEY in runtime" });
  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "no supabase service env" });

  const jobs = [];
  for (const d of DESTS) for (const c of CATEGORIES) jobs.push({ d, c });
  const raw = await pool(jobs.map((j) => () => searchDestTag(j.d.destId, j.c.tag).then((res) => ({ ...res, d: j.d, c: j.c }))), 10);

  // one row per product; categories[] merged across every dest×tag pull it hit
  const byCode = new Map();
  const coverage = {};
  for (const { products, d, c, status } of raw) {
    coverage[d.city] = coverage[d.city] || {};
    coverage[d.city][c.key] = status === 200 ? products.length : ("e" + status);
    for (const p of products) {
      const base = productToRow(p, d.destId, d.city);
      if (!base) continue;
      const hit = byCode.get(base.product_code);
      if (hit) hit.cats.add(c.key);
      else byCode.set(base.product_code, { row: base, cats: new Set([c.key]) });
    }
  }
  const nowIso = new Date().toISOString();
  const rows = [...byCode.values()].map(({ row, cats }) => ({ ...row, categories: [...cats], refreshed_at: nowIso }));

  // bulk upsert (merge-duplicates on product_code), chunked
  let upserted = 0, upErr = null;
  if (rows.length) {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const r = await fetch(`${s.url}/rest/v1/wf_experiences?on_conflict=product_code`, { method: "POST", headers: h, body: JSON.stringify(chunk), cache: "no-store" });
      if (r.ok) { upserted += chunk.length; } else { upErr = `upsert http ${r.status}: ${(await r.text()).slice(0, 160)}`; break; }
    }
  }
  return Response.json({ ok: !upErr, products: rows.length, upserted, error: upErr, coverage }, { headers: { "Cache-Control": "no-store" } });
}
