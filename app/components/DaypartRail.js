"use client";

// app/components/DaypartRail.js — the rail menu.
//
// WHAT IT REPLACES: the hero swipe rail (app/home.js HeroRail, eight cards
// reachable only by swiping) plus the category tile row. Both navigated with
// window.location.assign() inside onClick, which means a crawler reading the
// homepage found NO links to /best-beaches, /hidden-gems, /date-night, /family
// or /trending-now at all. Every tile here is a real <a href>, so the homepage
// finally links to the pages it has always been about.
//
// THE TWO RULES THIS COMPONENT ENFORCES
//
// 1. The hour decides what LEADS, never what EXISTS. All 15 rails render in
//    every daypart; an off-peak one is parked on the right, one swipe away.
//    Hiding a card the visitor came for is worse than showing it late.
//    (lib/dayparts.js orderFor)
//
// 2. Every rail owns exactly ONE axis. If a rail's axis-true pool is too thin
//    to fill, it renders an honest line and its route link — never someone
//    else's places wearing its name. (lib/railsData.js MIN_CARDS)
//
// HYDRATION: the server cannot know the visitor's clock, so it renders the
// daypart the CITY is in at regeneration and the browser corrects it in an
// effect after mount. First client render matches the server byte for byte;
// the reorder is an ordinary state update, not a mismatch.
//
// THE CLOCK: siteHourFloat(now, tzForPoint(lat,lng)) from lib/nowContext.js —
// never new Date().getHours(). Venue-local, not device-local: a reader in
// Seattle at 6pm PT looking at Orlando is looking at a 9pm ET city, and the
// rail must lead with tonight, not the afternoon. scripts/check-one-clock.mjs
// enforces this; scripts/test-dayparts.mjs proves the four bands never
// contradict nowContext's three.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// LAZY, and not for tidiness — for the homepage's JS budget, which this change
// blew through on Vercel (500.0KB gz against a 500KB gate,
// scripts/check-bundle.mjs). IconicPlaceCard brings businessStatus, ranking,
// score, google, price, commerce, placePartnerPicks, dining, placeOverrides and
// tags with it, and it was entering the eager homepage chunk for the first
// time — to render cards that are BEHIND A CLICK. The menu is closed at first
// paint by design ("the menu is a consequence of choosing a card — it does not
// exist until then"), so none of that belongs on the critical path.
//
// ssr:false costs nothing here: the drop renders no HTML until a card is
// picked, so there was never any server markup to lose, and the crawlable link
// is the tile's own href.
const IconicPlaceCard = dynamic(() => import("./IconicPlaceCard"), {
  ssr: false,
  loading: () => <PlaceCardSkeleton count={1} />,
});
// v8.12 — the owner's top-20 trends, back on the page (owner, 2026-08-18:
// "the exploding trends do not have the 20 top trending items"). Mounted
// INSIDE the trending drop only — behind a click, so it stays off the
// homepage's critical path (same ssr:false budget rule as the card above).
// Data: Google walk first (loadProvidedTrendList), then /api/trends/nearby
// as the owner-list floor when the walk 502/503s or finds nothing. The
// nearby route fail-softs missing config to that same in-repo list.
const ExplodingNearby = dynamic(() => import("./ExplodingNearby"), { ssr: false });
import { DAYPARTS, partForHour, orderFor, railHref, LEGACY_HERO_EVENT } from "../../lib/dayparts.js";
import { siteHourFloat, tzForPoint } from "../../lib/nowContext.js";
import { railArt, railArtSrcSet, railArtFallback, railTint, RAIL_ART_SIZES } from "../../lib/rails.js";
// v8.66 (owner, 2026-08-26): the chef and augtober tiles open the SAME
// pop-down drop as every other rail — the mid-feed rails they replace are
// gone from home.js. Chef's list is static testimony (HIS order, never
// reranked, no distance gate — Le Bernardin is in New York and that is the
// point); augtober's pool comes from /api/events/fall, fetched only when its
// drop opens. fallSkinLive gates the fall card skin: it retires the day
// after Halloween as the season hands over to Christmas.
import { RON_DUPRAT_TOP7, chefPickPlaces } from "../../lib/chefPicks.js";
import { fallSkinLive, eventFranchiseKey } from "../../lib/fallSkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
// `cityLabel` is aliased because this component already takes a prop by that
// name. The import is the LAW (never "you", never "your area"); the prop is a
// string the caller handed down.
import { emptyRailLive, liveFromRailsResponse, cityLabel as honestCityLabel } from "../../lib/locationHonesty.js";
// v8.46 — THE GREY BOX, AGAIN. lib/loadState.js was written on 2026-08-12 for
// the owner's screenshot of THIS RAIL ("What Should We Do Today?" expanded over
// an empty grey box) and BestNearby/TodaysBest were moved onto it. This
// component never was, so it kept the defect the module exists to kill: the
// skeleton was the final `else` of the render chain, reached whenever
// `shown.places[id]` was empty — which is ALSO what a still-in-flight fetch, a
// failed fetch, and a genuinely uncovered location all look like. Three
// different facts, one indistinguishable grey box, no way out of it.
import { settleLoad, LOAD_PENDING, LOAD_FAILED, LOAD_TIMEOUT_MS, isPending, isFailed } from "../../lib/loadState.js";
// v8.23 — the share intent (url, title, message body) is resolved in one pure
// module so the tile never builds a link string of its own, and so a share
// created on a dev server or a preview deploy still carries the production host
// (lib/site.js canonicalShareUrl — the "it previewed as localhost" bug).
import { railShareIntent } from "../../lib/railShare.js";
// v8.10 (owner, 2026-08-18: "there is no explanation of what the place is").
// The ONE editorial resolver every place surface uses (#687 pattern) — known-for
// research first, pool-cached blurb second, both fail-soft, no model in the
// render path — and the ONE compressor. The drop's cards were the only place
// cards on the site rendering without their editorial line.
import useEditorialHooks from "./useEditorialHooks";
import { toHookLine } from "../../lib/editorialHook";
import { formatBeachChipBits, waterQualityKey, WATER_TONE, WATER_PLAIN_LONG } from "../../lib/beachChip.js";
import PlaceCardSkeleton from "./PlaceCardSkeleton";

// Same drawing as the share control everywhere else in the app (app/home.js
// HookSolo, IconicPlaceCard) so a share is one glyph in this product rather
// than three that almost match.
const ShareGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
  </svg>
);

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "l" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);

function logEvent(name, props) {
  try { if (typeof window !== "undefined" && window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch (e) {}
}

// Rendered from the SAME float hour the band is chosen from, so the chip can
// never show a time that disagrees with the ordering beside it.

/** Left/right arrow enablement for a scroller, recomputed on scroll + resize. */
function useScrollEnds(ref, deps) {
  const [ends, setEnds] = useState({ atStart: true, atEnd: true });
  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth - 2;
    const atStart = el.scrollLeft <= 2;
    const atEnd = el.scrollLeft >= max;
    // v8.27 — BAIL OUT WHEN NOTHING CHANGED. This runs on every `scroll` event
    // of a rail the reader is dragging. It used to hand setEnds a FRESH OBJECT
    // each time, so the state identity always differed, React never bailed, and
    // dragging a rail re-rendered this whole component — tile track, open drop,
    // every place card, the beach-conditions effect and the editorial-hook
    // effect — at roughly 60fps for the length of the gesture. That is the
    // "jumpy and glitchy" the owner reported (2026-08-20). These are two
    // booleans: return the SAME object when they are unchanged and React stops.
    setEnds((prev) => (prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }));
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    sync();
    const raf = requestAnimationFrame(sync);
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, ...(deps || [])]);
  return [ends, sync];
}

