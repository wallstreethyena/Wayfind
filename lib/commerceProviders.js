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
import { clippDeepLink } from "./deals.js";
import { clippOfferById } from "./clippOffers.js";

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
  // Clipp (Clipper Magazine / LocalFlavor via CJ) — local dining certificates.
  //
  // THREE WAYS THIS PROVIDER IS SHAPED DIFFERENTLY, EACH FOR A REASON:
  //
  // 1. `resolve` INSTEAD OF A TABLE. clipp.com is behind Akamai and 403s every
  //    non-browser fetcher — pages, robots.txt and sitemap.xml alike — so a real
  //    market page and a fabricated one are indistinguishable to anything
  //    automated. Membership in lib/clippOffers.js is therefore a hand-verified
  //    claim (each row carries the date, page title and offer count a human saw in
  //    a browser), not a row a cron can refresh. A table would imply we can
  //    re-verify these; we cannot.
  //
  // 2. `trackHosts`. Tracking here is a REDIRECT NETWORK, not a query-param
  //    append: the tracked URL lives on dpbolvw.net, a different host from the
  //    destination. `hosts` gates the destination we resolved; `trackHosts` gates
  //    the wrapper we hand the browser. Without the split, resolveOffer's
  //    "if wrapping changed the host, fall back to the row's URL" rule — correct
  //    for Viator, where tracking only adds params — would silently hand out the
  //    UNTRACKED clipp.com URL on every single click. That is the exact failure
  //    mode this lane exists to prevent: a link that works, converts, and pays
  //    nothing, while reading as success in every dashboard.
  //
  // 3. `requireTracking`. For this provider the raw-URL fallback is not a
  //    degraded success, it is a revenue leak, so it must error instead.
  clipp: {
    resolve: (offerId) => {
      const m = clippOfferById(offerId);
      return m ? m.dest : null;
    },
    hosts: [/(^|\.)clipp\.com$/i],
    track: (url) => clippDeepLink(url),
    trackHosts: [/(^|\.)dpbolvw\.net$/i],
    requireTracking: true,
  },
};

/**
 * The Supabase credentials this resolver reads with: the ANON key, not the
 * service role.
 *
 * THIS IS A CORRECTNESS FIX, NOT A PREFERENCE. The service-role key in this
 * project is still a legacy JWT, and lib/envAudit.js states the consequence
 * plainly: legacy keys were disabled 2026-07-16 and "401 on every call". A
 * resolver on that key would have returned `table-401` for every click, taken the
 * fail-soft path, and sent the user to the homepage — a dead money link whose only
 * trace is a provider_redirect_failed event. app/eat/[metro]/page.js already
 * carries the same note and already reads with anon for the same reason.
 *
 * Anon is also the CORRECT credential on the merits, not merely the working one:
 * this is a public read of an affiliate catalogue. `wf_experiences` carries policy
 * wf_experiences_anon_read — SELECT USING (true) — so anon reads every row, and a
 * redirect has no business holding write authority.
 */
export function readEnv() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

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
  // A provider whose offers live in an in-repo registry rather than a table (see
  // PROVIDERS.clipp) resolves here and skips the fetch entirely. The host and
  // tracking checks below are shared — they are the part that must not be
  // duplicated per provider, because they are what makes the destination safe.
  if (typeof cfg.resolve === "function") {
    let raw;
    try { raw = await cfg.resolve(offerId); } catch { return { error: "resolve-error" }; }
    if (!raw) return { error: "offer-not-found" };
    return finishDest(raw, cfg);
  }
  // Table-backed providers read with ANON, not the service role: that key is a
  // legacy JWT and legacy keys 401 on every call (lib/envAudit.js), so this path
  // would have failed for EVERY viator click and fail-softed the user to the
  // homepage. Clipp is unaffected — it resolves above without touching the DB.
  const env = deps.env || readEnv;
  const s = env();
  if (!s) return { error: "no-supabase-env" };
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
  return finishDest(raw, cfg);
}

/**
 * Shared tail of resolveOffer: gate the resolved destination, apply tracking, gate
 * the tracked URL. Split out so a table-backed and a registry-backed provider
 * cannot drift on the checks that actually keep the redirect safe.
 */
function finishDest(raw, cfg) {
  // Tracking is applied AFTER the allowlist check, so a wrapper can never be what
  // sneaks a disallowed host past it.
  if (!isAllowedHost(raw, cfg.hosts)) return { error: "host-not-allowed" };
  if (!cfg.track) return { dest: raw };
  const dest = cfg.track(raw);
  // Where tracking is a REDIRECT NETWORK the tracked URL is *supposed* to be on a
  // different host, so it is checked against trackHosts. Providers whose tracking
  // only appends params declare no trackHosts and are checked against `hosts`,
  // exactly as before.
  const okHosts = cfg.trackHosts || cfg.hosts;
  if (dest && isAllowedHost(dest, okHosts)) return { dest };
  // Wrapping failed or produced an unexpected host. For most providers the raw
  // verified URL is a fine degraded answer. For a provider marked
  // requireTracking, it is NOT: an untracked partner URL converts and pays
  // nothing, which is invisible in every dashboard, so fail loudly instead.
  if (cfg.requireTracking) return { error: "tracking-failed" };
  return { dest: raw };
}
