"use client";

// Portable renderer for the canonical home PlaceCard visual contract. The
// classes and geometry come from WF_PLACE_CARD_CSS; keeping those names here
// means collection cards cannot quietly become a second, taller card system.
import { WayfindScoreBadge } from "./kit";
import { businessStatus } from "../../lib/businessStatus";
import { coarseCat } from "../../lib/ranking";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { priceLabel } from "../../lib/price";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { placePartnerPick } from "../../lib/placePartnerPicks";
import { cuisineLabel } from "../../lib/dining";
import { overrideFor } from "../../lib/placeOverrides";
import * as Tags from "../../lib/tags";
import { directionsHref } from "../../lib/directions.js";
import { useEffect, useRef, useState } from "react";
import { useMarketPhotoFallback, marketPhotoQuery } from "./marketPhoto.js";
import { hasPlacePhotoRef } from "../../lib/placePhoto.js";
import { toHookLine } from "../../lib/editorialHook.js";
// v8.29 — THE CARD'S OWN HANDS. Save/Like/Dislike used to fall back to
// <a href="/p/<id>?action=like"> whenever a caller forgot to wire a handler,
// which turned a like into a navigation on every surface that forgot. The card
// now carries a working fallback instead of a link. See lib/cardActions.js.
import { useCardActions, toggleLike as fallbackLike, toggleDislike as fallbackDislike, toggleSave as fallbackSave } from "../../lib/cardActions";
// v8.29.6 — MERGED WITH main's PR #888 (lib/railReaction.js), which fixed the
// same tap from the other end: it deletes the Like/Dislike anchor outright and
// routes every reaction through one click contract that cannot navigate.
//
// Both fixes are kept, because they solve different halves. #888 guarantees the
// tap NEVER leaves the rail; it also made every unwired card a live button over
// a no-op, because stayOnRailReaction silently returns when the handler is
// missing. lib/cardActions.js is what stops that: the handler is never missing
// after hydration. So the control is always a <button> (#888's rule) and it
// always has hands (v8.29's). The anchor is gone for like and dislike.
import { stayOnRailReaction } from "../../lib/railReaction.js";

