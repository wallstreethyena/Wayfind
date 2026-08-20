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
import { couponForPlaceName, couponEndsLabel, couponIsLive, COUPONS } from "./coupons.js";
import { siteTodayStr } from "./siteTime.js";
import { viatorProductGoUrl } from "./affiliates.js";

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
 * The venue a "See tickets for X" label may name, or null when nothing here can
 * be named honestly.
 *
 * WHY THIS IS NOT JUST pick.name (2026-08-06). A guide pick name is EDITORIAL —
 * it is a section heading, not a venue. #606 fixed that for the render-time
 * upgrade path after production shipped
 * "See tickets: What the hour actually covers". This is the sibling path: when a
 * pick carries a curated viatorUrl, guidePrimaryCta labelled it
 * "See tickets for {pick.name}" and rendered
 * "See tickets for Gatorland: the classic park" — the same defect, one code path
 * over, and it was invisible locally because no pick resolves verifiedUrl
 * without an API key.
 *
 * A curated viatorUrl IS a human asserting "this pick has this product", so
 * naming the pick is legitimate — but only the venue part of it. Everything from
 * the first colon or dash onward is the editorial garnish.
 *
 * Returns null when what remains is prose rather than a venue, so the caller can
 * fall back to a label that names nothing it cannot stand behind.
 */
