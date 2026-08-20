"use client";

// app/components/GuidePlaceCard.js — the guide's place card.
//
// WHY A WRAPPER AND NOT A SECOND CARD. The owner's ask was "in the blog we
// should have our iconic place cards" — so this renders the SHARED
// IconicPlaceCard, unforked. What it adds is the one thing a guide page cannot
// do on its own: the guide route is a server component (no "use client", by
// design, so the body is in the HTML a crawler reads), and IconicPlaceCard's
// Save and Itinerary actions are function props. A server component cannot pass
// a function. This client shell sits between them.
//
// THE STATE IS THE APP'S STATE, not a copy. It reads and writes the same two
// localStorage keys app/home.js persists to — "wayfind_lists" and
// "wayfind_trips" — through the same lib/trips.js helper the app uses. So a
// place saved in a guide reads as saved in the app, which is exactly what was
// asked for, and there is no second store to drift.
//
// It deliberately does NOT reach for Supabase. The signed-in sync path lives in
// app/home.js's effects; duplicating it here would be a second writer to the
// same rows. A guide save lands locally and the app reconciles it on next load,
// the same way an offline save always has.
import { useCallback, useEffect, useState } from "react";
import IconicPlaceCard from "./IconicPlaceCard";
import { addPlaceToTrips, tripMetaForPlace } from "../../lib/trips";

const LISTS_KEY = "wayfind_lists";
const TRIPS_KEY = "wayfind_trips";

const read = (k, fallback) => {
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
};
const write = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export default function GuidePlaceCard({ place, rank, editorial }) {
  // Mount-only. The server render must not read localStorage — it would
  // hydrate-mismatch, and these pages are prerendered.
  const [saved, setSaved] = useState(false);
  const [inTrip, setInTrip] = useState(false);

  useEffect(() => {
    if (!place || !place.id) return;
    const lists = read(LISTS_KEY, {});
    const fav = (lists.favorites && lists.favorites.places) || [];
    setSaved(fav.some((x) => x && x.id === place.id));
    const trips = read(TRIPS_KEY, {});
    try {
      const meta = tripMetaForPlace(place);
      const t = trips[meta.key];
      setInTrip(!!(t && t.items && t.items.some((it) => it.id === place.id)));
    } catch (e) {}
  }, [place]);

  const onSave = useCallback((e, p) => {
    const lists = read(LISTS_KEY, {});
    const fav = lists.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
    const has = fav.places.some((x) => x && x.id === p.id);
    const next = { ...lists, favorites: { ...fav, places: has ? fav.places.filter((x) => x.id !== p.id) : [...fav.places, p] } };
    write(LISTS_KEY, next);
    setSaved(!has);
  }, []);

  const onItinerary = useCallback((e, p) => {
    const trips = read(TRIPS_KEY, {});
    let already = false;
    try {
      const meta = tripMetaForPlace(p);
      const t = trips[meta.key];
      already = !!(t && t.items && t.items.some((it) => it.id === p.id));
    } catch (er) {}
    if (already) { setInTrip(true); return; }
    write(TRIPS_KEY, addPlaceToTrips(trips, p, Date.now()));
    setInTrip(true);
  }, []);

  if (!place) return null;
  // v8.28 shipped cardActionsReadOnly here: a guide page had no likes pipeline,
  // so rather than render an <a href="/p/<id>?action=like"> dressed as a button
  // it rendered nothing. v8.29 removes the reason. lib/cardActions.js is that
  // pipeline — the same four localStorage maps and the same Supabase `likes`
  // upsert app/home.js's toggleLike owns, reachable from a prerendered page —
  // so a guide reader can now like a place where they are reading about it,
  // which is the whole point of putting the card there. Nothing is forked: the
  // store IS lib/likeSignal.js, which home.js's behaviour was extracted into.
  return (
    <IconicPlaceCard
      place={place}
      rank={rank}
      href={`/p/${encodeURIComponent(place.id)}`}
      editorial={editorial || null}
      saved={saved}
      inTrip={inTrip}
      onSave={onSave}
      onItinerary={onItinerary}
      surface="guide"
    />
  );
}
