"use client";
// CityGate — the "clear door" (spec STEP 3 / on-demand-city-fetch). One function
// decides everything: wf_gate_status(lat, lng, uid) returns:
//   live   → the city is covered; render nothing (results show as normal).
//   unlock → a signed-in user in an uncovered city; offer to unlock it. Records
//            the demand in wf_city_requests and kicks /api/city/unlock (the
//            server-side Google/Viator fetch), then shows a "building it" state.
//   alert  → a signed-out user (or one who can't unlock); capture the email in
//            wf_waitlist so we can tell them when the city goes live.
// Returns null unless there's something to show, so it's safe to mount anywhere.
import { useEffect, useRef, useState } from "react";
import { C } from "./kit";
import { supabase } from "../../lib/supabase";

export default function CityGate({ center, city, user }) {
  const [status, setStatus] = useState(null); // live | unlock | alert | null
  const [phase, setPhase] = useState("idle");  // idle | building | listed
  const [email, setEmail] = useState("");
  const requestedFor = useRef(null);
  const cityName = (city || "this area").split(",")[0];

  useEffect(() => {
    let dead = false;
    if (!supabase || !center || !isFinite(center.lat)) { setStatus(null); return; }
    setPhase("idle");
    supabase.rpc("wf_gate_status", { p_lat: center.lat, p_lng: center.lng, p_user_id: (user && user.id) || null })
      .then(({ data }) => { if (!dead) setStatus(typeof data === "string" ? data : null); }, () => {});
    return () => { dead = true; };
  }, [center && center.lat, center && center.lng, user && user.id]);

  if (status !== "unlock" && status !== "alert") return null; // live / unknown → nothing

  const unlock = async () => {
    const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
    if (requestedFor.current === key) return;
    requestedFor.current = key;
    setPhase("building");
    try {
      await supabase.from("wf_city_requests").insert({
        user_id: (user && user.id) || null, email: (user && user.email) || null,
        city_query: cityName, lat: center.lat, lng: center.lng, status: "requested",
      });
    } catch (e) {}
    // Kick the server-side fetch (Google Places + Viator for this city). Fire-and-
    // forget: it runs in its own invocation; the gate flips to live once inventory
    // lands, so the user just re-searches shortly.
    try { fetch("/api/city/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: center.lat, lng: center.lng, city: cityName }) }); } catch (e) {}
  };

  const notify = async () => {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return;
    try {
      await supabase.from("wf_waitlist").insert({ email: em, city: cityName, lat: center.lat, lng: center.lng, source: "gate" });
      setPhase("listed");
    } catch (e) { setPhase("listed"); }
  };

  const shell = { margin: "10px 2px 16px", padding: "16px 16px", borderRadius: 16, border: `1px solid ${C.accent}55`, background: C.card };

  if (status === "unlock") {
    return (
      <div style={shell}>
        {phase === "building" ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Unlocking {cityName}…</div>
            <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5 }}>We're gathering the best of {cityName} — attractions, tours and stays, scored the same way as everywhere else. This takes a moment; check back shortly and it'll be live.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Wayfind isn't in {cityName} yet — want it?</div>
            <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginBottom: 12 }}>You're signed in, so you can open it. We'll pull {cityName}'s best places, tours and tickets and score them by the same Wayfind Score.</div>
            <button onClick={unlock} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 42, padding: "10px 20px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Unlock {cityName} →</button>
          </>
        )}
      </div>
    );
  }

  // alert
  return (
    <div style={shell}>
      {phase === "listed" ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>You're on the list for {cityName}.</div>
          <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5 }}>We'll email you the moment {cityName} goes live. Signed-in members can unlock a city instantly — worth it if you're headed there soon.</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Wayfind isn't in {cityName} yet.</div>
          <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginBottom: 12 }}>Get notified when it's live — or sign in to unlock it now.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="you@email.com" aria-label={"Email to be notified about " + cityName} style={{ flex: "1 1 180px", minHeight: 42, padding: "10px 14px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.adim, color: C.text, fontSize: 14 }} />
            <button onClick={notify} style={{ minHeight: 42, padding: "10px 20px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Notify me</button>
          </div>
        </>
      )}
    </div>
  );
}
