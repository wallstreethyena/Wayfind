"use client";
// The shared kit: design tokens and stateless helpers used by home.js and the
// screens/sheets extracted from it (July 2026 decomposition, G0+). Eager by
// design — everything here is needed on first paint or is a few hundred bytes.
// Rules for adding to this file: no component state, no module-scope mutable
// state, no imports from app/home.js. Content guardrails grep the concatenated
// shell source (scripts/lib/shellSrc.mjs), so moving code here never breaks them.
import { useEffect, useRef } from "react";

export const C = {
  bg: "#0D1117", panel: "#161B22", card: "#1C2230", border: "#2D3748",
  accent: "#F97316", adim: "rgba(249,115,22,.15)", blue: "#38BDF8", green: "#22C55E",
  red: "#EF4444", purple: "#FF8A3D", pink: "#F472B6", gold: "#FBBF24",
  text: "#F1F5F9", muted: "#94A3B8", light: "#CBD5E1",
};
export const CAT_ICONS = { food: "🍽️", nightlife: "🍸", attractions: "🎡", beach: "🏖️", hotels: "🏨", shopping: "🛍️" };
// Each category gets its own accent color, used on the selected category tab.
export const CAT_COLOR = {
  food: { c: "#F97316", dim: "rgba(249,115,22,.15)" },
  nightlife: { c: "#F472B6", dim: "rgba(244,114,182,.15)" },
  attractions: { c: "#FF8A3D", dim: "rgba(167,139,250,.15)" },
  beach: { c: "#2DD4BF", dim: "rgba(45,212,191,.15)" },
  hotels: { c: "#38BDF8", dim: "rgba(56,189,248,.15)" },
  shopping: { c: "#22C55E", dim: "rgba(34,197,94,.15)" },
};
export const CAT_LABEL_COLOR = { Food: "#F97316", Nightlife: "#F472B6", Activities: "#FF8A3D", Beach: "#2DD4BF", Hotels: "#38BDF8", Shopping: "#22C55E" };
export const SHEET_EASE = "transform .34s cubic-bezier(.22,.61,.36,1)";
export const EMOJIS = ["❤️","⭐","🍴","🍸","🏖️","✈️","🎉","☕","🏨","🛍️","🎯","🌮","🍜","🎸","🏞️","📍"];

export function GlowPin({ size = 26 }) {
  const s = size;
  return (
    <span style={{ position: "relative", width: s + 10, height: s + 10, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(249,115,22,.35)" }} />
      <span style={{ position: "absolute", inset: -7, borderRadius: "50%", border: "1px solid rgba(249,115,22,.18)" }} />
      <span style={{ position: "absolute", inset: -3, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,.4) 0%, transparent 70%)" }} />
      <svg width={s} height={s} viewBox="0 0 24 24" style={{ position: "relative", filter: "drop-shadow(0 2px 6px rgba(249,115,22,.5))" }}><path fill="#F97316" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Z" /><circle cx="12" cy="10" r="3" fill="#fff" /></svg>
    </span>
  );
}

// A small grab handle at the top of every bottom sheet, so it reads as "pull down to close".
export function Grabber() {
  return (
    <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "9px 0 5px" }}>
      <div style={{ width: 38, height: 5, borderRadius: 99, background: "#3A4453" }} />
    </div>
  );
}

export const KB_CLICK = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }; // v5.38: keyboard activation for role="button" divs

// v5.37 (July 2026 audit, Phase 5): real dialog behavior for overlays.
// While `open` is true the referenced card gets initial focus, a trapped
// Tab loop, Escape-to-close, and focus restoration to whatever had focus
// before it opened. Pair it with role="dialog" aria-modal aria-label
// tabIndex={-1} on the card div itself.
export function useDialogFocus(open, ref, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const prev = typeof document !== "undefined" ? document.activeElement : null;
    if (node) { try { node.focus({ preventScroll: true }); } catch (e) {} }
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); if (closeRef.current) closeRef.current(); return; }
      if (e.key !== "Tab" || !node) return;
      const f = node.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      try { if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true }); } catch (e) {}
    };
  }, [open]);
}

