"use client";

import { useEffect, useRef, useState } from "react";
import { drivingEmbedUrl } from "../../lib/eventDrivingRoute.js";

export default function EventDrivingRoute({ venue, directionsHref }) {
  const [url, setUrl] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setUrl(null); setMessage(""); setBusy(false);
    return () => { generation.current++; };
  }, [venue.lat, venue.lng]);
  const showRoute = () => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key || /placeholder/i.test(key)) { setMessage("The route preview is unavailable. Open directions in Google Maps below."); return; }
    if (!navigator.geolocation) { setMessage("Location is unavailable. Open directions to choose your starting point."); return; }
    const request = ++generation.current;
    setBusy(true); setMessage("");
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== generation.current) return;
      const next = drivingEmbedUrl(key, { lat: position.coords.latitude, lng: position.coords.longitude }, venue);
      setUrl(next); setBusy(false);
      if (!next) setMessage("Your location could not be used. Open directions to choose your starting point.");
    }, () => {
      if (request !== generation.current) return;
      setBusy(false); setMessage("Location wasn't available. Open directions to choose your starting point.");
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  };
  return <div style={{ padding: "16px 0", color: "#d7dde5" }}>
    <button type="button" className="wfw-btn wfw-dir" disabled={busy} onClick={showRoute}>{busy ? "Finding your location…" : "Show my driving route"}</button>
    <p style={{ fontSize: 12, lineHeight: 1.5, margin: "10px 0" }}>Uses your location with Google Maps to show the roads, distance and travel time.</p>
    <form onSubmit={event => {
      event.preventDefault();
      const next = drivingEmbedUrl(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY, start, venue);
      generation.current++; setBusy(false); setUrl(next);
      setMessage(next ? "" : "The route preview is unavailable. Open directions in Google Maps below.");
    }} style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
      <input aria-label="Starting city or address" placeholder="Or enter a starting city" value={start} onChange={event => setStart(event.target.value)} maxLength={200} required style={{ flex: "1 1 180px", minWidth: 0, padding: 12, border: "1px solid #3c4959", borderRadius: 10, color: "#f5f4ef", background: "#0d141e", font: "inherit" }} />
      <button className="wfw-btn wfw-site" type="submit">Preview drive</button>
    </form>
    {message ? <p role="status">{message}</p> : null}
    {url ? <iframe title={`Driving route to ${venue.name}`} src={url} width="100%" height="420" style={{ display: "block", border: 0, borderRadius: 16 }} referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : null}
    {directionsHref ? <a href={directionsHref} target="_blank" rel="noopener nofollow" style={{ display: "inline-block", color: "#ff9a55", fontSize: 13, marginTop: 10 }}>Open navigation in Google Maps ↗</a> : null}
  </div>;
}
