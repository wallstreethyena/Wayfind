// lib/guideCta.js — ONE primary CTA per guide, resolved through THE predicate.
//
// Hick's law: choice overload suppresses action. Guides currently render, PER
// PICK, a "Check tours & tickets" link, a "Check rates" link and an "Open in
// Wayfind" link, plus a floating pill at the bottom. Measured dwell on these
// pages is 0-25s and bounce is ~50%, so almost nobody reaches the end and the
// ones who do face a wall. This resolves exactly one monetized action per guide.
//
// THE SINGLE PREDICATE. Tour/attraction guides resolve through
// lib/bookingResolve.bookingTargets() — the same function the app's Detail sheet
// uses. Before this, guide pages called Aff.experienceGoUrl()/hotelSearchUrl()
// directly per pick, which is a parallel resolution path: two ways to turn a
// place into a booking href, which is how an earning link once rendered with no
// FTC disclosure. One predicate, two callers.
//
// Server-safe: no React, no browser globals, imports only server-safe libs.
import { bookingTargets } from "./bookingResolve.js";
import { couponForPlaceName, couponEndsLabel } from "./coupons.js";
import { siteTodayStr } from "./siteTime.js";

// Which mapping a guide takes. Derived from the guide's own data, not a list of
// slugs — a new guide gets the right CTA without editing this file.
export function guideIntent(g) {
  if (!g || !Array.isArray(g.picks)) return "none";
  if (g.picks.some((p) => p && p.hotel)) return "hotel";
  // A restaurant guide is one whose picks are places to eat. The title/keyword
  // carries that far more reliably than the picks do, because a pick is a
  // section heading ("Tickets, timing, and the cash catch"), not a venue.
  const t = ((g.title || "") + " " + (g.keyword || "")).toLowerCase();
  if (/restaurant|eat|dining|food|sandwich|brunch|breakfast|dinner/.test(t)) return "restaurant";
  if (g.picks.some((p) => p && (p.viatorUrl || p.bookQuery))) return "tour";
  return "none";
}

// A guide pick adapted to the `detail` shape bookingTargets() expects. The
// resolver needs id/name/address/types; a guide pick has name + bookQuery. The
// region supplies the city so the Viator fallback is geo-correct — without it the
// tracked search defaulted to Viator's featured cities (the Coquina->Mumbai bug).
function pickAsDetail(pick, region) {
  return {
    id: "guide:" + String(pick.name || "").slice(0, 60),
    name: pick.bookQuery || pick.name || "",
    address: ", " + (region || "Orlando") + ", FL",
    // `tourist_attraction` is what makes isTicketyPlace() admit it. A guide pick
    // that is a beach or natural feature must NOT carry it — the beach exclusion
    // in isTicketyPlace is what stops free sand getting a Viator CTA.
    types: ["tourist_attraction", "point_of_interest"],
  };
}

/**
 * Resolve the ONE primary CTA for a guide.
 *
 * Returns { kind, href, label, sponsored, monetized, deal } — or
 * { kind: "none", monetized: false } when nothing resolves.
 *
 * `monetized` is what primary_cta_null keys off: it is FALSE for the Directions
 * terminal, which is the acknowledged non-monetized outcome and does NOT suppress
 * the event.
 */
export function guidePrimaryCta(g, todayIso) {
  const intent = guideIntent(g);
  const region = (g && g.region) || "Orlando";
  const today = todayIso || siteTodayStr();

  if (intent === "hotel") {
    // Stay22 rewrites at click time. NEVER clone or precompute that href — the
    // resolver returns it and we pass it through untouched.
    const pick = g.picks.find((p) => p && p.hotel);
    const t = bookingTargets(
      { id: "guide:" + pick.name, name: pick.name + " " + region, address: ", " + region + ", FL", types: ["lodging", "hotel"] },
      "hotels", null, region);
    if (t.tu) return { kind: "hotel", href: t.tu, label: "Check rates & availability", sponsored: true, monetized: true, deal: null, place: pick.name };
  }

  if (intent === "restaurant") {
    // A registry deal for a place the guide actually mentions. Real expiry only —
    // couponEndsLabel reads the data, and couponIsLive has already hidden
    // anything past its date. Never a hardcoded deadline.
    for (const p of g.picks) {
      const c = couponForPlaceName(p && p.name, today);
      if (c) {
        return {
          kind: "deal", href: c.url, label: "Get the deal", sponsored: true, monetized: true,
          place: p.name,
          deal: { code: c.code || null, ends: couponEndsLabel(c) || null, title: c.title || null },
        };
      }
    }
    // No deal: Directions to the standout is the HONEST primary. It earns
    // nothing, and that is the point — it is a real next step rather than a
    // manufactured one.
    const standout = g.picks[0];
    if (standout) {
      return {
        kind: "directions", monetized: false, sponsored: false, deal: null, place: standout.name,
        href: "https://www.google.com/maps/dir/?api=1&destination=" +
          encodeURIComponent((standout.name || "") + ", " + region + ", FL"),
        label: "Get directions",
      };
    }
  }

  if (intent === "tour") {
    // THE predicate. Verified product when one cleared the default-deny gate,
    // else the same honest tracked search the app uses.
    for (const p of g.picks) {
      if (!p || (!p.viatorUrl && !p.bookQuery)) continue;
      const topItem = p.viatorUrl ? { url: p.viatorUrl } : null;
      const t = bookingTargets(pickAsDetail(p, region), "entertainment", topItem, region);
      if (t.tk) return { kind: "tour", href: t.tk, label: "Check tours & tickets", sponsored: true, monetized: true, deal: null, place: p.name };
    }
  }

  return { kind: "none", href: null, label: null, sponsored: false, monetized: false, deal: null, place: null };
}

/**
 * The one "continue" card — a sibling guide, same region first so the next step
 * is actually usable. Deterministic (no randomness) so the page stays SSG-stable.
 */
export function guideContinue(g, slug, allGuides) {
  const keys = Object.keys(allGuides || {}).filter((k) => k !== slug);
  const sameRegion = keys.filter((k) => allGuides[k] && allGuides[k].region === (g && g.region));
  const pick = (sameRegion.length ? sameRegion : keys).sort()[0];
  return pick ? { slug: pick, title: allGuides[pick].title } : null;
}
