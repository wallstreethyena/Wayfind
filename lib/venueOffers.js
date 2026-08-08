// lib/venueOffers.js — the EXPLICIT place→partner-offer map for Book-it.
//
// Audit finding F4. bookItTarget() returned null for every attraction and every
// tour, so the "guaranteed wrap" layer was dark on exactly the inventory it
// exists for. Measured:
//
//   The Ringling            cat=attractions  bestEV=tiqets    -> NULL
//   Mote Marine Aquarium    cat=attractions  bestEV=tiqets    -> NULL
//   Sarasota Bay Kayak Tour cat=tours        bestEV=wegotrip  -> NULL
//   Van Wezel               cat=events       bestEV=ticketnetwork -> ok
//
// THE MECHANISM, which is not what it looks like. bestAffiliate() picks the
// HIGHEST-EV provider, then wrapCard() looks for SEARCH_URL[that provider],
// finds none, and gives up — it never falls through to a provider it *can*
// build a link for. But adding a fall-through fixes nothing either: the only
// remaining search builder is ticketnetwork, which serves events. The tiqets /
// klook / wegotrip search paths were REMOVED on purpose in July, after a
// browser check found "/en/search?q=Ringling" returning eight results that were
// all in VIENNA. That purge was correct and is not being undone.
//
// So the fix is not a better search. It is an EXACT product, and the only
// honest source of one is a hand-verified venue list.
//
// ── TWO RULES THIS FILE HOLDS, BOTH LEARNED THE HARD WAY ──────────────────
//
// 1. NAMES ARE AN ALLOWLIST, NEVER A SUBSTRING GUESS. wf_place_products matched
//    products to places with `e.title ILIKE '%'||i.name||'%'` and sent Orlando
//    visitors to a Manhattan tour of Central Park and Sarasota visitors to a
//    tour of the New York subway. Every name below is written out.
//
// 2. GEO IS MANDATORY, NOT OPTIONAL. Every row names its market and a match
//    REQUIRES it. "The Florida Aquarium" exists in Tampa; a same-named place
//    anywhere else must not inherit its ticket. This is the constraint whose
//    absence caused 16% of live booking buttons to point at the wrong city.
//
// ── WHAT THE CLIENT RECEIVES ──────────────────────────────────────────────
// Offer IDS ONLY. No destination URL appears here, so this module is safe in
// the browser bundle and the resolved destination stays behind
// /api/commerce/go (the same split lib/intentPartnerPicks.js keeps from
// lib/partnerOfferRegistry.js). Every id below must exist in that registry —
// scripts/test-book-it-venues.mjs fails the build if one does not.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * One row per VENUE, not per offer. Where the registry holds several offers for
 * the same venue (the Dalí Museum appears under three city keys, the Florida
 * Aquarium under two providers) the row names the one to sell, so the choice is
 * made here once rather than by whichever lookup happens to run first.
 *
 * `market` is matched against the caller's city, loosely enough to survive
 * "St. Petersburg" vs "Saint Petersburg" and strictly enough that a different
 * metro never matches.
 */