// ---------------------------------------------------------------------------
// Experience-tag chips (owner: "I need the cards to look like the cards from
// the main menu" — home.js's canonical PlaceCard shows a row of clickable
// tag chips like "☕ Coffee ›", "💰 Great value ›", "⭐ Crowd favorite ›" and
// this card had nothing computing them). This is a portable adaptation of
// app/home.js's `experienceBadges(p, selectedKey, max, audit)` — same visual
// contract and the same evidence discipline (nothing invented) — but it is a
// LOCAL, independently-owned copy, not an import.
//
// Two reasons it must not import experienceBadges: (1)
// scripts/check-collection-look.mjs asserts `experienceBadges` stays
// physically declared inside app/home.js — home.js is a client component
// module with its own closure (EXPERIENCES, HINTS, faveTier/isLocalFave/
// isBestOf, the curated BEST_OF/LOCAL_FAVE name lists) and none of that is
// exported; and (2) it is not this codebase's pattern anyway — every other
// surface outside that closure (ThingsToDoList.js's Card, HookDetail.js when
// rendered as its own module) already carries its own adapted chip logic
// rather than reaching across the module boundary, and this follows suit.
//
// Signal availability differs from home.js's PlaceCard because the rows that
// reach this component (IntentPageClient's toRow(), TrendingNowClient's buzz
// rows) never carry Google's `labels` attribute array (Live music, Cocktails,
// Wine, Beer via label, Sports, Breakfast, Good for groups, Dog friendly) or
// the curated BEST_OF/LOCAL_FAVE name lists (home.js-local, geo-gated, not
// exported anywhere). So "bestof", "livemusic", "cocktails", "wine", "sports",
// "breakfast", "groups" and "dog" cannot be produced here — there is no real
// signal to ground them in, and nothing here is allowed to invent one. Every
// other key IS grounded in data these rows really carry: reputation
// (localfav/gem/value from rating + reviews + price), setting (waterfront,
// gated on the same lib/placeOverrides.js noWater override home.js reads;
// name-evident rooftop/romantic/instagram), real Google place types
// (family/outdoor/museum/nature/entertainment, gated through lib/tags.js's
// identity/compatibility map — the same v2.0 trust layer home.js's
// experienceBadges applies) and cuisine (via the shared lib/dining.js
// cuisineLabel, the exact source home.js's badge engine already uses).
const EXP_META = {
  localfav: { icon: "⭐", label: "Crowd favorite" },
  gem: { icon: "💎", label: "Hidden gem" },
  value: { icon: "💰", label: "Great value" },
  waterfront: { icon: "🌊", label: "Waterfront" },
  rooftop: { icon: "🌆", label: "Rooftop" },
  romantic: { icon: "💕", label: "Romantic" },
  // v8.24 (owner: "we need to be looking for date night — and whatever other
  // experiences we have; I have seen lots of hidden gems"). Grounded in data
  // these rows really carry: a restaurant identity + the same price/room
  // evidence lib/railSelect.js's datenight rail selects on (priceNum >= 2 or
  // a ROOM_WORDS name), tightened with a 4.4 floor so a pricey tourist trap
  // never wears it. Clicking it deep-links ?exp=datenight like every chip.
  datenight: { icon: "🍷", label: "Date night" },
  instagram: { icon: "📸", label: "Instagrammable" },
  outdoor: { icon: "🌳", label: "Outdoor" },
  family: { icon: "👨‍👩‍👧", label: "Best for families" },
  museum: { icon: "🏛️", label: "Museum" },
  nature: { icon: "🌿", label: "Nature & trails" },
  entertainment: { icon: "🎢", label: "Attractions & fun" },
  pizza: { icon: "🍕", label: "Pizza" },
  sushi: { icon: "🍣", label: "Sushi" },
  steak: { icon: "🥩", label: "Steakhouse" },
  seafood: { icon: "🦐", label: "Seafood" },
  burgers: { icon: "🍔", label: "Burgers" },
  mexican: { icon: "🌮", label: "Mexican" },
  italian: { icon: "🍝", label: "Italian" },
  dessert: { icon: "🍰", label: "Bakery & sweets" },
  coffee: { icon: "☕", label: "Coffee" },
  beer: { icon: "🍺", label: "Great beer" },
  // v8.27 (owner, 2026-08-20: "we need to add more experience pills on it that
  // match the vibe"). These are not new claims — lib/tags.js's ALLOW map has
  // sanctioned livemusic / cocktails / wine / sports / breakfast / dog for
  // their identities since v2.0. The card simply never produced them, so the
  // vocabulary was narrower than the trust layer permitted and every bar in
  // town wore the same three pills. Each is grounded the same way the existing
  // ones are — a Google type, or an explicit word in the venue's own name —
  // and nothing here infers a vibe from a vibe.
  livemusic: { icon: "🎶", label: "Live music" },
  cocktails: { icon: "🍸", label: "Cocktails" },
  wine: { icon: "🍇", label: "Wine bar" },
  sports: { icon: "📺", label: "Sports bar" },
  breakfast: { icon: "🥞", label: "Breakfast" },
  dog: { icon: "🐾", label: "Dog friendly" },
};
// Same display precedence as home.js's `order` array in experienceBadges,
// minus the keys this surface cannot ground in real data (see comment above).
const EXP_ORDER = ["museum", "nature", "entertainment", "waterfront", "instagram", "rooftop", "romantic", "datenight", "livemusic", "cocktails", "wine", "breakfast", "sports", "dog", "outdoor", "pizza", "sushi", "steak", "seafood", "burgers", "mexican", "italian", "dessert", "beer", "coffee", "family", "gem", "value", "localfav"];

