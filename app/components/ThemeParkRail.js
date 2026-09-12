"use client";
import { useEffect, useState } from "react";
import RailHeading from "./RailHeading";
import { RailDots, RailNav } from "./RailCard";
import IconicPlaceCard from "./IconicPlaceCard";
import { WF_PLACE_CARD_CSS } from "./css.js";
import { themeParkHeading, themeParkForPlace, orderThemeParks } from "../../lib/themeParks.js";
import { placePartnerPick } from "../../lib/placePartnerPicks.js";
import { usePinQuarantine } from "../../lib/pinQuarantine.js";

export default function ThemeParkRail({ mode = "flagship", query = "", items = null, onOpenPlace,
  isSaved, isOnTrip, isLiked, isDisliked, liked, disliked,
  onSave, onItinerary, onLike, onDislike, onShare, onBadge }) {
  const [loaded, setLoaded] = useState(Array.isArray(items) ? items : []);
  const pinQ = usePinQuarantine();
  useEffect(() => {
    if (Array.isArray(items)) { setLoaded(items); return undefined; }
    const controller = new AbortController();
    fetch(`/api/theme-parks?mode=${encodeURIComponent(mode)}${query ? `&q=${encodeURIComponent(query)}` : ""}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("theme parks unavailable")))
      .then((body) => setLoaded(Array.isArray(body.items) ? body.items : []), () => setLoaded([]));
    return () => controller.abort();
  }, [mode, query, items]);
  const rows = orderThemeParks(loaded.filter((place) => themeParkForPlace(place) && placePartnerPick(place, pinQ)));
  if (!rows.length) return null;
  const heading = themeParkHeading(mode);
  const railId = `theme-parks-${mode}`;
  return <section aria-labelledby={`${railId}-title`}>
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
    <RailHeading id={`${railId}-title`} title={heading.title} description={heading.description}>
      <RailNav railId={railId} count={rows.length} total={rows.length} unit="parks" />
    </RailHeading>
    <ol className="wf-rail" data-rail={railId} aria-label={heading.title}>
      {rows.map((place, index) => <IconicPlaceCard key={place.id} place={place} rank={index + 1}
        href={`/p/${encodeURIComponent(place.id)}`} onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
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
    <RailDots railId={railId} count={rows.length} />
  </section>;
}
