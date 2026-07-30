// lib/commerceProviders.js — WHO we may redirect to, and how an offer id becomes
// a destination URL.
//
// This lives in lib/ rather than inside app/api/commerce/go/route.js for one
// concrete reason: a Next.js route module may only export the handler and a few
// known config keys, so anything exported for a guard to CALL would break the
// build. Keeping the decision logic here means scripts/check-commerce-redirect.mjs
// can invoke these functions against real inputs instead of grepping the route's
// source — CLAUDE.md, "assert on the CALL, not on the string".
//
// THE SECURITY PROPERTY THIS FILE HOLDS
// A destination is NEVER accepted from the request. `resolveOffer` looks an id up
// in our own table and takes the URL from that row, so there is no request that
// makes this emit an arbitrary host. `isAllowedHost` is the second gate, applied
// to data we already control, and it defends against a poisoned/edited row rather
// than a crafted URL. Both are needed: drop the first and it is an open redirect;
// drop the second and one bad row in wf_experiences becomes an outbound link to
// anywhere.

import { withViatorTracking } from "./affiliates.js";

/**
 * Where a failed redirect lands. Our own site, always — never a partner guess.
 *
 * "/" and not "/things-to-do": app/things-to-do/ holds ONLY a [city] segment, so
 * the bare path has no page and the fallback would have 302'd a user who clicked
 * "book" straight into a 404. Caught by next build, missed by the first version of
 * check-commerce-redirect because it asserted the CONSTANT rather than whether the
 * path resolves to a real page — the same "assert on the call, not the string"
 * mistake the guard was written to prevent. The guard now checks the route exists.
 */
export const FALLBACK = "/";

/**
 * Providers this route will redirect to, and the ONLY hosts each may reach.
 * A provider absent here is dark: its offers cannot be redirected at all.
 * WeGoTrip and Klook are deliberately NOT here — verified 2026-07-30, neither has
 * food inventory in any Wayfind metro (WeGoTrip has no Sarasota page at all), so
 * wiring them would ship a link to an empty page.
 */
export const PROVIDERS = {
  viator: {
    table: "wf_experiences",
    idColumn: "product_code",
    urlColumn: "product_url",
    hosts: [/(^|\.)viator\.com$/i],
    track: withViatorTracking,
  },
};

/** True only for an http(s) URL whose hostname matches one of `hosts`. */
export function isAllowedHost(rawUrl, hosts) {
  if (!rawUrl || !Array.isArray(hosts) || !hosts.length) return false;
  let u;
  try { u = new URL(rawUrl); } catch { return false; }
  // javascript: and data: both parse as valid URLs — without this check a stored
  // "javascript:..." value would become a live link on our own domain.
  if (!/^https?:$/.test(u.protocol)) return false;
  return hosts.some((rx) => rx.test(u.hostname));
}

/**
 * Resolve an offer id to its destination URL, reading OUR table.
 * @returns {Promise<{dest?:string, error?:string}>} never throws.
 */
export async function resolveOffer(provider, offerId, deps = {}) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { error: "unknown-provider" };
  if (!offerId) return { error: "missing-offer" };
  let sbEnv = deps.sbEnv;
  if (!sbEnv) ({ sbEnv } = await import("./serverCache.js"));
  const s = sbEnv();
  if (!s) return { error: "no-service-env" };
  const doFetch = deps.fetch || fetch;
  const url =
    `${s.url}/rest/v1/${cfg.table}?select=${cfg.idColumn},${cfg.urlColumn}` +
    `&${cfg.idColumn}=eq.${encodeURIComponent(offerId)}&limit=1`;
  let rows;
  try {
    const r = await doFetch(url, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
      cache: "no-store",
    });
    if (!r.ok) return { error: `table-${r.status}` };
    rows = await r.json();
  } catch { return { error: "fetch-error" }; }
  if (!Array.isArray(rows) || !rows.length) return { error: "offer-not-found" };
  const raw = rows[0][cfg.urlColumn];
  if (!raw) return { error: "offer-has-no-url" };
  if (!isAllowedHost(raw, cfg.hosts)) return { error: "host-not-allowed" };
  // Tracking is applied AFTER the allowlist check, so a wrapper can never be what
  // sneaks a disallowed host past it; and if wrapping somehow changes the host we
  // fall back to the row's own verified URL rather than trusting the wrapper.
  const dest = cfg.track ? cfg.track(raw) : raw;
  return { dest: isAllowedHost(dest, cfg.hosts) ? dest : raw };
}
