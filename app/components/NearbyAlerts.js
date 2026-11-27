"use client";
// app/components/NearbyAlerts.js — opt-in "picks near me" plus an in-page nudge.
//
// OWNER INTENT (Gabe, 2026-11-27): nudge people toward hidden springs and the
// sweet spots everyone loves when they are close, driving foot traffic to local
// businesses, with strict privacy and good battery. On the website a browser
// cannot watch location in the background, so this is the honest web version:
//
//   1. Nothing happens until the reader taps "Show picks near me". Only then
//      does the browser ask for location (never on page load).
//   2. The point is rounded to about 1 km ON THE PHONE and sent once, in a POST
//      body, to /api/nearby-picks. The server stores nothing.
//   3. "Nudge me while I browse" is a second, separate opt-in. While this page
//      is open and visible, the phone compares its own location with the picks
//      it already has. No further location ever leaves the phone. It stops the
//      moment the tab is hidden, the page closes or the reader turns it off.
//   4. Every nudge passes lib/alertPolicy.js first: one alert a day across all
//      Wayfind alerts (push included), quiet 8 PM to 9 AM, and a place never
//      nudges twice in 30 days.
//
// Analytics carry counts and kinds only, never a coordinate.
// Locked by scripts/test-nearby-picks.mjs.
import { useCallback, useEffect, useRef, useState } from "react";
import IconicPlaceCard from "./IconicPlaceCard";
import { track } from "../../lib/track";
import { toDisplayScore, formatScore } from "../../lib/score";
import { distanceMiles } from "../../lib/deviceDistance.js";
import { roundCoord, nudgeCandidate, SPRING_RADIUS_MI, SWEET_RADIUS_MI } from "../../lib/nearbyHotspots.js";
import { canAlert, recordAlert, readAlertLedger, writeAlertLedger, deviceTimeZone } from "../../lib/alertPolicy.js";

const ACCENT = "#E8B84B";
const panel = { marginBottom: 18, padding: "16px 16px 14px", borderRadius: 16, background: "#0F1420", border: "1px solid rgba(255,255,255,.08)" };
const btn = (primary) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, padding: "10px 18px",
  borderRadius: 12, border: primary ? "none" : "1px solid rgba(255,255,255,.18)", background: primary ? ACCENT : "transparent",
  color: primary ? "#111824" : "#F8F5EE", fontSize: 13.5, fontWeight: 850, cursor: "pointer", maxWidth: "100%",
});
const h3 = { margin: "16px 0 8px", fontSize: 15, fontWeight: 850, color: "#F8F5EE" };
const muted = { margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "#8B949E" };

function safeTrack(name, props) { try { track(name, props); } catch (e) {} }

