// When a Viator rail has nothing to sell, switch to the next live partner.
// Order is fixed: GetYourGuide when NEXT_PUBLIC_GYG_PID is set, then Tiqets
// through Travelpayouts. Payout never chooses the order. An empty ladder
// stays the current empty rail.
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
