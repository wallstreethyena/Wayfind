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
// Data comes from /api/trends/nearby, which now serves the owner-licensed
// EXPLODING_NEARBY_UNIVERSE through the same evidence-gated matcher the cron
// path uses (see that route's v8.12 note).
const ExplodingNearby = dynamic(() => import("./ExplodingNearby"), { ssr: false });
import { DAYPARTS, partForHour, orderFor, railHref, LEGACY_HERO_EVENT } from "../../lib/dayparts.js";
import { siteHourFloat, tzForPoint } from "../../lib/nowContext.js";
import { railArt, railArtSrcSet, railArtFallback, railTint, RAIL_ART_SIZES } from "../../lib/rails.js";
import { emptyRailLive, liveFromRailsResponse } from "../../lib/locationHonesty.js";
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
  onCoverage = null,
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
  // v8.28 (owner, 2026-08-20: "when I click the like button in those place
  // cards that are shown by the rails, it opens up the page instead of just
  // registering the like"). IconicPlaceCard renders Like/Dislike as a BUTTON
  // when the caller wires a handler and as an <a href="/p/<id>?action=like">
  // when it does not — a navigation dressed as a button. Ten other surfaces
  // wire these; this one, now the homepage's main card surface, never did.
  onLike = null,
  onDislike = null,
  onShare = null,
  // Predicates, not raw state — the same shape as isSaved/isOnTrip above.
  // test-first-screen requires every rail prop to be server data or a callable,
  // because a prop carrying client state is a prop the first paint can wait on.
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
  const [selected, setSelected] = useState(null);
  const trackRef = useRef(null);
  const pcRef = useRef(null);
  const menuRef = useRef(null);
  const shown = live || { places: {}, thin: thin || [], region: region || null, citySlug: citySlug || null, cityLabel: cityLabel || "" };
  const thinSet = useMemo(() => new Set(shown.thin), [shown.thin]);
  const railById = useMemo(() => new Map(rails.map((r) => [r.id, r])), [rails]);
  // NOTE on `artStale`: a rail can be renamed in code while the reader keeps
  // seeing the old claim, because the headline on these tiles is PIXELS.
  // `trending` still reads "EXPLODING TRENDS NEAR YOU" in the artwork, and the
  // Exploding Trends accordion is dark (removed 2026-08-16). The stale tile is
  // hidden — do not remount the accordion; do not advertise a dark surface.
  const order = useMemo(() => orderFor(daypart, rails.map((r) => r.id)), [daypart, rails]);
  const band = DAYPARTS[daypart] || DAYPARTS.afternoon;

  // Re-rank when the reader is meaningfully somewhere else. The threshold is
  // generous on purpose: a few miles is the same market and refetching on every
  // GPS jitter would spend a request to return an identical list.
  useEffect(() => {
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
      setLive(emptyRailLive());
      return undefined;
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
      if (R * 2 * Math.asin(Math.sqrt(s2)) < 1.5) return undefined;
    }
    let cancelled = false;
    setLive(emptyRailLive());
    // Snapped to ~0.7mi so the CDN sees a countable set of URLs per metro, not
    // one per GPS fix. The server re-measures every distance from this point.
    const snap = (v) => Math.round(v * 100) / 100;
    fetch(`/api/rails?lat=${encodeURIComponent(snap(center.lat))}&lng=${encodeURIComponent(snap(center.lng))}`)
      .then((r2) => r2.json().catch(() => null))
      .then((j) => {
        if (cancelled) return;
        setLive(liveFromRailsResponse(j));
        try { onCoverage && onCoverage(j && j.covered === true && j.data ? "covered" : "uncovered"); } catch (e) {}
      })
      .catch(() => {
        if (cancelled) return;
        setLive(emptyRailLive());
        try { onCoverage && onCoverage("error"); } catch (e) {}
      });
    return () => { cancelled = true; };
  }, [center && center.lat, center && center.lng, lat, lng]);

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
                    <button
                      type="button"
                      className="wf8-tshare"
                      aria-label={`Share ${r.title}`}
                      title={`Share ${r.title}`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); share(r); }}
                    ><ShareGlyph /></button>
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
            <p className="wf8-mhd">Showing <b>{selRail ? selRail.title : ""}</b>{selRail && !selRail.guides ? near : ""}</p>
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
              onSave={onSave || undefined}
              // v8.29.2 (owner: "this button for the likes still not working
              // under the exploding trends near you"). This block passed
              // isSaved and onSave and NOTHING else, so every thumb inside the
              // trending drop was a live button over a no-op. The place cards
              // below it have had these since v8.28; the trend cards now get
              // the same home-shell state, from the same props.
              isLiked={isLiked || undefined}
              isDisliked={isDisliked || undefined}
              onLike={onLike || undefined}
              onDislike={onDislike || undefined}
            />
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
          ) : selRail && selPlaces.length ? (
            <div className="wf8-pcwrap">
              <ul className="wf8-pcrail" ref={pcRef}>
                {selPlaces.map((p, i) => (
                  <IconicPlaceCard
                    key={p.id}
                    place={p}
                    rank={i + 1}
                    href={`/p/${encodeURIComponent(p.id)}`}
                    onOpen={onOpenPlace ? (pl) => onOpenPlace(pl) : undefined}
                    // Place-card editorial is the sourced why-go / known-for
                    // only (useEditorialHooks → Atlas / wf_editorial). Occasion
                    // fields (summerWhy, birthdayWhy) stay off the card —
                    // they are page/rail copy, not a place hook. No sourced
                    // why → empty slot, never a deal or registry promo.
                    editorial={toHookLine(hooks[p.id], p.name) || null}
                    badge={beachChip(p)}
                    saved={isSaved ? isSaved(p.id) : false}
                    inTrip={isOnTrip ? isOnTrip(p) : false}
                    onSave={onSave ? (e, pl) => onSave(e, pl) : null}
                    onItinerary={onItinerary ? (e, pl) => onItinerary(e, pl) : null}
                    onLike={onLike ? (e, pl) => onLike(e, pl || p) : null}
                    onDislike={onDislike ? (e, pl) => onDislike(e, pl || p) : null}
                    onShare={onShare ? (e, pl) => onShare(e, pl || p) : null}
                    liked={isLiked ? !!isLiked(p.id) : false}
                    disliked={isDisliked ? !!isDisliked(p.id) : false}
                  />
                ))}
              </ul>
              <button type="button" className="wf8-pnav l" aria-label="Previous places" disabled={pcEnds.atStart}
                onClick={() => { scrollBy(pcRef, -1); syncPc(); }}><Chevron dir="l" /></button>
              <button type="button" className="wf8-pnav r" aria-label="More places" disabled={pcEnds.atEnd}
                onClick={() => { scrollBy(pcRef, 1); syncPc(); }}><Chevron dir="r" /></button>
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
            <div className="wf8-pcwrap">
              <ul className="wf8-pcrail" role="status" aria-busy="true" aria-label="Ranking places">
                <PlaceCardSkeleton count={3} />
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
