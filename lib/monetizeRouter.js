// lib/monetizeRouter.js — single-owner monetization decision layer (v6.42, flag-gated).
//
// RULE (owner directive, corrected): the user-relevant CANONICAL destination is
// primary. An affiliate route attaches ONLY when a verified + permitted route
// exists for THAT exact destination — the provider must be configured (ids
// present, server-side) AND the canonical URL must actually belong to that
// provider. When more than one verified route qualifies, pick the highest-
// paying. When none qualifies, the link stays CANONICAL. There is NO blanket
// fallback to an unrelated affiliate program — an unmatched click is never
// bent toward money it didn't ask for.
//
// SECRETS: every id/marker/aid is read from SERVER-SIDE env at call time. No
// hardcoded defaults, no NEXT_PUBLIC_ exposure. If an id is unset, that lane is
// simply not verified and the click stays canonical.
//
// Pure + dependency-free so scripts/test-monetize-router.mjs can lock the
// invariants without a network or a live key. This module NEVER performs a
// redirect and NEVER influences ranking — it only maps (intent, canonical) ->
// { url, owner }.

const cfg = () => ({
  STAY22_AID: (process.env["STAY22_AID"] || "").trim(),
  TP_MARKER: (process.env["TRAVELPAYOUTS_MARKER"] || "").trim(),
  KLOOK_TP_PROGRAM: (process.env["KLOOK_TP_PROGRAM"] || "").trim(),
  VIATOR_PID: (process.env["VIATOR_PARTNER_ID"] || "").trim(),   // server-side (NOT NEXT_PUBLIC)
  VIATOR_MCID: (process.env["VIATOR_MCID"] || "").trim(),
  UBEREATS_TEMPLATE: (process.env["UBEREATS_TEMPLATE"] || "").trim(),
});

const enc = (s) => encodeURIComponent(String(s || ""));
const isHttp = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };
const hostIs = (u, re) => { try { return re.test(new URL(u).hostname); } catch { return false; } };

// ── verified route builders. Each returns an affiliate URL ONLY when the
//    provider is configured AND the canonical host belongs to that provider
//    ("permitted"). Otherwise null -> caller keeps canonical. Each also carries
//    an economic weight so resolveClick can prefer the highest-paying verified
//    route when more than one qualifies. Weights are relative, not authoritative
//    payout figures — a real A/B on live bookings is the source of truth.
function viatorRoute(canonical, c) {
  if (!c.VIATOR_PID || !hostIs(canonical, /(^|\.)viator\.com$/i)) return null;
  const sep = canonical.includes("?") ? "&" : "?";
  const mc = c.VIATOR_MCID ? `&mcid=${enc(c.VIATOR_MCID)}` : "";
  return { url: `${canonical}${sep}pid=${enc(c.VIATOR_PID)}${mc}&medium=api`, owner: "viator", weight: 8 };
}
function klookRoute(canonical, c) {
  // Travelpayouts-mediated Klook. NOTE: the TP link tool mints shortened
  // per-URL tracking links; a directly-constructed redirect is UNVERIFIED until
  // a real click is confirmed in the TP dashboard. Until then this route stays
  // disabled (returns null) even when ids are present, so we never ship an
  // untracked "affiliate" link that silently pays nothing. Enable only after
  // the deep-link process is verified (env KLOOK_DEEPLINK_VERIFIED=on).
  if (!c.TP_MARKER || !c.KLOOK_TP_PROGRAM || !hostIs(canonical, /(^|\.)klook\.com$/i)) return null;
  if (String(process.env["KLOOK_DEEPLINK_VERIFIED"] || "").toLowerCase() !== "on") return null;
  return { url: `https://tp.media/r?marker=${enc(c.TP_MARKER)}&p=${enc(c.KLOOK_TP_PROGRAM)}&u=${enc(canonical)}`, owner: "klook", weight: 6 };
}
function stay22Route(canonical, lodgingCtx, c) {
  // Stay22 is a best-payer LODGING link optimizer — it needs a lodging context
  // (address/coords), not an arbitrary canonical. Permitted only for lodging
  // intent with a context; never wraps a non-lodging URL.
  if (!c.STAY22_AID || !lodgingCtx || (lodgingCtx.lat == null && !lodgingCtx.address)) return null;
  const p = new URLSearchParams({ aid: c.STAY22_AID, campaign: "wayfind" });
  if (lodgingCtx.address) p.set("address", lodgingCtx.address);
  if (lodgingCtx.lat != null && lodgingCtx.lng != null) { p.set("maplat", String(lodgingCtx.lat)); p.set("maplng", String(lodgingCtx.lng)); }
  if (lodgingCtx.checkin) p.set("checkin", lodgingCtx.checkin);
  if (lodgingCtx.checkout) p.set("checkout", lodgingCtx.checkout);
  return { url: `https://www.stay22.com/allez/${enc(c.STAY22_AID)}?${p.toString()}`, owner: "stay22", weight: 7 };
}
function uberEatsRoute(canonical, c) {
  if (!c.UBEREATS_TEMPLATE || !hostIs(canonical, /(^|\.)ubereats\.com$/i)) return null;
  return { url: c.UBEREATS_TEMPLATE.replace("{url}", enc(canonical)), owner: "ubereats", weight: 5 };
}

// intent -> the candidate route builders permitted for it. An intent only ever
// considers its own providers; nothing is cross-routed.
function candidatesFor(intent, canonical, lodgingCtx, c) {
  switch (intent) {
    case "hotel": case "lodging":        return [stay22Route(canonical, lodgingCtx, c)];
    case "attraction_ticket": case "ticket": return [klookRoute(canonical, c)];
    case "tour": case "experience":      return [viatorRoute(canonical, c)];
    case "food_delivery":                return [uberEatsRoute(canonical, c)];
    case "vacation_rental":              return []; // VRBO wrapper lives in affiliates.js; no /go route yet
    default:                             return []; // unclassified -> canonical only (NO blanket routing)
  }
}

// THE DECISION. Returns { url, owner }. `owner` is "canonical" whenever no
// verified+permitted route qualifies — the user still reaches where they meant
// to go. Highest-weight verified route wins when several qualify.
export function resolveClick({ intent, canonical, lodgingCtx } = {}) {
  const safe = isHttp(canonical) ? canonical : null;
  if (!safe) return { url: null, owner: "canonical" };
  const c = cfg();
  const routes = candidatesFor(String(intent || "").toLowerCase(), safe, lodgingCtx, c).filter(Boolean);
  if (!routes.length) return { url: safe, owner: "canonical" };
  routes.sort((a, b) => b.weight - a.weight); // highest-paying verified route first
  const best = routes[0];
  return { url: best.url, owner: best.owner };
}

// Which lanes are BOTH configured AND verified right now — surfaced by the /go
// health check and the audit so coverage gaps are visible, never assumed.
export function coverageReport() {
  const c = cfg();
  return {
    hotel: !!c.STAY22_AID,
    attraction_ticket: !!(c.TP_MARKER && c.KLOOK_TP_PROGRAM && String(process.env["KLOOK_DEEPLINK_VERIFIED"] || "").toLowerCase() === "on"),
    tour: !!c.VIATOR_PID,
    experience: !!c.VIATOR_PID,
    food_delivery: !!c.UBEREATS_TEMPLATE,
  };
}

export const LANES = ["hotel", "attraction_ticket", "tour", "experience", "food_delivery"];
