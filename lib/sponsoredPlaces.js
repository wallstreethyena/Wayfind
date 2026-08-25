// lib/sponsoredPlaces.js — PAID, GEO-GATED SPONSORED PLACE CARDS.
//
// Wayfind's first direct advertiser (owner, 2026-08-23): Rio Body Wax GASTONIA,
// North Carolina. Not an affiliate link, not a coupon — a business paid us to
// put their card in front of readers who are actually near them.
//
// FOUR PROPERTIES MAKE A PAID CARD SAFE, HONEST AND WORTH RENEWING:
//
//   1. GEO-GATED, HARD. A reader further than `radiusMi` from the sponsor's own
//      front door never receives the card. sponsoredPlaceNear() is the single
//      gate and scripts/check-sponsored-places.mjs pins the radius, so a paid
//      placement can never quietly widen into markets it did not buy. For Rio
//      the gate is 15 miles — Gaston County — deliberately TIGHTER than the
//      Coconut Grove 20: the same brand runs its own Charlotte (22mi) and
//      Pineville (30mi) studios, and sending a Charlotte reader to Gastonia
//      would cost the advertiser a booking rather than win one.
//
//   2. THE DISCLOSURE IS PART OF THE CARD, NOT A SETTING. `label` is required
//      and non-empty, the component renders it above the fold of the card, and
//      the guard fails the build if either stops being true. Undisclosed
//      pay-to-place is the FTC problem; disclosed paid placement is legal,
//      standard, and the reader is not being fooled.
//
//   3. THE SCORE IS NEVER FOR SALE. rating/reviews below are a dated Google
//      snapshot; the number the card SHOWS is recomputed at render by the same
//      wayfindScore() the rest of the app ranks with (lib/wayfindScore.js), so
//      a sponsor can never display a score Wayfind itself would not give them.
//      Paying moves you into a slot. It does not move your number.
//
//   4. EVERY CLAIM IS THE ADVERTISER'S OWN, VERIFIABLY. `headline`, `body` and
//      `claim` are the sponsor's copy, corroborated against riobodywax.com on
//      2026-08-23 ("Authentic Brazilian technique and organic wax", "Designed
//      for Sensitive Skin"). We do not write claims for a business about its
//      own services, and we do not print facts we could not re-verify — which
//      is why there are no opening hours on this card: Google and the brand's
//      own book-now page disagreed about them.
//
// BUNDLE NOTE: nothing in this module may be imported eagerly by app/home.js.
// The home route sits at ~498KB gz against a 500KB budget (check-bundle), and
// the gate is false for all but a few square miles of the world — so home.js
// dynamic-imports this file inside the effect that resolves the reader's
// location, and the card component behind next/dynamic. Zero bytes for the
// reader in Sarasota.
import { milesBetween } from "./partnerCollections.js";
import { wayfindScore } from "./wayfindScore.js";

export { milesBetween };

/** The default gate. Overridable per sponsor, pinned by the guard. */
export const SPONSORED_DEFAULT_RADIUS_MI = 15;