export function pickVenueLabel(name) {
  const head = String(name || "").split(/\s*[:\u2014\u2013]\s*/)[0].trim();
  if (!head) return null;

  // A VENUE IS SHORT AND PROPER-NOUN SHAPED. Length alone is not enough: the
  // string that shipped to production, "What the hour actually covers", is 29
  // characters and starts with a capital, so a length-plus-leading-capital test
  // accepts it. Prose is distinguished by having many words, most of them
  // lowercase.
  //
  // Judged on the ratio of proper-noun CARRIERS (connectors discounted):
  //   "Gatorland"                            1/1  -> venue
  //   "Winter Park Scenic Boat Tour"         5/5  -> venue
  //   "Museum of Fine Arts"                  3/3  -> venue ("of" discounted)
  //   "What the hour actually covers"        1/4  -> prose
  //   "Seventh Avenue and the cigar legacy"  2/4  -> prose
  const words = head.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6) return null;
  // Connectors are neutral: they appear in real venue names ("Museum of Fine
  // Arts") and in prose alike, so counting them in the denominator would reject
  // the venue. Judge on the words that actually carry the name.
  const CONNECTORS = new Set(["of", "the", "and", "at", "on", "in", "de", "la", "el", "a"]);
  const carriers = words.filter((w) => !CONNECTORS.has(w.toLowerCase()));
  if (!carriers.length) return null;
  const proper = carriers.filter((w) => /^[A-Z0-9]/.test(w)).length;
  if (proper / carriers.length < 0.8) return null;
  return head;
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
function resolvePrimaryCta(g, todayIso) {
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
    // Founder P0: do not render an earning Check rates that points at raw
    // booking.com. bookingTargets fail-closes hotelUrl; this belt rejects
    // any leftover partner hotel href so a merge cannot put it back.
    if (t.tu && !/booking\.com/i.test(String(t.tu))) {
      return { kind: "hotel", href: t.tu, label: "Check rates & availability", sponsored: true, monetized: true, deal: null, place: pick.name, exact: true };
    }
  }

  if (intent === "restaurant") {
    // A guide may name the registry deal it is ABOUT. #18 is a guide about the
    // Clipp certificate programme itself, so its terminal is that offer rather
    // than a per-restaurant coupon that happens to match a pick name. Still one
    // registry and still live-gated: this READS COUPONS by id, it does not carry
    // a URL of its own, and an expired or unknown id resolves to nothing rather
    // than to a dead link.
    if (g.dealId) {
      const d = COUPONS.find((c) => c && c.id === g.dealId);
      if (d && couponIsLive(d, today)) {
        return {
          kind: "deal", href: d.url, label: d.cta || "Get the deal", sponsored: true, monetized: true,
          exact: true, place: d.business,
          deal: { code: d.code || null, ends: couponEndsLabel(d) || null, title: d.title || null },
        };
      }
    }
    // A registry deal for a place the guide actually mentions. Real expiry only —
    // couponEndsLabel reads the data, and couponIsLive has already hidden
    // anything past its date. Never a hardcoded deadline.
    for (const p of g.picks) {
      const c = couponForPlaceName(p && p.name, today);
      if (c) {
        return {
          kind: "deal", href: c.url, label: "Get the deal", sponsored: true, monetized: true,
          exact: true, place: p.name,
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
        kind: "directions", monetized: false, sponsored: false, deal: null, place: standout.name, exact: false,
        href: "https://www.google.com/maps/dir/?api=1&destination=" +
          encodeURIComponent((standout.name || "") + ", " + region + ", FL"),
        label: "Get directions",
      };
    }
  }

  if (intent === "tour") {
    // A guide may name the registry deal it is ABOUT — same rule and same code
    // as the restaurant rung above (#18), because the CityPASS rows carry empty
    // match arrays by design (they are bundles, not places), so the per-pick
    // couponForPlaceName loop below can never reach them. Still one registry,
    // still live-gated, never a URL written in a guide.
    if (g.dealId) {
      const d = COUPONS.find((c) => c && c.id === g.dealId);
      if (d && couponIsLive(d, today)) {
        return {
          kind: "deal", href: d.url, label: d.cta || "Get the deal", sponsored: true, monetized: true,
          exact: true, place: d.business,
          deal: { code: d.code || null, ends: couponEndsLabel(d) || null, title: d.title || null },
        };
      }
    }
    // A LIVE DEAL BEATS A SEARCH. Measured on the identical intent_partner_rail,
    // 2026-07-25 -> 08-05, owner excluded: undercover_tourist deals drew 5 clicks
    // from 23 viewers (~17%) while generic viator drew 2 from 39 (~5%). The
    // restaurant rung above already prefers the registry; the tour rung never
    // looked, even though the registry carries 18 live ATTRACTION offers
    // (CityPASS, The Florida Aquarium, The Ringling). Same registry, same
    // live-gating, same real-expiry rule — no new source of truth.
    for (const p of g.picks) {
      const c = couponForPlaceName(p && p.name, today);
      if (c) {
        return {
          kind: "deal", href: c.url, label: c.cta || "Get the deal", sponsored: true, monetized: true,
          exact: true, place: p.name,
          deal: { code: c.code || null, ends: couponEndsLabel(c) || null, title: c.title || null },
        };
      }
    }

    // THE predicate. Verified product when one cleared the default-deny gate,
    // else the same honest tracked search the app uses.
    for (const p of g.picks) {
      if (!p || (!p.viatorUrl && !p.bookQuery)) continue;
      const topItem = p.viatorUrl ? { url: p.viatorUrl } : null;
      const t = bookingTargets(pickAsDetail(p, region), "entertainment", topItem, region);
      if (!t.tk) continue;

      // SAY WHICH ONE IT IS. bookingTargets already distinguishes an exact
      // product (verifiedUrl) from a tracked search (goFallback) and the CTA
      // threw that away, so every tour guide shipped the same label —
      // "Check tours & tickets" — regardless of destination.
      //
      // Measured 2026-08-05: ALL NINE tour-intent guides resolve to a generic
      // SEARCH; not one has an exact product. So 20 readers were promised
      // "tours & tickets" for a named place and handed a Viator search results
      // page. 0 of 20 clicked. A label that overstates the destination is the
      // most expensive kind of copy, because the disappointment lands after the
      // click and teaches people not to trust the next one.
      //
      // `exact` also rides the events, because cta_kind:"tour" conflated the two
      // and made the 0/20 unreadable: nobody could tell a bad OFFER from a vague
      // LABEL. With it split, the next read answers that directly.
      const exact = !!t.verifiedUrl;
      // A curated viatorUrl used to become a BARE partner href via
      // bookingTargets -> viatorDirectUrl (pid/mcid on viator.com). Culture
      // pages wrap the same shape through viatorProductGoUrl so
      // /api/viator/go fires provider_redirect_started. Same destination,
      // our handoff. Do not change the product — only the href host.
      const href = (exact && p.viatorUrl)
        ? (viatorProductGoUrl(p.viatorUrl, region, "guide", "guide") || t.tk)
        : t.tk;
      // Name the VENUE, not the pick heading. With nothing nameable, say what we
      // can stand behind — the same rule #606 set for the upgrade path.
      const venue = exact ? pickVenueLabel(p.name) : null;
      return {
        kind: "tour", href, sponsored: true, monetized: true, deal: null, place: p.name, exact,
        label: exact
          ? (venue ? `See tickets for ${venue}` : "See tickets & availability")
          : `Find tours in ${region}`,
      };
    }
  }

  return { kind: "none", href: null, label: null, sponsored: false, monetized: false, deal: null, place: null, exact: false };
}

