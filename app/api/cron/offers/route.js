// app/api/cron/offers/route.js — ingest for the SECOND inventory provider,
// Undercover Tourist (discounted attraction tickets) via CJ's Product/Shopping
// GraphQL API. Mirrors app/api/cron/experiences/route.js: pull → map → bulk
// upsert into wf_experiences (provider='undercover_tourist') through the service
// role. The same rails + wf_things_to_do RPC then render UT offers alongside
// Viator, unchanged.
//
// Fail-CLOSED auth (unset CRON_SECRET is NOT public). DORMANT until CJ_API_TOKEN
// exists in runtime — returns { ok:false, dark:true } and writes nothing, so it
// is safe to deploy today and lights up the moment the owner drops the token in
// Vercel (exactly like the Viator/CJ pattern). Nothing here HAND-BUILDS a
// product URL: booking_url is CJ's own pre-tagged `link`, used verbatim, and any
// product whose link doesn't carry our PID (101643573) is dropped rather than
// shown untracked.
import { sbEnv } from "../../../../lib/serverCache.js";
import { CJ_PID, CJ_UT_ADVERTISER, deriveMapsTo, ATTRACTION_PLACEMENT, offerLinkIsAttributed } from "../../../../lib/offers.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOKEN = () => ((process.env.CJ_API_TOKEN || "").trim());
const PAGE = 100;

// CJ GraphQL products query. companyId = our publisher (PID); partnerIds scopes
// to the Undercover Tourist advertiser. Field names follow CJ's Shopping schema;
// the mapper below is tolerant of missing fields so a minor schema drift degrades
// gracefully rather than 500-ing.
function query(offset) {
  return `{ products(companyId: "${CJ_PID}", partnerIds: ["${CJ_UT_ADVERTISER}"], limit: ${PAGE}, offset: ${offset}) {
    totalCount count
    resultList { id title description imageLink link linkCode price { amount currency } salePrice { amount currency } }
  } }`;
}

async function fetchPage(offset) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch("https://ads.api.cj.com/query", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: query(offset) }),
    });
    if (!r.ok) return { status: r.status, list: [], total: 0, error: `cj http ${r.status}: ${(await r.text()).slice(0, 160)}` };
    const d = await r.json();
    const prod = d && d.data && d.data.products;
    return { status: 200, list: Array.isArray(prod && prod.resultList) ? prod.resultList : [], total: (prod && prod.totalCount) || 0 };
  } catch (e) {
    return { status: 0, list: [], total: 0, error: String((e && e.message) || e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}

// CJ product → wf_experiences row. product_code is a stable synthetic id derived
// from CJ's own product id so re-runs upsert the same row. Any product with a
// non-attributed link (missing our PID) or an unmappable title is skipped.
function productToRow(p, nowIso) {
  const link = p && (p.link || p.linkCode || "");
  if (!offerLinkIsAttributed(link)) return null;
  const mapsTo = deriveMapsTo(p.title || "");
  if (!mapsTo) return null; // only ship offers we can place + match honestly
  const place = ATTRACTION_PLACEMENT[mapsTo] || {};
  const sale = p.salePrice && Number(p.salePrice.amount);
  const list = p.price && Number(p.price.amount);
  const from = Number.isFinite(sale) && sale > 0 ? sale : (Number.isFinite(list) && list > 0 ? list : null);
  const rawId = String(p.id || link).replace(/[^\w-]/g, "").slice(-24) || Math.abs(hash(link)).toString(36);
  return {
    product_code: `UT-${rawId}`,
    provider: "undercover_tourist",
    dest_id: place.dest_id || "663",
    city: place.city || "Orlando",
    title: String(p.title || "").slice(0, 200) || "Undercover Tourist tickets",
    product_url: link, // CJ's pre-tagged affiliate link, VERBATIM
    image: p.imageLink || null,
    rating: null,
    reviews: 0,
    from_price: from != null ? Math.round(from) : null,
    duration_min: null,
    selling_out: false,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    maps_to: mapsTo,
    categories: ["theme", "attractions"],
    flags: [],
    refreshed_at: nowIso,
  };
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const manual = new URL(req.url).searchParams.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!TOKEN()) return Response.json({ ok: false, dark: true, error: "no CJ_API_TOKEN in runtime — dormant" });
  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "no supabase service env" });

  const nowIso = new Date().toISOString();
  const byCode = new Map();
  let offset = 0, total = 0, firstErr = null, pages = 0;
  do {
    const { list, total: t, error, status } = await fetchPage(offset);
    if (error && !firstErr) firstErr = error;
    if (status !== 200) break;
    total = t || total;
    for (const p of list) { const row = productToRow(p, nowIso); if (row) byCode.set(row.product_code, row); }
    offset += PAGE; pages += 1;
  } while (offset < total && pages < 20);

  const rows = [...byCode.values()];
  let upserted = 0, upErr = null;
  if (rows.length) {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const r = await fetch(`${s.url}/rest/v1/wf_experiences?on_conflict=product_code`, { method: "POST", headers: h, body: JSON.stringify(chunk), cache: "no-store" });
      if (r.ok) { upserted += chunk.length; } else { upErr = `upsert http ${r.status}: ${(await r.text()).slice(0, 160)}`; break; }
    }
  }
  return Response.json({ ok: !upErr, provider: "undercover_tourist", products: rows.length, upserted, error: upErr || firstErr }, { headers: { "Cache-Control": "no-store" } });
}
