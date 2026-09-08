"use client";

import { useEffect, useRef, useState } from "react";

export default function EventDrivingRoute({ venue, directionsHref, mapController }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState("");
  const [summary, setSummary] = useState(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setMessage(""); setBusy(false); setSummary(null); setStart("");
    return () => { generation.current += 1; };
  }, [venue.lat, venue.lng]);

  const run = (request) => {
    if (!mapController) { setMessage("The Apple route preview is unavailable right now. Use the external directions link below."); return; }
    const requestNumber = ++generation.current;
    setBusy(true); setMessage(""); setSummary(null);
    Promise.resolve(request()).then((next) => {
      if (requestNumber !== generation.current) return;
      setSummary(next); setBusy(false);
    }).catch((error) => {
      if (requestNumber !== generation.current) return;
      setBusy(false); setMessage(error && error.message ? error.message : "Apple could not calculate a driving route.");
    });
  };

  const showLocation = () => {
    if (!navigator.geolocation) { setMessage("Location is unavailable. Enter a starting point below."); return; }
    setBusy(true); setMessage(""); setSummary(null);
    const requestNumber = ++generation.current;
    navigator.geolocation.getCurrentPosition((position) => {
      if (requestNumber !== generation.current) return;
      run(() => mapController && mapController.routeFromCoordinate({ lat: position.coords.latitude, lng: position.coords.longitude }));
    }, () => {
      if (requestNumber !== generation.current) return;
      setBusy(false); setMessage("Location wasn't available. Enter a starting point below.");
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!start.trim() || busy) return;
    run(() => mapController && mapController.searchAndRoute(start));
  };
  return <section id="event-route" tabIndex="-1" aria-label={`Driving route to ${venue.name}`} style={{ padding: "16px 0", color: "#d7dde5", scrollMarginTop: 24 }}>
    <h3 style={{ margin: "0 0 6px", color: "#F8FAFC", fontSize: 17 }}>Plan your drive</h3>
    <p style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 10px" }}>Choose your location or enter a starting point to draw the Apple driving route on the map. Your starting point is shared with Apple to calculate this route.</p>
    <button type="button" className="wfw-btn wfw-dir" disabled={busy || !mapController} onClick={showLocation}>{busy ? "Calculating route…" : "Use my location"}</button>
    <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
      <input aria-label="Starting city or address" placeholder="Or enter a starting city or address" value={start} onChange={(event) => setStart(event.target.value)} maxLength={200} required style={{ flex: "1 1 220px", minWidth: 0, padding: 12, border: "1px solid #3c4959", borderRadius: 10, color: "#f5f4ef", background: "#0d141e", font: "inherit" }} />
      <button className="wfw-btn wfw-site" type="submit" disabled={busy || !mapController} style={{ flex: "0 0 auto", whiteSpace: "nowrap", minWidth: 132, minHeight: 44 }}>Preview drive</button>
    </form>
    {summary ? <p role="status" style={{ margin: "8px 0", fontWeight: 800, color: "#8ED6C4" }}>Driving route: {summary.distanceLabel} · about {summary.etaLabel}</p> : null}
    {message ? <p role="status" style={{ margin: "8px 0", color: "#FDBA74" }}>{message}</p> : null}
    {directionsHref ? <a href={directionsHref} target="_blank" rel="noopener nofollow" style={{ display: "inline-block", color: "#ff9a55", fontSize: 13, marginTop: 10 }}>Open in Apple Maps ↗</a> : null}
  </section>;
}