// ── The book ─────────────────────────────────────────────────────────────────
// One entry per paying advertiser. Every field below is REQUIRED except
// `endsOn`, and `endsOn: null` must be a decision someone wrote down rather
// than a field somebody forgot — see sponsoredIsLive().
export const SPONSORED_PLACES = [
  {
    id: "rio-body-wax-gastonia",
    advertiser: "Rio Body Wax",
    // THE DISCLOSURE. Rendered by the card, asserted by the guard.
    //
    // DO NOT change this to the "<brand> Partner" wording the ad copy arrived
    // with. lib/creatorRights.js bans that construction outright and
    // check-creator-rights.mjs fails the build on it, for a reason that lands
    // squarely on THIS card: the badge sits directly above a named, real
    // person (Manu), and a membership-style badge over an individual's name is
    // the textbook shape of a Lanham Act s. 43(a) false-endorsement claim. It
    // would also be the wrong claim commercially — it reads as Wayfind
    // VOUCHING for the business, which is not what was sold and not something
    // the score is allowed to be traded for. "Paid partner" is the Instagram/
    // FTC convention, says the true thing (money changed hands), gives the
    // advertiser the standing they paid for, and needs no evidence beyond the
    // invoice.
    label: "Sponsored · Paid partner",

    // The venue, exactly as Google knows it. Verified 2026-08-23 through
    // Places v1 searchText with GOOGLE_MAPS_SERVER_KEY.
    placeId: "ChIJH0a_B7W_VogRrXeKuCFkr-Q",
    name: "Rio Body Wax",
    venueLine: "Rio Body Wax · Gastonia",
    address: "2930 E Franklin Blvd Ste 25, Gastonia, NC 28056",
    lat: 35.2619678,
    lng: -81.126481,
    primaryType: "beauty_salon",
    types: ["beauty_salon", "hair_care", "point_of_interest", "establishment"],

    // Google snapshot, 2026-08-23. The SHOWN score is recomputed at hydrate.
    rating: 4.9,
    reviews: 384,

    // The storefront photo from the business's OWN Google account (author
    // "Rio Body Wax GASTONIA"), not a customer snapshot — it shows the real
    // door a reader has to find. /api/photo self-heals an expired ref from the
    // placeId inside it, so this string ageing out is not a broken image.
    // SELF-HOSTED ART (2026-08-25): the one image on the site that must never
    // depend on a metered Google fetch or the spend gate. Recovered once
    // (deliberate 1-call spend, owner-visible) and committed to the repo.
    staticPhoto: "/partners/rio-body-wax.jpg",
    photoRef:
      "places/ChIJH0a_B7W_VogRrXeKuCFkr-Q/photos/AVoNoXQL-c8FFgMJBfGsMwq1GBobbcLlgMl1hlhp2buRpsbydr5oEeiVzAEnJoNK46cZ-VCrbeCmrdyNPgIq78hf4835C_B9n_2r69GygNv5gz_ISQNXTgKK7ni2ke-xSP9JBfEq4Mm4t8KHoShvMoSZJ8CoD_aXpARZhfX2oN6KkCmANGix0wLpoAm_b2WlPe44Pu4iEHOk-_QveYiYvAAntBysNJ9Q0GTU_ex0WQj8I0KTPn5PfmgJK6homjcPSU_wbLscmUA-liVbTtSY047kqUqUksjJzFIPNLLIDbVHAQhwqV9XVRybJSzVbuwTtH9olaieUIfIs0e_Wk2lbS5x2jakUcur5TtkIDOGpWVn2UKCcBERFqZfoX-ooZyS3HOIshhymHx7rYwomFy6z3YEKEiKjkdAP1-KP894alS-EUBw1vsXFOIz2EEclGgoRot1",

    // Who the reader actually books with. A studio is a person, and the person
    // is the reason someone taps. Owner-supplied, 2026-08-23.
    person: { name: "Manu", full: "Emanuela", role: "Esthetician" },

    // Where the subject of the photograph actually sits. A centred cover crop
    // on this portrait shot cuts the studio's sign in half, which is the one
    // thing that makes the storefront recognisable from the road.
    photoPosition: "50% 26%",

    // THE SPONSOR'S OWN COPY. Corroborated against riobodywax.com.
    headline: "The wax appointment you don’t have to overthink.",
    body: "Authentic Brazilian technique, organic wax and personalized care — even if it’s your first time.",
    claim: "Designed for sensitive skin",
    cta: "Book your appointment",

    // The advertiser's real booking system (Zenoti), confirmed twice: it is the
    // websiteUri on their Google record AND the link their own /book-now/ page
    // gives for Gastonia. utm params are appended at click time so they can see
    // in their own dashboard what Wayfind sent them — that report is what makes
    // the renewal conversation short.
    href: "https://riobodywax.zenoti.com/webstoreNew/services/2ac2e288-fba8-4bd4-a8ab-54368313593b",
    phone: "+17046712160",

    // Brand palette read off the studio's own signage and collateral: the deep
    // purple and the lime. Deliberately not Wayfind orange — a paid card should
    // look like the advertiser, and should never be mistaken for our editorial.
    accent: "#6D2E8E",
    accentLight: "#8CC63F",

    // ── THE PAGE ─────────────────────────────────────────────────────────────
    // /partners/rio-body-wax-gastonia. The card only reaches readers standing
    // in Gaston County; this page reaches anyone who searches, from anywhere,
    // forever. It is the half of the deal that keeps earning between visits.
    //
    // It must also be worth landing on. Wayfind's own creator-page rule — a
    // one-item page is a thin page, it does not rank, and shipping thin pages
    // is how a domain loses its trust — applies to a paid page hardest of all.
    // So everything below is REAL: the four wax types are the brand's own
    // descriptions from riobodywax.com/services, the service counts are theirs,
    // and nothing here was written to fill space.
    page: {
      // What a stranger typing "brazilian wax gastonia" needs answered.
      lede:
        "A Brazilian wax studio in Franklin Square, Gastonia — Brazilian technique, hard wax, and a room set up for people who have never done this before.",
      about: [
        "Rio Body Wax is a waxing specialist rather than a salon that also waxes, and the difference shows up in the menu: four different Brazilian formulas, a separate sugaring line, and a room built around one service done properly.",
        "The Gastonia studio sits in Franklin Square on East Franklin Boulevard, and it is the highest-rated waxing room in Gaston County by review volume — 4.9 stars across 384 Google reviews at last check.",
      ],
      // Their words, marked as theirs. Quoting a business on its own services
      // is honest; paraphrasing it into a claim of ours is not.
      waxes: [
        { name: "Brazilian Cocoa", note: "All-natural, emollient and nourishing — calms the skin and helps reduce redness." },
        { name: "Brazilian Turmeric", note: "Brightens and softens, may help slow regrowth, anti-inflammatory." },
        { name: "Brazilian Regular", note: "The standard hard wax." },
        { name: "Brazilian Sugar", note: "Sugar, lemon juice and water — mostly recommended for finer hair." },
      ],
      services: [
        "Body waxing for her — 19 services, brow and lip through full leg",
        "Body waxing for him — 16 services, back and chest through full leg",
        "Sugaring, her and his — the full menu again in sugar paste",
        "Full-body packages — cocoa, turmeric and sugaring combinations",
        "Specials — vajacial, HydroJelly mask, high frequency, brow design and tinting",
      ],
      firstTime:
        "If it is your first time, book the Brazilian and say so when you arrive. The studio's whole pitch is that a first appointment should not require research: the providers are licensed, the formulas are chosen for sensitive skin, and picking between cocoa, turmeric, regular and sugar is a conversation you have in the room rather than a decision you have to make on the booking screen.",
      // Hours are NOT published here. Google and the brand's own book-now page
      // disagreed on 2026-08-23 (10–7 vs 9–7). A paid page is the last place to
      // print a fact we could not re-verify, so the page sends people to the
      // live booking calendar instead — which is also where the money is.
      hoursNote: "Hours vary by day — the live booking calendar has the current ones.",
    },

    // THE GATE.
    center: { lat: 35.2619678, lng: -81.126481 },
    radiusMi: 15,

    // Flight. `endsOn: null` = runs until the owner pulls it — an explicit
    // decision for the first sponsor, not an omission (Wayfind's own coupon
    // rule: a dated thing needs a date, an undated thing needs a reason).
    // The reason: going dark on a business that has paid is worse than serving
    // one extra week, and no term was agreed in writing. Give a term an end
    // date here and the card hides itself the morning after.
    startsOn: "2026-08-23",
    endsOn: null,
  },
];

