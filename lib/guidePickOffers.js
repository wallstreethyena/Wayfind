// lib/guidePickOffers.js — focused, verified offers attached to the guide pick
// they are the bookable version of (owner direction 2026-10-18, t5u).
//
// WHY. The Orlando guide's 30-tile "Bookable highlights" strip sat above pick 1
// and repeated city inventory far from the decision a reader was making (53 of
// 63 clicks in 28 days, 0 on the bottom CTA). A focused offer sits under the
// pick it books and answers the practical questions there: what you get, where
// you meet, what's included, and the condition that matters (cancellation,
// confirmation, closures, extra costs).
//
// STABLE IDENTIFIERS. Offers attach by the pick's explicit `id` field in the
// guide data (lib/guides.js), never by its visible number or array position.
// Reordering or inserting picks cannot move an offer to the wrong
// recommendation; a pick without a matching id simply shows no offer.
//
// THE RULES (enforced by scripts/test-guide-pick-offers.mjs):
//   - Every product, operator, meeting point, inclusion and cancellation term
//     was checked on `verifiedOn` (evidence: /workspace/wayfind/release/
//     offers-evidence.md on the shared box). Chosen on fit with the pick,
//     inclusions and terms — never commission.
//   - No prices and no review counts in copy (they drift; the partner page
//     shows the live figure). The button says "Check dates and price" because
//     it opens a product page, not a checkout.
//   - Ratings are never borrowed: a place's Google rating can't appear here.
//   - An "alternative" is labelled as a different venue with its own location.
//   - The click goes through /api/commerce/go (link_ok + denylist re-checked at
//     click time; Viator campaign wf-<page>-pick-<offer> added server-side).
//   - Official, non-affiliate links are allowed (they earn nothing) and are
//     tracked separately from commerce clicks.
import { honestPartnerLabel } from "./guideCta.js";

const V = "2026-10-18";
export const PICK_OFFER_CTA = "Check dates and price";

const o = (x) => Object.freeze({ verifiedOn: V, provider: "viator", role: "primary", ...x });

