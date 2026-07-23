export const runtime = "nodejs";
// /api/place-products — given a batch of Google place_ids, return the ONE
// verified booking product per place (wf_place_products, rn = 1, Cowork's
// verified-product rule). The place-card booking button renders ONLY for a
// place that comes back here: "no verified product, no button" (owner — kill
// the generic 'Search Viator' fallback that sent people to wrong-geo searches).
// This is a same-origin Supabase read via the service role → ANTI-SCRAPING
// guard in middleware.js's matcher, NOT a cost gate (no metered upstream).
import { NextResponse } from "next/server";

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// Google place ids are [A-Za-z0-9_-]; hard-filter so nothing else reaches the
// PostgREST in.() clause (no injection, no encoding surprises).
const SAFE_ID = /^[A-Za-z0-9_-]{6,128}$/;

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const ids = Array.isArray(body.ids)
    ? Array.from(new Set(body.ids.filter((x) => typeof x === "string" && SAFE_ID.test(x)))).slice(0, 80)
    : [];
  if (!ids.length) return NextResponse.json({ products: {} }, { status: 200 });

  const s = sb();
  if (!s) return NextResponse.json({ products: {} }, { status: 200 }); // fail-soft: no button rather than a wrong one

  try {
    const inList = ids.join(",");
    const r = await fetch(
      `${s.url}/rest/v1/wf_place_products?rn=eq.1&place_id=in.(${inList})&select=place_id,provider,product_title,product_url`,
      { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" }
    );
    const rows = r.ok ? await r.json() : [];
    const products = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row && row.place_id && row.product_url) {
        products[row.place_id] = { provider: row.provider || "viator", url: row.product_url, title: row.product_title || "" };
      }
    }
    return NextResponse.json({ products }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ products: {} }, { status: 200 });
  }
}
