// lib/eatInventory.js — /eat SSG must not wait on the network.
//
// THE DEFECT, Vercel dpl_96WvKbByKsXtTqJrxJAtM9GzmVHJ (2026-08-29 18:33Z,
// merge SHA df2292c3 / #1021):
//   Error: Static page generation for /eat/tampa/indian is still timing out
//   after 3 attempts. Static worker SIGTERM at 60 seconds. Many
//   /eat/{metro}/{cuisine} pages (tampa, orlando, manatee-sarasota) were
//   restarted for taking >60s, plus
//   /florida-events/anastasia-manatee-performing-arts-2026.
//
// #1022 made landings/guides inventory-first and skip Places at
// NEXT_PHASE=phase-production-build. That did NOT cover /eat. /eat never
// called Places — it called wf_cuisine_chips / wf_cuisine_places and
// wf_experiences with bare fetch() and no deadline. A hang is not an
// exception (lib/fetchDeadline.js), so the existing try/catch never ran.
//
// Ranking is never invented. SSG returns empty / "could not ask". Runtime
// ISR reads the owned inventory and ranks as before.
// This module is server-only. Do not import it from app/home.js.

import { isSsgBuild } from "./landingInventory.js";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { CUISINE_METROS } from "./cuisine.js";

export { isSsgBuild, CUISINE_METROS };

/** True when `next build` is prerendering, or a test forces the build flag. */
export function eatNetworkForbidden({ build } = {}) {
  return build === true || isSsgBuild();
}

function sb() {
  return {
    url: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""),
    anon: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
  };
}

/** Bounded fetch for /eat inventory. Drop-in for the page's bare fetch. */
export function eatFetch(input, init, ms) {
  return fetchDeadline(input, init, ms == null ? DB_DEADLINE_MS : ms);
}

/**
 * Owned-inventory RPC (wf_cuisine_chips / wf_cuisine_places).
 * SSG / next build: return null immediately — do not start a 60s hang.
 * Runtime: deadline, then null. Never throws. Never calls Places.
 */
export async function eatRpc(fn, body, opts) {
  if (eatNetworkForbidden({ build: opts && opts.build })) return null;
  const { url, anon } = sb();
  if (!url || !anon) return null;
  try {
    const r = await eatFetch(
      url + "/rest/v1/rpc/" + fn,
      {
        method: "POST",
        headers: { apikey: anon, Authorization: "Bearer " + anon, "content-type": "application/json" },
        body: JSON.stringify(body),
        next: { revalidate: 3600 },
      },
      opts && opts.deadlineMs,
    );
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * generateStaticParams for /eat/[metro]/[cuisine].
 * At SSG, return [] so Next does not prerender cuisine pages during
 * `next build`. ISR fills them. Returning pairs and then hanging on
 * wf_cuisine_places is what SIGTERM'd /eat/tampa/indian.
 */
export async function eatCuisineStaticParams(opts) {
  if (eatNetworkForbidden({ build: opts && opts.build })) return [];
  const out = [];
  for (const metro of Object.keys(CUISINE_METROS)) {
    const chips = await eatRpc("wf_cuisine_chips", { p_metro: metro }, opts);
    for (const c of chips || []) out.push({ metro, cuisine: c.cuisine });
  }
  return out;
}

/**
 * wf_experiences rows for the food-tour rail. SSG → []. Runtime: deadline.
 * Caller still pickFoodTours() — we do not invent tours.
 */
export async function eatExperienceRows(metro, dests, opts) {
  if (eatNetworkForbidden({ build: opts && opts.build })) return [];
  if (!dests || !dests.length) return [];
  const { url, anon } = sb();
  if (!url || !anon) return [];
  const cols = "product_code,title,image,rating,reviews,from_price,product_url,dest_id,link_ok";
  try {
    const r = await eatFetch(
      `${url}/rest/v1/wf_experiences?select=${cols}&dest_id=in.(${dests.join(",")})&limit=800`,
      {
        headers: { apikey: anon, Authorization: "Bearer " + anon },
        next: { revalidate: 3600 },
      },
      opts && opts.deadlineMs,
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
