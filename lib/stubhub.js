// lib/stubhub.js — StubHub affiliate link adapter. SHIPS DARK.
//
// Wayfind is NOT yet an approved StubHub affiliate. StubHub's North America
// program runs on Partnerize; its deep links look like
//   https://stubhub.prf.hn/click/camref:<CAMREF>/destination:<URL-encoded stubhub.com URL>
// When the owner is approved he sets Vercel env STUBHUB_PARTNERIZE_CAMREF and
// StubHub links start working with no code change. Until then (unset, empty,
// Vercel's "[SENSITIVE]" placeholder, or a malformed value) every builder
// returns null and /api/stubhub/go refuses with a non-redirect response, so an
// unattributed stubhub.com link can never be handed to a visitor.
//
// Same shape as Ticketmaster: the UI never renders a stubhub.com or prf.hn URL;
// it links to stubhubGoUrl(), and the server route validates the destination and
// attributes it at the 302. Nothing renders StubHub in the UI yet.
//
// The env var is read at CALL time (not import time) so the route follows a
// Vercel env change on the next cold start and the guard can flip it in-process.

import { credential } from "./envPlaceholder.js";

const PARTNERIZE_HOST = "stubhub.prf.hn";
const CAMREF_RE = /^[A-Za-z0-9]{3,40}$/;

/**
 * True only for an https URL whose host is exactly stubhub.com or a real
 * subdomain of it (www., m., etc). Rejects http, javascript:, userinfo tricks
 * (https://stubhub.com@evil.io), lookalikes (stubhub.com.evil.io, evilstubhub.com)
 * and non-default ports.
 */
export function isStubhubUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.port) return false;
    const h = u.hostname.toLowerCase().replace(/\.$/, "");
    return h === "stubhub.com" || h.endsWith(".stubhub.com");
  } catch { return false; }
}

/** The configured Partnerize camref, or "" when unset/placeholder/malformed (= dark). */
export function stubhubCamref() {
  const v = credential(process.env.STUBHUB_PARTNERIZE_CAMREF);
  return CAMREF_RE.test(v) ? v : "";
}

/** True when the program is live (a valid camref is configured). */
export function isStubhubLive() {
  return !!stubhubCamref();
}

/**
 * Server-only: the attributed Partnerize deep link for a StubHub destination, or
 * null when dark or when the destination is not StubHub.
 */
export function stubhubPartnerizeUrl(destination) {
  if (!isStubhubUrl(destination)) return null;
  const camref = stubhubCamref();
  if (!camref) return null;
  return `https://${PARTNERIZE_HOST}/click/camref:${camref}/destination:${encodeURIComponent(String(destination).trim())}`;
}

/**
 * The internal href the UI would use (nothing renders it yet). Returns null when
 * the destination is not a StubHub URL. It does NOT depend on the camref: the
 * link target is our own route, which fails closed while the program is dark.
 */
export function stubhubGoUrl(destination, opts = {}) {
  if (!destination || !isStubhubUrl(destination)) return null;
  const q = new URLSearchParams({ url: String(destination).trim() });
  if (opts.surface) q.set("surface", String(opts.surface));
  if (opts.contentId) q.set("content", String(opts.contentId));
  if (opts.offerId) q.set("offer", String(opts.offerId));
  return "/api/stubhub/go?" + q.toString();
}
