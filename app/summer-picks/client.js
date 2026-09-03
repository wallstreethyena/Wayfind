"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "../components/RankedExperiencePage";
import SummerPicksRails from "../components/SummerPicksRails";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { liveFromRailsResponse, originForCity } from "../../lib/locationHonesty.js";
import { homeAffiliateActivities } from "../../lib/homeAffiliateActivities.js";
import { composeSummerPickRails } from "../../lib/summerPicks.js";
import { cardImageSrc } from "../../lib/placePhoto.js";

const LOAD_TIMEOUT_MS = 10000;
const PHOTO_TIMEOUT_MS = 4000;
const PHOTO_WORKERS = 12;

const ownedPhotoSrc = (place) => place?.photoUrl || place?.photo_url || cardImageSrc(place, 640);

function imageLoads(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), PHOTO_TIMEOUT_MS);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = src;
  });
}

async function placesWithWorkingPhotos(places) {
  const rows = Array.isArray(places) ? places : [];
  const sources = [...new Set(rows.map(ownedPhotoSrc).filter(Boolean))];
  const working = new Set();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(PHOTO_WORKERS, sources.length) }, async () => {
    while (cursor < sources.length) {
      const src = sources[cursor++];
      if (await imageLoads(src)) working.add(src);
    }
  }));
  return rows.filter((place) => working.has(ownedPhotoSrc(place)));
}

function menuPlaces(payload) {
  const live = liveFromRailsResponse(payload);
  const byId = new Map();
  for (const [railId, cards] of Object.entries(live.places || {})) {
    for (const card of cards || []) {
      if (!card?.id) continue;
      const previous = byId.get(card.id);
      if (previous) {
        if (!previous._sourceRails.includes(railId)) previous._sourceRails.push(railId);
      } else {
        byId.set(card.id, { ...card, _sourceRails: [railId] });
      }
    }
  }
  return [...byId.values()];
}

export default function SummerPicksClient() {
  const sp = useSearchParams();
  const city = String(sp.get("city") || "").slice(0, 48);
  const queryLat = Number.parseFloat(sp.get("lat") || "");
  const queryLng = Number.parseFloat(sp.get("lng") || "");
  const cityOrigin = originForCity(city);
  const initial = Number.isFinite(queryLat) && Number.isFinite(queryLng) ? { lat: queryLat, lng: queryLng } : cityOrigin;
  const [center, setCenter] = useState(initial || null);
  const [rails, setRails] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (center) return;
    try {
      const stored = JSON.parse(localStorage.getItem("wf_center") || "null");
      if (stored && Number.isFinite(stored.lat) && Number.isFinite(stored.lng)) setCenter({ lat: stored.lat, lng: stored.lng });
    } catch {}
  }, [center]);

  const key = useMemo(() => center ? `${center.lat.toFixed(2)}|${center.lng.toFixed(2)}|${retry}` : "", [center, retry]);
  useEffect(() => {
    if (!key || !center) return;
    let cancelled = false;
    setFailed(false);
    setRails(null);
    const location = { lat: center.lat.toFixed(2), lng: center.lng.toFixed(2) };
    const summerQ = new URLSearchParams(location);
    const menuQ = new URLSearchParams({ ...location, v: "2", limit: "12" });
    const tourQ = new URLSearchParams({ ...location, mi: "120", cat: "all", limit: "100", page: "0" });
    Promise.allSettled([
      fetchJsonWithDeadline(`/api/summer/places?${summerQ}`, { timeoutMs: LOAD_TIMEOUT_MS }),
      fetchJsonWithDeadline(`/api/rails?${menuQ}`, { timeoutMs: LOAD_TIMEOUT_MS }),
      fetchJsonWithDeadline(`/api/experiences?${tourQ}`, { timeoutMs: LOAD_TIMEOUT_MS }),
    ]).then(async (results) => {
      if (cancelled) return;
      const summer = results[0].status === "fulfilled" ? results[0].value : null;
      const menu = results[1].status === "fulfilled" ? results[1].value : null;
      const experiences = results[2].status === "fulfilled" ? results[2].value : null;
      const placeMap = new Map();
      for (const place of Array.isArray(summer?.places) ? summer.places : []) placeMap.set(place.id, place);
      for (const place of menuPlaces(menu)) {
        const existing = placeMap.get(place.id);
        placeMap.set(place.id, existing ? { ...place, ...existing, _sourceRails: [...new Set([...(place._sourceRails || []), ...(existing._sourceRails || [])])] } : place);
      }
      const tours = homeAffiliateActivities(experiences?.items, 100);
      const verifiedPlaces = await placesWithWorkingPhotos([...placeMap.values()]);
      if (cancelled) return;
      const composed = composeSummerPickRails(verifiedPlaces, tours);
      const usable = composed.some((rail) => rail.cards.length > 0);
      if (!usable) setFailed(true);
      else setRails(composed);
    });
    return () => { cancelled = true; };
  }, [key]);

  const headingCity = city || "Florida";
  return <RankedExperiencePage
    eyebrow="WAYFIND SUMMER PICKS"
    titleTop="Your best"
    titleBottom="Florida summer"
    subtitle={`Ten ranked ways to handle heat, rain, school break and vacation mode around ${headingCity}. Real place photos, current Wayfind inventory and verified bookable activities only.`}
    heroImg="/cards/best-summer-ever.jpg"
    location={headingCity}
    imageKicker="BEST SUMMER EVER"
    imageTitle="Water first. Rain plan ready. Every card earns the stop."
    dekLead="Pick the summer need."
    trustLines={["Places rank on evidence, not payment.", "Viator links are affiliate links; Wayfind may earn a commission at no extra cost to you."]}
    topLeft={<a href="/" style={{ color: "#F97316", textDecoration: "none", fontWeight: 800 }}>← Wayfind</a>}
  >
    {!center ? <div style={{ padding: "18px", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, color: "#A8B0BE" }}>Open Summer Picks from the Wayfind homepage so your location can rank the rails.</div> : null}
    {center && !rails && !failed ? <div role="status" aria-busy="true" aria-label="Ranking Florida summer picks">{[0, 1, 2].map((n) => <div key={n} className="wf-sk" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />)}</div> : null}
    {failed ? <div style={{ color: "#A8B0BE" }}><p>Wayfind could not reach enough photo-verified summer inventory. This is a loading failure, not an empty Florida.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #F97316", borderRadius: 999, background: "#111827", color: "#F8FAFC", padding: "9px 14px", fontWeight: 800 }}>Try again</button></div> : null}
    {rails ? <SummerPicksRails rails={rails} city={headingCity} /> : null}
  </RankedExperiencePage>;
}
