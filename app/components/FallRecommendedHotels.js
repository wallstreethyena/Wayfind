"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { validStayOrigin } from "../../lib/stayOrigin.js";
import EventStayCards from "./EventStayCards.js";
import RailLoading from "./RailLoading.js";
import RailHeading from "./RailHeading.js";
import { WF_PLACE_CARD_CSS } from "./css.js";

const REQUEST_DEADLINE_MS = 8000;
const RECOMMENDED_HOTEL_LIMIT = 20;
const MUTED = "#A99FA8";

function hotelParams(center) {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  if (!validStayOrigin(lat, lng)) return null;
  return new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(RECOMMENDED_HOTEL_LIMIT) });
}

function normalizeHotel(place) {
  if (!place || typeof place !== "object") return null;
  const googlePlaceId = String(place.googlePlaceId || "").trim();
  const id = googlePlaceId || String(place.id || "").trim();
  if (!id || !place.name) return null;
  return {
    ...place,
    id,
    // Only a stable Google place identity opens Wayfind detail. Owned rows
    // without one remain useful hotel cards and booking CTAs without inventing
    // a detail route for a synthetic id.
    detailHref: googlePlaceId ? "/p/" + encodeURIComponent(googlePlaceId) : null,
  };
}

function dedupeHotels(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const place = normalizeHotel(row);
    if (!place) continue;
    const key = String(place.googlePlaceId || place.id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}

export default function FallRecommendedHotels({ center = null }) {
  const params = useMemo(() => hotelParams(center), [center?.lat, center?.lng]);
  const key = params ? params.toString() : "";
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ key: "", status: "idle", places: [] });

  useEffect(() => {
    if (!key) {
      setState({ key: "", status: "idle", places: [] });
      return undefined;
    }
    let current = true;
    setState({ key, status: "loading", places: [] });
    fetchJsonWithDeadline("/api/hotels?" + key, { timeoutMs: REQUEST_DEADLINE_MS })
      .then((body) => {
        if (!current) return;
        if (!body || !Array.isArray(body.hotels)) throw new Error("Malformed hotel response");
        setState({ key, status: "ready", places: dedupeHotels(body.hotels) });
      })
      .catch(() => {
        if (current) setState({ key, status: "failed", places: [] });
      });
    return () => { current = false; };
  }, [key, retry]);

  if (!key || state.status === "idle" || state.key !== key) return null;

  if (state.status === "loading") {
    return <section aria-label="Recommended hotels" style={{ marginTop: 28 }}>
      <RailHeading title="Recommended Hotels" description="Best-rated stays near this area." />
      <RailLoading label="Finding recommended hotels" />
    </section>;
  }

  if (state.status === "failed") {
    return <section aria-label="Recommended hotels" style={{ marginTop: 28 }}>
      <RailHeading title="Recommended Hotels" description="Best-rated stays near this area." />
      <p style={{ color: MUTED, fontSize: 13, margin: "8px 0" }}>Hotels could not load right now.</p>
      <button type="button" onClick={() => setRetry((value) => value + 1)}
        style={{ border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: "#FFF7ED", padding: "7px 12px", fontWeight: 800 }}>
        Try again
      </button>
    </section>;
  }

  // Do not end the collection with a dead "no stays within 12 miles" panel.
  // The owned-hotel source already widens to the nearest practical market;
  // when it genuinely has no coverage, hiding the rail is the honest state.
  if (!state.places.length) return null;

  return <section aria-label="Recommended hotels" style={{ marginTop: 28 }}>
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
    <EventStayCards
      places={state.places}
      title="Recommended Hotels"
      description="Best-rated stays near this area."
      label="Recommended hotels"
      surface="fall_recommended_hotels"
    />
  </section>;
}
