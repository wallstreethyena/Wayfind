// app/api/cron/experiences-link-health/route.js — the nightly wf_experiences
// destination sweep. Walks the catalogue oldest-checked-first, asks Viator's
// own product endpoint whether each product still exists and is ACTIVE, and
// writes link_ok / fail_count / last_checked_at. Serving paths and
// /api/commerce/go refuse link_ok=false rows, so a product Viator retires
// stops being offered within a sweep cycle instead of 302ing users to
// Viator's "similar experiences" search page (the 2026-08-26 owner report).
//
// Fail-CLOSED auth (same contract as cron/experiences). Fail-SOFT everything
// else: an upstream 429/5xx or a missing key marks nothing dead — see
// classifyProductProbe. Never throws a 500.
import { sbEnv } from "../../../../lib/serverCache.js";
import { classifyProductProbe, nextHealthState } from "../../../../lib/experienceLinkHealth.js";
import { credential } from "../../../../lib/envPlaceholder.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = () => credential(process.env["VIATOR_API_KEY"]);
const VH = () => ({ "exp-api-key": KEY(), "Accept": "application/json;version=2.0", "Accept-Language": "en-US" });

async function probe(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch("https://api.viator.com/partner/products/" + encodeURIComponent(code), {
      cache: "no-store", signal: ctrl.signal, headers: VH(),
    });
    let body = null;
    if (r.status === 200) { try { body = await r.json(); } catch { body = null; } }
    return classifyProductProbe(r.status, body);
  } catch {
    return "unknown";
  } finally { clearTimeout(timer); }
}

// bounded-concurrency runner (same shape as cron/experiences)
async function pool(thunks, limit) {
  const out = []; let i = 0;
  async function worker() { while (i < thunks.length) { const idx = i++; out[idx] = await thunks[idx](); } }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return out;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const sp = new URL(req.url).searchParams;
  const manual = sp.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!KEY()) return Response.json({ ok: false, error: "no VIATOR_API_KEY in runtime" });
  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "no supabase service env" });
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "250", 10) || 250, 1), 400);
  // Oldest-checked first, never-checked before everything: a full 3,400-row
  // catalogue completes a sweep in ~2 weeks at 250/night, and every row a
  // sweep touches restarts at the back of the queue.
  const sel = `${s.url}/rest/v1/wf_experiences?select=product_code,link_ok,fail_count&provider=eq.viator&order=last_checked_at.asc.nullsfirst&limit=${limit}`;
  let rows;
  try {
    const r = await fetch(sel, { headers: h, cache: "no-store" });
    if (!r.ok) return Response.json({ ok: false, error: `select-${r.status}` });
    rows = await r.json();
  } catch { return Response.json({ ok: false, error: "select-fetch-error" }); }
  if (!Array.isArray(rows) || !rows.length) return Response.json({ ok: true, checked: 0 });

  const verdicts = await pool(rows.map((row) => () => probe(row.product_code)), 8);

  const nowIso = new Date().toISOString();
  const buckets = { alive: [], dead: [], unknown: [] }; // arrays of product_code
  const perRow = []; // rows needing an individual fail_count write
  rows.forEach((row, i) => {
    const next = nextHealthState(row, verdicts[i]);
    if (!next) { buckets.unknown.push(row.product_code); return; }
    if (next.link_ok === true) buckets.alive.push(row.product_code);
    else perRow.push({ code: row.product_code, next });
    if (next.link_ok === false) buckets.dead.push(row.product_code);
  });

  const inList = (codes) => codes.map((c) => `"${String(c).replace(/["\\]/g, "")}"`).join(",");
  const patch = async (filter, body) => {
    const r = await fetch(`${s.url}/rest/v1/wf_experiences?${filter}`, {
      method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(body), cache: "no-store",
    });
    return r.ok ? null : `patch-${r.status}`;
  };

  let err = null;
  if (buckets.alive.length) err = err || await patch(`product_code=in.(${encodeURIComponent(inList(buckets.alive))})`, { link_ok: true, fail_count: 0, last_checked_at: nowIso });
  for (const { code, next } of perRow) {
    err = err || await patch(`product_code=eq.${encodeURIComponent(code)}`, { link_ok: next.link_ok, fail_count: next.fail_count, last_checked_at: nowIso });
  }
  if (buckets.unknown.length) err = err || await patch(`product_code=in.(${encodeURIComponent(inList(buckets.unknown))})`, { last_checked_at: nowIso });

  return Response.json({
    ok: !err, error: err, checked: rows.length,
    alive: buckets.alive.length, newly_or_still_dead: buckets.dead.length, unknown: buckets.unknown.length,
  }, { headers: { "Cache-Control": "no-store" } });
}
