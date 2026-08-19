// v4.16 — Server-rendered SEO guide pages. No "use client": these render to
// HTML at build time so search engines index the full content. Each pick can
// carry a Viator experience link (bookQuery) or a Booking.com rate link
// (hotel), both clearly disclosed. Pages cross-link into the app and back to
// the guide index for the middleman internal-link structure.
import { notFound } from "next/navigation";
import { GUIDES } from "../../../lib/guides";
import { SITE_URL } from "../../../lib/site";
import { experienceSearchUrl, viatorProductGoUrl } from "../../../lib/affiliates";
import { resolveGuideProduct, productCtaLabel } from "../../../lib/guideProductResolve";
// ONE primary CTA per guide, resolved through THE predicate in
// lib/bookingResolve — the same one the app's Detail sheet uses. The per-pick
// experienceGoUrl()/hotelSearchUrl() calls this file used to make were a PARALLEL
// resolution path: two ways to turn a place into a booking href, which is how an
// earning link once rendered with no FTC disclosure.
import { bookingTargets } from "../../../lib/bookingResolve";
import { guidePrimaryCta, guideContinue, guideIntent } from "../../../lib/guideCta";
import GuideConversion from "./GuideConversion";
import GuideDealCards from "./GuideDealCards";
// v8.23 — the share control every guide was missing, and the resolver that
// finally connects 39 guides to a 69-row deal registry they were never wired
// to. See lib/guideDeals.js for why that gap existed.
import ShareButton from "../../components/ShareButton";
import { guideDealIds } from "../../../lib/guideDeals";
import GuideEmailCapture from "./GuideEmailCapture";
import { COUPONS, couponIsLive, couponEndsLabel } from "../../../lib/coupons";
// Venue-local US Eastern, DST-aware. NEVER new Date().toISOString() — that is UTC
// and expires a coupon roughly four hours early.
import { siteTodayStr } from "../../../lib/siteTime";
// v6.73 THE DECISION ENGINE ON AN INDEXABLE PAGE. Computed SERVER-SIDE during
// ISR, which is the entire point: Wayfind's one defensible property is that its
// answer changes with the hour and the weather, and until now that engine ran
// only on /tonight, /date-night and seven siblings — all `noindex, nofollow`.
// The moat was invisible to search and absent from the pages search can see.
import { nowContext } from "../../../lib/nowContext";
import { guidePicksForNow, guideNowHeadline, guideNowExplainer, guideWeather, indoorSiblingFor, indoorFromInventory, regionCity } from "../../../lib/guideNow";
import { existingTypeSignals } from "../../../lib/placeCategory";

/**
 * Rating + review count for a place from OUR OWN inventory.
 *
 * Returns the social object on a hit, `null` when the lookup ran and the place
 * genuinely is not in inventory, and `false` when the lookup FAILED. Those three
 * must stay distinguishable — collapsing a failure into "not found" is how a
 * degraded lookup hides behind a page that merely looks sparse.
 *
 * Reads via REST rather than a client library so this stays server-safe.
 */
async function inventorySocial(placeName) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const name = String(placeName || "").trim();
  // 2026-08-08 root cause of the "[guide] social proof" log spam the owner
  // screenshotted: the land-script worktrees run `next build` WITHOUT
  // .env.local, so every guide prerender took this path and the caller
  // logged it as a FAILURE. A missing key is a configuration state (envAudit
  // doctrine: absent = feature off), not a degraded lookup — return a
  // distinct sentinel so the caller can log it quietly, once, and keep the
  // loud console.error for lookups that fail WITH keys present.
  if (!url || !anon) return "unconfigured";
  if (!name) return false;
  // The CTA's `place` can be a merchant string with qualifiers ("Gecko's Grill &
  // Pub — all locations"); match on the leading segment before punctuation.
  const stem = name.split(/[—,(]/)[0].trim().slice(0, 40);
  if (!stem) return false;
  try {
    const r = await fetch(
      `${url}/rest/v1/wf_inventory?select=name,signals&status=eq.OPERATIONAL&name=ilike.${encodeURIComponent("%" + stem + "%")}&limit=5`,
      { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    if (!Array.isArray(rows)) return false;
    for (const row of rows) {
      const rating = Number(row && row.signals && row.signals.rating);
      const reviews = Number(row && row.signals && row.signals.reviews);
      // Same floor the rankedFor path uses: below 15 reviews a rating is noise,
      // and showing it as proof would be worse than showing nothing.
      if (rating > 0 && reviews >= 15) return { rating, reviews, name: row.name };
    }
    return null;
  } catch (e) {
    return false;
  }
}
// v8.4 (owner: "in the blog we should have our iconic place cards, everyone
// needs to have those with images"). Resolves a guide pick's NAME to a real
// wf_inventory row so the card can carry the PLACE'S OWN photo, score and
// review count.
//
// NO placeId EXISTS TO USE. Measured: 0 of 214 picks across all guides carry
// one, so name matching is the only route, and it is the same ilike stem match
// inventorySocial() above already relies on — widened, not reinvented.
//
// RETURNS null WHEN IT CANNOT CONFIRM A MATCH, and the caller then renders the
// original text block. That is the whole discipline here: a generic image over
// a named place is the trust bug from the audit, so a pick we cannot resolve
// gets no card rather than a stock photo. Same >=15 review floor as the social
// path — below that a rating is noise.
async function inventoryPlaceByStem(stem, near) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon || !stem) return null;
  try {
    const r = await fetch(
      `${url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,primary_type,google_types,signals,photo_ref,editorial&status=eq.OPERATIONAL&name=ilike.${encodeURIComponent("%" + stem + "%")}&limit=5`,
      { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const rating = Number(row && row.signals && row.signals.rating);
      const reviews = Number(row && row.signals && row.signals.reviews);
      if (!(rating > 0 && reviews >= 15)) continue;
      // GEO GATE (v8.14). Name-only ilike is how the Columbia trap happens —
      // "Columbia" matches Sarasota AND Celebration, and a guide caches its
      // resolution for an hour, so a wrong-city card is served to everyone.
      // When the guide's region has known coordinates, a match farther than
      // ~80mi (beyond any day-trip radius a guide would write about) is
      // rejected rather than rendered. No coords for the region → no gate,
      // same as before.
      if (near && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng))) {
        const dLat = (Number(row.lat) - near.lat) * 69;
        const dLng = (Number(row.lng) - near.lng) * 69 * Math.cos((near.lat * Math.PI) / 180);
        if (Math.sqrt(dLat * dLat + dLng * dLng) > 80) continue;
      }
      return {
        id: row.place_id,
        name: row.name,
        rating,
        reviews,
        lat: row.lat,
        lng: row.lng,
        photoRef: row.photo_ref || null,
        types: existingTypeSignals(row),
        primary_type: row.primary_type || null,
      };
    }
    return null;
  } catch (e) { return null; }
}

