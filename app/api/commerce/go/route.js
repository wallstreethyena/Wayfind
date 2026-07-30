// app/api/commerce/go/route.js — the commerce redirect. GET → 302.
//
// THIS ROUTE IS THE MISSING HALF OF #469. lib/commerce.js `commerceHref()` has
// been returning "/api/commerce/go?..." since that PR merged, and nothing served
// it: every link built through the documented, schema-approved path would have
// 404'd. A money link that 404s is worse than no money link, because it looks
// shipped. This is that endpoint.
//
// WHAT IT IS FOR
// The UI never constructs a partner URL (lib/commerce.js rule 2). It links here
// with an OFFER ID; this route resolves that id to a destination server-side,
// mints the opaque click_id, records the handoff, and 302s. That is what makes a
// click attributable: the browser leaves our origin at the redirect, so the
// server is the only place the handoff can be witnessed.
//
// THE DESTINATION IS NEVER READ FROM THE REQUEST.
// `offer` is an id we look up in OUR OWN table; the URL comes from that row. A
// route that accepted a destination URL — even "validated" — is an open redirect,
// and an open redirect on a domain users trust is a phishing primitive. Because
// the URL can only come from wf_experiences, there is no input that makes this
// route emit an arbitrary host. The host allowlist below is a SECOND check on
// data we already control, defending against a poisoned row rather than a
// crafted request.
//
// NO sub_id ON THE OUTBOUND LINK (owner, 2026-07-29). The click_id is minted and
// recorded on OUR side only. lib/travelpayouts.js documents why an unverified
// extra param is how silent mis-attribution starts; this route keeps that
// discipline while still making every click attributable in PostHog.
//
// FAIL-SOFT. Any failure emits provider_redirect_failed with a reason AND the
// fallback taken, then sends the user somewhere real on our own site. A user who
// clicked "book" never lands on an error page.
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
// Explicit .js extensions: scripts/check-commerce-redirect.mjs imports this route
// under raw node ESM to drive the real handler, and node will not resolve an
// extensionless specifier. Next resolves both, so this costs nothing and is what
// makes the route executable by a guard.
import { captureServer, distinctIdFromCookies } from "../../../../lib/serverEvents.js";
import { commercePayload, rankBucket } from "../../../../lib/commerce.js";
import { PROVIDERS, FALLBACK, resolveOffer } from "../../../../lib/commerceProviders.js";
import { isCrawler } from "../../../../lib/crawler.js";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const provider = String(sp.get("provider") || "").trim().toLowerCase();
  const offerId = String(sp.get("offer") || "").trim();
  const surface = String(sp.get("surface") || "").trim();
  const contentId = String(sp.get("content") || "").trim();
  const rank = sp.get("rank");

  const clickId = randomUUID();
  const distinctId = distinctIdFromCookies(req.headers.get("cookie")) || clickId;

  const base = {
    provider, offer_id: offerId, surface, content_id: contentId,
    click_id: clickId, rank_bucket: rankBucket(rank),
  };

  const emit = (event, extra) => {
    // commercePayload enforces the field whitelist, so nothing outside the
    // schema can leave here even if a caller passes it.
    const props = commercePayload(event, { ...base, ...(extra || {}) });
    // Deliberately NOT awaited: a slow analytics POST must not delay the user's
    // redirect. Errors are swallowed inside captureServer.
    captureServer(event, { distinctId, properties: props });
  };

  const fail = (reason) => {
    try { emit("provider_redirect_failed", { failure_reason: reason }); } catch {}
    // Built by hand rather than via Response.redirect(), which sets no cache
    // headers: a CDN-cached failure 302 would serve one user's outcome to
    // everyone after them and suppress every later provider_redirect_failed,
    // hiding a broken provider behind a cache hit. Caught by
    // scripts/check-commerce-redirect.mjs on its first run.
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL(FALLBACK, req.url).toString(),
        "Cache-Control": "no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    });
  };

  // Refuse crawlers BEFORE resolving anything: no partner URL is even looked up,
  // so there is no path from an automated request to a CJ click.
  if (isCrawler(req.headers.get("user-agent"))) return fail("crawler-refused");

  if (!provider || !offerId) return fail("missing-provider-or-offer");
  if (!PROVIDERS[provider]) return fail("unknown-provider");

  const { dest, error } = await resolveOffer(provider, offerId);
  if (error || !dest) return fail(error || "unresolved");

  try { emit("provider_redirect_started"); } catch {}
  return new Response(null, {
    status: 302,
    headers: {
      Location: dest,
      // A redirect that carries a click_id must never be cached — a cached 302
      // would hand every later user the FIRST user's click_id and collapse
      // attribution to one person.
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}