export default function NearbyAlerts() {
  const [state, setState] = useState("idle"); // idle | locating | loading | ready | empty | denied | error
  const [picks, setPicks] = useState(null);
  const [watching, setWatching] = useState(false);
  const [nudge, setNudge] = useState(null);
  const watchRef = useRef(null);

  const stopWatch = useCallback(() => {
    if (watchRef.current != null) {
      try { navigator.geolocation.clearWatch(watchRef.current); } catch (e) {}
      watchRef.current = null;
    }
  }, []);

  const showPicks = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setState("error"); return; }
    setState("locating");
    safeTrack("nearby_picks_requested", {});
    navigator.geolocation.getCurrentPosition(async (pos) => {
      setState("loading");
      try {
        const res = await fetch("/api/nearby-picks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Rounded here, before it leaves the phone (about 1.1 km).
          body: JSON.stringify({ lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude) }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || body.status === "unavailable") { setState("error"); return; }
        const next = { springs: Array.isArray(body.springs) ? body.springs : [], sweets: Array.isArray(body.sweets) ? body.sweets : [] };
        setPicks(next);
        setState(next.springs.length || next.sweets.length ? "ready" : "empty");
        safeTrack("nearby_picks_shown", { springs: next.springs.length, sweets: next.sweets.length });
      } catch (e) {
        setState("error");
      }
    }, (err) => {
      setState(err && err.code === 1 ? "denied" : "error");
    }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 15000 });
  }, []);

  const onPosition = useCallback((pos) => {
    if (!picks) return;
    // Full-precision point, used here on the phone only, never sent anywhere.
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const hit = nudgeCandidate(here, picks, (a, b) => distanceMiles(a, b));
    if (!hit) return;
    const tz = deviceTimeZone();
    const ledger = readAlertLedger();
    const now = Date.now();
    if (!canAlert(ledger, { now, tz, placeId: hit.place.id }).ok) return;
    writeAlertLedger(recordAlert(ledger, { now, tz, placeId: hit.place.id }));
    setNudge(hit);
    safeTrack("nearby_nudge_shown", { kind: hit.kind });
  }, [picks]);

  useEffect(() => {
    if (!watching || !picks || typeof navigator === "undefined" || !navigator.geolocation) return undefined;
    const start = () => {
      if (watchRef.current != null || document.visibilityState === "hidden") return;
      watchRef.current = navigator.geolocation.watchPosition(onPosition, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") stopWatch(); else start(); };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); stopWatch(); };
  }, [watching, picks, onPosition, stopWatch]);

  const toggleWatch = () => {
    setWatching((w) => {
      safeTrack(w ? "nearby_nudge_off" : "nearby_nudge_on", {});
      return !w;
    });
  };

  const card = (p, i, kind) => (
    <IconicPlaceCard key={p.id} place={p} rank={i + 1} href={"/p/" + encodeURIComponent(p.id)}
      editorial={null} badge={<span style={{ fontSize: 11.5, fontWeight: 800, color: ACCENT }}>{kind === "spring" ? "Natural spring" : "Sweet spot"}</span>} />
  );

  return (
    <section aria-labelledby="wf-nearby-picks-h" data-nearby-alerts style={panel}>
      <h2 id="wf-nearby-picks-h" style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#F8F5EE" }}>Springs and sweet spots near you</h2>
      {state === "idle" || state === "locating" || state === "loading" ? (
        <>
          <p style={muted}>Natural springs within {SPRING_RADIUS_MI} miles and the best rated dessert, bakery and ice cream stops within {SWEET_RADIUS_MI} miles. We use your location once to find them and never save it.</p>
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={showPicks} disabled={state !== "idle"} style={btn(true)} data-nearby-show>
              {state === "idle" ? "Show picks near me" : "Finding picks near you…"}
            </button>
          </div>
        </>
      ) : null}
      {state === "denied" ? <p style={muted} role="status">Location is off for Wayfind in this browser, so we can't find picks near you. Everything below still works.</p> : null}
      {state === "error" ? (
        <p style={muted} role="status">We couldn't load picks near you just now. <button type="button" onClick={showPicks} style={{ ...btn(false), minHeight: 32, padding: "4px 12px", marginLeft: 6 }}>Try again</button></p>
      ) : null}
      {state === "empty" ? <p style={muted} role="status">No natural springs within {SPRING_RADIUS_MI} miles or top rated sweet spots within {SWEET_RADIUS_MI} miles of you right now.</p> : null}
      {state === "ready" && picks ? (
        <>
          {picks.springs.length ? <><h3 style={h3}>Natural springs</h3><ol style={{ listStyle: "none", margin: 0, padding: 0 }}>{picks.springs.map((p, i) => card(p, i, "spring"))}</ol></> : null}
          {picks.sweets.length ? <><h3 style={h3}>Sweet spots</h3><ol style={{ listStyle: "none", margin: 0, padding: 0 }}>{picks.sweets.map((p, i) => card(p, i, "sweet"))}</ol></> : null}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <button type="button" onClick={toggleWatch} aria-pressed={watching} style={btn(!watching)} data-nearby-watch>
              {watching ? "Stop nudges" : "Nudge me while I browse"}
            </button>
            <p style={muted}>{watching
              ? "On while this page is open. Your location stays on your phone. At most one nudge a day, never at night."
              : "We'll let you know when you're right by one of these, only while this page is open. At most one nudge a day, never at night."}</p>
          </div>
        </>
      ) : null}
      {nudge ? (
        <div role="status" data-nearby-nudge style={{ position: "fixed", left: 12, right: 12, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", zIndex: 60, maxWidth: 520, margin: "0 auto", padding: "14px 14px 12px", borderRadius: 16, background: "#161C2A", border: "1px solid " + ACCENT, boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "#F8F5EE", fontWeight: 700 }}>
            You're {nudge.d < 0.5 ? "a short walk" : Math.max(1, Math.round(nudge.d)) + " mi"} from {nudge.place.name}
            {toDisplayScore(nudge.place.governed_score) != null ? `, rated ${formatScore(toDisplayScore(nudge.place.governed_score))} on Wayfind` : ""}.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <a href={"/p/" + encodeURIComponent(nudge.place.id)} onClick={() => safeTrack("nearby_nudge_opened", { kind: nudge.kind })} style={{ ...btn(true), textDecoration: "none" }}>See it</a>
            <button type="button" onClick={() => setNudge(null)} style={btn(false)}>Not now</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