// Topical tokens a guide is "about" — its title + keyword, minus generic travel
// filler, singularised so "manatees"/"manatee" and "tours"/"tour" match. Used
// only to relate ACROSS regions; same-region matching never needs it.
const GUIDE_TOKEN_STOP = new Set([
  "guide", "local", "complete", "florida", "best", "day", "trip", "trips",
  "things", "near", "your", "with", "from", "that", "this", "what", "when",
  "where", "tour", "visit", "thing", "ultimate", "real", "honest", "weekend",
  "family", "date", "night", "cheap", "budget", "kids", "free", "great",
  "perfect", "little", "hidden", "gem", "gems", "trip", "getaway", "the",
]);
function guideTokens(g) {
  const raw = ((g && g.title) || "") + " " + ((g && g.keyword) || "");
  const out = new Set();
  for (let w of raw.toLowerCase().match(/[a-z]+/g) || []) {
    if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1); // crude singularise
    if (w.length >= 4 && !GUIDE_TOKEN_STOP.has(w)) out.add(w);
  }
  return out;
}
function tokenOverlap(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/**
 * The one "continue" card — a sibling guide, same region first so the next step
 * is actually usable. When a guide is ALONE in its region (the Nature Coast
 * paddle/springs cluster — Weeki Wachee, Cocoa Beach — each sit in a region of
 * one), the old alphabetical fallback handed the reader an unrelated beach
 * day-trip. Now the next step stays on-theme through two signals, in order:
 *
 *   1. an explicit `cluster` tag (collision-proof — "Weeki Wachee's spring" must
 *      never link to "Disney *Springs*" just because the word matches), then
 *   2. topical token overlap of title+keyword as the tiebreak and the general
 *      cross-region case.
 *
 * Still ONE card (Hick's law, per check-guide-conversion) and deterministic (no
 * randomness, sorted iteration) so the page stays SSG-stable.
 */
export function guideContinue(g, slug, allGuides) {
  const keys = Object.keys(allGuides || {}).filter((k) => k !== slug);
  if (!keys.length) return null;
  const sameRegion = keys.filter((k) => allGuides[k] && allGuides[k].region === (g && g.region));
  if (sameRegion.length) {
    const pick = sameRegion.sort()[0];
    return { slug: pick, title: allGuides[pick].title };
  }
  // No same-region sibling. Score every candidate: same cluster dominates
  // (+1000, so a curated cluster always beats an accidental word match), then
  // topical token overlap. Sorted iteration makes ties resolve alphabetically
  // and keeps the result stable across builds.
  const mine = guideTokens(g);
  const myCluster = g && g.cluster;
  let best = keys.slice().sort()[0], bestScore = -1;
  for (const k of keys.slice().sort()) {
    const cg = allGuides[k];
    let score = tokenOverlap(mine, guideTokens(cg));
    if (myCluster && cg && cg.cluster === myCluster) score += 1000;
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return { slug: best, title: allGuides[best].title };
}

// v8.29.5 — THE STEP NAMES THE PLACE (owner, 2026-08-20: "these next steps are
// really not very clear we need to make it clear for the user and make sure
// that we have deep links for those and we are going to get paid").
//
// Every rung above returns a verb and nothing else — "Get the deal", "Book
// tickets", "Get directions" — while the line UNDER the button already reads
// "4.4★ · 573 reviews · The Ringling Grillroom". So the page knew the place and
// the button did not, and a reader had to look below a call to action to find
// out what it was a call to. `place` is already on every CTA this module
// returns; this is the one place that spends it.
//
// LENGTH IS A REAL CONSTRAINT, not a style preference: this button is a single
// centred line inside an 18px-padded card at 390px. A name is trimmed at 30
// characters on a word boundary, and if the composed label still cannot fit it
// falls back to the bare verb rather than wrapping to two lines or truncating
// mid-word. Nothing here changes an href, a rel, a provider or an event — the
// deep links and their tracking are exactly as the rungs built them.
const MAX_STEP_LABEL = 44;

function trimName(name) {
  const v = String(name || "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  if (v.length <= 30) return v;
  const cut = v.slice(0, 30);
  const sp = cut.lastIndexOf(" ");
  return (sp > 12 ? cut.slice(0, sp) : cut).replace(/[\s,·-]+$/, "") + "\u2026";
}

export function namedStepLabel(cta) {
  if (!cta || !cta.label || !cta.place) return cta && cta.label;
  const place = trimName(cta.place);
  if (!place) return cta.label;
  // Already names it (a registry cta like "Save $10 at Yoder's") — leave it be.
  if (String(cta.label).toLowerCase().includes(String(cta.place).toLowerCase().slice(0, 12))) return cta.label;
  const joined =
    cta.kind === "directions" ? `Directions to ${place}`
    // "Check rates & availability · <a hotel name>" cannot fit a phone button,
    // and dropping the place to keep the longer verb is the wrong trade: the
    // NAME is the information. Shorten the verb, keep the hotel.
    : cta.kind === "hotel" ? `Check rates \u00b7 ${place}`
    : cta.kind === "deal" ? `${cta.label} at ${place}`
    : `${cta.label} \u00b7 ${place}`;
  return joined.length <= MAX_STEP_LABEL ? joined : cta.label;
}

export function guidePrimaryCta(g, todayIso) {
  const cta = resolvePrimaryCta(g, todayIso);
  if (!cta || !cta.label) return cta;
  return { ...cta, label: namedStepLabel(cta) };
}