export function experienceTags(place, max) {
  if (!place) return [];
  const lim = max || 3;
  const q = new Set();
  const nm = (place.name || "").toLowerCase();
  const said = (arr) => arr.some((w) => nm.includes(w));
  const types = Array.isArray(place.types) ? place.types : [];
  const ts = types.join(" ").toLowerCase();
  const tokens = types.map((x) => String(x).toLowerCase());
  const rating = Number(place.rating) || 0;
  const reviews = Number(place.reviews) || 0;
  const priceNum = place.priceLevel != null ? Number(place.priceLevel) : (place.priceNum != null ? Number(place.priceNum) : null);
  // v5.75 parity: an override can hard-disable the waterfront read for an
  // inland place whose name merely mentions water words (same source home.js
  // reads through Ranking.overrideFor).
  const ov = overrideFor(place);
  const noWater = !!(ov && ov.noWater);

  if (rating >= 4.6 && reviews >= 800) q.add("localfav");
  if (rating >= 4.5 && reviews >= 2500) q.add("localfav");
  if (rating >= 4.4 && reviews >= 15 && reviews < 800) q.add("gem");
  if (rating >= 4.2 && priceNum != null && priceNum <= 2) q.add("value");

  if (!noWater && said(["waterfront", "riverfront", "riverwalk", "on the river", "bayfront", "beachfront", "lakefront", "wharf", "dockside", "boathouse", "on the bay", "on the water"])) q.add("waterfront");
  if (said(["rooftop", "roof top", "sky bar", "skybar", "skyline"])) q.add("rooftop");
  if (said(["romantic", "date night", "intimate", "candlelit", "special occasion"])) q.add("romantic");
  // v8.24 — date night, same evidence class as the datenight rail
  // (lib/railSelect.js): a real restaurant whose price tier or name says
  // "the room matters", with a quality floor. Types are the identity gate —
  // a $$$ mini-golf never qualifies.
  {
    const isRestaurant = tokens.some((x) => x === "restaurant" || x.endsWith("_restaurant") || x === "fine_dining_restaurant" || x === "wine_bar");
    const roomName = said(["waterfront", "rooftop", "romantic", "wine", "cellar", "chophouse", "steak", "bistro", "trattoria", "osteria", "supper", "candle", "sunset", "bayfront", "riverfront"]);
    if (isRestaurant && rating >= 4.4 && ((priceNum != null && priceNum >= 3) || ((priceNum != null && priceNum >= 2) && roomName))) q.add("datenight");
  }
  if (said(["instagram", "instagrammable", "photo spot", "photogenic", "aesthetic", "scenic", "great views", "amazing views", "beautiful views", "stunning views", "picturesque", "mural"])) q.add("instagram");

  if (["zoo", "aquarium", "amusement_park", "water_park", "theme_park"].some((x) => ts.includes(x))) q.add("family");
  if (tokens.some((x) => ["zoo", "national_park", "state_park", "botanical_garden", "campground", "beach", "park", "garden", "rv_park", "hiking_area"].includes(x))) q.add("outdoor");
  if (["museum", "art_gallery"].some((x) => ts.includes(x)) || said(["museum", "gallery"])) q.add("museum");
  if (tokens.some((x) => ["national_park", "state_park", "natural_feature", "botanical_garden", "campground", "hiking_area", "park", "garden"].includes(x)) || said(["preserve", "nature trail", "trailhead"])) q.add("nature");
  if (["amusement_park", "theme_park", "water_park", "bowling_alley", "movie_theater", "aquarium", "zoo"].some((x) => ts.includes(x))) q.add("entertainment");
  if (said(["skyway", "overlook", "lookout", "lighthouse", "observation deck"]) || tokens.includes("natural_feature")) q.add("instagram");

  const cz = (cuisineLabel(place) || "").toLowerCase();
  const CUIS = [["pizza", "pizza"], ["sushi", "sushi"], ["steak", "steak"], ["seafood", "seafood"], ["hamburger", "burgers"], ["burger", "burgers"], ["mexican", "mexican"], ["taco", "mexican"], ["italian", "italian"]];
  for (const [needle, key] of CUIS) { if (cz.includes(needle) || nm.includes(needle)) q.add(key); }
  if ((tokens.includes("bakery") && !cz) || cz.includes("bakery") || cz.includes("dessert") || /bakery|dessert|donut|doughnut|ice cream|gelato|patisserie|pastry/.test(nm)) q.add("dessert");
  if (tokens.includes("coffee_shop") || (tokens.includes("cafe") && !cz) || cz.includes("coffee") || cz.includes("cafe") || /coffee|café|cafe\b|espresso|roaster/.test(nm)) q.add("coffee");
  if (tokens.some((x) => x.includes("brew")) || /brewery|brewing|brewpub|brew pub|taproom/.test(nm)) q.add("beer");

  // v8.27 — the six sanctioned-but-unused keys. Type evidence first, then the
  // venue's OWN name; never an inference from another tag. lib/tags.js gates
  // each to the identities it belongs to, so a state park cannot wear
  // "Cocktails" even if a word matches.
  if (tokens.includes("night_club") || tokens.includes("concert_hall") || said(["live music", "music hall", "jazz", "blues bar", "honky tonk", "amphitheater", "amphitheatre", "listening room"])) q.add("livemusic");
  if (tokens.includes("cocktail_bar") || said(["speakeasy", "cocktail", "mixology", "apothecary bar"])) q.add("cocktails");
  if (tokens.includes("wine_bar") || tokens.includes("winery") || said(["wine bar", "winery", "vineyard", "enoteca", "wine room"])) q.add("wine");
  if (tokens.includes("sports_bar") || said(["sports bar", "sportsbar", "sports grill"])) q.add("sports");
  if (tokens.includes("breakfast_restaurant") || tokens.includes("brunch_restaurant") || said(["breakfast", "brunch", "pancake", "waffle", "omelette", "omelet"])) q.add("breakfast");
  if (tokens.includes("dog_park") || said(["dog friendly", "dog-friendly", "dog park", "barkery", "paws "])) q.add("dog");

  let keys = EXP_ORDER.filter((k) => q.has(k) && EXP_META[k]);
  // Same v2.0 trust gate as home.js: a tag must ALSO be compatible with the
  // place's resolved identity, or it is dropped even with real evidence.
  const identity = Tags.resolveIdentity(types, false);
  keys = Tags.filterAllowed(identity, keys).shown;
  return keys.slice(0, lim).map((k) => ({ key: k, icon: EXP_META[k].icon, label: EXP_META[k].label }));
}