/** ISO yyyy-mm-dd for "today" in the reader's own clock. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/**
 * Is this placement inside its flight window? A missing `endsOn` runs forever
 * BY DECISION; a present one auto-hides the morning after it passes, the same
 * way couponIsLive() retires an expired deal.
 */
export function sponsoredIsLive(s, now) {
  if (!s) return false;
  const day = now || today();
  if (s.startsOn && day < s.startsOn) return false;
  if (s.endsOn && day > s.endsOn) return false;
  return true;
}

/**
 * The sponsored placements whose gate contains (lat,lng), nearest first. Empty
 * outside every gate — which is the common case and the entire point: a
 * Gastonia studio must not render in Tampa.
 */
export function sponsoredPlacesNear(lat, lng, now) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return SPONSORED_PLACES.filter((s) => sponsoredIsLive(s, now))
    .map((s) => ({ s, mi: milesBetween(lat, lng, s.center.lat, s.center.lng) }))
    .filter((x) => x.mi <= (x.s.radiusMi || SPONSORED_DEFAULT_RADIUS_MI))
    .sort((a, b) => a.mi - b.mi)
    .map((x) => x.s);
}

/** The single card to show a reader here, or null. */
export function sponsoredPlaceNear(lat, lng, now) {
  return sponsoredPlacesNear(lat, lng, now)[0] || null;
}

