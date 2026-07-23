"use client";
// CityGate — the "clear door" (spec STEP 3 / on-demand-city-fetch). One function
// decides everything: wf_gate_status(lat, lng, uid) returns:
//   live   → the city is covered; render nothing (results show as normal).
//   unlock → a signed-in user in an uncovered city; offer to unlock it. Records
//            the demand in wf_city_requests and kicks /api/city/unlock (the
//            server-side Google/Viator fetch), then shows a "building it" state.
//   alert  → a signed-out user; PRIMARY = sign in free to unlock, fallback = the
//            waitlist (wf_waitlist).
// Premium, image-led shell (v6.79): a deep gradient with a warm accent glow, a
// champagne eyebrow, a location-pin motif, and a gradient CTA — matches the
// hero-card standard, not a plain box. Returns null unless there's something to
// show, so it's safe to mount anywhere.
import { useEffect, useRef, useState } from "react";
import { C, CHAMPAGNE } from "./kit";
import { supabase } from "../../lib/supabase";

export default function CityGate({ status, center, city, user, onSignUp }) {
  // SINGLE SOURCE OF TRUTH: home.js already resolves wf_gate_status and passes it
  // in. We do NOT re-fetch here — that double round-trip is what made the card
  // linger. The card now appears/disappears atomically with home's fast lookup.
  const [phase, setPhase] = useState("idle");  // idle | building | listed
  const [email, setEmail] = useState("");
  const requestedFor = useRef(null);
  const cityName = (city || "this area").split(",")[0];

  // Reset the transient phase when the place or coverage status changes.
  useEffect(() => { setPhase("idle"); }, [status, center && center.lat, center && center.lng]);

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
    // The on-demand fetch only runs for a signed-in user, so send the access
    // token — the server verifies it before spending Google calls (#10).
    let token = null;
    try { const { data } = await supabase.auth.getSession(); token = data && data.session && data.session.access_token; } catch (e) {}
    try { fetch("/api/city/unlock", { method: "POST", headers: { "content-type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ lat: center.lat, lng: center.lng, city: cityName }) }); } catch (e) {}
  };

  const notify = async () => {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return;
    try {
      await supabase.from("wf_waitlist").insert({ email: em, city: cityName, lat: center.lat, lng: center.lng, source: "gate" });
      setPhase("listed");
    } catch (e) { setPhase("listed"); }
  };

  // ── premium shell ──
  const shell = {
    position: "relative", overflow: "hidden", margin: "12px 2px 18px",
    padding: "22px 20px 20px", borderRadius: 20,
    background: "radial-gradient(120% 140% at 100% 0%, rgba(249,115,22,.22) 0%, rgba(249,115,22,0) 42%), linear-gradient(160deg, #0C1526 0%, #131E33 55%, #0A1120 100%)",
    border: "1px solid rgba(232,201,122,.28)",
    boxShadow: "0 12px 34px rgba(0,0,0,.45)",
  };
  const pin = (
    <svg width="120" height="120" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ position: "absolute", right: -14, top: -18, opacity: 0.1, color: CHAMPAGNE.base, pointerEvents: "none" }}>
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
  const eyebrow = (label) => (
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: CHAMPAGNE.base, marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden="true">📍</span> {label}
    </div>
  );
  const title = (t) => <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.2, letterSpacing: "-.2px", marginBottom: 6 }}>{t}</div>;
  const body = (t) => <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.5, marginBottom: 16, maxWidth: 460 }}>{t}</div>;
  const primaryBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 48, padding: "12px 20px", borderRadius: 999, border: "none", background: "linear-gradient(135deg, #F97316 0%, #FB923C 100%)", color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 22px rgba(249,115,22,.32)" };

  if (status === "unlock") {
    return (
      <div style={shell}>
        {pin}
        {phase === "building" ? (
          <>
            {eyebrow("Unlocking " + cityName)}
            {title("Building " + cityName + "…")}
            {body("We're pulling " + cityName + "'s best places, tours and stays and scoring them the same way as everywhere else. Give it a moment, then refresh — it'll be live.")}
          </>
        ) : (
          <>
            {eyebrow("New city")}
            {title("Wayfind isn't in " + cityName + " yet.")}
            {body("You can unlock it now — we'll pull it in live.")}
            <button onClick={unlock} style={primaryBtn}>Unlock {cityName} →</button>
          </>
        )}
      </div>
    );
  }

  // alert (signed out)
  return (
    <div style={shell}>
      {pin}
      {phase === "listed" ? (
        <>
          {eyebrow("You're on the list")}
          {title("We'll tell you when " + cityName + " is live.")}
          {body("Signed-in members can unlock a city the moment they arrive — it's free, and worth it if you're headed there soon.")}
        </>
      ) : (
        <>
          {eyebrow("Coming to your area")}
          {title("Wayfind isn't in " + cityName + " yet.")}
          {body("Sign in to unlock " + cityName + " now — or get notified when it's live. It's free.")}
          <button onClick={() => { try { onSignUp && onSignUp(); } catch (e) {} }} style={primaryBtn}>Sign in to unlock {cityName}</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 10px", color: C.muted, fontSize: 11.5, fontWeight: 700 }}>
            <span style={{ flex: 1, height: 1, background: C.border }} /> OR <span style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="you@email.com" aria-label={"Email to be notified about " + cityName} style={{ flex: "1 1 160px", minHeight: 44, padding: "10px 15px", borderRadius: 999, border: `1px solid ${C.border}`, background: "rgba(4,8,16,.5)", color: C.text, fontSize: 14 }} />
            <button onClick={notify} style={{ minHeight: 44, padding: "10px 20px", borderRadius: 999, border: `1px solid ${CHAMPAGNE.base}66`, background: "transparent", color: CHAMPAGNE.base, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Notify me</button>
          </div>
        </>
      )}
    </div>
  );
}