const compactCount = (n) => Number(n) >= 1000
  ? (Math.round(Number(n) / 100) / 10) + "k"
  : String(Number(n) || 0);

const photoUrl = (p) => {
  const ref = p && (p.photoRef || p.photo_ref);
  if (hasPlacePhotoRef(ref)) return "/api/photo?ref=" + encodeURIComponent(ref) + "&w=640";
  if (p && typeof p.photo === "string" && p.photo) return p.photo;
  return null;
};

// v8.29 — the ticket glyph. Drawn, not an emoji: 🎟️ is a different picture on
// iOS, Android and Windows, and the one control on this card that earns money
// should not be the one whose artwork the platform chooses.
const TicketGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M3 8.5V6.6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1.9a2.4 2.4 0 0 0 0 4.8v1.9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1.9a2.4 2.4 0 0 0 0-4.8Z" />
    <path d="M14.6 5.6v1.7M14.6 11.1v1.8M14.6 16.7v1.5" strokeDasharray="1.6 2" />
  </svg>
);

const ThumbIcon = ({ down = false }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {down
      ? <><path d="M8 4v10H4V4h4Z" /><path d="M8 6h8.5a2 2 0 0 1 1.9 1.4l1.3 4a2 2 0 0 1-1.9 2.6H14l.6 3.1a2.4 2.4 0 0 1-2.4 2.9L8 14V6Z" /></>
      : <><path d="M8 10v10H4V10h4Z" /><path d="M8 18h8.5a2 2 0 0 0 1.9-1.4l1.3-4a2 2 0 0 0-1.9-2.6H14l.6-3.1A2.4 2.4 0 0 0 12.2 4L8 10v8Z" /></>}
  </svg>
);