export const VENUE_OFFERS = Object.freeze([
  // ── Tampa Bay ───────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "tampa-deal-florida-aquarium", market: ["tampa"], names: ["the florida aquarium", "florida aquarium"] },
  { provider: "tiqets", offerId: "tampa-hidden-plant-museum", market: ["tampa"], names: ["henry b plant museum", "plant museum"] },
  { provider: "tiqets", offerId: "tampa-deal-adventure-island", market: ["tampa"], names: ["adventure island", "adventure island tampa bay"] },
  { provider: "tiqets", offerId: "tampa-drive-clearwater-aquarium", market: ["clearwater"], names: ["clearwater marine aquarium"] },
  { provider: "tiqets", offerId: "tampa-date-dali-museum", market: ["st petersburg", "saint petersburg", "st pete"], names: ["the dali museum", "dali museum", "the salvador dali museum", "salvador dali museum"] },

  // ── Orlando ─────────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "orlando-tonight-sealife", market: ["orlando"], names: ["sea life orlando aquarium", "sea life orlando"] },
  { provider: "tiqets", offerId: "orlando-hidden-chocolate-kingdom", market: ["orlando", "kissimmee"], names: ["chocolate kingdom", "chocolate kingdom factory of chocolate dreams"] },
  { provider: "tiqets", offerId: "orlando-drive-kennedy-explore", market: ["orlando", "merritt island", "cape canaveral", "titusville"], names: ["kennedy space center", "kennedy space center visitor complex"] },

  // ── Tampa Bay + Orlando attraction ticket hooks (2026-08-07). Each venue's
  // Tiqets page was opened and confirmed live/bookable with a real price before
  // shipping. Market is the venue's own city (plus the metro it is genuinely
  // sold into) so the geo gate still refuses a same-named place in the wrong
  // region — the F4 invariant. One row per venue; the id names the exact product
  // to sell.
  { provider: "tiqets", offerId: "tampa-hook-zootampa", market: ["tampa"], names: ["zootampa at lowry park", "zootampa", "lowry park zoo"] },
  { provider: "tiqets", offerId: "tampa-hook-busch-gardens", market: ["tampa"], names: ["busch gardens tampa bay", "busch gardens"] },
  { provider: "tiqets", offerId: "tampa-hook-glazer-childrens", market: ["tampa"], names: ["glazer children s museum", "glazer childrens museum"] },
  { provider: "tiqets", offerId: "tampa-hook-dinosaur-world", market: ["plant city", "tampa"], names: ["dinosaur world", "dinosaur world florida"] },
  { provider: "tiqets", offerId: "stpete-hook-imagine-museum", market: ["st petersburg", "saint petersburg", "st pete"], names: ["imagine museum"] },
  { provider: "tiqets", offerId: "stpete-hook-floridarama", market: ["st petersburg", "saint petersburg", "st pete"], names: ["floridarama"] },
  { provider: "tiqets", offerId: "orlando-hook-aquatica", market: ["orlando"], names: ["aquatica orlando", "aquatica"] },
  { provider: "tiqets", offerId: "orlando-hook-boggy-creek", market: ["kissimmee", "orlando"], names: ["boggy creek airboat adventures", "boggy creek airboat rides"] },
  { provider: "tiqets", offerId: "orlando-hook-central-florida-zoo", market: ["sanford", "orlando"], names: ["central florida zoo botanical gardens", "central florida zoo and botanical gardens", "central florida zoo"] },
  { provider: "tiqets", offerId: "orlando-hook-wonderworks", market: ["orlando"], names: ["wonderworks orlando", "wonderworks"] },
  { provider: "tiqets", offerId: "orlando-hook-icon-park", market: ["orlando"], names: ["icon park", "icon park orlando"] },
  { provider: "tiqets", offerId: "orlando-hook-andretti", market: ["orlando"], names: ["andretti indoor karting games", "andretti indoor karting and games", "andretti indoor karting"] },
  { provider: "tiqets", offerId: "daytona-hook-speedway", market: ["daytona beach", "daytona"], names: ["daytona international speedway"] },
  { provider: "tiqets", offerId: "winterhaven-hook-legoland", market: ["winter haven", "orlando"], names: ["legoland florida resort", "legoland florida", "legoland florida park"] },
  { provider: "tiqets", offerId: "orlando-hook-gatorland", market: ["orlando", "kissimmee"], names: ["gatorland"] },
  { provider: "tiqets", offerId: "orlando-hook-seaworld", market: ["orlando"], names: ["seaworld orlando", "sea world orlando"] },
  { provider: "tiqets", offerId: "orlando-hook-crayola", market: ["orlando"], names: ["crayola experience", "crayola experience orlando"] },
  { provider: "tiqets", offerId: "winterhaven-hook-peppa-pig", market: ["winter haven", "orlando"], names: ["peppa pig theme park", "peppa pig theme park florida"] },
  { provider: "tiqets", offerId: "orlando-hook-fun-spot", market: ["orlando"], names: ["fun spot america orlando", "fun spot orlando"] },
  { provider: "tiqets", offerId: "kissimmee-hook-fun-spot", market: ["kissimmee"], names: ["fun spot america kissimmee", "fun spot kissimmee"] },

  // ── New York ────────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "nyc-family-amnh", market: ["new york", "new york city", "manhattan", "nyc"], names: ["american museum of natural history"] },
  { provider: "tiqets", offerId: "nyc-drive-bronx-zoo", market: ["new york", "new york city", "bronx", "nyc"], names: ["bronx zoo"] },
  { provider: "tiqets", offerId: "nyc-budget-911-memorial", market: ["new york", "new york city", "manhattan", "nyc"], names: ["9 11 memorial museum", "national september 11 memorial museum", "9 11 memorial"] },
  { provider: "tiqets", offerId: "nyc-hook-empire-state", market: ["new york", "new york city", "manhattan", "nyc"], names: ["empire state building"] },
  { provider: "tiqets", offerId: "nyc-hook-one-world-observatory", market: ["new york", "new york city", "manhattan", "nyc"], names: ["one world observatory"] },
  { provider: "tiqets", offerId: "nyc-hook-vessel-hudson-yards", market: ["new york", "new york city", "manhattan", "nyc"], names: ["vessel", "the vessel", "vessel at hudson yards"] },
  { provider: "tiqets", offerId: "nyc-hook-summit-vanderbilt", market: ["new york", "new york city", "manhattan", "nyc"], names: ["summit one vanderbilt", "summit one vanderbilt observatory"] },
  { provider: "tiqets", offerId: "nyc-hidden-artechouse", market: ["new york", "new york city", "manhattan", "nyc"], names: ["artechouse", "artechouse nyc"] },

  // ── 2026-08-08 attraction ticket hooks, batch 2. Each venue's Tiqets page
  // was fetched and confirmed live/bookable with a real price on 2026-08-08.
  // Market is the venue's own city plus the metro it is genuinely sold into —
  // the F4 invariant. Where a BRAND exists in several cities (Madame Tussauds,
  // Museum of Illusions, Museum of Ice Cream, Color Factory) the bare brand
  // name is safe HERE because a match requires the market too; the exact-name
  // disclosure list in lib/placePartnerPicks.js uses city-suffixed aliases
  // only, because that lookup has no market gate.
  // ── Orlando metro ───────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "orlando-hook-madame-tussauds", market: ["orlando"], names: ["madame tussauds orlando", "madame tussauds"] },
  { provider: "tiqets", offerId: "orlando-hook-titanic-exhibition", market: ["orlando"], names: ["titanic the artifact exhibition", "titanic artifact exhibition"] },
  { provider: "tiqets", offerId: "orlando-hook-dezerland-park", market: ["orlando"], names: ["dezerland park orlando", "dezerland park", "dezerland action park"] },
  { provider: "tiqets", offerId: "orlando-hook-discovery-cove", market: ["orlando"], names: ["discovery cove", "discovery cove orlando"] },
  { provider: "tiqets", offerId: "orlando-hook-orlando-eye", market: ["orlando"], names: ["the orlando eye", "orlando eye", "the wheel at icon park"] },
  { provider: "tiqets", offerId: "orlando-hook-ripleys", market: ["orlando"], names: ["ripley s believe it or not orlando", "ripley s believe it or not orlando odditorium"] },
  { provider: "tiqets", offerId: "kissimmee-hook-island-h2o", market: ["kissimmee", "orlando"], names: ["island h2o water park", "island h2o live water park"] },
  { provider: "tiqets", offerId: "kissimmee-hook-old-town", market: ["kissimmee"], names: ["old town kissimmee", "old town"] },
  { provider: "tiqets", offerId: "kenansville-hook-wild-florida", market: ["kenansville", "st cloud", "kissimmee"], names: ["wild florida", "wild florida airboats", "wild florida drive thru safari park"] },

  // ── Miami metro ─────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "miami-hook-zoo-miami", market: ["miami"], names: ["zoo miami", "miami dade zoological park and gardens"] },
  { provider: "tiqets", offerId: "miami-hook-jungle-island", market: ["miami"], names: ["jungle island"] },
  { provider: "tiqets", offerId: "miami-hook-frost-science", market: ["miami"], names: ["phillip patricia frost museum of science", "frost museum of science", "frost science"] },
  { provider: "tiqets", offerId: "miami-hook-paradox-museum", market: ["miami"], names: ["paradox museum miami", "paradox experience miami"] },
  { provider: "tiqets", offerId: "miami-hook-wynwood-walls", market: ["miami"], names: ["wynwood walls", "the wynwood walls"] },
  { provider: "tiqets", offerId: "miami-hook-superblue", market: ["miami"], names: ["superblue miami", "superblue"] },
  { provider: "tiqets", offerId: "miami-hook-museum-ice-cream", market: ["miami"], names: ["museum of ice cream", "museum of ice cream miami"] },
  { provider: "tiqets", offerId: "miami-hook-skyviews-wheel", market: ["miami"], names: ["skyviews miami observation wheel", "skyviews miami"] },
  { provider: "tiqets", offerId: "miami-hook-museum-of-sex", market: ["miami"], names: ["museum of sex", "museum of sex miami"] },
  { provider: "tiqets", offerId: "miami-hook-historymiami", market: ["miami"], names: ["historymiami museum", "historymiami", "history miami museum"] },
  { provider: "tiqets", offerId: "miami-hook-deering-estate", market: ["miami"], names: ["deering estate", "the deering estate"] },
  { provider: "tiqets", offerId: "miami-hook-everglades-safari-park", market: ["miami"], names: ["everglades safari park"] },
  { provider: "tiqets", offerId: "miami-hook-museum-of-graffiti", market: ["miami"], names: ["museum of graffiti"] },
  { provider: "tiqets", offerId: "davie-hook-flamingo-gardens", market: ["davie", "fort lauderdale"], names: ["flamingo gardens"] },
  { provider: "tiqets", offerId: "ftl-hook-everglades-holiday-park", market: ["fort lauderdale"], names: ["everglades holiday park"] },
  { provider: "tiqets", offerId: "weston-hook-sawgrass-park", market: ["weston", "fort lauderdale"], names: ["sawgrass recreation park"] },

  // ── Chicago metro ───────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "chicago-hook-skydeck", market: ["chicago"], names: ["skydeck chicago", "willis tower skydeck", "willis tower"] },
  { provider: "tiqets", offerId: "chicago-hook-360-chicago", market: ["chicago"], names: ["360 chicago", "360 chicago observation deck", "john hancock observatory"] },
  { provider: "tiqets", offerId: "chicago-hook-shedd-aquarium", market: ["chicago"], names: ["shedd aquarium", "john g shedd aquarium"] },
  { provider: "tiqets", offerId: "chicago-hook-field-museum", market: ["chicago"], names: ["field museum", "the field museum", "field museum of natural history", "the field museum of natural history"] },
  { provider: "tiqets", offerId: "chicago-hook-adler-planetarium", market: ["chicago"], names: ["adler planetarium"] },
  { provider: "tiqets", offerId: "chicago-hook-art-institute", market: ["chicago"], names: ["art institute of chicago", "the art institute of chicago"] },
  { provider: "tiqets", offerId: "chicago-hook-navy-pier-wheel", market: ["chicago"], names: ["navy pier", "navy pier centennial wheel", "centennial wheel"] },
  { provider: "tiqets", offerId: "chicago-hook-flyover", market: ["chicago"], names: ["flyover", "flyover chicago", "flyover at navy pier"] },
  { provider: "tiqets", offerId: "chicago-hook-balloon-museum", market: ["chicago"], names: ["balloon museum chicago", "balloon museum"] },
  { provider: "tiqets", offerId: "chicago-hook-color-factory", market: ["chicago"], names: ["color factory chicago", "color factory"] },
  { provider: "tiqets", offerId: "chicago-hook-museum-ice-cream", market: ["chicago"], names: ["museum of ice cream", "museum of ice cream chicago"] },
  { provider: "tiqets", offerId: "chicago-hook-museum-of-illusions", market: ["chicago"], names: ["museum of illusions chicago", "museum of illusions"] },
  { provider: "tiqets", offerId: "chicago-hook-mca", market: ["chicago"], names: ["museum of contemporary art chicago", "museum of contemporary art", "mca chicago"] },
  { provider: "tiqets", offerId: "gurnee-hook-six-flags", market: ["gurnee", "chicago"], names: ["six flags great america"] },
  { provider: "tiqets", offerId: "gurnee-hook-hurricane-harbor", market: ["gurnee", "chicago"], names: ["hurricane harbor chicago", "six flags hurricane harbor chicago"] },

  // ── New York ────────────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "nyc-hook-top-of-the-rock", market: ["new york", "new york city", "manhattan", "nyc"], names: ["top of the rock", "top of the rock observation deck", "30 rockefeller plaza"] },
  { provider: "tiqets", offerId: "nyc-hook-museum-of-illusions", market: ["new york", "new york city", "manhattan", "nyc"], names: ["museum of illusions new york", "museum of illusions"] },
  { provider: "tiqets", offerId: "nyc-hook-madame-tussauds", market: ["new york", "new york city", "manhattan", "nyc"], names: ["madame tussauds new york", "madame tussauds"] },
  { provider: "tiqets", offerId: "nyc-hook-moma", market: ["new york", "new york city", "manhattan", "nyc"], names: ["the museum of modern art", "museum of modern art", "moma"] },
  { provider: "tiqets", offerId: "nyc-hook-riseny", market: ["new york", "new york city", "manhattan", "nyc"], names: ["riseny", "rise ny"] },
  { provider: "tiqets", offerId: "nyc-hook-ny-aquarium", market: ["new york", "new york city", "brooklyn", "coney island", "nyc"], names: ["new york aquarium"] },
  { provider: "tiqets", offerId: "nyc-hook-museum-ice-cream", market: ["new york", "new york city", "manhattan", "nyc"], names: ["museum of ice cream", "museum of ice cream new york"] },

  // ── St. Augustine ───────────────────────────────────────────────────────
  { provider: "tiqets", offerId: "staug-hook-pirate-museum", market: ["st augustine", "saint augustine"], names: ["st augustine pirate treasure museum", "pirate treasure museum"] },
  { provider: "tiqets", offerId: "staug-hook-aquarium", market: ["st augustine", "saint augustine"], names: ["st augustine aquarium"] },
  { provider: "tiqets", offerId: "staug-hook-shipwreck-museum", market: ["st augustine", "saint augustine"], names: ["st augustine shipwreck museum", "shipwreck museum"] },
  { provider: "tiqets", offerId: "staug-hook-history-museum", market: ["st augustine", "saint augustine"], names: ["st augustine history museum"] },
]);

/**
 * The exact partner offer for a place, or null.
 *
 * BOTH the name AND the market must match. A name hit in the wrong city returns
 * null — that is the whole point of the row carrying a market.
 *
 * @param {string} placeName  the venue's own name
 * @param {string} city       the caller's resolved city
 * @returns {{provider:string, offerId:string}|null}  never a destination URL
 */
export function venueOfferFor(placeName, city) {
  const n = norm(placeName);
  const c = norm(String(city || "").split(",")[0]);
  if (!n || !c) return null;
  for (const row of VENUE_OFFERS) {
    if (!row.names.some((name) => norm(name) === n)) continue;
    if (!row.market.some((m) => norm(m) === c)) continue;
    return { provider: row.provider, offerId: row.offerId };
  }
  return null;
}