/** A sponsor by id, or null. */
export function sponsoredPlaceById(id) {
  return SPONSORED_PLACES.find((s) => s.id === id) || null;
}

/**
 * THE PAGE LAYER. A sponsor only earns a /partners/<slug> page once it has real
 * content to put on one — the same floor lib/creatorPages.js applies to a
 * creator. A paid page with nothing on it does not rank, and a domain that
 * ships thin pages for money stops ranking for everything else too.
 *
 * The id IS the slug. One string, so a page URL and a campaign parameter can
 * never drift apart.
 */
export function sponsorHasPage(s) {
  if (!s || !s.page) return false;
  const p = s.page;
  return Boolean(
    p.lede &&
      Array.isArray(p.about) && p.about.length >= 2 &&
      Array.isArray(p.services) && p.services.length >= 3
  );
}

/** Every slug that has a page today. Feeds the sitemap and generateStaticParams. */
export function sponsorSlugs() {
  return SPONSORED_PLACES.filter(sponsorHasPage).map((s) => s.id);
}

/** The sponsor behind a /partners/<slug>, or null (which the route 404s on). */
export function sponsorBySlug(slug) {
  const s = SPONSORED_PLACES.find((x) => x.id === slug);
  return s && sponsorHasPage(s) ? s : null;
}

/** The canonical page path for a sponsor, or null when it has no page. */
export function sponsorPagePath(s) {
  return sponsorHasPage(s) ? "/partners/" + s.id : null;
}

/**
 * The outbound URL, stamped so the advertiser can see Wayfind in their own
 * analytics. Never mutates the stored href; never invents a param the sponsor
 * did not agree to. Returns the raw href unchanged if it cannot be parsed.
 */
export function sponsoredHref(s, medium) {
  if (!s || !s.href) return null;
  try {
    const u = new URL(s.href);
    u.searchParams.set("utm_source", "wayfind");
    // Which Wayfind surface sent them — the in-app card or the partner page.
    // The advertiser sees the split in their own dashboard, which is how they
    // learn that the page keeps working after the campaign window closes.
    u.searchParams.set("utm_medium", medium || "sponsored_card");
    u.searchParams.set("utm_campaign", s.id);
    return u.toString();
  } catch (e) {
    return s.href;
  }
}

/**
 * Turn a sponsor entry into the object the card renders: distance from the
 * reader, the LIVE Wayfind Score (never a baked one), the app's own photo
 * proxy, and the stamped outbound. Everything user-facing resolves here so the
 * component cannot invent a number of its own.
 */
export function hydrateSponsoredPlace(s, center) {
  if (!s) return null;
  const here = center && Number.isFinite(center.lat) ? center : s.center;
  const wf = wayfindScore(s.rating, s.reviews);
  return {
    ...s,
    distMi: milesBetween(here.lat, here.lng, s.lat, s.lng),
    // The card feeds this straight to PlaceScoreChip, which recomputes from
    // rating/reviews anyway — wfScore is passed so the two can never disagree.
    wfScore: wf,
    photo: s.staticPhoto || (s.photoRef ? "/api/photo?ref=" + encodeURIComponent(s.photoRef) + "&w=640" : null),
    outboundHref: sponsoredHref(s),
    // Where the card sends a reader who wants more than the card. null when the
    // sponsor has not earned a page, so the card can never link to a 404.
    pagePath: sponsorPagePath(s),
    mapsHref: Number.isFinite(s.lat)
      ? "https://www.google.com/maps/search/?api=1&query=" + s.lat + "%2C" + s.lng + (s.placeId ? "&query_place_id=" + s.placeId : "")
      : null,
  };
}