export const GUIDE_PICK_OFFERS = Object.freeze({
  "things-to-do-sarasota": Object.freeze({
    "lido-mangrove-tunnels": Object.freeze({
      offers: Object.freeze([o({
        offerId: "108117P1", place: "Lido", city: "Sarasota",
        operator: "Sea Life Kayak Adventures",
        title: "Guided Lido mangrove tunnel kayak tour",
        whoFor: "First-time paddlers, couples and families who would rather follow a guide than find the tunnels themselves.",
        detail: "About 2 hours (it can run to 2½) through the South Lido mangrove tunnels. Single or tandem kayak, paddle and life jacket are included; a tandem is booked as two adults.",
        meet: "Meet at Ted Sperling Nature Park, 190 Taft Dr, Sarasota. Look for the Sea Life Kayak check-in sign in the trailer parking lot.",
        objection: "Will we see manatees? Manatees, dolphins and rays use these waters, but nobody can promise a sighting. Mornings are usually calmer for paddling.",
        restriction: "Free cancellation up to 24 hours before. Confirmation can take up to 48 hours, so book ahead rather than the morning of. Children paddle with an adult.",
      })]),
    }),
    "myakka-river-state-park": Object.freeze({
      offers: Object.freeze([o({
        offerId: "136885P3", place: "Myakka", city: "Sarasota",
        operator: "Endless Summer Eco Tours and Rentals",
        title: "Guided Myakka e-bike safari",
        whoFor: "Active couples and families who want to cover far more of the park in a morning than they could on foot.",
        detail: "About 2½ hours on pedal-assist e-bikes with a guide, including a stop at the Canopy Walkway (no extra charge beyond park entry; it involves 100+ stairs). E-bike, helmet and bottled water are included.",
        meet: "Meet in the small lot just past the ranger station at the main entrance, near the visitor center (13208 State Rd 72).",
        objection: "Why pay for a tour when entry is cheap? You don't have to: the walkway and the weir are yours with park entry. The tour is for ground covered and a guide who knows where to look. Wildlife isn't guaranteed.",
        restriction: "Park entry is not included and is paid at the ranger station: $6 per vehicle with 2–8 people, $4 for a single-occupant vehicle, $2 on foot or by bike. Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "things-to-do-orlando-not-theme-parks": Object.freeze({
    "orlando-airboat-headwaters": Object.freeze({
      offers: Object.freeze([
        o({
          offerId: "5039P5", place: "Boggy Creek", city: "Orlando",
          operator: "Boggy Creek Airboat Adventures",
          title: "Boggy Creek one-hour airboat ride",
          whoFor: "The ride this pick recommends: an hour on the headwaters marsh from Kissimmee.",
          detail: "A 60-minute airboat tour with park admission, the alligator viewing area, hearing protection and life vests included. Food is extra.",
          meet: "Boggy Creek Airboat Adventures, 2001 E Southport Rd, Kissimmee. Check your confirmation for the arrival time.",
          objection: "Will we see gators? Alligators and birds are common on the headwaters, but wildlife is never guaranteed.",
          restriction: "Free cancellation up to 24 hours before.",
        }),
        o({
          role: "alternative", offerId: "5467OHEP", place: "Wild Florida", city: "Orlando",
          operator: "Wild Florida Adventure Park",
          title: "Alternative: Wild Florida airboat + Alligator Park",
          whoFor: "Families who want an airboat ride and a gator park in one stop. This is a different venue from Boggy Creek, farther south in Kenansville, and you need your own car.",
          detail: "Choose a 30-minute or 1-hour ride, or the half-day package with lunch. Every airboat ticket includes Wild Florida's Alligator Park. It does not include the Drive-Thru Safari, which is a separate ticket.",
          meet: "Wild Florida, 3301 Lake Cypress Rd, Kenansville. No hotel pickup.",
          objection: "Is it worth the longer drive? Only if you want the gator park too; for the airboat alone, the pick above is the closer option.",
          restriction: "Closed Sundays. The operator asks you to check in 45 minutes before your departure. Free cancellation up to 24 hours before.",
        }),
      ]),
    }),
    "rock-springs-run-kayak": Object.freeze({
      offers: Object.freeze([o({
        offerId: "123164P1", place: "Rock Springs", city: "Orlando",
        operator: "Get Up And Go Kayaking",
        title: "Guided clear-kayak tour on Rock Springs Run",
        whoFor: "Active couples and families (kids 3+) who want a guide and clear kayaks instead of planning the county launch window.",
        detail: "About 2 to 2½ hours up Rock Springs Run in tandem clear-bottom kayaks, in groups of up to 10. Confirmation comes at booking.",
        meet: "Launches from Kings Landing, 5722 Baptist Camp Rd, Apopka — not the Kelly Park gate described above. Park on the road outside the gate and check in behind the Kings Landing building.",
        objection: "What if the weather turns? If the operator cancels for weather you're offered another date or a full refund. If you cancel, you aren't.",
        restriction: "Non-refundable: no refund or date change if you cancel. Children must be 3+ and paddle with an adult; weight limit 250 lb per seat and 425 lb per kayak. Not recommended during pregnancy or with back or heart conditions.",
      })]),
    }),
    "kennedy-space-center": Object.freeze({
      offers: Object.freeze([o({
        offerId: "3170P32", place: "Kennedy Space Center", city: "Orlando",
        operator: "Gray Line Orlando",
        title: "No car? Kennedy Space Center with round-trip transport",
        whoFor: "Visitors without a car who want the full Visitor Complex day.",
        detail: "Choose the “Kennedy Space Center Tour” option: it includes round-trip coach transport and Visitor Complex admission. The “Transportation Only” option does not include admission (it is the one with the lowest “from” price). About 11 hours door to door; food and tips are extra.",
        meet: "Pickup is from set Gray Line stops in the Disney/Lake Buena Vista, Universal, International Drive and Kissimmee areas, not from every hotel. Check the stop nearest you before booking.",
        objection: "Why not just buy a ticket? If you can drive, do — see the official option below. This package is for getting there and back without a car.",
        restriction: "Free cancellation up to 24 hours before.",
      })]),
      official: Object.freeze({
        label: "Driving? Buy admission on the official KSC site",
        href: "https://www.kennedyspacecenter.com/info/tickets",
        note: "Official Visitor Complex tickets. Parking is $15 per car and isn't included in the ticket. Wayfind earns nothing from this link.",
      }),
    }),
  }),
  // Crystal River: a NARROW owner exception (affiliate release, 2026-10-18).
  "swim-with-manatees-crystal-river": Object.freeze({
    "kings-bay-manatee-swim": Object.freeze({
      offers: Object.freeze([o({
        offerId: "44460P1", place: "Kings Bay", city: "Crystal River",
        operator: null,
        title: "Kings Bay small-group manatee swim",
        whoFor: "Swimmers who want a licensed captain and an in-water guide.",
        detail: "3 hours, six guests at most. Wetsuit, mask, snorkel and hot drinks are included; photos are sold separately.",
        meet: null, objection: null,
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
    "kings-bay-clear-kayak": Object.freeze({
      offers: Object.freeze([o({
        offerId: "123201P1", place: "Kings Bay", city: "Crystal River",
        operator: null,
        title: "Kings Bay clear kayak tour",
        whoFor: "Paddlers who want a guide and a clear tandem kayak.",
        detail: "About 2 hours with a local guide; kayak, paddles and life jackets are included. Paddle craft are not allowed inside Three Sisters Springs during manatee season, so check the route for your date.",
        meet: null, objection: null,
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "gatorland-vs-wild-florida": Object.freeze({
    "wild-florida-airboat": Object.freeze({
      offers: Object.freeze([o({
        offerId: "5467OHEP", place: "Wild Florida", city: "Orlando",
        operator: "Wild Florida Adventure Park",
        title: "Wild Florida airboat + Alligator Park",
        whoFor: "Families who want an airboat ride and the gator park on one ticket.",
        detail: "A 30-minute or 1-hour ride on the Lake Cypress headwaters, or the half-day package with lunch. Every airboat ticket includes the Alligator Park; the Drive-Thru Safari is a separate ticket.",
        meet: "3301 Lake Cypress Rd, Kenansville. No hotel pickup.",
        objection: null,
        restriction: "Closed Sundays. The operator asks you to check in 45 minutes before departure. Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
});

const ID_RX = /^[0-9A-Za-z]+$/;

/** Verified offers (and optional official link) for one pick, by its stable id. Fail-closed. */
export function guidePickOffers(slug, pick) {
  const id = pick && typeof pick.id === "string" ? pick.id : null;
  const entry = id && GUIDE_PICK_OFFERS[slug] && GUIDE_PICK_OFFERS[slug][id];
  if (!entry) return null;
  const offers = (entry.offers || []).filter((x) =>
    x && x.provider === "viator" && ID_RX.test(String(x.offerId || "")) && x.title && x.detail && x.restriction &&
    (x.role === "primary" || x.role === "alternative") && honestPartnerLabel(x.title.replace(/^Alternative:\s*/, "").slice(0, 44), x.place));
  const official = entry.official && /^https:\/\/www\.kennedyspacecenter\.com\//.test(entry.official.href) ? entry.official : null;
  if (!offers.length && !official) return null;
  return { pickId: id, offers, official };
}

// Guides where the 30-tile "Bookable highlights" city strip is replaced by the
// focused offers above. winter-park-scenic-boat-tour has no offer on purpose:
// its one recommendation is a cash-only boat no partner sells.
export const FOCUSED_OFFER_GUIDES = Object.freeze(new Set([
  "gatorland-vs-wild-florida",
  "winter-park-scenic-boat-tour",
  "things-to-do-orlando-not-theme-parks",
]));
export function replacesCityStrip(slug) {
  return FOCUSED_OFFER_GUIDES.has(slug);
}
