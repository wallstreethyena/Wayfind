// When a Viator rail has nothing to sell, switch to the next live partner.
// GetYourGuide first (2026-11-28, owner decision): Viator rails are tours, and
// GetYourGuide sells the same kind of tour, so it is the closest fit. Tiqets
// (attraction tickets, Travelpayouts) is next. Payout never chooses the order.
// An empty ladder stays the current empty rail.
//
// The 2026-11-23 shutdown said a GetYourGuide button "resolved to the Wayfind
// homepage". A typed /api/commerce/go link from a test session lands on our
// homepage for EVERY provider, Tiqets included (checked 2026-11-28): the
// redirect traffic gate refuses QA, verifier and burst traffic before any
// partner is resolved (lib/redirectTrafficClass.js). Real visitors resolve to the
// GetYourGuide city search with partner_id. The pid is read with a literal
// process.env access below so Next inlines it into the client bundle; the
// old `env.NEXT_PUBLIC_GYG_PID` read was always empty in the browser.
import { credential } from "./envPlaceholder.js";
import { isTpProgramLive, TP_PROGRAMS } from "./travelpayouts.js";
import { commerceHref } from "./commerce.js";

const PARTNER_LABEL = Object.freeze({
  viator: "Viator",
  getyourguide: "GetYourGuide",
  tiqets: "Tiqets",
});

export function railSearchOfferId(query) {
  const slug = String(query || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (slug.length < 2) return null;
  return "q-" + slug;
}

export function searchTextFromOfferId(offerId) {
  const id = String(offerId || "");
  if (!/^q-[a-z0-9-]{2,40}$/.test(id)) return null;
  const text = id.slice(2).replace(/-/g, " ").trim();
  if (!/^[a-z0-9 ]{2,40}$/.test(text)) return null;
  return text;
}

export function gygPidFrom(env = process.env) {
  // Literal read when no test env is passed: Next only inlines
  // `process.env.NEXT_PUBLIC_*` written out in full.
  if (env === process.env) return credential(process.env.NEXT_PUBLIC_GYG_PID) || "";
  return credential(env && env.NEXT_PUBLIC_GYG_PID) || "";
}

export function gygSearchDestination(offerId, env = process.env) {
  const pid = gygPidFrom(env);
  const q = searchTextFromOfferId(offerId);
  if (!pid || !q) return null;
  const u = new URL("https://www.getyourguide.com/s/");
  u.searchParams.set("q", q);
  u.searchParams.set("partner_id", pid);
  return u.toString();
}

export function tiqetsSearchDestination(offerId) {
  const q = searchTextFromOfferId(offerId);
  if (!q || !isTpProgramLive("tiqets")) return null;
  const u = new URL("/en/search", TP_PROGRAMS.tiqets.home);
  u.searchParams.set("q", q);
  return u.toString();
}

export function viatorRailFallback({ items, env = process.env, tiqetsLive } = {}) {
  // An empty list is the switch: ledger_denied, an error, and zero results all
  // arrive as no products. A rail that already has products stays on Viator.
  const count = Array.isArray(items) ? items.length : 0;
  if (count > 0) return { partner: "viator", label: PARTNER_LABEL.viator };
  // GetYourGuide only when its publisher id is configured; the resolver in
  // commerceProviders fails closed without it, so an unset pid never offers it.
  if (gygPidFrom(env)) return { partner: "getyourguide", label: PARTNER_LABEL.getyourguide };
  const tiqets = tiqetsLive == null ? isTpProgramLive("tiqets") : !!tiqetsLive;
  if (tiqets) return { partner: "tiqets", label: PARTNER_LABEL.tiqets };
  return { partner: null, label: "" };
}

export function railFallbackHref({ partner, query, surface = "viator_rail", contentId } = {}) {
  if (partner !== "getyourguide" && partner !== "tiqets") return null;
  const offerId = railSearchOfferId(query);
  if (!offerId) return null;
  return commerceHref({ provider: partner, offerId, surface, contentId });
}
