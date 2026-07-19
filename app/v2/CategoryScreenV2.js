"use client";

// app/v2/CategoryScreenV2.js — Discovery v2, stage 1: the category screen.
//
// This is the assembly surface for the components that landed in #210
// (CategoryNav / LocalPulse / ExperienceRail / PlaceCardV2 / DealsButton),
// wired to REAL owned-inventory data so the kit gets proven against production
// rows before the signature "best move right now" hero is built on top of it.
//
// Deliberately additive: it lives on its own route behind
// NEXT_PUBLIC_DISCOVERY_V2 and does not touch app/home.js, so the live app is
// bit-for-bit unchanged while this is iterated on.
//
// HONESTY: nothing here is mocked. The LOCAL PULSE band and the experience
// rails from the comps are intentionally ABSENT rather than filled with
// invented copy or invented counts — they need real signals, which is stage 2
// work. What renders is what we can actually stand behind.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, RADII, SPACE, TYPE } from "../components/kit";
import { CategoryNav, DealsButton, DISCOVERY_V2_CATEGORIES, PlaceCardV2 } from "../components/discovery-v2";
import { categorySearchUrl, invPlacesToCards } from "../../lib/discoveryV2Data";

// Mirrors app/home.js DEFAULT_CENTER. The v2 route has no location picker yet,
// so it opens where the app opens and reuses the persisted centre if the user
// already has one.
const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };

const TITLE = {
  food: "Food near",
  nightlife: "Night out near",
  attractions: "Things to do near",
  family: "Family near",
  hotels: "Stays near",
  shopping: "Shopping near",
};

function readStoredCenter() {
  try {
    const raw = localStorage.getItem("wf_center");
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (typeof c.lat === "number" && typeof c.lng === "number") {
      return { lat: c.lat, lng: c.lng, name: c.loc || DEFAULT_CENTER.name };
    }
  } catch {}
  return null;
}

export default function CategoryScreenV2({ initialCat = "attractions" }) {
  const [cat, setCat] = useState(initialCat);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [places, setPlaces] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | empty | error
  const [marks, setMarks] = useState({}); // id -> { saved, liked, disliked }

  // Ignore a slow response for a category the user has already left.
  const reqRef = useRef(0);

  useEffect(() => {
    const stored = readStoredCenter();
    if (stored) setCenter(stored);
  }, []);

  useEffect(() => {
    const seq = ++reqRef.current;
    let alive = true;
    setState("loading");

    (async () => {
      try {
        const r = await fetch(categorySearchUrl({ cat, lat: center.lat, lng: center.lng }));
        if (!r.ok) throw new Error(`search ${r.status}`);
        const j = await r.json();
        if (!alive || seq !== reqRef.current) return;
        const cards = invPlacesToCards(Array.isArray(j.places) ? j.places : [], center);
        setPlaces(cards);
        setState(cards.length ? "ready" : "empty");
      } catch {
        if (!alive || seq !== reqRef.current) return;
        setPlaces([]);
        setState("error");
      }
    })();

    return () => { alive = false; };
  }, [cat, center.lat, center.lng]);

  const mark = useCallback((id, key) => {
    setMarks((prev) => {
      const cur = prev[id] || {};
      const next = { ...cur, [key]: !cur[key] };
      // Like and dislike are mutually exclusive, same as the live app.
      if (key === "liked" && next.liked) next.disliked = false;
      if (key === "disliked" && next.disliked) next.liked = false;
      return { ...prev, [id]: next };
    });
  }, []);

  const heading = `${TITLE[cat] || "Near"} ${String(center.name || "").split(",")[0]}`;
  const countLabel = useMemo(
    () => (places.length === 1 ? "1 place" : `${places.length} places`),
    [places.length]
  );

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: `${SPACE.l}px ${SPACE.l}px 96px`, background: C.bg, minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.m, marginBottom: SPACE.l }}>
        <span style={{ ...TYPE.title, color: C.text, fontSize: 20 }}>wayfind</span>
        <DealsButton onClick={() => { window.location.href = "/coupons"; }} />
      </header>

      <h1 style={{ ...TYPE.title, color: C.text, fontSize: 26, lineHeight: 1.15, margin: `0 0 ${SPACE.l}px` }}>
        {heading}
      </h1>

      <div style={{ marginBottom: SPACE.l }}>
        <CategoryNav activeKey={cat} onSelect={setCat} categories={DISCOVERY_V2_CATEGORIES} />
      </div>

      <div aria-live="polite" style={{ ...TYPE.meta, color: C.muted, marginBottom: SPACE.m }}>
        {state === "loading" && "Finding places…"}
        {state === "ready" && countLabel}
        {state === "empty" && "Nothing in our inventory here yet."}
        {state === "error" && "Couldn’t load places just now."}
      </div>

      {state === "loading" && (
        <div style={{ display: "grid", gap: SPACE.l }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="wf-skeleton" style={{ height: 300, borderRadius: RADII.card }} />
          ))}
        </div>
      )}

      {state === "ready" && (
        <div style={{ display: "grid", gap: SPACE.l }}>
          {places.map((p) => {
            const m = marks[p.id] || {};
            return (
              <PlaceCardV2
                key={p.id}
                place={p}
                saved={!!m.saved}
                liked={!!m.liked}
                disliked={!!m.disliked}
                onSave={() => mark(p.id, "saved")}
                onLike={() => mark(p.id, "liked")}
                onDislike={() => mark(p.id, "disliked")}
              />
            );
          })}
        </div>
      )}

      <p style={{ ...TYPE.meta, color: C.muted, marginTop: SPACE.xl || SPACE.l, textAlign: "center" }}>
        Discovery v2 preview — saves and reactions here are not stored yet.
      </p>
    </main>
  );
}
