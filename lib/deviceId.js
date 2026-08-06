// lib/deviceId.js — durable, first-party, anonymous device id.
//
// EXTRACTED FROM app/home.js VERBATIM (2026-08-01), not reimplemented. This
// function is privacy-sensitive (Do Not Track / wf_optout handling) and used
// to be module-private to home.js, so any surface outside the app shell that
// needed a device id had no way to get the SAME one short of copy-pasting
// this logic — which risks a second implementation quietly drifting from the
// opt-out contract described below. Moving it here once, with home.js
// importing it back, keeps it a single source of truth instead of two.
//
// This is the LEGAL maximum of a "persistent cookie": it recognizes a
// returning visitor and (via user_id on signed-in events) links the device
// to their account — WITHOUT the illegal parts of a zombie/supercookie.
// Specifically it uses ONLY standard first-party storage (localStorage + a
// long-lived first-party cookie, mirrored for reliability + server
// visibility) — never Flash/ETag/canvas/IndexedDB/cache "evercookie"
// resurrection or fingerprinting — and it HONORS opt-out: with Do Not Track
// or an explicit wf_optout flag the id is session-only (no cross-session
// recognition), and a full "clear site data" removes both stores.
// (Disclosed in the privacy policy — it's a functional/analytics identifier.)
export const WF_DID_MAXAGE = 2 * 365 * 24 * 3600; // 2 years — as durable as a first-party cookie legally gets

// ---------------------------------------------------------------------------
// Shared first-party storage primitives (2026-08-04).
//
// These were inlined inside deviceId() until lib/introGate.js needed the same
// durable cookie+localStorage mirror for the welcome gate's once-ever flag.
// Exporting them is the point of this module's header comment: a second
// surface that needs durable first-party storage must REUSE this opt-out
// contract, not paste a near-copy of it that then drifts. Anything durable in
// this app goes through wfOptedOut() first.
// ---------------------------------------------------------------------------

// The single definition of "this visitor asked not to be tracked": the browser
// Do-Not-Track signal, or our own explicit wf_optout flag.
export function wfOptedOut() {
  try {
    if (typeof window === "undefined") return true;
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return true;
    try { return localStorage.getItem("wf_optout") === "1"; } catch { return false; }
  } catch { return true; }
}

export function readWfCookie(name) {
  try {
    const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

// Standard first-party cookie only — Path=/, SameSite=Lax, Secure on https.
// Callers are responsible for checking wfOptedOut() before asking for a
// durable write; this helper deliberately does not do it for them, because
// the opted-out FALLBACK differs per caller (session id vs. session flag).
export function writeWfCookie(name, value, maxAge = WF_DID_MAXAGE) {
  try {
    document.cookie = name + "=" + encodeURIComponent(value) + "; Max-Age=" + maxAge +
      "; Path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
  } catch (e) {}
}

export function deviceId() {
  try {
    if (typeof window === "undefined") return null;
    const newId = () => "d_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    if (wfOptedOut()) {
      // Respect the signal: a per-session id only, never persisted → no
      // cross-visit recognition for users who asked not to be tracked.
      let s = null; try { s = sessionStorage.getItem("wf_device_s"); } catch (e) {}
      if (!s) { s = newId(); try { sessionStorage.setItem("wf_device_s", s); } catch (e) {} }
      return s;
    }
    const readCookie = () => readWfCookie("wf_device");
    const setCookie = (v) => writeWfCookie("wf_device", v);
    let id = null;
    try { id = localStorage.getItem("wf_device"); } catch (e) {}
    if (!id) id = readCookie();          // survive a partial clear of one store
    if (!id) id = newId();
    try { localStorage.setItem("wf_device", id); } catch (e) {}
    setCookie(id);                        // refresh the 2-year first-party cookie
    return id;
  } catch { return null; }
}
