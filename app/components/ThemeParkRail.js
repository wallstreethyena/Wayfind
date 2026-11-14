"use client";
import { useEffect, useRef, useState } from "react";
import RailHeading from "./RailHeading";
import { RailDots, RailNav } from "./RailCard";
import IconicPlaceCard from "./IconicPlaceCard";
import { WF_PLACE_CARD_CSS } from "./css.js";
import { themeParkHeading, themeParkForPlace, orderThemeParks, filterFamilyThemeParks } from "../../lib/themeParks.js";
import { placePartnerPick } from "../../lib/placePartnerPicks.js";
import { usePinQuarantine } from "../../lib/pinQuarantine.js";
import { useCuratedRows } from "../../lib/curatorPicks.js";
import useEditorialHooks from "./useEditorialHooks.js";
import { styleHtml } from "../../lib/styleHtml.js";
import { useStagedCards } from "../../lib/stagedMount.js";

// One number per place OBJECT: a refetch or a curator stamp hands over a new object, which must repaint its card.
const seqs = new WeakMap();
let nextSeq = 1;
function placeSeq(place) { let n = seqs.get(place); if (!n) { n = nextSeq++; seqs.set(place, n); } return n; }

export default function ThemeParkRail({ stagedCards = false, mode = "flagship", query = "", items = null, initialItems = null, familyContext = null, excludeOfferIds = null, onOpenPlace: onOpenPlaceProp,
  isSaved, isOnTrip, isLiked, isDisliked, liked, disliked,
  onSave: onSaveProp, onItinerary: onItineraryProp, onLike: onLikeProp, onDislike: onDislikeProp, onShare: onShareProp, onBadge }) {
  // `initialItems` (2026-09-29) is a SERVER seed from lib/landingRails.js — the
  // same loadThemeParks() read /api/theme-parks serves — so the park cards and
  // their ticket links are in the crawlable HTML. Unlike `items` it does NOT stop
  // the fetch: the mount refresh still runs and wins, and a failed refresh keeps
  // the seed. No seed = the old behaviour exactly.
  const seeded = Array.isArray(initialItems) && initialItems.length > 0;
  const [fetched, setLoaded] = useState(Array.isArray(items) ? items : seeded ? initialItems : []);
  const loaded = useCuratedRows(fetched); // owner picks BEFORE orderThemeParks (lib/curatorPicks.js)
  const pinQ = usePinQuarantine();
  useEffect(() => {
    if (Array.isArray(items)) { setLoaded(items); return undefined; }
    const controller = new AbortController();
    fetch(`/api/theme-parks?mode=${encodeURIComponent(mode)}${query ? `&q=${encodeURIComponent(query)}` : ""}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("theme parks unavailable")))
      .then((body) => setLoaded(Array.isArray(body.items) ? body.items : []), () => { if (!seeded) setLoaded([]); });
    return () => controller.abort();
  }, [mode, query, items]);
  const rows = orderThemeParks(filterFamilyThemeParks(loaded.filter((place) => { if (!themeParkForPlace(place)) return false; const pick = placePartnerPick(place, pinQ); return !!pick && !(excludeOfferIds && excludeOfferIds.includes(pick.offerId)); }), familyContext));
  // THE EDITORIAL LINE (owner, 2026-10-31): this was the one IconicPlaceCard
  // surface that never asked for the place's verified line, so the flagship
  // park cards said nothing about why to go while 15 of 17 parks already had
  // researched copy held for them. VERIFIED RUNG ONLY ("wayfind" tier: Atlas
  // + verified wf_editorial + hand-reviewed editorial_card) — a park with no
  // researched line stays silent rather than borrowing a generated one.
  const hooks = useEditorialHooks(rows);
  const verifiedLine = (place) => (hooks.tiers && hooks.tiers[place.id] === "wayfind" ? hooks[place.id] || null : null);
  // The parent hands over fresh closures on every page render. They travel through a ref read
  // at CALL time (never a stale handler), so a card can be skipped while its place, order,
  // saved/liked state and line are unchanged (memoKey, see IconicPlaceCard.sameCard). Before
  // this, every page commit re-rendered all of the park cards (about a quarter of the home
  // page's component renders in a phone profile).
  const handlers = useRef(null);
  handlers.current = { onOpenPlace: onOpenPlaceProp, onSave: onSaveProp, onItinerary: onItineraryProp, onLike: onLikeProp, onDislike: onDislikeProp, onShare: onShareProp };
  // Stable forwarders, named like the props they stand for: the JSX below keeps its original shape, and a skipped
  // card's older closure still lands on the NEWEST handler because the forwarder reads the ref when it is called.
  const fwd = useRef(null);
  if (!fwd.current) fwd.current = {
    onOpenPlace: (place) => handlers.current.onOpenPlace(place),
    onSave: (event, place) => handlers.current.onSave(event, place),
    onItinerary: (event, place) => handlers.current.onItinerary(event, place),
    onLike: (event, place) => handlers.current.onLike(event, place),
    onDislike: (event, place) => handlers.current.onDislike(event, place),
    onShare: (place) => handlers.current.onShare(place),
  };
  const onOpenPlace = onOpenPlaceProp ? fwd.current.onOpenPlace : undefined;
  const onSave = onSaveProp ? fwd.current.onSave : undefined;
  const onItinerary = onItineraryProp ? fwd.current.onItinerary : undefined;
  const onLike = onLikeProp ? fwd.current.onLike : undefined;
  const onDislike = onDislikeProp ? fwd.current.onDislike : undefined;
  const onShare = onShareProp ? fwd.current.onShare : undefined;
  const cardKey = (place, index) => [placeSeq(place), index,
    isSaved && isSaved(place.id) ? 1 : 0, isOnTrip && isOnTrip(place) ? 1 : 0,
    (isLiked ? isLiked(place.id) : liked && liked[place.id]) ? 1 : 0, (isDisliked ? isDisliked(place.id) : disliked && disliked[place.id]) ? 1 : 0,
    verifiedLine(place) || "", onOpenPlace ? 1 : 0, onSave ? 1 : 0, onItinerary ? 1 : 0, onLike ? 1 : 0, onDislike ? 1 : 0, onShare ? 1 : 0, onBadge ? 1 : 0].join("|");
  const shown = useStagedCards(rows.length, true, { enabled: stagedCards });
  if (!rows.length) return null;
  const heading = themeParkHeading(mode);
  const railId = `theme-parks-${mode}`;
  return <section aria-labelledby={`${railId}-title`}>
    <style dangerouslySetInnerHTML={styleHtml(WF_PLACE_CARD_CSS)} />
    <RailHeading id={`${railId}-title`} title={heading.title} description={heading.description}>
      <RailNav railId={railId} count={rows.length} total={rows.length} unit="parks" />
    </RailHeading>
    <ol className="wf-rail" data-rail={railId} aria-label={heading.title}>
      {rows.slice(0, shown).map((place, index) => <IconicPlaceCard key={place.id} memoKey={cardKey(place, index)} place={place} rank={index + 1}
        href={`/p/${encodeURIComponent(place.id)}`} onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
        editorial={verifiedLine(place)} editorialTier="wayfind"
        photoAttr={place.photoAttr || null} photoAttrHref={place.photoAttrHref || null}
        surface="theme_park_rail" eagerMedia={index < 2}
        saved={isSaved ? !!isSaved(place.id) : undefined} inTrip={isOnTrip ? !!isOnTrip(place) : undefined}
        liked={isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined}
        disliked={isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined}
        onSave={onSave ? (event) => onSave(event, place) : undefined}
        onItinerary={onItinerary ? (event) => onItinerary(event, place) : undefined}
        onLike={onLike ? (event) => onLike(event, place) : undefined}
        onDislike={onDislike ? (event) => onDislike(event, place) : undefined}
        onShare={onShare ? () => onShare(place) : undefined} onBadge={onBadge} />)}
    </ol>
    <RailDots railId={railId} count={rows.length} layoutKey={shown >= rows.length ? 1 : 0} />
  </section>;
}