// v8.14 (owner: "i want every single blog to have our iconic place card
// whenever we are recommending a place"). A pick's `name` is an editorial
// TITLE ("The mangrove shoreline trail"), so resolving on it alone left whole
// guides card-less — De Soto rendered zero cards while recommending three
// real, in-inventory places. The pick's `appQuery` is the actual place name
// (it exists precisely to name the POI for the app handoff), so it is the
// stronger candidate. Candidates run in order, most-specific first; the
// appQuery is progressively shortened from the right (min 2 words, ≥6 chars)
// because authors suffix regions ("Bean Point Beach Anna Maria") that the
// inventory row's name does not contain. First confirmed match wins; nothing
// resolving still means no card — never a stock photo under a named place.
async function inventoryPlace(pick, near) {
  if (!pick) return null;
  // v8.17 — a pick that CARRIES a placeId (the Gulf Coast guides embed real
  // ids) resolves on it directly: exact, no ilike ambiguity, no geo gate
  // needed (the id IS the identity). The name path below stays the fallback
  // for the older guides. Same >=15-review floor via the shared row shaper.
  if (pick.placeId) {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    if (url && anon) {
      try {
        const r = await fetch(
          `${url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,primary_type,google_types,signals,photo_ref,editorial&status=eq.OPERATIONAL&place_id=eq.${encodeURIComponent(pick.placeId)}&limit=1`,
          { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }
        );
        if (r.ok) {
          const rows = await r.json();
          const row = Array.isArray(rows) && rows[0];
          if (row) {
            const rating = Number(row.signals && row.signals.rating);
            const reviews = Number(row.signals && row.signals.reviews);
            if (rating > 0 && reviews >= 15) {
              return {
                id: row.place_id, name: row.name, rating, reviews,
                lat: row.lat, lng: row.lng, photoRef: row.photo_ref || null,
                types: existingTypeSignals(row),
                primary_type: row.primary_type || null,
              };
            }
          }
        }
      } catch (e) {}
    }
  }
  const seen = new Set();
  const candidates = [];
  const push = (s) => {
    const v = String(s || "").trim().slice(0, 60);
    if (v && v.length >= 6 && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); candidates.push(v); }
  };
  push(String(pick.name || "").split(/[—,(]/)[0]);
  const aq = String(pick.appQuery || "").split(/[—,(]/)[0].trim();
  if (aq) {
    const words = aq.split(/\s+/);
    for (let n = words.length; n >= 2; n--) push(words.slice(0, n).join(" "));
    if (words.length === 1) push(aq);
  }
  for (const stem of candidates) {
    const hit = await inventoryPlaceByStem(stem, near);
    if (hit) return hit;
  }
  return null;
}

import GuidePlaceCard from "../../components/GuidePlaceCard";
import { placeCardHook } from "../../../lib/rankingWhy";
// v8.14 — THE CARD CONTRACT'S CSS. IconicPlaceCard renders class names
// (.wf-place-card and friends) whose rules live in WF_PLACE_CARD_CSS, and
// this page never injected them — so every guide shipped the iconic card as
// raw unstyled HTML: the like/dislike SVGs (no width attribute; sized by CSS)
// exploded to viewport width in default link-blue, and the card body rendered
// as a bare text stack. home.js, /v8 and RankedExperiencePage all inject this
// alongside the component; guides now do the same. Locked by
// scripts/check-place-card-css-contract.mjs.
import { WF_PLACE_CARD_CSS } from "../../components/css";
import DiscoveryPaths from "../../components/DiscoveryPaths";
import OpenAppCTA from "../../components/OpenAppCTA.js";
import PremiumIntentHero from "../../components/PremiumIntentHero";
// The floating pill stays (it catches people who DO read to the end). This adds
// the above-the-fold handoff under a 50/50 experiment — measured dwell on these
// pages is 0-25s, so almost nobody reaches the pill. Control renders nothing.
import ExploreBridge from "../../components/ExploreBridge";
import IntentPartnerPick from "../../components/IntentPartnerPick";
import { guideRailIntent } from "../../../lib/railPlacement";
import { LANDING_CITIES, rankedFor, whyLine } from "../../../lib/landing";

// 15 minutes. Long enough that the weather fetch is nearly free, short enough
// that "97° right now" is never a lie. A guide whose live block is stale is
// worse than one with no live block.
export const revalidate = 900;

export function generateStaticParams() {
  return Object.keys(GUIDES).map((slug) => ({ slug }));
}

export function generateMetadata({ params }) {
  const g = GUIDES[params.slug];
  if (!g) return { title: "Guide not found" };
  const url = `${SITE_URL}/guides/${params.slug}`;
  // THE SHARE-CARD RULE (owner, 2026-07-22): every page shares a card that is
  // unique to that page — never the generic homepage art.
  const ogImg = `${SITE_URL}/api/og?t=${encodeURIComponent(g.title)}`;
  return {
    title: `${g.title} | Wayfind`,
    description: g.description,
    alternates: { canonical: url },
    openGraph: { title: g.title, description: g.description, url, siteName: "Wayfind", type: "article", images: [{ url: ogImg, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: g.title, description: g.description, images: [ogImg] },
  };
}

const S = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "0 18px 72px", background: "#040810", color: "#F1F5F9", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  meta: { fontSize: 13, color: "#94A3B8", marginBottom: 18 },
  p: { fontSize: 16, color: "#CBD5E1", margin: "0 0 18px" },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 6px" },
  tip: { fontSize: 14, color: "#8ED6C4", margin: "6px 0 0" },
  btn: { display: "inline-block", marginTop: 10, padding: "9px 16px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 14, textDecoration: "none" },
  btnGhost: { display: "inline-block", marginTop: 10, marginLeft: 8, padding: "9px 16px", borderRadius: 999, border: "1.5px solid #F97316", color: "#F97316", fontWeight: 800, fontSize: 14, textDecoration: "none" },
  disclosure: { fontSize: 12, color: "#94A3B8", margin: "22px 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
  faqQ: { fontSize: 16, fontWeight: 800, color: "#FFFFFF", margin: "14px 0 4px" },
  faqA: { fontSize: 15, color: "#CBD5E1", margin: 0 },
  footerLink: { color: "#F97316", textDecoration: "none", fontWeight: 700 },
  pick: { margin: "0 0 16px", padding: "22px", borderRadius: 20, background: "linear-gradient(145deg,#101C2B,#0A1421)", border: "1px solid #2D3748", boxShadow: "0 18px 45px rgba(0,0,0,.2)" },
};

// v7.29 PERF — the WebP derivative, not the 473KB original. This is the LCP
// element on this route too, and it is full-bleed, so the 1600px candidate is
// the same pixels the JPEG delivered at 31%% of the bytes (473KB -> 144.8KB).
// WebP and not AVIF because this is a bare <img src> with no <picture> to fall
// back from, and WebP is the format every browser we support can decode.
// Built by scripts/build-brand-derivatives.mjs.
const NEUTRAL_HERO = "/brand/opt/hero-1600.webp";

function guideHero(g) {
  const haystack = `${g.title} ${g.keyword || ""}`.toLowerCase();
  // v8.24 (owner, on the Gulf Coast Brunch & Date Night hero: "I never want
  // to see this image ever again"). Two changes: the AI neon-concert
  // composite (night-out.jpg) is BANNED site-wide and deleted from the repo
  // (locked by scripts/check-banned-art.mjs), and brunch/date-night guides
  // now match the DINING branch — a food guide was falling through to
  // nightlife art because "brunch" appeared in no branch.
  if (/restaurant|food|cuban|pie|brunch|dining|date/.test(haystack)) return "/cards/date-night-dining-hero.jpg";
  if (/beach|siesta|lido/.test(haystack)) return "/cards/beach-adobestock-216195684.jpeg";
  if (/night|bar|cocktail/.test(haystack)) return "/cards/tonight-alfonso-scarpa-unsplash.jpg";
  if (/boat|kayak|spring|airboat/.test(haystack)) return "/brand/orlando-paddleboard-portrait.jpg";
  // The keyword branches above assign art that MATCHES the guide. This last
  // line is what a guide gets when none matched, so it must assert no
  // category — it used to hand out the hidden-gems photo, which is why the
  // Ybor City, Tampa Riverwalk, Myakka River and De Soto guides all opened
  // on an image claiming they were hidden gems.
  return g.region === "Orlando" ? "/brand/orlando-night-wheel-portrait.jpg" : NEUTRAL_HERO;
}

export default async function GuidePage({ params }) {
  const g = GUIDES[params.slug];
  // v5.75 (SEO): return a real 404 for unknown guide slugs instead of a
  // 200-status "not found" body — otherwise Google indexes infinite junk URLs.
  if (!g) notFound();
  // PLACE-INTENT DEEP LINK. A guide's "Open in Wayfind" names a SPECIFIC
  // place, but a bare "/?q=" ran the app's area-first search: "Airboat the
  // Everglades headwaters" geocoded to Everglades City, recentered the app 100
  // miles from the guide's region, and showed a generic food rail (measured
  // 2026-08-07: 389 guide entry sessions, 0 detail opens). `intent=place`
  // tells home.js to resolve the query as a POI near the guide's own region
  // and open its detail sheet; `near` pins the search to the region so the
  // reader's physical location (or a POI word that doubles as a town name)
  // cannot hijack the handoff.
  const nearCity = (g.region || "Orlando") + ", FL";
  const appUrl = (name) => "/?q=" + encodeURIComponent(name) + "&intent=place&near=" + encodeURIComponent(nearCity);

  // ── the ONE primary CTA, resolved once, server-side ─────────────────────
  let primaryCta = guidePrimaryCta(g);
  const continueTo = guideContinue(g, params.slug, GUIDES);

  // ── UPGRADE A SEARCH INTO A PRODUCT, at render time ──────────────────────
  // #599 made the tour label honest: a CTA that only has a Viator SEARCH says
  // "Find tours in {region}" instead of promising tickets. Honest, but a floor —
  // measured 2026-08-05, ALL NINE tour guides were on that floor and 0 of 20
  // readers clicked.
  //
  // This is the ceiling. The page is already an async server component with ISR,
  // so it can ask Viator for the actual product and bake it in. resolveVerified
  // (the default-deny, geo-confirmed predicate behind /api/viator/go) decides —
  // NOT the weaker "region token appears in the title" check — because a guide
  // caches its CTA for a day, so a wrong-place product here is served to
  // everyone rather than to one clicker.
  //
  // Fail-soft in every direction: no key, no candidates, an ambiguous field or a
  // geo mismatch all leave the honest search label exactly as it was.
  if (primaryCta && primaryCta.kind === "tour" && !primaryCta.exact && primaryCta.place) {
    const pick = (g.picks || []).find((p) => p && p.name === primaryCta.place);
    const region = g.region || "Orlando";
    const hit = pick ? await resolveGuideProduct(pick, region).catch(() => null) : null;
    // The href goes through OUR redirect, never a bare partner URL — the route
    // re-validates the destination host before it can become a Location.
    const href = hit ? viatorProductGoUrl(hit.url, region, "guide", "guide") : null;
    if (href) {
      // Name what the click OPENS. A long title is truncated on a word boundary
      // so the button stays one line at 390px; the full title still rides the
      // events as product_title.
      primaryCta = {
        ...primaryCta,
        href,
        exact: true,
        productTitle: hit.title || primaryCta.place,
        label: productCtaLabel(hit.title, primaryCta.place),
      };
    }
  }

  // LIVE DEAL CARDS. A guide opts in by listing REGISTRY IDS — it cannot supply
  // an offer, a price or a URL of its own, so an unregistered deal has no route
  // onto the page and an expired one is dropped here by couponIsLive rather than
  // rendered as a dead link. Guides that declare nothing are untouched.
  // Weather for the guide's REGION, fetched during ISR. Fails soft: on any
  // error nowContext reports weather.known === false and the block renders
  // nothing at all, leaving the guide exactly as it is today.
  const wx = await guideWeather(g.region);
  const nowCtx = nowContext({ city: g.region, weather: wx });
  // Resolved once per render, in parallel — each is an independent ilike and
  // they all share the 1h revalidate, so this costs one round of cached reads.
  const regionSlugForGeo = String(g.region || "Orlando").toLowerCase().replace(/\s+/g, "-");
  const regionCoords = LANDING_CITIES[regionSlugForGeo]
    ? { lat: LANDING_CITIES[regionSlugForGeo].lat, lng: LANDING_CITIES[regionSlugForGeo].lng }
    : null;
  const pickPlaces = await Promise.all((g.picks || []).map((p) => inventoryPlace(p, regionCoords)));
  // DEDUPE (v8.14): two picks in one guide can legitimately resolve to the
  // same place (De Soto's trail + living-history picks are both the memorial).
  // The FIRST pick keeps the card; later duplicates keep their text block and
  // "Open in Wayfind" link — two identical cards on one page reads as a bug.
  {
    const rendered = new Set();
    for (let i = 0; i < pickPlaces.length; i++) {
      const rp = pickPlaces[i];
      if (!rp || !rp.id) continue;
      if (rendered.has(rp.id)) pickPlaces[i] = null;
      else rendered.add(rp.id);
    }
  }
  const nowResult = guidePicksForNow(g.picks, nowCtx);
  const nowHeadline = guideNowHeadline(nowCtx, g.region, nowResult);
  const nowExplainer = guideNowExplainer(nowResult, (g.picks || []).length);
  // When conditions beat this guide, hand off to a sibling that can answer
  // rather than leaving the visitor at a dead end.
  const sibling = (nowResult.mode === "plain" && nowCtx.weather.known && !nowCtx.outdoorOK)
    ? indoorSiblingFor(params.slug, GUIDES) : null;
  // DECLARED HERE, ASSIGNED LATER. The assignment must come after
  // inventorySocial (check-guide-deal-cards: rankedFor cannot answer during
  // `next build`), but that position turned out to be a nested block — so
  // declaring it there put it out of scope at the return and every guide threw
  // `ReferenceError: liveIndoor is not defined` during static generation.
  // check:jsx and all 247 guards passed: none of them EXECUTE the component.
  // Same #486 class. Split declaration from assignment so both rules hold.
  let liveIndoor = [];

  const today = siteTodayStr();
  // The canonical guide URL, built server-side from SITE_URL — the same string
  // generateMetadata canonicalises to, so what gets shared and what gets
  // indexed can never disagree.
  const shareUrl = SITE_URL + "/guides/" + params.slug;
  const INTENT_CATEGORY = { eatnow: "dining", datenight: "dining", nightout: "drinks", familyfun: "games" };
  // v8.23 — WAS `Array.isArray(g.dealCards) ? g.dealCards : []`, which meant a
  // guide showed local offers only if a human had typed their ids into
  // lib/guides.js. Two guides out of thirty-nine ever got that treatment, so
  // thirty-seven pages rendered no deals over a registry that had twenty-one
  // live rows in the Bradenton market alone (owner: "we definitely have an
  // opportunity to add clipp coupons in an article like this").
  //
  // guideDealIds() returns a hand-declared list VERBATIM when one exists, and
  // otherwise resolves the guide's own market and intent against the registry.
  // Everything downstream is unchanged — same rows, same live filter, same
  // tracked hrefs — so this widens what is eligible without loosening one rule
  // about what may render.
  const dealCards = guideDealIds(g, today)
    .map((id) => COUPONS.find((c) => c && c.id === id))
    .filter((c) => c && couponIsLive(c, today))
    .map((c) => ({
      id: c.id,
      business: c.business,
      title: c.title,
      details: c.details,
      area: c.area,
      badge: c.badge || null,
      cta: c.cta || null,
      image: c.image || null,
      category: INTENT_CATEGORY[(c.intents || [])[0]] || "dining",
      // Registry-declared href, passed through untouched. A row carrying
      // `commerce` already points at /api/commerce/go, which is the tracked
      // redirect — this never rewrites one and never adds params of its own.
      url: c.url,
      external: !String(c.url || "").startsWith("/"),
      ends: couponEndsLabel(c) || null,
    }));

  // Social proof adjacent to the CTA — review count + rating, ONLY where the data
  // actually exists. rankedFor() is the same ranked local inventory the landing
  // pages use, so these are real Google counts, never a placeholder.
  //
  // THREE OUTCOMES, KEPT DISTINCT. My first version wrapped this in one try/catch
  // that set social = null on every path, and I wrote a comment arguing that was
  // acceptable because the render looks the same either way. It is not
  // acceptable, and it is the specific thing §3 of the directive forbids: a
  // caught failure must stay distinguishable from a legitimate empty. Rendering
  // identically is fine; REPORTING identically is how a broken lookup hides for
  // five days behind a page that looks merely sparse.
  //   "ok"           matched a place with enough reviews to stand behind
  //   "no-match"     the lookup ran and this place genuinely is not in inventory
  //   "unavailable"  the lookup FAILED — a real error, logged, and carried into
  //                  the impression event so the miss is countable
  let social = null;
  let socialStatus = "no-match";
  // OUR OWN INVENTORY FIRST. rankedFor() reaches Google Places, which is not
  // available during `next build` — so on every statically generated guide it
  // returned null and social proof was silently absent on all of them. That is
  // the [guide] social proof: rankedFor returned null log, and it is an
  // environment mismatch rather than a lookup bug: the page asks a live API for
  // a number we already store. wf_inventory holds the same Google rating and
  // review count, needs no key at build time and no quota, so it is tried first
  // and rankedFor stays as the fallback. Failure is still reported as
  // "unavailable" rather than folded into "no-match".
  if (primaryCta && primaryCta.place) {
    const hit = await inventorySocial(primaryCta.place);
    if (hit === "unconfigured") {
      socialStatus = "unavailable";
      // Expected in env-less builds (land-script worktrees); not an error.
      console.log(`[guide] social proof: inventory source unconfigured (no Supabase env) — expected outside prod builds (${params.slug})`);
    } else if (hit === false) {
      socialStatus = "unavailable";
      console.error(`[guide] social proof: inventory lookup failed for "${primaryCta.place}" (${params.slug})`);
    } else if (hit) {
      social = hit;
      socialStatus = "ok";
    }
  }
  if (!social && primaryCta && primaryCta.place) {
    const cityKey = (g.region === "Tampa" ? "tampa" : g.region === "Sarasota" ? "sarasota" : "orlando");
    if (!LANDING_CITIES[cityKey]) {
      socialStatus = "unavailable";
      console.error(`[guide] social proof: no LANDING_CITIES entry for "${cityKey}" (${params.slug})`);
    } else if (!(process.env.GOOGLE_MAPS_SERVER_KEY || "").trim()) {
      // Same doctrine as above: rankedFor reaches Google Places; without the
      // server key (env-less builds) a null is BY DESIGN, not degradation —
      // don't page anyone about it.
      socialStatus = "unavailable";
      console.log(`[guide] social proof: Places server key unconfigured — rankedFor skipped, expected outside prod builds (${params.slug})`);
    } else {
      try {
        const rows = await rankedFor("things-to-do", cityKey, LANDING_CITIES[cityKey]);
        if (!Array.isArray(rows)) {
          socialStatus = "unavailable";
          console.error(`[guide] social proof: rankedFor returned ${rows === null ? "null" : typeof rows} for ${cityKey} (${params.slug})`);
        } else if (!rows.length) {
          // Zero rows is NOT a legitimate empty here — this metro has hundreds of
          // attractions in inventory, so an empty result means the lookup is
          // degraded (Places quota, cache miss), not that Orlando is empty.
          socialStatus = "unavailable";
          console.error(`[guide] social proof: rankedFor returned 0 rows for ${cityKey} — inventory is not empty, so this is a degraded lookup (${params.slug})`);
        } else {
          const want = String(primaryCta.place).toLowerCase();
          const hit = rows.find((r) => {
            const n = String(r.name || "").toLowerCase();
            return n && (n.includes(want) || want.includes(n));
          });
          if (hit && hit.rating > 0 && hit.reviews >= 15) {
            social = { rating: hit.rating, reviews: hit.reviews, name: hit.name };
            socialStatus = "ok";
          }
        }
      } catch (e) {
        socialStatus = "unavailable";
        console.error(`[guide] social proof threw for ${cityKey} (${params.slug}): ${String(e && e.message).slice(0, 160)}`);
      }
    }

  // TIER 3 — the live product, deliberately placed AFTER the social-proof
  // section above. check-guide-deal-cards enforces that our own inventory is
  // consulted BEFORE rankedFor, because rankedFor reaches Google Places and
  // cannot answer during `next build`. Inserting this earlier broke that
  // ordering; the guard caught it. Same code, correct position.
  // TIER 3 — the live product. When neither this guide nor a sibling can answer
  // the conditions, fall back to real ranked inventory for the region rather
  // than leaving the visitor at a dead end. This is what makes the fix scale:
  // no editorial work per guide, and it covers Bradenton, whose three guides
  // are 0/3 indoor and therefore have no sibling to offer.
  if (nowResult.mode === "plain" && nowCtx.weather.known && !nowCtx.outdoorOK && !sibling) {
    try {
      const citySlug = regionCity(g.region);
      if (citySlug) {
        const ranked = await rankedFor("things-to-do", citySlug, { limit: 24 });
        liveIndoor = indoorFromInventory(ranked && ranked.places ? ranked.places : ranked);
      }
    } catch (e) { liveIndoor = []; }
  }
  }
  // v4.18: FAQ structured data — makes these guides eligible for expanded
  // FAQ rich results in search, which lifts click-through beyond position.
  const faqLd = g.faq && g.faq.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  } : null;
  // Region -> landing city (all four guide regions exist as landing slugs).
  // rankedFor reuses the SAME 30-day cached rows as /go/[city], so this adds no
  // new metered Places spend beyond the first render per city.
  const bridgeSlug = String(g.region || "Orlando").toLowerCase().replace(/\s+/g, "-");
  const bridgeCity = LANDING_CITIES[bridgeSlug] || null;
  // What this guide sells under, derived from what it IS — the same
  // guideIntent() classification the primary CTA uses. null for hotel guides.
  const railIntent = guideRailIntent(guideIntent(g));
  let bridgePicks = [];
  if (bridgeCity) {
    try {
      const ranked = await rankedFor("things-to-do", bridgeSlug, { withPhotos: true });
      bridgePicks = (Array.isArray(ranked) ? ranked : []).slice(0, 3).map((p) => ({
        id: p.id, name: p.name, rating: p.rating, reviews: p.reviews,
        distMi: p.distMi, openNow: p.openNow, photoRef: p.photoRef || null,
        // Sourced why only — same helper the ranked landing pages use.
        // No Atlas/curated/editorial why → empty, never a star sentence.
        reason: whyLine(p, "spot"),
      }));
    } catch (e) { bridgePicks = []; }
  }

  return (
    <main style={S.page}>
      {/* v8.22 — same rule as the /guides hub: every guide page carries a
          visible way back into the app. */}
      <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: "#161B22", border: "1px solid #21262D", color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none" }}>‹ Back to Wayfind</a>
        <a href="/guides" style={{ color: "#8B949E", fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>All guides</a>
      </nav>
      <style dangerouslySetInnerHTML={{ __html: `
        .wf-guide-article{max-width:860px;margin:0 auto}
        .wf-guide-intro{max-width:760px;font-family:Georgia,"Times New Roman",serif;font-size:21px;line-height:1.55;color:#F1F5F9}
        .wf-guide-disclosure{font-size:11px;color:#F1F5F9;margin:12px 4px 28px;padding:0 0 12px;border-bottom:1px solid #2D3748}
        /* RIGHT NOW block — server-rendered, so it is in the indexed HTML. */
        .wf-guide-now{margin:26px 0 8px;padding:18px 20px;border-radius:14px;background:rgba(249,115,22,.07);border:1px solid rgba(249,115,22,.30)}
        .wf-guide-now-head{font-size:13px;font-weight:800;letterSpacing:.6px;text-transform:uppercase;color:#FDBA74;margin-bottom:6px}
        .wf-guide-now-why{margin:0;font-size:16px;line-height:1.5;color:#F1F5F9}
        .wf-guide-now-list{margin:12px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
        .wf-guide-now-list a{color:#F1F5F9;font-weight:650}
        .wf-guide-now-handoff{background:rgba(56,189,248,.07);border-color:rgba(56,189,248,.30)}
        .wf-guide-now-handoff a{color:#7DD3FC;font-weight:750}
        .wf-guide-now-live{background:rgba(94,232,180,.07);border-color:rgba(94,232,180,.30)}
        .wf-guide-now-live .wf-guide-now-head{color:#5EE8B4}
        .wf-guide-pick{display:grid;grid-template-columns:76px minmax(0,1fr);gap:22px;position:relative;margin:0;padding:31px 4px;border-radius:0;background:transparent;border:0;border-top:1px solid #2D3748;box-shadow:none;color:#F1F5F9}
        .wf-guide-pick:last-of-type{border-bottom:1px solid #2D3748}
        .wf-guide-number{font:600 49px/1 Georgia,"Times New Roman",serif;color:#68778d;letter-spacing:-2px;padding-top:3px;text-shadow:0 1px 18px rgba(104,119,141,.14)}
        .wf-guide-pick h2{font-size:31px;color:#F1F5F9!important}
        .wf-guide-pick>p{color:#94A3B8!important}
        .wf-guide-pick .wf-guide-tip{color:#a64f1b!important}
        /* Live deal cards. Sized so the whole card is one tap target on a phone,
           and min-width:0 on the text column is what stops a long merchant name
           forcing the grid wider than the viewport — the classic overflow. */
        .wf-gd-wrap{margin:34px 0 0}
        .wf-gd-h{font-size:22px;color:#F1F5F9;margin:0 2px 12px}
        .wf-gd-list{list-style:none;margin:0;padding:0}
        .wf-gd-card{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:start;text-decoration:none;color:inherit;background:#141c27;border:1px solid #2D3748;border-radius:14px;padding:12px;margin:0 0 10px;transition:border-color .15s ease}
        .wf-gd-card:hover{border-color:#FBBF24}
        .wf-gd-img{width:96px;height:96px;object-fit:cover;border-radius:10px;display:block;background:#0d131b}
        .wf-gd-body{min-width:0}
        .wf-gd-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
        .wf-gd-title{font-size:16px;font-weight:750;color:#F1F5F9;overflow-wrap:anywhere}
        .wf-gd-badge{flex:none;font-size:11px;font-weight:750;color:#0B0F14;background:#FBBF24;border-radius:999px;padding:2px 8px}
        .wf-gd-merchant{font-size:12.5px;color:#94A3B8;margin-top:3px;overflow-wrap:anywhere}
        .wf-gd-details{font-size:13.5px;color:#c8d1dd;line-height:1.45;margin:7px 0 0;overflow-wrap:anywhere}
        .wf-gd-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;flex-wrap:wrap}
        .wf-gd-loc{font-size:12px;color:#94A3B8;min-width:0;overflow-wrap:anywhere}
        .wf-gd-cta{flex:none;font-size:13px;font-weight:750;color:#FBBF24}
        .wf-gd-ends{font-size:11.5px;color:#94A3B8;margin-top:5px}
        .wf-gd-disc{font-size:11px;color:#94A3B8;line-height:1.45;margin:12px 2px 0}
        .wf-guide-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .wf-guide-actions a{border-radius:4px!important}
        @media(max-width:760px){
          .wf-guide-article{padding-top:2px}
          .wf-guide-intro{font-size:17px!important;line-height:1.5!important;margin:14px 2px 16px!important}
          .wf-guide-disclosure{margin:10px 2px 16px!important;padding:0 0 10px!important;font-size:10.5px!important;line-height:1.4!important}
          .wf-gd-card{grid-template-columns:72px minmax(0,1fr);gap:11px;padding:10px}
          .wf-gd-img{width:72px;height:72px}
          .wf-gd-h{font-size:19px}
          .wf-guide-pick{grid-template-columns:35px minmax(0,1fr);gap:11px;padding:21px 2px!important}
          .wf-guide-number{font-size:29px;letter-spacing:-1px;color:#7f8da1}
          .wf-guide-pick h2{font-size:22px!important;line-height:1.15!important;margin:3px 0 8px!important}
          .wf-guide-pick p{font-size:14px!important;line-height:1.5!important;margin-bottom:10px!important}
          .wf-guide-pick .wf-guide-tip{font-size:13px!important;margin:6px 0 2px!important}
          .wf-guide-actions a{margin:7px 0 0!important;padding:8px 13px!important;font-size:12.5px!important}
          /* v8.14: at phone width the pick grid's number gutter (35px column
             + 11px gap) squeezes the iconic card until the Share button clips.
             The slot is NOT a direct grid child (it lives inside the text
             column's div), so it breaks out with a negative margin equal to
             the gutter; the text above keeps its indent. */
          .wf-guide-card-slot{margin-left:-46px!important}
        }
        ${WF_PLACE_CARD_CSS}
      ` }} />
      {faqLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, datePublished: g.updated || "2026-06-01", dateModified: g.updated || "2026-06-01", author: { "@type": "Person", name: "Gabriel Pereira", url: SITE_URL + "/about" }, publisher: { "@type": "Organization", name: "WAYFIND LLC", logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png" } }, mainEntityOfPage: SITE_URL + "/guides/" + params.slug }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Guides", item: SITE_URL + "/guides" }, { "@type": "ListItem", position: 3, name: g.title, item: SITE_URL + "/guides/" + params.slug }] }) }} />
      <PremiumIntentHero
        backHref="/guides"
        backLabel="All guides"
        eyebrow="Your local decision concierge"
        location={g.region || "Orlando"}
        title={g.title}
        description={`${g.title}—distilled into the few choices actually worth your time, with the context a map result leaves out.`}
        image={guideHero(g)}
        primaryHref={"/?intent=" + encodeURIComponent(g.keyword || g.title)}
        primaryLabel="Personalize these picks"
        secondaryHref="#guide"
        secondaryLabel="Read the local edit"
        // v8.23 (owner: "why is it that none of these blog has a share button
        // ... i want a share button on all of them"). Third action, quiet tone:
        // it must not out-shout the CTA that earns. The URL is resolved on the
        // SERVER from SITE_URL — never from window.location, which on a preview
        // deploy is a host the recipient cannot open (lib/site.js).
        actions={<ShareButton
          url={shareUrl}
          title={g.title}
          text={g.title + " — found this on Wayfind."}
          tone="hero"
          event="guide_share"
          meta={{ slug: params.slug, region: g.region || null, placement: "hero" }}
        />}
      />
      <article id="guide" className="wf-guide-article">
      <div style={S.meta}>Written by the Wayfind team, led by <a href="/about" style={{ color: "#CBD5E1", textDecoration: "none", fontWeight: 700 }}>Gabriel Pereira</a> · Last verified {g.updated} · <a href="/how-wayfind-ranks" style={{ color: "#CBD5E1", textDecoration: "none", fontWeight: 700 }}>How we rank ›</a></div>
      {/* §2 OPEN LOOP, above the fold. One honest line the body resolves — a
          reader who wants the answer scrolls. Every teaser is derived from that
          guide's own tips (lib/guides.js) and check-guide-teasers.mjs proves the
          grounding, because a teaser promising something the body never delivers
          is the dark pattern the directive rules out. */}
      {g.teaser ? (
        <p className="wf-guide-teaser" style={{ margin: "0 0 14px", fontSize: 16.5, lineHeight: 1.5, color: "#FBBF24", fontWeight: 650 }}>
          {g.teaser}
        </p>
      ) : null}
      <p className="wf-guide-intro" style={S.p}>{g.intro}</p>
      <ExploreBridge city={bridgeCity} picks={bridgePicks} entryPage={"/guides/" + params.slug} pageType="guide" />
      {/* AUDIT F2 (2026-08-02) — guides took ~276 of the 685 visitors across
          the top 25 pages (40%, and a floor, since that list truncates at 25)
          and carried no bookable rail at all. The curated partner inventory
          and the theme-park deals rail mounted only on the intent pages, which
          take single digits each. /guides/things-to-do-orlando-not-theme-parks
          is the site's SECOND most-visited page at 63 visitors, over a market
          holding 193 link-checked Viator products and 10 theme-park deals.

          The intent is derived from what the guide IS, through the same
          guideIntent() classification the primary CTA already uses, mapped in
          lib/railPlacement.js — so a restaurant guide sells food/wine evening
          experiences, and a hotel guide sells nothing here at all because it
          already monetizes through Stay22 on its own links and a second rail
          would compete with the page's converting path.

          Sits BELOW the intro and ABOVE the picks: the guide's own editorial
          earns the reader first. These never enter the guide's ranking, and
          the component carries its own commission disclosure. */}
      {railIntent && bridgeCity ? (
        <IntentPartnerPick
          city={bridgeCity.name}
          intent={railIntent}
          inventory={[]}
          lat={bridgeCity.lat}
          lng={bridgeCity.lng}
        />
      ) : null}
      <div className="wf-guide-disclosure">Wayfind may earn a commission from partner links in this guide. It never changes our rankings: every pick is here on merit, and we say so when something isn&apos;t worth your money.</div>
      {/* v6.71 — the per-pick link wall is GONE. Each pick used to carry
          "Check tours & tickets" + "Check rates" + "Open in Wayfind"; measured
          dwell here is 0-25s and bounce ~50%, so almost nobody reached the end
          and those who did faced a wall of competing choices (Hick's law). The
          monetized links are consolidated into ONE primary CTA below. "Open in
          Wayfind" STAYS as the non-monetized navigation affordance.
          This deliberately removes live monetized surface area — the bet is
          instrumented in GuideConversion so it is falsifiable within a week. */}
      {/* ── RIGHT NOW ─────────────────────────────────────────────────────
          Server-rendered, so it is in the HTML Google indexes — a page whose
          ranked block genuinely differs by hour and weather, which a static
          listicle cannot fake and a competitor cannot scrape once and cache.
          Renders NOTHING when we have no weather or nothing true to say. */}
      {nowHeadline && nowExplainer ? (
        <section className="wf-guide-now" aria-label="Right now">
          <div className="wf-guide-now-head">{nowHeadline}</div>
          <p className="wf-guide-now-why">{nowExplainer}</p>
          {nowResult.mode === "gated" && nowResult.kept.length ? (
            <ol className="wf-guide-now-list">
              {nowResult.kept.slice(0, 5).map((pk, i) => (
                <li key={i}><a href={appUrl(pk.appQuery || pk.name)}>{pk.name}</a></li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
      {/* TIER 3 — live inventory. The guide has no answer and no sibling; the
          PRODUCT does. Real ranked places, classified by venueLean on Google
          TYPES (reliable, unlike prose), so this scales to every guide and
          every future city with no editorial work. */}
      {liveIndoor.length ? (
        <section className="wf-guide-now wf-guide-now-live" aria-label="Open right now">
          <div className="wf-guide-now-head">Better right now</div>
          <p className="wf-guide-now-why">
            {nowCtx.reason.charAt(0).toUpperCase() + nowCtx.reason.slice(1)} — and this guide is mostly outdoors.
            {" "}These are indoor and highly rated near {g.region}.
          </p>
          <ol className="wf-guide-now-list">
            {liveIndoor.map((p, i) => (
              <li key={i}><a href={appUrl(p.name)}>{p.name}</a>{p.rating ? <span> — {p.rating}★</span> : null}</li>
            ))}
          </ol>
        </section>
      ) : null}
      {/* THE HANDOFF. This guide cannot answer today's conditions — say so, and
          point at the sibling that can. Strictly more useful than a generic
          "Open in Wayfind", and it is chosen from the indoor data, not a
          hardcoded pairing. Absent when no sibling qualifies. */}
      {sibling ? (
        <section className="wf-guide-now wf-guide-now-handoff" aria-label="Better for these conditions">
          <p className="wf-guide-now-why">
            {nowCtx.reason.charAt(0).toUpperCase() + nowCtx.reason.slice(1)} — and most of this guide is outdoors.
            {" "}<a href={"/guides/" + sibling.slug}>{sibling.title}</a> has {sibling.indoor} picks that work right now.
          </p>
        </section>
      ) : null}
      {g.picks.map((pick, i) => {
        const resolved = pickPlaces[i];
        return (
          <section key={i} className="wf-guide-pick">
            <div className="wf-guide-number">{String(i + 1).padStart(2, "0")}</div>
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", color: "#F97316" }}>{i === 0 ? "The essential" : "The local edit"}</div>
              <h2 style={{ ...S.h2, marginTop: 5, fontFamily: "var(--wf-display)", fontSize: 28 }}>{pick.name}</h2>
              <p style={S.p}>{pick.blurb}</p>
              {pick.tip ? <p className="wf-guide-tip" style={S.tip}>Insider note — {pick.tip}</p> : null}
              {/* THE CARD, only when the place genuinely resolved. Editorial
                  is the place's sourced why-go / known-for (placeCardHook) —
                  never pick.blurb. Occasion/deal copy stays in the article
                  block above. No sourced why → empty slot, not the promo.
                  A pick that did not resolve keeps the text block and gets
                  NO card — never a stock photo under a named place. */}
              {resolved ? (
                // IconicPlaceCard renders an <li>; give it a real list parent
                // so the HTML stays valid (crawlers parse these pages raw).
                <ul className="wf-guide-card-slot" style={{ listStyle: "none", margin: "14px 0 4px", padding: 0 }}>
                  <GuidePlaceCard place={resolved} rank={i + 1} editorial={placeCardHook(resolved, [pick.blurb, pick.tip]) || null} />
                </ul>
              ) : null}
              <div className="wf-guide-actions">
                {(pick.appQuery !== null) ? <a href={appUrl(pick.appQuery || pick.name)} style={{ ...S.btnGhost, marginLeft: 0 }}>Open in Wayfind</a> : null}
              </div>
            </div>
          </section>
        );
      })}
      {dealCards.length ? (
        <GuideDealCards slug={params.slug} region={g.region || "Orlando"} deals={dealCards} />
      ) : null}
      {g.faq && g.faq.length ? (
        <section>
          <h2 style={S.h2}>Good to know</h2>
          {g.faq.map((f, i) => (<div key={i}><p style={S.faqQ}>{f.q}</p><p style={S.faqA}>{f.a}</p></div>))}
        </section>
      ) : null}
      {/* ONE monetized CTA + ONE continue card + the save prompt. The old
          four-link "More Wayfind guides" list was itself a choice wall; the
          continue card inside GuideConversion replaces it with a single
          same-region next step. */}
      <GuideConversion
        slug={params.slug}
        region={g.region || "Orlando"}
        cta={primaryCta}
        next={continueTo}
        social={social}
        socialStatus={socialStatus}
      />
      {/* Email capture (2026-08-07): guides are ~46% of external entries with a
          2.2% D+1 return — an owned channel is the only realistic comeback
          path for a trip planner reading weeks ahead. Sits after the
          conversion block so the monetized CTA keeps first position. */}
      {/* citySlug MUST be a real LANDING_CITIES key. bridgeSlug is just the
          guide's region lowercased, and plenty of regions are not landing
          cities — "Crystal River" produced /things-to-do/crystal-river, which
          answers 200 with a "Not found" body: a soft-404, the exact shape
          scripts/check-rail-routes.mjs exists to forbid. Passing null omits
          segmented hrefs rather than inventing Sarasota. */}
      <DiscoveryPaths
        region={g.region === "Orlando" ? "orlando" : "fl"}
        citySlug={bridgeCity ? bridgeSlug : null}
        cityLabel={bridgeCity ? bridgeCity.name : ""}
      />
      {/* v8.23 — THE SECOND SHARE, and the one that will do the work. The hero
          control catches a reader who already knew they wanted to send this;
          this one catches the far larger group who only know it after reading.
          It sits AFTER GuideConversion so the monetized CTA keeps first
          position — the rule the email capture below already follows. */}
      <section style={{ margin: "26px 0 4px", padding: "18px 20px", borderRadius: 16, background: "#0E1520", border: "1px solid #1F2A3A" }}>
        <p style={{ margin: "0 0 12px", fontSize: 15.5, lineHeight: 1.5, color: "#CBD5E1" }}>
          Know someone this would help? Send it to them — they'll get the same picks, ranked from where they are.
        </p>
        <ShareButton
          url={shareUrl}
          title={g.title}
          text={g.title + " — found this on Wayfind."}
          label="Share this guide"
          tone="solid"
          event="guide_share"
          meta={{ slug: params.slug, region: g.region || null, placement: "article_end" }}
        />
      </section>
      <GuideEmailCapture slug={params.slug} region={g.region || "Orlando"} />
      <p style={{ ...S.p, marginTop: 30 }}>
        Planning the rest of your trip? <a href="/" style={S.footerLink}>Wayfind</a> ranks every restaurant, attraction, and hotel near you with live hours and honest scores, and our <a href={"/culture/" + (g.region === "Tampa" ? "tampa" : g.region === "Sarasota" ? "sarasota" : "orlando")} style={S.footerLink}>{g.region || "Orlando"} culture guide</a> covers what to eat, say, and never skip.
      </p>
      <OpenAppCTA to="/" label="Open Wayfind" />
      </article>
    </main>
  );
}