export default function DaypartRail({
  rails = [],
  places = {},
  guides = [],
  thin = [],
  region = "fl",
  citySlug = "",
  cityLabel = "",
  lat = null,
  lng = null,
  initialDaypart = "afternoon",
  // The reader's real location, once it resolves. app/home.js passes `center`,
  // the one piece of state both geolocation and the search box write to.
  // Unresolved seed (DEFAULT_CENTER / null) is NOT a visitor location.
  center = null,
  // v8.69 — THE PAID CARD INSIDE A RAIL'S DROP (owner, 2026-08-26). Already
  // geo-gated, flight-checked and hydrated by app/home.js through
  // lib/sponsoredPlaces.sponsoredRailCardNear(), so this component makes no
  // eligibility decision of its own — it places the card and renders the
  // disclosure. Null for every reader outside a sponsor's bought radius, which
  // is nearly all of them, and null on /v8 which has no location machinery.
  //
  // Distinct from `sponsor` above, which is a rail TILE (the poster in the
  // track). This is a CARD in the list behind one.
  sponsorCard = null,
  onCoverage = null,
  // v8.46 — the label the CHROME is showing the reader. The drop needs it for
  // one job only: to name the town in the honest "we're not live here yet"
  // copy. It is never used to rank anything — `center` does that — so a label
  // that disagrees with the coordinates can mislead nobody here.
  locName = "",
  // v8.46 — the way out of an uncovered/unlocated drop: home.js's recenterToMe,
  // the same one-tap GPS fix the header runs. Nullable (/v8 has no location
  // machinery); without it the drop still explains itself, it just cannot
  // offer the fix.
  onRecenter = null,
  // v8.29.16 — WHERE "SEE WHAT'S ON" ACTUALLY GOES. Every other tile opens a
  // drop of place cards, which is the right payoff for "the best beaches near
  // you". The events tile promises something a place card cannot be: concerts,
  // festivals, shows and pop-ups — things with a DATE. Its drop was showing
  // ticketed VENUES (the arena, the playhouse), which is a different question
  // answered under a headline the owner drew himself.
  //
  // So this one tile hands off to the events screen, where the real feed lives
  // — now including the hand-verified schedule in wf_events (v8.29.16,
  // app/api/events). Nullable: /v8 mounts this component without it and keeps
  // the old drop behaviour rather than breaking.
  onOpenEvents = null,
  // v8.4 — SAVE AND ITINERARY. This surface had NEITHER, and it is the one the
  // owner looks at most: the homepage rail drop. All four come from app/home.js
  // so the state is the SAME store every other surface reads — a place saved
  // here shows as saved in Favorites, and one added to a trip shows on the
  // Itinerary screen. Nullable: the /v8 preview route mounts this component
  // without them and must keep working.
  isSaved = null,
  isOnTrip = null,
  onSave = null,
  onItinerary = null,
  // v8.28 — LIKE/DISLIKE STAY ON THE RAIL, AND THEY REGISTER. The drop used to
  // omit these entirely, so IconicPlaceCard fell back to
  // <a href="/p/{id}?action=like"> and every thumb left the open rail. Same
  // store as onSave: app/home.js toggleLike / toggleDislike.
  onLike = null,
  onDislike = null,
  onShare = null,
  // v8.29.6 — BOTH SHAPES, because the two fixes that met here chose
  // differently and both callers exist. `liked` / `disliked` are the maps
  // main's PR #888 passes; `isLiked` / `isDisliked` are the predicates v8.28
  // passes, the same shape as isSaved / isOnTrip above. test-first-screen
  // requires every rail prop to be server data or a callable, and a MAP of
  // client state would break that rule if the rail rendered from it — it does
  // not: both are read only inside the drop, which emits no HTML until a card
  // is picked and is itself a next/dynamic ssr:false import.
  liked = null,
  disliked = null,
  isLiked = null,
  isDisliked = null,
  // The curator gold ("god bump") is driven by place._members.ownerPick, which
  // lib/memberSignals.js sets for the OWNER's like (ownerId is server env only
  // and is never derived on the client — that is deliberate). app/home.js
  // applies this to every pool it owns and it was NEVER applied to the rail
  // pool, so the mark could not appear on these cards even after a like landed.
  // The parent hands down ITS fetcher and ITS decorator rather than this file
  // re-deriving either: one signal source, one aggregation.
  memberSignalsFor = null,
  applyMemberSignal = null,
  // v8.17 (owner, live screenshot: "when i go on a card detail and then try
  // to go back everything is gone from the main page"). ROOT CAUSE: a rail
  // card's only open path was its /p/{id} href — a FULL NAVIGATION off the
  // homepage, so the open rail, scroll position and feed state were destroyed
  // and Back reloaded the page cold. app/home.js now passes openDetail here;
  // the card opens the detail SHEET in place (href stays as the crawlable
  // fallback), exactly like every other in-app card. Nullable for the /v8
  // preview route, which keeps the navigation behavior.
  onOpenPlace = null,
  // A sponsor/partner rail (e.g. Coconut Grove) hands its collection id up to
  // home.js, which opens the curated partner sheet — the tile never navigates.
  // `sponsor` is the synthetic rail object itself (already geo-gated by home.js,
  // or null); `onOpenPartner` is the callback its tile fires.
  sponsor = null,
  onOpenPartner = null,
  // v8.23 — SHARE. The tile hands an intent up rather than opening a sheet
  // itself, because app/home.js already owns the hard part: on iOS a clipboard
  // write consumes the tap's transient user activation, so the native sheet has
  // to be the FIRST activation-consuming call in the handler (shareLink, v4.07).
  // A second implementation here would be a second thing to get wrong.
  //
  // The handler returns TRUE when a native sheet actually opened. False means
  // the link was only copied — and that is exactly when this card has to say so
  // itself, because on a desktop nothing else visibly happens.
  onShareRail = null,
  // v8.23 — a shared card lands as /?rail=<id> (see app/r/[rail]/page.js) and
  // opens its own drop. That is what makes the share honest: the recipient sees
  // THIS rail's picks, and the center effect above re-ranks every one of them
  // from their own location the moment geolocation resolves.
  initialRail = null,
}) {
  const [daypart, setDaypart] = useState(initialDaypart);
  // THE RAIL FOLLOWS THE READER. Server props are the flagship metro's ranking
  // — a real answer at first paint, and the WRONG one the moment we know the
  // visitor is somewhere else, or that /api/rails failed. covered:false and
  // thrown fetches must empty the flagship, never keep Sarasota as "your" city.
  const [live, setLive] = useState(null);
  // v8.46 — WHAT THE EMPTINESS MEANS. `live` alone cannot say: emptyRailLive()
  // is byte-identical for "the fetch is in flight", "the fetch failed" and
  // "Wayfind does not cover this town", and the render chain used to treat all
  // three as "still ranking" and show a skeleton with no way out. This is the
  // missing fact, tracked explicitly and settled by lib/loadState.js:
  //   null          — nothing has been asked yet; the server props are the answer
  //   LOAD_PENDING  — a /api/rails request is genuinely in flight (skeleton OK)
  //   LOAD_FAILED   — it failed or timed out (12s) — say so, offer a retry
  //   "uncovered"   — it answered covered:false — say so, offer the way in
  //   "live"        — real ranked places for this reader's point
  const [railLoad, setRailLoad] = useState(null);
  // A failed load must be RE-CLAIMABLE (lib/loadState.js canClaim). Bumping
  // this re-runs the center effect with identical coordinates, which is what
  // makes the "Try again" button a real button and not decoration.
  const [retryNonce, setRetryNonce] = useState(0);
  const [selected, setSelected] = useState(null);
  const trackRef = useRef(null);
  const pcRef = useRef(null);
  const menuRef = useRef(null);
  // v8.46 — THE SERVER PROPS ARE AN ANSWER AGAIN. dd783d8 ("leftover Sarasota
  // after Tampa") replaced `{ places, thin, … }` with `{ places: {}, thin: [] }`
  // to stop a Tampa reader inheriting the flagship's places. It over-corrected:
  // `places` and `thin` became DEAD PROPS, so before the first live payload
  // every rail was empty AND `thin` was empty — which is exactly the state that
  // fell through to the terminal skeleton. It also broke /v8 outright, which
  // passes real per-city places and never passes `center`, so `live` there is
  // permanently the honest empty.
  //
  // Reinstated safely, because the shape it feared no longer exists: the ISR
  // homepage asks railMenuData(null) (app/page.js), which by design returns
  // places:{} and every list rail in `thin` — an honest empty, not a flagship.
  // A caller that DOES pass places (/v8) is passing its own city's, and the
  // center effect still replaces them the instant the reader is somewhere else.
  const shown = live || { places: places || {}, thin: thin || [], region: region || null, citySlug: citySlug || null, cityLabel: cityLabel || "" };
  const thinSet = useMemo(() => new Set(shown.thin), [shown.thin]);
  const railById = useMemo(() => new Map((sponsor ? [sponsor, ...rails] : rails).map((r) => [r.id, r])), [sponsor, rails]);
  // NOTE on `artStale`: a rail can be renamed in code while the reader keeps
  // seeing the old claim, because the headline on these tiles is PIXELS.
  // `trending` still reads "EXPLODING TRENDS NEAR YOU" in the artwork, and the
  // Exploding Trends accordion is dark (removed 2026-08-16). The stale tile is
  // hidden — do not remount the accordion; do not advertise a dark surface.
  // A SPONSOR tile (a geo-gated neighborhood partner, e.g. Coconut Grove) is
  // injected here as a SYNTHETIC rail — home.js passes it already gated by the
  // reader's location, or null. It is NOT added to lib/rails.js RAILS, so the
  // canonical 15-rail identity/route/rotation guards are untouched; it just
  // rides the same tile markup and pins to the FRONT ("Top Sponsor").
  const allRails = useMemo(() => (sponsor ? [sponsor, ...rails] : rails), [sponsor, rails]);
  const order = useMemo(() => {
    const base = orderFor(daypart, rails.map((r) => r.id));
    return sponsor ? [sponsor.id, ...base] : base;
  }, [daypart, rails, sponsor]);
  const band = DAYPARTS[daypart] || DAYPARTS.afternoon;

  // Re-rank when the reader is meaningfully somewhere else. The threshold is
  // generous on purpose: a few miles is the same market and refetching on every
  // GPS jitter would spend a request to return an identical list.
  useEffect(() => {
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
      // A CALLER THAT ALREADY NAMED THE CITY. /v8?city=orlando ranks on the
      // server for a city IT chose and hands the result down in `places` plus
      // that city's own point in lat/lng. There is no reader location to wait
      // for and none is claimed — the page's own <h1> says which city this is —
      // so the server props are the answer, not a placeholder. The ISR homepage
      // is untouched by this: railMenuData(null) returns lat/lng null, so it
      // still falls through to the honest empty below and can never present a
      // flagship metro as the visitor's town.
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setLive(null);
        setRailLoad("live");
        return undefined;
      }
      // No point from either side. Geolocation is probably still resolving
      // (8s GPS timeout, then the /api/geo fallback), so this IS pending — but
      // pending with a DEADLINE, on the same clock loadState uses. A reader who
      // blocked location, or whose fix never lands, gets a sentence and a
      // button instead of the grey box that could previously sit there for the
      // life of the tab.
      setLive(emptyRailLive());
      setRailLoad(LOAD_PENDING);
      const settleUnlocated = setTimeout(() => setRailLoad("unlocated"), LOAD_TIMEOUT_MS);
      return () => clearTimeout(settleUnlocated);
    }
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const R = 3958.8, r = (d) => (d * Math.PI) / 180;
      const s2 = Math.sin(r(center.lat - lat) / 2) ** 2
        + Math.cos(r(lat)) * Math.cos(r(center.lat)) * Math.sin(r(center.lng - lng) / 2) ** 2;
      // v8.7 (owner, 2026-08-18: "leverage the exact user location … show
      // everything that is the best near the user"). Was 20 miles — inside the
      // same metro the rail kept the city-hall ranking while the map measured
      // from the reader, and a Parrish reader saw Sarasota-centre miles on
      // every card. 1.5mi still absorbs GPS jitter; a real move re-asks.
      //
      // v8.30 — THE BAND IS PART OF THE ANSWER NOW, so it joins the point in
      // this test. The today card holds the owner's handpicked board for the
      // CURRENT band only, and a reader who has not moved an inch still needs a
      // new payload the moment the clock crosses into the next one — otherwise
      // the morning board sits there all evening. Standing still inside the
      // band the server already rendered is still free.
      if (R * 2 * Math.asin(Math.sqrt(s2)) < 1.5 && daypart === initialDaypart) {
        // The reader is standing where the server already ranked, in the band
        // it ranked for: the server props ARE the live answer. `live = null`
        // now means exactly that, because `shown` falls back to those props.
        setLive(null);
        setRailLoad("live");
        return undefined;
      }
    }
    let cancelled = false;
    setLive(emptyRailLive());
    setRailLoad(LOAD_PENDING);
    // Snapped to ~0.7mi so the CDN sees a countable set of URLs per metro, not
    // one per GPS fix. The server re-measures every distance from this point.
    const snap = (v) => Math.round(v * 100) / 100;
    // v8.46 — SETTLED, ALWAYS. Through lib/loadState.js, the module written for
    // this exact grey box: the 12s timer is armed BEFORE the request, so a
    // black-holed connection, a sleeping device and a promise nothing ever
    // resolves all reach LOAD_FAILED instead of leaving the skeleton up. The
    // old chain had a .catch for rejections and nothing at all for a fetch that
    // simply never settles — the one failure mode that looks like slowness.
    settleLoad(() => fetch(`/api/rails?lat=${encodeURIComponent(snap(center.lat))}&lng=${encodeURIComponent(snap(center.lng))}&band=${encodeURIComponent(daypart)}&v=2`).then((r2) => r2.json())).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setLive(emptyRailLive());
        setRailLoad(LOAD_FAILED);
        try { onCoverage && onCoverage("error"); } catch (e) {}
        return;
      }
      const j = res.data;
      const covered = !!(j && j.covered === true && j.data);
      setLive(liveFromRailsResponse(j));
      setRailLoad(covered ? "live" : "uncovered");
      try { onCoverage && onCoverage(covered ? "covered" : "uncovered"); } catch (e) {}
    });
    return () => { cancelled = true; };
  }, [center && center.lat, center && center.lng, lat, lng, daypart, initialDaypart, retryNonce]);

  // The live hour, after mount, from the ONE clock — read in the timezone of
  // the coordinates being ranked. Re-checkedevery minute so a rail left open across
  // a band edge reorders instead of going stale.
  useEffect(() => {
    const tz = tzForPoint(lat, lng);
    const tick = () => {
      const h = siteHourFloat(new Date(), tz);
      setDaypart(partForHour(h));
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [lat, lng]);

  // v8.1 (owner, 2026-08-16: "dont write nothign on top of the card just use
  // the card information"). There is no text overlay any more. Every card's
  // headline, sub and CTA are IN the artwork — the owner drew them there — so
  // rendering them again in HTML on top produced the doubled copy in his
  // screenshot ("Beach Day / The beach, decided" stamped over "WE FOUND THE
  // BEST BEACHES"). The tile is the picture. Its accessible name comes from
  // aria-label and the <img> alt, so nothing is lost to a screen reader.
  const [trackEnds, syncTrack] = useScrollEnds(trackRef, [order.length]);
  const [pcEnds, syncPc] = useScrollEnds(pcRef, [selected]);

  const open = useCallback((id, src) => {
    const rail = railById.get(id);
    if (!rail) return;
    setSelected(id);
    logEvent("rail_open", {
      rail_id: id, rail_title: rail.title, daypart, region: shown.region, city: shown.citySlug,
      position: order.indexOf(id) + 1, src: src || "rail",
      has_places: (shown.places[id] || []).length,
    });
    // The hero cards these replace fire eight named events that live dashboards
    // depend on. Keep emitting them for one release so nothing flatlines at
    // cutover; delete LEGACY_HERO_EVENT once the new series has history.
    const legacy = LEGACY_HERO_EVENT[id];
    if (legacy) logEvent(legacy, { src: "rail", rail_id: id });
  }, [railById, daypart, shown, order]);

  const close = useCallback(() => setSelected(null), []);

  // Which tile is currently saying "Link copied". One at a time, cleared on a
  // timer that matches the wf8Said animation — a toast that outlives its own
  // fade is a toast that looks stuck.
  const [artReady, setArtReady] = useState({});
  const markArtReady = useCallback((id) => {
    if (!id) return;
    setArtReady((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const mark = () => {
      track.querySelectorAll("img.wf8-tim").forEach((img) => {
        if (!(img.complete && img.naturalWidth)) return;
        const tile = img.closest("[data-id]");
        const id = tile && tile.getAttribute("data-id");
        if (id) markArtReady(id);
      });
    };
    mark();
    const raf = requestAnimationFrame(mark);
    return () => cancelAnimationFrame(raf);
  }, [order, markArtReady]);
  const [said, setSaid] = useState(null);
  useEffect(() => {
    if (!said) return undefined;
    const t = setTimeout(() => setSaid(null), 2400);
    return () => clearTimeout(t);
  }, [said]);

  const share = useCallback((r) => {
    if (!r) return;
    const intent = railShareIntent(r.id);
    if (!intent) return;
    logEvent("rail_share", {
      rail_id: r.id, rail_title: r.title, daypart,
      region: shown.region, city: shown.citySlug,
      open: selected === r.id, src: "rail_tile",
    });
    let native = false;
    try { native = onShareRail ? onShareRail(intent) === true : false; } catch (e) { native = false; }
    if (native) return;
    // /v8 mounts this component without the prop. Rather than have the button
    // do nothing there, copy the link directly — a share that quietly fails is
    // worse than one that only half-works.
    if (!onShareRail && typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      try { navigator.clipboard.writeText(intent.url); } catch (e) {}
    }
    setSaid(r.id);
  }, [onShareRail, daypart, shown, selected]);

  const openedShared = useRef(false);
  useEffect(() => {
    if (openedShared.current) return;
    if (!initialRail || !railById.has(initialRail)) return;
    openedShared.current = true;
    open(initialRail, "share_link");
  }, [initialRail, railById, open]);

  // Take the reader TO the picks. Owner, repeatedly.
  //
  // v8.26 ROOT CAUSE: the homepage does NOT scroll the document. app/home.js
  // renders the feed inside <div className="wf-scrollarea" overflowY:"auto">,
  // so THAT div is the scrolling box; window.scrollY is always 0 here and
  // window.scrollTo() is a no-op.
  //
  // v8.27.2 — WHY v8.26 STILL DID NOT FIRE IN PRODUCTION. The drop's picks
  // arrive from /api/rails AFTER it opens, so at the moment of the landing the
  // page has not grown and scrollIntoView has almost no runway. v8.26
  // re-checked exactly ONCE, on a 620ms timer, still earlier than the cards,
  // then never looked again. It was verified against a build with placeholder
  // Supabase credentials, where the drop stayed empty and therefore never grew
  // — the one environment in which this bug cannot appear.
  //
  // So the landing is a SETTLEMENT, not a moment: a ResizeObserver re-lands on
  // every height change and stops the instant the picks are on screen, on any
  // touch of the reader's own, or at a hard 4s ceiling. Our own scrolling never
  // resizes the drop, so this cannot feed itself.
  useEffect(() => {
    if (!selected || typeof window === "undefined") return undefined;
    const sec = menuRef.current;
    if (!sec) return undefined;
    const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let f1 = 0, f2 = 0, ceiling = 0, ro = null, settled = false, userMoved = false;
    const noteUser = () => { userMoved = true; };
    const onScreen = () => {
      const el = pcRef.current || sec;
      const top = el.getBoundingClientRect().top;
      return top >= -8 && top <= (window.innerHeight || 0) * 0.72;
    };
    const land = (behavior) => {
      try { sec.scrollIntoView({ behavior, block: "start", inline: "nearest" }); }
      catch (e) { try { sec.scrollIntoView(true); } catch (e2) {} }
    };
    const settle = (behavior) => {
      if (settled || userMoved) return;
      if (onScreen()) { settled = true; return; }
      land(behavior);
    };
    const stop = () => { settled = true; if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; } };
    f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => {
        settle(reduced ? "auto" : "smooth");
        if (reduced) { stop(); return; }
        for (const ev of ["wheel", "touchmove", "keydown"]) window.addEventListener(ev, noteUser, { passive: true, once: true });
        try { ro = new ResizeObserver(() => settle("auto")); ro.observe(sec); } catch (e) { ro = null; }
        ceiling = window.setTimeout(stop, 4000);
      });
    });
    if (pcRef.current) pcRef.current.scrollLeft = 0;
    syncPc();
    return () => {
      cancelAnimationFrame(f1); cancelAnimationFrame(f2); window.clearTimeout(ceiling);
      if (ro) { try { ro.disconnect(); } catch (e) {} }
      for (const ev of ["wheel", "touchmove", "keydown"]) window.removeEventListener(ev, noteUser);
    };
  }, [selected, syncPc]);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  const tileClick = (e, id) => {
    // Let the browser do its thing for a new tab / new window / middle click —
    // a real link must keep behaving like one. A button (no city, no href)
    // only opens the drop.
    if (e.currentTarget && e.currentTarget.tagName === "A") {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
    }
    if (id === "events" && onOpenEvents) { onOpenEvents(); return; }
    // A sponsor/partner tile opens the curated partner sheet instead of the
    // in-rail drop — the whole tile is the ad; the payoff is the featured list.
    const _r = railById.get(id);
    if (_r && _r.partner && onOpenPartner) { onOpenPartner(_r.partner); return; }
    if (selected === id) close(); else open(id, "rail");
  };

  const scrollBy = (ref, dir) => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (el.clientWidth - 70), behavior: reduced ? "auto" : "smooth" });
  };

  const selRail = selected ? railById.get(selected) : null;
  // v8.22 (owner: "when the amazon rail card is selected make sure it becomes
  // the main focus on the screen"). The pulsing glow marks the card; this
  // brings it there — the open tile centers itself in the track, so the
  // selection is never a half-cropped card at the viewport edge (his
  // screenshot). scroll-snap is proximity, so a programmatic center sticks.
  useEffect(() => {
    if (!selected) return;
    const track = trackRef.current;
    if (!track) return;
    const tile = track.querySelector(".wf8-tile.is-sel");
    if (!tile) return;
    const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = tile.offsetLeft - (track.clientWidth - tile.clientWidth) / 2;
    try { track.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" }); } catch (e) { track.scrollLeft = Math.max(0, left); }
  }, [selected]);
  // v8.27 — STABLE IDENTITY. A fresh [] on every render made every consumer
  // that depends on this list think the list had changed: useEditorialHooks
  // re-ran its resolve pass and the beach-conditions effect (deps
  // [selected, selPlaces]) re-entered its fetch-guard loop on every render —
  // including the ~60 renders per second a rail drag used to produce. Memoised,
  // the drop's places change when the drop or the data changes, and not once
  // more.
  const _selRaw = useMemo(() => (selected ? (shown.places[selected] || []) : []), [selected, shown]);
  // v8.28 — the curator's pick can only mark a card that carries _members, and
  // that aggregate is server-side by design. Fetched per open drop, fail-soft:
  // no signals, no mark, never a guess and never a blocked render.
  const [memberSig, setMemberSig] = useState(null);
  useEffect(() => {
    if (!memberSignalsFor || !_selRaw.length) { setMemberSig(null); return undefined; }
    let dead = false;
    Promise.resolve()
      .then(() => memberSignalsFor(_selRaw))
      .then((sig) => { if (!dead) setMemberSig(sig || null); })
      .catch(() => { if (!dead) setMemberSig(null); });
    return () => { dead = true; };
  }, [memberSignalsFor, _selRaw]);
  const selPlaces = useMemo(
    () => (memberSig && applyMemberSignal ? applyMemberSignal(_selRaw, memberSig) : _selRaw),
    [applyMemberSignal, memberSig, _selRaw]
  );
  // v8.66 — the two curated drops. Chef: static testimony in HIS order (the
  // shape IconicPlaceCard reads; `photo` self-heals once refs are harvested).
  // Augtober: the owned fall pool, fetched once per session when its drop
  // first opens; events render above the place cards, both wear the fall skin
  // while the season lasts (fallSkinLive — gone after Halloween).
  const chefPlaces = useMemo(() => chefPickPlaces(RON_DUPRAT_TOP7).map((e) => ({
    id: e.id, name: e.name, city: e.area, lat: e.lat, lng: e.lng,
    rating: e.rating, reviews: e.reviews, types: [], hook: e.hook, _chefRank: e._chefRank,
  })), []);
  const [fallPool, setFallPool] = useState(null);
  useEffect(() => {
    if (selected !== "augtober" || fallPool) return undefined;
    let dead = false;
    fetch("/api/events/fall").then((r) => (r.ok ? r.json() : null), () => null)
      .then((j) => { if (!dead) setFallPool(j || { events: [], places: [] }); });
    return () => { dead = true; };
  }, [selected, fallPool]);
  const fallSkin = fallSkinLive(siteTodayStr());
  // v8.67 — the event tiles the augtober drop actually shows: one per
  // FRANCHISE (nearest location wins), nearest-first when we know where the
  // reader is, and only events that can take the reader somewhere (official
  // url, or a venue we can open in place). Cap 14 — variety over volume.
  const fallEvents = useMemo(() => {
    const rows = (fallPool && fallPool.events) || [];
    const c = center || (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
    const dist = (e) => (c && Number.isFinite(e.lat) && Number.isFinite(e.lng))
      ? Math.hypot((e.lng - c.lng) * Math.cos(((e.lat + c.lat) / 2) * Math.PI / 180), e.lat - c.lat)
      : 999;
    const linked = rows.filter((e) => e.url || e.place_id);
    const sorted = linked.slice().sort((a, b) => dist(a) - dist(b));
    const seen = new Set();
    const out = [];
    for (const e of sorted) {
      const k = eventFranchiseKey(e.name || e.title);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= 14) break;
    }
    return out;
  }, [fallPool, center, lat, lng]);
  const dropList = useMemo(() => {
    const base = selected === "chef" ? chefPlaces
      : selected === "augtober" ? ((fallPool && fallPool.places) || []).map((p) => ({
          id: p.id, name: p.name, city: (p.metro || "").replace(/-/g, " "), lat: p.lat, lng: p.lng,
          rating: p.rating, reviews: p.reviews, types: [], photo: p.image || null, hook: p.take || null,
        }))
      : selPlaces;
    // v8.69 (owner, 2026-08-26: "create a place card for them in our rail lists
    // — place them on the night is calling and add a sponsored feature on it").
    // THE PAID CARD RIDES AT THE FRONT OF ITS OWN RAIL AND NOWHERE ELSE.
    //
    // `sponsorCard` is already gated and hydrated by the caller
    // (lib/sponsoredPlaces.sponsoredRailCardNear — geo + flight window), so
    // this is placement only: no filtering decision lives here, which is what
    // keeps the gate a single door rather than a rule two files half-know.
    //
    // The dedupe is not defensive noise. Möbius is a real Sarasota venue that
    // can also rank into this rail organically, and a reader seeing the same
    // place twice — once paid, once earned — reads as the ranking being for
    // sale, which is the one thing this registry exists to prevent.
    // …AND IT NEVER STANDS ALONE. A rail with nothing earned to show ships an
    // HONEST EMPTY ("we only publish a list once we've actually ranked the
    // places in it") — that copy is a promise, and prepending an ad to an empty
    // list would replace the promise with a drop containing nothing BUT an ad.
    // Caught live at 390px: the drop rendered exactly one card and it was the
    // paid one. It is also worthless to the advertiser, who bought a slot at
    // the top of a list of real recommendations, not a page of their own.
    if (sponsorCard && selected === sponsorCard.rail && sponsorCard.place && base.length > 0) {
      const dupe = new Set([sponsorCard.place.id, sponsorCard.place.placeId].filter(Boolean));
      return [sponsorCard.place, ...base.filter((p) => p && !dupe.has(p.id))];
    }
    return base;
  }, [selected, chefPlaces, fallPool, selPlaces, sponsorCard]);
  // Resolves ONLY the open drop's places (empty list while closed, so the
  // closed menu costs zero requests). Fail-soft: no hook, no line, no loss.
  const hooks = useEditorialHooks(selPlaces);
  // v8.10 (owner, 2026-08-18: "the beach cards have no water conditions and
  // water temperature"). Lite marine conditions per beach card, fetched only
  // while the BEACH drop is open, per place, from the same
  // /api/beach/conditions?mode=lite the hero's beach card uses (open-meteo,
  // CDN-cached 900s). Fail-soft everywhere: no data, no chip — never a guess.
  // redTide rides the lite payload but is deliberately NOT rendered here; its
  // severity vocabulary belongs to the full beach card, not a one-line chip.
  const [beachCond, setBeachCond] = useState({});
  // v8.19 (owner, on a Coquina Beach card in the BEST drop with no water
  // line: "we don't have the water quality on the beach cards"). The fetch
  // was gated to the beach RAIL, but a beach card rides best/family/today
  // too — the card's identity, not the rail's id, decides. Type evidence
  // only ("beach" in Google types), so a Beach House restaurant never
  // fetches surf.
  const isBeachRow = (p) => Array.isArray(p && p.types) && p.types.some((t) => String(t).toLowerCase() === "beach");
  useEffect(() => {
    if (!selected || !selPlaces.some(isBeachRow)) return undefined;
    let cancelled = false;
    for (const p of selPlaces) {
      if (!isBeachRow(p)) continue;
      if (!p || !p.id || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      if (beachCond[p.id] !== undefined) continue;
      fetch(`/api/beach/conditions?mode=lite&lat=${p.lat}&lng=${p.lng}&place_id=${encodeURIComponent(p.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (cancelled) return;
          const usable = c && !c.none && c.show !== false;
          setBeachCond((m) => ({ ...m, [p.id]: usable ? c : null }));
        })
        .catch(() => { if (!cancelled) setBeachCond((m) => ({ ...m, [p.id]: null })); });
    }
    return () => { cancelled = true; };
    // beachCond is read for the already-fetched check only; adding it would
    // refire the effect on every arrival for nothing new to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selPlaces]);
  const beachChip = (p) => {
    // v8.19 — any drop, any rail: a beach card carries its water line
    // wherever it appears (the fetch above is gated the same way).
    if (!isBeachRow(p)) return null;
    const c = beachCond[p.id];
    if (!c) return null;
    // v8.22 (owner, on one long chip cut at the card edge: "make it shorter
    // or make it into multiple pills"). SEPARATE SHORT PILLS now: the
    // quality verdict (three words, severity-toned), then temp, then wind —
    // each its own lane child, so nothing long enough to crop exists. The
    // fragment's spans land as direct children of .wf-place-card-highlights
    // and inherit the swipe-lane rules. Quality replaces waves when a
    // wf_beach_water row exists; no row → omit quality AND waves.
    const bits = formatBeachChipBits(c, c.water);
    if (!bits.length) return null;
    const key = waterQualityKey(c.water);
    const tone = WATER_TONE[key] || "#7DD3FC";
    return (
      <>
        {bits.map((b, i) => (
          <span key={b} style={{ color: i === 0 && key ? tone : "#7DD3FC", fontWeight: 700 }}
            title={i === 0 && key ? WATER_PLAIN_LONG[key] + (c.water && c.water.sampled_at ? " · FL Healthy Beaches sample " + c.water.sampled_at : "") : undefined}>
            {i === 0 ? "🌊 " : ""}{b}
          </span>
        ))}
      </>
    );
  };
  const near = (live && live.cityLabel) ? ` near ${live.cityLabel}` : "";
  // The town to NAME in an honest-empty sentence. The reader's own label first
  // (it is what the chrome is already showing them, so the copy matches the
  // page), then whatever the payload named, then nothing — and never "you".
  const dropCity = honestCityLabel(locName) || (shown.cityLabel ? honestCityLabel(shown.cityLabel) : "") || "";

  return (
    <div className={`wf8 is-${daypart}${selected ? " is-open" : ""}`} data-daypart={daypart}>
      <section className="wf8-railsec" aria-label="What to do right now">
        <div className="wf8-in">
          <div className="wf8-railwrap">
            <div className="wf8-track" ref={trackRef}>
              {order.filter((id) => {
                const r = railById.get(id);
                return r && !r.artStale;
              }).map((id, i) => {
                const r = railById.get(id);
                if (!r) return null;
                if (r.artStale) return null;
                const base = railArt(r, shown.region);
                const href = railHref(r, shown.region, shown.citySlug);
                const eager = i < 2;
                const tileClass = `wf8-tile${selected === id ? " is-sel" : ""}${artReady[id] ? " is-art-ready" : ""}`;
                const art = (
                    <picture>
                      <source type="image/avif" srcSet={railArtSrcSet(base, "avif")} sizes={RAIL_ART_SIZES} />
                      <source type="image/webp" srcSet={railArtSrcSet(base, "webp")} sizes={RAIL_ART_SIZES} />
                      <img
                        className="wf8-tim"
                        src={railArtFallback(base)}
                        alt={r.title}
                        width="760"
                        height="1350"
                        decoding="async"
                        loading={eager ? "eager" : "lazy"}
                        fetchPriority={eager ? "high" : "low"}
                        onLoad={() => markArtReady(id)}
                      />
                    </picture>
                );
                const label = `${r.title} — ${r.short}`;
                // THE TILE IS THE BOX; THE LINK INSIDE IT IS THE DESTINATION.
                // Split in v8.23 because the share control is a real <button>,
                // and a <button> inside an <a> is a nested interactive — the
                // contract test-card-a11y.mjs and check-collection-look.mjs
                // both pin elsewhere in this codebase.
                //
                // .wf8-tile keeps EVERYTHING the rest of the system measures it
                // by: the reserved box (test-first-screen reads the width/height
                // rule out of railMenuCss), data-id, .is-sel, the snap point,
                // and — the one that would have failed silently — its
                // offsetLeft, which the centering effect below arithmetics on.
                // Had the link become the flex item, offsetLeft would be 0 and
                // every selected card would centre on the track's left edge.
                return (
                  <div
                    key={id}
                    className={tileClass}
                    data-id={id}
                    style={{ background: railTint(id) }}
                  >
                    {artReady[id] ? null : (
                      <div className="wf8-tile-sk" aria-hidden="true">
                        <PlaceCardSkeleton count={1} as="div" />
                      </div>
                    )}
                    {href
                      ? <a className="wf8-tlink" href={href} aria-label={label} onClick={(e) => tileClick(e, id)}>{art}</a>
                      : <button type="button" className="wf8-tlink" aria-label={label} onClick={(e) => tileClick(e, id)}>{art}</button>}
                    {/* A sponsor tile is a paid unit, not a shareable list —
                        it has no route to share, so it shows no share control. */}
                    {r.sponsor ? null : (
                      <button
                        type="button"
                        className="wf8-tshare"
                        aria-label={`Share ${r.title}`}
                        title={`Share ${r.title}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); share(r); }}
                      ><ShareGlyph /></button>
                    )}
                    {said === id ? <span className="wf8-tsaid" role="status">Link copied</span> : null}
                  </div>
                );
              })}
            </div>
            <button type="button" className="wf8-nav l" aria-label="Scroll left" disabled={trackEnds.atStart}
              onClick={() => { scrollBy(trackRef, -1); syncTrack(); }}><Chevron dir="l" /></button>
            <button type="button" className="wf8-nav r" aria-label="Scroll right" disabled={trackEnds.atEnd}
              onClick={() => { scrollBy(trackRef, 1); syncTrack(); }}><Chevron dir="r" /></button>
          </div>
        </div>
      </section>

      <section className="wf8-menusec" ref={menuRef} aria-label={selRail ? `${selRail.title} — picks` : "Picks"} aria-hidden={!selected}>
        <div className="wf8-in">
          <div className="wf8-mbar">
            <p className="wf8-mhd">Showing <b>{selRail ? selRail.title : ""}</b>{selRail && !selRail.guides && selRail.id !== "chef" && selRail.id !== "augtober" ? near : ""}</p>
            <button type="button" className="wf8-mclose" onClick={close}>✕ Close</button>
          </div>


          {/* v8.12 — the owner's ranked trends (32 as of v8.25) lead the TRENDING drop, each one
              matched to verified local places (daypart-gated inside the
              component). The ranked place cards below stay: trends answer
              "what's the thing", the cards answer "the best places, period". */}
          {selRail && selRail.id === "trending" ? (
            <ExplodingNearby
              active
              center={center || (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null)}
              city={shown.cityLabel || ""}
              onOpenPlace={(p) => { if (!p || !p.id) return; if (onOpenPlace) { onOpenPlace(p); return; } if (typeof window !== "undefined") window.location.assign("/p/" + encodeURIComponent(p.id)); }}
              isSaved={isSaved || undefined}
              liked={liked || undefined}
              disliked={disliked || undefined}
              onSave={onSave || undefined}
              // v8.29.2 (owner: "this button for the likes still not working
              // under the exploding trends near you"). This block passed
              // isSaved and onSave and NOTHING else, so every thumb inside the
              // trending drop was a live button over a no-op. The trend cards
              // now get the same home-shell state the place cards below them
              // get, in whichever shape the parent supplies.
              isLiked={isLiked || undefined}
              isDisliked={isDisliked || undefined}
              onLike={onLike || undefined}
              onDislike={onDislike || undefined}
            />
          ) : null}
          {/* v8.67 (owner, 2026-08-26: "no deep links … most of them are
              repetitive") — the AUGTOBER drop leads with its dated events, ONE
              PER FRANCHISE, nearest first: the second Howl-O-Scream never gets
              a tile, the near one does. Every tile GOES somewhere — the
              official page when the event has one, our own venue detail when
              it does not; an event with neither is not shown, because a dead
              tile is worse than one fewer tile. WHEN badge, never a fabricated
              score. wf-fall is the seasonal skin (fallSkinLive — gone after
              Halloween). */}
          {selRail && selRail.id === "augtober" && fallPool && fallEvents.length ? (
            <div className={fallSkin ? "wf-fall" : undefined} style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 10, marginBottom: 12 }} aria-label="Fall and Halloween events">
              {fallEvents.map((e) => {
                const inner = (
                  <>
                    <div style={{ position: "relative", height: 86, overflow: "hidden", borderBottom: "1px solid rgba(148,163,184,.18)", background: "#131A26" }}>
                      {e.image ? <img src={e.image} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
                      <span style={{ position: "absolute", top: 7, right: 7, padding: "3px 7px", borderRadius: 999, background: "rgba(7,12,20,.82)", border: "1px solid rgba(251,146,60,.5)", color: "#FDBA74", fontSize: 8.5, fontWeight: 800 }}>{(e.when && e.when.label) || "Seasonal"}</span>
                    </div>
                    <div style={{ padding: "8px 10px 9px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title || e.name}</div>
                      <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 2 }}>{e.city}{e.price_band ? " · " + e.price_band : ""}</div>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#FDBA74", marginTop: 5 }}>{e.ticket ? "🎟 Tickets · via " + e.ticket.via : e.url ? "Event page ↗" : "Open the venue →"}</div>
                    </div>
                  </>
                );
                const tileStyle = { flex: "0 0 200px", background: "var(--wf-card,#131A26)", border: "1px solid rgba(148,163,184,.18)", borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit", textAlign: "left", padding: 0, cursor: "pointer", font: "inherit" };
                const label = (e.title || e.name) + (e.when && e.when.label ? " — " + e.when.label : "");
                // Monetized first (owner: these events earn — the server attached a
                // health-checked UT deal, disclosed on the tile). rel carries
                // sponsored on the paid link ONLY; the official-page link stays
                // plain noreferrer.
                return e.ticket ? (
                  <a key={e.id} href={e.ticket.href} target="_blank" rel="sponsored nofollow noopener" aria-label={label + " — tickets via " + e.ticket.via} className="wf8-falltile" style={tileStyle}
                    onClick={() => {
                      // commerce.js loads at CLICK time, not page time — the
                      // bundle ratchet is why; the money-funnel guard reads
                      // the emitCommerce call here either way.
                      import("../../lib/commerce.js").then(({ emitCommerce, mintClickId }) => {
                        try { emitCommerce("commerce_cta_clicked", { surface: "augtober_rail", content_id: e.id, provider: "undercover_tourist", merchant: e.ticket.via, offer_id: String(e.ticket.deal_id), click_id: mintClickId(), disclosure_version: "augtober-tile-v1" }); } catch (er) {}
                      }).catch(() => {});
                      logEvent("tickets_out", { kind: "augtober_rail", id: e.id, name: e.name, deal: e.ticket.deal_id });
                    }}>{inner}</a>
                ) : e.url ? (
                  <a key={e.id} href={e.url} target="_blank" rel="noreferrer" aria-label={label} className="wf8-falltile" style={tileStyle}
                    onClick={() => logEvent("augtober_event_open", { id: e.id, name: e.name })}>{inner}</a>
                ) : (
                  <button key={e.id} type="button" aria-label={label} className="wf8-falltile" style={tileStyle}
                    onClick={() => { logEvent("augtober_event_open", { id: e.id, name: e.name, via: "venue" }); onOpenPlace && onOpenPlace({ id: e.place_id, name: e.venue || e.name, lat: e.lat, lng: e.lng, types: [], hook: e.hook }); }}>{inner}</button>
                );
              })}
            </div>
          ) : null}
          {selRail && selRail.guides ? (
            <ul className="wf8-grail" aria-label="Local guides">
              {guides.map((g, i) => (
                <li key={g.slug}>
                  <a className="wf8-gcard" style={{ "--wf8-i": i }} href={`/guides/${g.slug}`}
                    onClick={() => logEvent("guide_open", { slug: g.slug, region: g.region, src: "rail_library" })}>
                    <div className="wf8-gtop">{g.region}<em>· {g.mins} min read</em></div>
                    <h4 className="wf8-gtit">{g.title}</h4>
                    <p className="wf8-gtea">{g.teaser}</p>
                    <div className="wf8-gread">Read the guide →</div>
                  </a>
                </li>
              ))}
              <li>
                <a className="wf8-gcard" style={{ "--wf8-i": guides.length }} href="/guides">
                  <div className="wf8-gtop">All guides</div>
                  <h4 className="wf8-gtit">Every Wayfind guide, in one place</h4>
                  <p className="wf8-gtea">{guides.length} guides, each written after someone actually went.</p>
                  <div className="wf8-gread">Open the library →</div>
                </a>
              </li>
            </ul>
          ) : selRail && dropList.length ? (
            <div className={"wf8-pcwrap" + (selected === "augtober" && fallSkin ? " wf-fall" : "")}>
              <ul className="wf8-pcrail" ref={pcRef}>
                {dropList.map((p, i) => {
                  // v8.69 — the paid card is index 0 of its own rail and is the
                  // ONLY card here that is not a ranked result. Two consequences,
                  // both deliberate:
                  //
                  //   • IT WEARS NO RANK AND NO "TOP … PICK" BAND. It is first
                  //     because it was bought. A "1" chip would assert a ranking
                  //     Wayfind did not perform, on the one card where the reader
                  //     has the least reason to trust us — and lib/topPickAward
                  //     would then compose a merchandising claim out of a
                  //     purchase. `rank={null}` drops both (the chip is falsy-
                  //     guarded; topPickAward returns null off 1–3).
                  //   • THE EARNED CARDS KEEP THEIR REAL NUMBERS. Ranks count
                  //     from the first ORGANIC card, so the genuine #1 of this
                  //     rail is still labelled #1 rather than demoted to #2 by
                  //     an ad sitting above it.
                  const isPaid = !!(sponsorCard && p && p.id === sponsorCard.place.id && selected === sponsorCard.rail);
                  const organicRank = isPaid ? null : (sponsorCard && selected === sponsorCard.rail ? i : i + 1);
                  return (
                  <IconicPlaceCard
                    key={p.id}
                    place={p}
                    rank={organicRank}
                    // The paid card opens the destination the placement bought —
                    // our own event page, which carries the dates, the parking,
                    // the consent-cleared photos and the advertiser's own link.
                    // A real href, so it is crawlable and shareable like every
                    // other card here.
                    href={isPaid ? sponsorCard.href : `/p/${encodeURIComponent(p.id)}`}
                    // ...and it must NOT be intercepted into the in-app place
                    // sheet: `p.id` is a sponsor id, not a Google place id, so
                    // onOpenPlace would open a detail for a place that does not
                    // exist in inventory.
                    onOpen={!isPaid && onOpenPlace ? (pl) => onOpenPlace(pl) : undefined}
                    // Place-card editorial is the sourced why-go / known-for
                    // only (useEditorialHooks → Atlas / wf_editorial). Occasion
                    // fields (summerWhy, birthdayWhy) stay off the card —
                    // they are page/rail copy, not a place hook. No sourced
                    // why → empty slot, never a deal or registry promo.
                    editorial={(isPaid || selected === "chef" || selected === "augtober") ? (p.hook || null) : (toHookLine(hooks[p.id], p.name) || null)}
                    // THE DISCLOSURE IS PART OF THE CARD, NOT A SETTING.
                    // IconicPlaceCard renders `badge` FIRST in the chip lane,
                    // ahead of the decorative tag pills, precisely so a
                    // disclosure cannot be clipped by the one-row clamp (see the
                    // v8.17 note at that call site). That is what makes this the
                    // right slot for it rather than a nicer-looking one further
                    // down the card.
                    //
                    // The DISCLOSURE IS THE ONLY THING IN THIS LANE for a paid
                    // card. The nights ride in the meta row instead
                    // (place.whenFact): measured at 390px the lane holds 275px
                    // of content in a 226px box, so a second chip is partly
                    // masked — and "which nights is this actually open" is the
                    // one fact a reader on an HOURS rail must not have to
                    // scroll a clipped lane to find.
                    badge={isPaid ? <span className="wf-sponsor-chip">{sponsorCard.label}</span> : beachChip(p)}
                    saved={isSaved ? isSaved(p.id) : false}
                    // v8.29.6 — ONE set of these, reading whichever shape the
                    // parent gave. The merge of two independent fixes left the
                    // element carrying `liked` and `onLike` twice; in JSX the
                    // last wins silently, which is exactly how a working
                    // handler gets replaced by a broken one without a diff
                    // that looks wrong.
                    liked={isLiked ? !!isLiked(p.id) : liked ? !!liked[p.id] : false}
                    disliked={isDisliked ? !!isDisliked(p.id) : disliked ? !!disliked[p.id] : false}
                    inTrip={isOnTrip ? isOnTrip(p) : false}
                    onSave={onSave ? (e, pl) => onSave(e, pl || p) : null}
                    onItinerary={onItinerary ? (e, pl) => onItinerary(e, pl || p) : null}
                    onLike={onLike ? (e, pl) => onLike(e, pl) : null}
                    onDislike={onDislike ? (e, pl) => onDislike(e, pl) : null}
                    // v8.30.1 — THE SHAPE. IconicPlaceCard calls onShare(place),
                    // like every other render site in the app; this adapter read
                    // (e, pl), so once the prop was finally wired the handler
                    // would have received the PLACE as its event. It also hands
                    // over the two things that make the unfurl worth tapping and
                    // that only this component knows: the reader's real city and
                    // the card's sourced hook (the share audit's S2 — a card
                    // share was shipping with neither).
                    onShare={onShare ? (pl) => onShare(pl || p, {
                      city: shown.cityLabel || "",
                      hook: isPaid ? (p.hook || "") : (toHookLine(hooks[p.id], p.name) || ""),
                    }) : null}
                    // SAVE / LIKE / DISLIKE ARE READ-ONLY ON THE PAID CARD.
                    // Those stores key on a Google place id; this row carries a
                    // sponsor id, so wiring them would ship four live-looking
                    // buttons that write a key nothing else can ever read back
                    // — the exact dead-affordance bug RailCard documents at its
                    // `actionsReadOnly` prop. Share stays live: sharing the
                    // event page is the thing the advertiser is actually buying.
                    cardActionsReadOnly={isPaid}
                    surface={isPaid ? "rail_sponsored_card" : "place_card"}
                  />
                  );
                })}
              </ul>
              <button type="button" className="wf8-pnav l" aria-label="Previous places" disabled={pcEnds.atStart}
                onClick={() => { scrollBy(pcRef, -1); syncPc(); }}><Chevron dir="l" /></button>
              <button type="button" className="wf8-pnav r" aria-label="More places" disabled={pcEnds.atEnd}
                onClick={() => { scrollBy(pcRef, 1); syncPc(); }}><Chevron dir="r" /></button>
            </div>
          ) : selRail && (isPending(railLoad) || (selRail.id === "augtober" && !fallPool)) ? (
            /* v8.46 — THE ONLY PLACE A SKELETON MAY RENDER. It is gated on an
               explicit in-flight flag that lib/loadState.js guarantees will be
               overwritten within 12s, by data or by LOAD_FAILED. It is no
               longer the final `else`, so "empty" can never be mistaken for
               "still ranking". scripts/check-no-terminal-loading.mjs fails the
               build if a skeleton ever becomes the last branch again. */
            <div className="wf8-pcwrap">
              <ul className="wf8-pcrail" role="status" aria-busy="true" aria-label="Ranking places">
                <PlaceCardSkeleton count={3} />
              </ul>
            </div>
          ) : selRail && thinSet.has(selRail.id) ? (
            <div className="wf8-thin">
              <p>
                {`Nothing${near} clears this bar right now — ${selRail.emptyWhy || "nothing nearby clears the bar"}. Padding it with places that don't belong would make the rail worthless.`}
              </p>
              {railHref(selRail, shown.region, shown.citySlug) ? (
                <a href={railHref(selRail, shown.region, shown.citySlug)}>{selRail.cta} →</a>
              ) : null}
            </div>
          ) : selRail ? (
            /* THE HONEST TERMINAL STATE. Whatever else went wrong, the reader
               gets a sentence that is true, and at least one thing to press.
               Never a grey box. */
            <div className="wf8-thin">
              <p>
                {isFailed(railLoad)
                  ? `We couldn't reach the ranking service just now, so we won't show you a list we haven't ranked.`
                  : railLoad === "unlocated"
                    ? `We need a location before we can rank anything${dropCity ? ` — the pin we're holding says ${dropCity}` : ""}.`
                    : `Wayfind isn't live in ${dropCity || "your area"} yet — we only publish a list once we've actually ranked the places in it.`}
              </p>
              <div className="wf8-thinact">
                {isFailed(railLoad) ? (
                  <button type="button" className="wf8-thinbtn" onClick={() => { setRetryNonce((n) => n + 1); try { logEvent("rail_retry", { rail_id: selRail.id }); } catch (e) {} }}>
                    Try again
                  </button>
                ) : onRecenter ? (
                  /* The self-heal. The defect that produced this screen on the
                     owner's own browser was a stored pin in North Carolina
                     wearing a Florida city's name; one tap on a real GPS fix
                     fixes it, and it is the same recenter the header runs. */
                  <button type="button" className="wf8-thinbtn" onClick={() => { try { onRecenter(); } catch (e) {} try { logEvent("rail_recenter", { rail_id: selRail.id }); } catch (e) {} }}>
                    Use my current location
                  </button>
                ) : null}
                {railHref(selRail, shown.region, shown.citySlug) ? (
                  <a href={railHref(selRail, shown.region, shown.citySlug)}>{selRail.cta} →</a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