// v4.32 — Robust single-destination directions link. detail.mapsUrl is keyed by
// query_place_id, which only resolves for genuine Google Place IDs. Places from
// town notes, events, staples, and culture cards carry synthetic ids, so their
// place_id URL opens a broken Google Maps search. This picks the resolvable form:
// a real Google Place ID uses the place_id search; otherwise route by name and,
// when present, coordinates, which Google always resolves. Coordinates alone are
// the final fallback.
export function directionsUrl(p) {
  if (!p) return null;
  const looksLikePlaceId = typeof p.id === "string" && /^ChIJ|^GhIJ|^Eh|^0x/.test(p.id) && p.id.length >= 20;
  if (looksLikePlaceId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name || "")}&query_place_id=${encodeURIComponent(p.id)}`;
  const hasCoords = p.lat != null && p.lng != null;
  // v4.94: secondary-source places (fsq/osm/ridb) may not exist under that
  // name on Google Maps — a name search dead-ends on a blank map. Their
  // coordinates always resolve, so directions open the exact pin instead.
  if (hasCoords && typeof p.id === "string" && /^(fsq|osm|ridb|nps):/.test(p.id)) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  if (p.name) {
    const q = encodeURIComponent(p.name + (p.address ? " " + p.address : ""));
    return hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${q}&center=${p.lat},${p.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  if (hasCoords) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return p.mapsUrl || null;
}

export function offerLabel(o) {
  if (!o) return "Offer";
  const t = (o.offer_type || "").toLowerCase();
  if (t.indexOf("happy") >= 0) return "Happy hour";
  if (t.indexOf("kids") >= 0) return "Kids eat free";
  if (t.indexOf("bogo") >= 0) return "2 for 1";
  if (t.indexOf("percent") >= 0 || t.indexOf("%") >= 0) return "Save today";
  if (t === "partner" || o.source === "partner") return "Partner offer";
  return "Offer";
}

export function scoreLabel(wf) {
  if (wf == null) return null;
  const s = (wf / 10).toFixed(1);
  let word = "Fair";
  if (wf >= 95) word = "Exceptional";
  else if (wf >= 90) word = "Excellent";
  else if (wf >= 85) word = "Great";
  else if (wf >= 80) word = "Very good";
  else if (wf >= 70) word = "Good";
  return { s, word };
}

export function stars(r) {
  if (!r) return "";
  return "★".repeat(Math.floor(r)) + (r % 1 >= 0.5 ? "½" : "");
}

// Deterministic lunar phase from a known new-moon epoch. Pure math, no API, no
// fabrication: same date always yields the same phase.
export function moonPhase(date) {
  const synodic = 29.530588853;
  const epochDays = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000;
  const nowDays = date.getTime() / 86400000;
  const age = (((nowDays - epochDays) % synodic) + synodic) % synodic;
  const illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100);
  let name, emoji;
  if (age < 1.85) { name = "New moon"; emoji = "🌑"; }
  else if (age < 5.54) { name = "Waxing crescent"; emoji = "🌒"; }
  else if (age < 9.23) { name = "First quarter"; emoji = "🌓"; }
  else if (age < 12.92) { name = "Waxing gibbous"; emoji = "🌔"; }
  else if (age < 16.61) { name = "Full moon"; emoji = "🌕"; }
  else if (age < 20.30) { name = "Waning gibbous"; emoji = "🌖"; }
  else if (age < 23.99) { name = "Last quarter"; emoji = "🌗"; }
  else if (age < 27.68) { name = "Waning crescent"; emoji = "🌘"; }
  else { name = "New moon"; emoji = "🌑"; }
  return { name, emoji, illum };
}

// WMO weather code to a small icon and word. Used with the free, keyless
// Open-Meteo API so Wayfind can show local weather and reason about it.
export function hourIcon(code, isDay, ms) {
  // At night, clear/partly conditions show the actual moon phase; precip keeps its icon.
  const w = weatherFromCode(code);
  if (!isDay && (code === 0 || code === 1 || code === 2)) { const m = moonPhase(new Date(ms)); return { icon: m.emoji, label: m.name }; }
  return { icon: w.icon, label: w.label };
}
export function weatherFromCode(code) {
  const c = Number(code);
  if (c === 0) return { icon: "☀️", img: "sunny", label: "Clear", warm: true };
  if (c === 1 || c === 2) return { icon: "🌤️", img: "partly", label: "Partly cloudy", warm: true };
  if (c === 3) return { icon: "☁️", img: "cloudy", label: "Overcast" };
  if (c === 45 || c === 48) return { icon: "🌫️", img: "cloudy", label: "Fog" };
  if (c >= 51 && c <= 57) return { icon: "🌦️", img: "rain", label: "Drizzle", wet: true };
  if (c >= 61 && c <= 67) return { icon: "🌧️", img: "rain", label: "Rain", wet: true };
  if (c >= 71 && c <= 77) return { icon: "❄️", img: "snow", label: "Snow", wet: true };
  if (c >= 80 && c <= 82) return { icon: "🌦️", img: "rain", label: "Showers", wet: true };
  if (c >= 85 && c <= 86) return { icon: "🌨️", img: "snow", label: "Snow", wet: true };
  if (c >= 95) return { icon: "⛈️", img: "storm", label: "Storms", wet: true };
  return { icon: "🌡️", img: "cloudy", label: "" };
}