export default function IconicPlaceCard({ place, rank, href, editorial, aiSummary, badge, rankingNote, onShare, saved, liked, disliked, inTrip, onSave, onItinerary, onLike, onDislike, onOpen, onBadge, cardActionsReadOnly = false, surface = "place_card" }) {
  // v8.29 — the shared like/dislike/save store, read ONLY when this card has an
  // action its caller did not wire. A fully wired card (the home shell's, which
  // owns its own state) subscribes to nothing and re-renders for nothing.
  // Hooks run before the early return below, because they must: a card whose
  // `place` arrives late may not skip a hook on the render before it.
  const needsFallback = !cardActionsReadOnly && !(onSave && onLike && onDislike);
  const fb = useCardActions(needsFallback);
  if (!place) return null;
  const expTags = experienceTags(place, 3);
  // THE GOVERNING LAW, shown == sorted (2026-08-07): a row ranked through
  // byVisibleScore carries governed_score (base +0.2 video −0.2 far +0.6
  // trending, disclosed below) — prefer it so the badge can never disagree
  // with the row's position. Un-ranked callers keep the canonical base.
  const score = toDisplayScore(Number.isFinite(place.governed_score) ? place.governed_score : place.wfScore != null ? place.wfScore : wayfindScore(place.rating, place.reviews));
  const category = coarseCat(place) || place.primaryType || place.type || "Local pick";
  // v8.13.3 (owner: "I don't want any of the place cards not to have an
  // image"). Rung 3 of the photo ladder — a city+category stock scene via the
  // cached /api/market-photo route — fetched ONLY when the venue-truthful
  // rungs (photoRef / photo) are absent. See app/components/marketPhoto.js
  // for the ladder and the honesty line (query is never the venue name).
  const marketFallback = useMarketPhotoFallback(photoUrl(place) ? null : marketPhotoQuery(category, place.city));
  const status = businessStatus({
    ...place,
    oh: place.oh || place.regularOpeningHours || null,
    utcOffset: place.utcOffset != null ? place.utcOffset : place.utcOffsetMinutes,
  });
  const state = status.open === true ? "Open" : status.open === false ? "Closed" : null;
  const distance = Number.isFinite(Number(place.distMi))
    ? (Number(place.distMi) < 10 ? Number(place.distMi).toFixed(1) : Math.round(Number(place.distMi))) + " mi"
    : null;
  const isCuratorPick = !!(place._members && place._members.ownerPick);
  const facts = [
    place.reviews ? compactCount(place.reviews) + " reviews" : null,
    priceLabel(place.priceLevel ?? place.price_level ?? place.priceNum),
    state,
    distance,
    // 2026-08-07: mandatory disclosure for the trending rank component
    // (lib/trendSignal.js — real demand data; lib/wayfindScore TRENDING_BONUS).
    place.trending && place.trend_reason ? "🔥 " + place.trend_reason : null,
  ].filter(Boolean);
  // v8.19 (owner screenshot: "TOP LOCAL PICK PICK"). When the category
  // falls back to "Local pick", composing "+ ' pick'" doubled the word.
  // Strip any trailing "pick" from the category before composing — the
  // award is the one place that appends it.
  const awardCat = String(category).toLowerCase().replace(/\s*pick\s*$/, "").trim() || "local";
  const award = isCuratorPick ? "Wayfind curator's pick" : rank <= 3 ? (rank === 1 ? "Best " : "Top ") + awardCat + " pick" : null;
  // v6.87 (owner): the rank-summary fallback ("Our #1 pick — 4.9★ with 921
  // reviews, and it holds up.") is GONE — rating, reviews, rank, price,
  // status and distance already render above in `facts`/`award`, and
  // restating them here was the generic filler this rule exists to kill.
  // THE CARD HOOK LAW (owner, 2026-08-20): the take is the PLACE — sourced
  // why-go / known-for — never the host page theme (birthday deal, local-edit
  // offer, guide occasion, rail title, pickReason, insider note). Callers
  // still pass `editorial`; toHookLine is the global lock so a leaked
  // pick.blurb / birthdayWhy cannot paint. Unusable → empty slot. Never invent.
  // `aiSummary` is a validated { card_line_1, card_line_2 } CARD_SUMMARY
  // (lib/editorialValidator.js already rejected anything generic, a
  // fragment, or card-data-repeating before this ever reached the client).
  // If NEITHER exists, nothing renders in this slot — no template fallback.
  const take = toHookLine(editorial, place.name);
  const validAiSummary = !take && aiSummary && typeof aiSummary === "object" && aiSummary.card_line_1 && aiSummary.card_line_2 ? aiSummary : null;
  const hasTake = !!(take || validAiSummary);
  const initials = String(place.name || "WF").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  // Save still has a crawlable fallback for callers that have not wired
  // onSave. Like/Dislike MUST NOT — that href is the 2026-08-20 P0 (Amazon
  // rail → /p/{id}?action=like → trapped on the place route). Like is a
  // signal, not a page. See lib/railReaction.js.
  const actionHref = (action) => "/p/" + encodeURIComponent(place.id) + "?action=" + action;
  // v8.29 — WIRED, OR THE CARD WIRES ITSELF. `fb.hydrated` is false on the
  // server and on the hydrating render, so the markup React reconciles against
  // is byte-identical to the HTML that was sent (the no-JS anchor); the swap to
  // a real button happens on the render right after, which is an update, not a
  // mismatch. Net effect: the anchor exists only while the page cannot run the
  // handler anyway, and a tap after hydration can never be a navigation.
  const doSave = onSave || (fb.hydrated ? (e, p) => fallbackSave(p, { surface }) : null);
  const doLike = onLike || (fb.hydrated ? (e, p) => fallbackLike(p, { surface }) : null);
  const doDislike = onDislike || (fb.hydrated ? (e, p) => fallbackDislike(p, { surface }) : null);
  const isSavedNow = onSave ? !!saved : fb.hydrated ? !!fb.saved[place.id] : !!saved;
  const isLikedNow = onLike ? !!liked : fb.hydrated ? !!fb.liked[place.id] : !!liked;
  const isDislikedNow = onDislike ? !!disliked : fb.hydrated ? !!fb.disliked[place.id] : !!disliked;
  // v8.22 (owner: "indicate in the pills that the row is scrollable — someone
  // looking at it won't know"). After hydration, measure the lane: when it
  // genuinely overflows, a small pulsing chevron sits at its right edge and
  // disappears once the reader reaches the end. No overflow → no affordance;
  // server render carries none (measurement is a client fact).
  const laneRef = useRef(null);
  const [laneMore, setLaneMore] = useState(false);
  useEffect(() => {
    const el = laneRef.current;
    if (!el) return undefined;
    const measure = () => {
      try { setLaneMore(el.scrollWidth - el.clientWidth > 8 && el.scrollLeft + el.clientWidth < el.scrollWidth - 6); } catch (e) {}
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    let ro = null;
    try { ro = new ResizeObserver(measure); ro.observe(el); } catch (e) {}
    return () => { el.removeEventListener("scroll", measure); try { ro && ro.disconnect(); } catch (e) {} };
  }, []);
  const partner = placePartnerPick(place);
  const partnerHref = partner ? commerceHref({
    provider: partner.provider,
    offerId: partner.offerId,
    surface: "iconic_place_card",
    contentId: place.id,
  }) : null;
  const openCard = (event) => {
    const target = event && event.target;
    if (target && typeof target.closest === "function" && target.closest("a,button,input,select,textarea,[role='button']")) return;
    // v7.16 (map): an in-app caller (the map's bottom card) opens the detail
    // SHEET instead of navigating away and losing the map. href remains the
    // fallback and the crawlable link.
    if (onOpen) { onOpen(place); return; }
    if (href && typeof window !== "undefined") window.location.assign(href);
  };

  return (
    <li data-iconic-place-card data-card-opens-detail onClick={openCard} className={`wf-place-card${isCuratorPick ? " is-curator-pick" : ""}${liked ? " is-liked" : ""}${disliked ? " is-disliked" : ""}${hasTake ? "" : " is-no-take"}`} style={{ listStyle: "none", cursor: href ? "pointer" : "default" }}>
      <div className="wf-place-card-layout">
        {photoUrl(place) || marketFallback
          ? <img src={photoUrl(place) || marketFallback} alt="" loading="lazy" style={{ objectFit: "cover" }} />
          : <div className="wf-place-card-monogram" aria-hidden="true">{initials}</div>}
        <div className="wf-place-card-content" style={{ position: "relative" }}>
          <div className="wf-place-card-title-row" style={{ display: "flex", alignItems: "flex-start" }}>
            <span className="wf-place-card-rank" aria-label={"Rank " + rank}>{rank}</span>
            <div className="wf-place-card-heading">
              <span className="wf-place-card-category">{category}</span>
              <a className="wf-place-card-name" href={href} onClick={onOpen ? (e) => { e.preventDefault(); e.stopPropagation(); onOpen(place); } : undefined} style={{ display: "block", color: "#F8F5EE", textDecoration: "none" }}>{place.name}</a>
            </div>
            {score != null ? <div className="wf-place-card-score"><WayfindScoreBadge score={score} /></div> : null}
          </div>

          <div className="wf-place-card-meta" style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            {facts.map((fact) => <span key={fact} style={{ color: fact === "Open" ? "#22C55E" : fact === "Closed" ? "#EF4444" : fact.startsWith("🔥") ? "#FB923C" : undefined, fontWeight: fact.startsWith("🔥") ? 700 : undefined }}>{fact}</span>)}
          </div>

          {award ? (
            <div className={`wf-place-card-award${isCuratorPick ? " is-curator" : ` is-rank-${rank}`}`} aria-label={isCuratorPick ? "Personally selected by Wayfind's curator" : undefined}>
              <span className="wf-place-card-award-icon" aria-hidden="true">{isCuratorPick ? "✦" : rank === 1 ? "🏆" : rank}</span>
              <span>{award}</span>
            </div>
          ) : null}

          {/* v6.88 (owner): `intentLabel` used to render an inert <span> here
              repeating the page's own eyebrow text ("Best of", "Trending now",
              ...) on every single card — not a link, not a badge about the
              place, just the list's own name stamped on each row for no
              reason. The user already sees what list they're looking at from
              the page header; removed entirely rather than replaced. This row
              is for real per-card badges only, matching home.js's canonical
              PlaceCard (clickable category chips, never decorative repeats). */}
          {/* v8.19 (owner: "these cut-off pills are driving me nuts … an
              intelligent way to present ALL of the experience pills with no
              cutoffs"). flexWrap:wrap + a 30px crop showed a SLIVER of the
              second row. The row is now a single horizontal swipe lane:
              every pill present, none ever cropped — .wf-place-card-highlights
              in css.js carries the nowrap/scroll/fade treatment. */}
          <div className="wf-place-card-highlights-wrap">
          <div className="wf-place-card-highlights" ref={laneRef}>
            {/* v6.89 (owner: "I need the cards to look like the cards from the
                main menu"): real experience-tag chips, computed by
                experienceTags() above from data this row actually carries —
                see that function's header comment for exactly what it can and
                cannot ground. Direct <button> children of
                .wf-place-card-highlights so they inherit the SAME orange-pill
                CSS (app/components/css.js) home.js's canonical PlaceCard chips
                use — no separate styling to drift. stopPropagation matches
                every other action in this card (Save/Like/Dislike/Share
                below): the outer <li> navigates to the detail page on click,
                and a chip tap must not also trigger that. Falls back to the
                same ?exp=<key> deep link ThingsToDoList/HookDetail already use
                since this card is portable
                and cannot assume an in-app navigation handler exists. */}
            {/* v7.15 (owner, 2026-08-11) removed these — "i told you i don't
                like the bubbles either".

                v8.5 (owner, 2026-08-16) REVERSES THAT, explicitly: "i want the
                place card to look like it used to, it looked premium and it had
                experience pills on them... bring that everywhere."

                DATED NOTE SO NOBODY UNDOES IT AGAIN: v7.15 above is SUPERSEDED,
                not forgotten. Two owner calls a week apart in opposite
                directions; this is the later one. check-collection-look §8
                encoded the v7.15 rule, and has been re-pointed with the same
                note rather than deleted.

                The engine never went away, so this restores the RENDER only,
                byte-for-byte from b5c46763^ rather than rewritten. */}
            {/* v8.17 (owner: "i asked for the water conditions you still did
                not deliver"). The caller's `badge` — live water conditions on
                the beach rail, the trending flame — is a DISCLOSURE, and it
                rendered AFTER the decorative tag pills, so on a card with two
                pills the one-row clamp (.wf-place-card-highlights, 30px)
                clipped the water chip clean off. Fort De Soto showed
                "Nature & trails · Outdoor" and no water; the pier next to it
                showed water only because it had one pill. Disclosures render
                FIRST; the clamp trims decoration instead. */}
            {badge || null}
            {expTags.map((tag) => (
              <button
                key={tag.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onBadge) onBadge(tag.key, place);
                  else if (typeof window !== "undefined") window.location.href = "/?exp=" + tag.key;
                }}
              >{tag.icon} {tag.label} ›</button>
            ))}
            {partnerHref ? (
              <a
                href={partnerHref}
                target="_blank"
                rel="sponsored noopener"
                aria-label={`Partner tickets for ${place.name} via ${partner.merchant}`}
                title="Partner link. Wayfind may earn a commission; rankings never change."
                onClick={(event) => {
                  const clickId = mintClickId();
                  const live = commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "iconic_place_card", contentId: place.id, clickId });
                  if (live && event.currentTarget) event.currentTarget.href = live;
                  try { emitCommerce("commerce_cta_clicked", { surface: "iconic_place_card", provider: partner.provider, merchant: partner.merchant, offer_id: partner.offerId, content_id: place.id, click_id: clickId, disclosure_version: "partner-place-v1" }); } catch {}
                }}
                className="wf-ticket-pill"
              >{/* v8.22 (owner: "it doesn't have to have so many letters —
                  be more concise"). Merchant + arrow is the whole message;
                  the title/aria keep the full disclosure.

                  v8.29 (owner: "display the tickets from viator on the place
                  cards ... make it look premium and fancy not ghetto like
                  this"). Same words, same disclosure, same one row — but it
                  was a bare <a> with one inline colour sitting in a lane of
                  real chips, so the ONE monetised affordance on the card was
                  the least designed thing on it. It is now a ticket: stamped
                  label, perforated stub rule, merchant in the reading weight,
                  and a drawn glyph instead of an emoji that renders as a
                  different picture on every platform. Styling only — the href,
                  the click-id mint, the commerce event and the rel are
                  untouched. */}
                <TicketGlyph />
                <span className="wf-ticket-pill-lb">Tickets</span>
                <span className="wf-ticket-pill-sep" aria-hidden="true" />
                <span className="wf-ticket-pill-mr">{partner.merchant}</span>
                <span className="wf-ticket-pill-ar" aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>
          {/* v8.22 (owner: "indicate that the pills are scrollable — someone
              looking at it won't know"). Chevron renders only while the lane
              measurably overflows and the reader is not at its end. */}
          {laneMore ? <span className="wf-pill-more" aria-hidden="true">›</span> : null}
          </div>
          {take ? (
            <div className="wf-place-card-take">{take}</div>
          ) : validAiSummary ? (
            <div className="wf-place-card-take">
              <div>{validAiSummary.card_line_1}</div>
              <div style={{ marginTop: 2 }}>{validAiSummary.card_line_2}</div>
            </div>
          ) : null}
          {rankingNote ? <div style={{ color: "#8791A4", fontSize: 9.5, marginTop: 4 }}>{rankingNote}</div> : null}

          <div className="wf-place-card-actions wf-sheet-card-actions">
            {/* v8.11 (owner, 2026-08-18): DIRECTIONS IS OFF THE CARD FACE —
                "remove the directions from the place cards; only when the user
                goes into the card details will they [see] the directions
                button, so everything fits in one row." Save / Like / Dislike /
                Share is the row, one line. The capability is unchanged where
                it belongs: the detail sheet (Detail.js) keeps its Directions
                terminal, and directionsHref() below still powers it. Same
                shape as v8.5's "+ Itinerary off the card face" call. */}
            {/* v8.5 (owner): "+ Itinerary" is OFF THE CARD FACE — a fifth
                control crowded the row. Save / Like / Dislike / Share is the row.

                THE CAPABILITY AND THE STORE ARE UNTOUCHED: onItinerary is still
                accepted, addToItinerary() still writes wayfind_trips through
                Trips.addPlaceToTrips, and quickSaveFavorite still auto-files a
                saved place into its city trip. Kept as a prop so re-exposing it
                elsewhere needs no plumbing.

                AND THIS FIXES A REGRESSION I SHIPPED IN #774. The `: (<a>♡ Save</a>)`
                fallback below belongs to the onSave ternary — it is what an
                unwired caller renders. #774 inserted the itinerary block between
                them and re-parented the fallback to onItinerary, so any surface
                passing onSave but NOT onItinerary drew TWO save controls. It is
                back where it belongs. */}
            {doSave ? (
              <button
                type="button"
                className={"wf-place-card-save" + (isSavedNow ? " is-active" : "")}
                aria-label={isSavedNow ? "Remove from saved: " + place.name : "Save " + place.name}
                aria-pressed={isSavedNow}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); doSave(e, place); }}
              >{isSavedNow ? "♥ Saved" : "♡ Save"}</button>
            ) : (
              <a className="wf-place-card-save" href={actionHref("save")} aria-label={"Save " + place.name}>♡ Save</a>
            )}
            {/* v8.29.6 — ALWAYS A BUTTON (main PR #888), ALWAYS WIRED (v8.29).
                The anchor is gone: a control that promises to register a like
                and instead loads a route is the bug both fixes exist for. The
                handler is `doLike`, which is the caller's when the caller wired
                one and lib/cardActions.js's shared store otherwise — so
                stayOnRailReaction's "no-op when the handler is missing" branch
                is unreachable on a hydrated page rather than the normal case.
                stayOnRailReaction owns stopPropagation + preventDefault, so the
                tap can never fall through to the surrounding list's navigation.

                cardActionsReadOnly remains the written opt-out for a surface
                that genuinely must not offer the control at all. */}
            {cardActionsReadOnly ? null : (
              <button
                type="button"
                className={"wf-place-card-like" + (isLikedNow ? " is-active" : "")}
                aria-label={isLikedNow ? "Remove like: " + place.name : "Like " + place.name}
                aria-pressed={isLikedNow}
                title={isLikedNow ? "Remove like" : "Like this place"}
                onClick={(e) => stayOnRailReaction(e, doLike, place)}
              ><ThumbIcon /></button>
            )}
            {cardActionsReadOnly ? null : (
              <button
                type="button"
                className={"wf-place-card-dislike" + (isDislikedNow ? " is-active" : "")}
                aria-label={isDislikedNow ? "Remove dislike: " + place.name : "Not for me: " + place.name}
                aria-pressed={isDislikedNow}
                title={isDislikedNow ? "Remove dislike" : "Not for me"}
                onClick={(e) => stayOnRailReaction(e, doDislike, place)}
              ><ThumbIcon down /></button>
            )}
            <button className="wf-place-card-share" type="button" aria-label={"Share " + place.name} onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (onShare) onShare(place); }}>↗ Share</button>
          </div>
        </div>
      </div>
    </li>
  );
}
