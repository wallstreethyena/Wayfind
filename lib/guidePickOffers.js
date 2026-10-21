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
    "three-sisters-springs-water": Object.freeze({
      offers: Object.freeze([o({
        offerId: "184792P17", place: "Three Sisters Springs", city: "Crystal River",
        operator: null,
        title: "Three Sisters Springs guided kayak tour (kayaking only, no swimming)",
        whoFor: "Paddlers who want a guided kayak route from Kings Bay toward the springs rather than an in-water swim.",
        detail: "Guided kayak paddle on Kings Bay with kayak, paddle and life jacket included. This is a kayaking tour only and does not include in-water swimming. Water entry into Three Sisters Springs itself is regulated during manatee season and depends on refuge rules.",
        meet: "Check your confirmation for the Kings Bay launch address and check-in window.",
        objection: "Will we see manatees? Manatees gather in winter cold snaps, but wild sightings are never guaranteed.",
        restriction: "Kayaking only — swimming is not included. Free cancellation up to 24 hours before. Seasonal refuge closures apply inside the spring run.",
      })]),
    }),
  }),
  "florida-manatee-season-2026": Object.freeze({
    "three-sisters-springs": Object.freeze({
      offers: Object.freeze([o({
        offerId: "184792P17", place: "Three Sisters Springs", city: "Crystal River",
        operator: null,
        title: "Three Sisters Springs guided kayak tour (kayaking only, no swimming)",
        whoFor: "Visitors who want to paddle Kings Bay with a local guide in addition to or instead of the land boardwalk shuttle.",
        detail: "Guided kayak tour on Kings Bay with kayak, paddle and life jacket included (kayaking only — in-water swimming is not included). Refuge access rules govern where paddle craft may enter during winter manatee season.",
        meet: "Check your confirmation for the Crystal River launch point and arrival time.",
        objection: "Will we see manatees? No spot can promise a sighting — manatees are wild animals and sightings are never guaranteed.",
        restriction: "Kayaking only — swimming is not included. Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "things-to-do-in-sarasota-florida": Object.freeze({
    "sarasota-ted-sperling-lido": Object.freeze({
      offers: Object.freeze([o({
        offerId: "108117P1", place: "Lido", city: "Sarasota",
        operator: "Sea Life Kayak Adventures",
        title: "Guided Lido mangrove tunnel kayak tour",
        whoFor: "First-time paddlers, couples and families who would rather follow a guide than navigate the mangrove tunnels alone.",
        detail: "About 2 hours through the South Lido mangrove tunnels. Single or tandem kayak, paddle and life jacket are included; a tandem is booked as two adults.",
        meet: "Meet at Ted Sperling Nature Park, 190 Taft Dr, Sarasota. Look for the Sea Life Kayak check-in sign in the trailer parking lot.",
        objection: "Will we see wildlife? Manatees, dolphins and rays use these waters, but wildlife is never guaranteed. Mornings are usually calmer for paddling.",
        restriction: "Free cancellation up to 24 hours before. Confirmation can take up to 48 hours, so book ahead rather than the morning of. Children paddle with an adult.",
      })]),
    }),
    "sarasota-myakka-state-park": Object.freeze({
      offers: Object.freeze([o({
        offerId: "136885P3", place: "Myakka", city: "Sarasota",
        operator: "Endless Summer Eco Tours and Rentals",
        title: "Guided Myakka e-bike safari",
        whoFor: "Active couples and families who want to cover far more of the park in a morning than they could on foot.",
        detail: "About 2½ hours on pedal-assist e-bikes with a guide, including a stop at the Canopy Walkway (it involves 100+ stairs). E-bike, helmet and bottled water are included.",
        meet: "Meet in the small lot just past the ranger station at the main entrance, near the visitor center (13208 State Rd 72).",
        objection: "Why book a tour when park entry is cheap? The walkway and birdwalk are yours with park entry; the tour is for ground covered on e-bikes with a local guide. Wildlife isn't guaranteed.",
        restriction: "Park entry fee is not included and is paid at the ranger station per vehicle. Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "myakka-river-state-park-guide": Object.freeze({
    "myakka-outpost-ebike": Object.freeze({
      offers: Object.freeze([o({
        offerId: "136885P3", place: "Myakka", city: "Sarasota",
        operator: "Endless Summer Eco Tours and Rentals",
        title: "Guided Myakka e-bike safari",
        whoFor: "Visitors who want pedal-assist e-bikes and a guide instead of planning their own route.",
        detail: "About 2½ hours on pedal-assist e-bikes with a guide, including a stop at the Canopy Walkway (100+ stairs). E-bike, helmet and bottled water are included.",
        meet: "Meet in the small lot just past the ranger station at the main entrance, near the visitor center (13208 State Rd 72).",
        objection: "Will we see alligators? Alligators are common in the park, especially in the dry season, but wildlife is never guaranteed.",
        restriction: "Park entry fee is not included and is paid at the ranger station per vehicle. Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "robinson-preserve-bradenton": Object.freeze({
    "robinson-preserve-kayak": Object.freeze({
      offers: Object.freeze([o({
        offerId: "454941P4", place: "Robinson Preserve", city: "Bradenton",
        operator: null,
        title: "Robinson Preserve guided mangrove kayak tour",
        whoFor: "Paddlers who want kayak gear and a local guide for the tidal creeks and mangrove tunnels.",
        detail: "Guided kayak paddle through Robinson Preserve's coastal waterways with kayak, paddle and life jacket included.",
        meet: "Robinson Preserve, Bradenton. Check your confirmation for the exact launch lot inside the preserve.",
        objection: "Do I need a tour to visit? Walking and biking the preserve trails are free; this booking is for a guided kayak paddle on the water.",
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "de-soto-national-memorial-bradenton": Object.freeze({
    "robinson-preserve-kayak": Object.freeze({
      offers: Object.freeze([o({
        offerId: "454941P4", place: "Robinson Preserve", city: "Bradenton",
        operator: null,
        title: "Robinson Preserve guided mangrove kayak tour",
        whoFor: "Visitors pairing De Soto National Memorial with a guided paddle in neighboring Robinson Preserve.",
        detail: "Guided kayak tour through the mangrove tunnels and tidal creeks of Robinson Preserve, with kayak, paddle and life jacket included.",
        meet: "Robinson Preserve, Bradenton (a short drive from De Soto National Memorial). Check your confirmation for the exact launch lot.",
        objection: null,
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "things-to-do-in-bradenton-florida": Object.freeze({
    "robinson-preserve-kayak": Object.freeze({
      offers: Object.freeze([o({
        offerId: "454941P4", place: "Robinson Preserve", city: "Bradenton",
        operator: null,
        title: "Robinson Preserve guided mangrove kayak tour",
        whoFor: "Visitors who want a guided kayak block in Robinson Preserve without hauling their own gear.",
        detail: "Guided kayak paddle through Robinson Preserve's coastal habitats with kayak, paddle and life jacket included.",
        meet: "Robinson Preserve, Bradenton. Check your confirmation for the launch entrance and check-in time.",
        objection: "Can I just walk the preserve instead? Yes — trail access is free. This offer is for paddling the mangrove waterways with a guide and gear.",
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "bioluminescence-kayak-tour-space-coast": Object.freeze({
    "merritt-island-bioluminescence": Object.freeze({
      offers: Object.freeze([o({
        offerId: "123164P2", place: "Merritt Island", city: "Cocoa Beach",
        operator: "Get Up And Go Kayaking",
        title: "Merritt Island clear-kayak bioluminescence tour",
        whoFor: "Night paddlers who want a clear-bottom kayak and a guided launch inside the dark-water refuge.",
        detail: "Guided evening paddle in tandem clear kayaks on the Indian River Lagoon near Merritt Island, with kayak, paddles and life jackets included.",
        meet: "Launches near Haulover Canal inside Merritt Island National Wildlife Refuge (Titusville area). Check your confirmation for exact directions.",
        objection: "How bright is the glow? Bioluminescence is a natural phenomenon that reads brightest on dark, moonless nights and is never guaranteed.",
        restriction: "Free cancellation up to 24 hours before. Weight limits apply per seat and per tandem kayak.",
      })]),
    }),
  }),
  "ybor-city-tampa-guide": Object.freeze({
    "ybor-7th-ave-tour": Object.freeze({
      offers: Object.freeze([o({
        offerId: "5642110P1", place: "Ybor City", city: "Tampa",
        operator: null,
        title: "Ybor City historic food and culture walking tour",
        whoFor: "Visitors who want the immigrant cigar-city backstory and local food stops with a guide.",
        detail: "Guided walking tour along Seventh Avenue and historic Ybor City with food tastings and local history included.",
        meet: "Historic Ybor City, Tampa. Check your confirmation for the exact meeting corner on or near Seventh Avenue.",
        objection: "Can you walk Seventh Avenue on your own? Yes — the streets and the streetcar are free. The tour adds guided history and curated tastings.",
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "things-to-do-in-tampa-florida": Object.freeze({
    "tampa-ybor-city": Object.freeze({
      offers: Object.freeze([o({
        offerId: "5642110P1", place: "Ybor City", city: "Tampa",
        operator: null,
        title: "Ybor City historic food and culture walking tour",
        whoFor: "First-time visitors who want Ybor's cigar history, social clubs and food stops in one guided walk.",
        detail: "Guided walking tour through historic Ybor City with local food tastings included.",
        meet: "Ybor City, Tampa. Check your confirmation for the meeting point.",
        objection: null,
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
    "tampa-shell-key-preserve": Object.freeze({
      offers: Object.freeze([o({
        offerId: "173028P1", place: "Shell Key", city: "St. Petersburg",
        operator: null,
        title: "Shell Key Preserve clear-kayak tour",
        whoFor: "Day-trippers from Tampa who want a guided clear-kayak paddle out to the undeveloped barrier island.",
        detail: "Guided clear-kayak tour to Shell Key Preserve off Tierra Verde, with kayak, paddle and life jacket included.",
        meet: "Launches from Tierra Verde near the Fort De Soto causeway (about 45 minutes from downtown Tampa). Check your confirmation for the launch site.",
        objection: null,
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
  }),
  "things-to-do-st-petersburg-clearwater-summer-2026": Object.freeze({
    "st-pete-pier-cruise": Object.freeze({
      offers: Object.freeze([o({
        offerId: "242020P5", place: "St. Pete Pier", city: "St. Petersburg",
        operator: null,
        title: "St. Pete Pier sightseeing and dolphin cruise",
        whoFor: "Visitors already downtown who want to get out on Tampa Bay from the pier district.",
        detail: "Sightseeing boat cruise around the St. Pete Pier and Tampa Bay waters with views of the downtown skyline.",
        meet: "Departs from the St. Pete Pier marina area. Check your confirmation for the slip and boarding time.",
        objection: "Will we see dolphins? Dolphins are frequently spotted in Tampa Bay, but wildlife is never guaranteed.",
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
    "fort-de-soto-kayak": Object.freeze({
      offers: Object.freeze([o({
        offerId: "324135P3", place: "Fort De Soto", city: "St. Petersburg",
        operator: null,
        title: "Fort De Soto guided kayak eco-tour",
        whoFor: "Paddlers who want a guided route through Fort De Soto's calm lagoons and mangrove edges.",
        detail: "Guided kayak tour in the Fort De Soto area with kayak, paddle and life jacket included.",
        meet: "Check your confirmation for the exact Fort De Soto / Tierra Verde launch location.",
        objection: null,
        restriction: "Free cancellation up to 24 hours before.",
      })]),
    }),
    "shell-key-clear-kayak": Object.freeze({
      offers: Object.freeze([o({
        offerId: "173028P1", place: "Shell Key", city: "St. Petersburg",
        operator: null,
        title: "Shell Key Preserve clear-kayak tour",
        whoFor: "Visitors who want a guided clear-kayak crossing from Tierra Verde to the roadless barrier island.",
        detail: "Guided clear-kayak paddle through the Shell Key Preserve waters with kayak, paddle and life jacket included.",
        meet: "Launches from Tierra Verde near the island crossing. Check your confirmation for the exact check-in spot.",
        objection: null,
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
