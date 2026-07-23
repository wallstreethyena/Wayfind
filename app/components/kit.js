"use client";
// The shared kit: design tokens and stateless helpers used by home.js and the
// screens/sheets extracted from it (July 2026 decomposition, G0+). Eager by
// design — everything here is needed on first paint or is a few hundred bytes.
// Rules for adding to this file: no component state, no module-scope mutable
// state, no imports from app/home.js. Content guardrails grep the concatenated
// shell source (scripts/lib/shellSrc.mjs), so moving code here never breaks them.
import { useEffect, useRef } from "react";
import { getScoreBand, isValidScore, BAND_COLOR, SCORE_TOKENS, pinGlyphColor, toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google"; // v6.40: the ONE score formula — chips self-heal from rating signals when wfScore is missing

export const C = {
  bg: "#040810", panel: "#161B22", card: "#1C2230", border: "#2D3748",
  accent: "#C9A961", adim: "rgba(148,163,184,.12)", blue: "#38BDF8", green: "#22C55E",
  red: "#EF4444", purple: "#A78BFA", pink: "#F472B6", gold: "#FBBF24",
  text: "#F1F5F9", muted: "#94A3B8", light: "#CBD5E1",
};
export const CAT_ICONS = { food: "🍽️", nightlife: "🍸", attractions: "🎡", beach: "🏖️", hotels: "🏨", shopping: "🛍️" };
// Each category gets its own accent color, used on the selected category tab.
export const CAT_COLOR = {
  food: { c: "#A8B3C4", dim: "rgba(148,163,184,.14)" },
  nightlife: { c: "#F472B6", dim: "rgba(244,114,182,.15)" },
  attractions: { c: "#94A3B8", dim: "rgba(148,163,184,.14)" },
  beach: { c: "#2DD4BF", dim: "rgba(45,212,191,.15)" },
  hotels: { c: "#38BDF8", dim: "rgba(56,189,248,.15)" },
  shopping: { c: "#22C55E", dim: "rgba(34,197,94,.15)" },
};
export const CAT_LABEL_COLOR = { Food: "#A8B3C4", Nightlife: "#F472B6", Activities: "#94A3B8", Beach: "#2DD4BF", Hotels: "#38BDF8", Shopping: "#22C55E" };
export const SHEET_EASE = "transform .34s cubic-bezier(.22,.61,.36,1)";
export const sheetBg = { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center" };
export const sheet = { background: C.panel, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "92dvh", overflowY: "auto" };
export const EMOJIS = ["❤️","⭐","🍴","🍸","🏖️","✈️","🎉","☕","🏨","🛍️","🎯","🌮","🍜","🎸","🏞️","📍"];

// ─── Design tokens (premium redesign, v5.55) ────────────────────────────────
// One token system for the whole app. C above stays the color source of
// truth; these add the editorial scale the redesign builds on. New and
// touched surfaces MUST consume these instead of ad-hoc literals.
export const TYPE = {
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase" },
  display: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px", lineHeight: 1.15 },
  title: { fontSize: 16, fontWeight: 700, lineHeight: 1.3 },
  body: { fontSize: 16, lineHeight: 1.55 },
  meta: { fontSize: 14, lineHeight: 1.4 },
};
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const RADII = { chip: 999, control: 12, card: 14, sheet: 20 };
export const SHADOW = { card: "0 1px 2px rgba(0,0,0,.35)", raised: "0 10px 34px rgba(0,0,0,.5)" };
// 150–220ms, one curve, no bounce/pulse/glow loops anywhere in chrome.
export const MOTION = { fast: "150ms", base: "180ms", slow: "220ms", ease: "cubic-bezier(.4,0,.2,1)" };
export const RATIO = { card: "3 / 2", hero: "16 / 9" };
export const FOCUS = { outline: `2px solid ${C.accent}`, outlineOffset: "2px" };
// Champagne/gold — RESERVED for the giveaway/premium surfaces (share/save
// prompt's Phase 3 direction). Orange stays the app-wide accent. The
// orange+champagne pairing is FLAGGED FOR OWNER REVIEW — do not spread
// champagne into general chrome without that decision.
export const CHAMPAGNE = { base: "#E8C97A", deep: "#B98A2F", dim: "rgba(232,201,122,.14)" };
// v6.57: the "🔥 Trending" flame renders when a place's tier2_popularity
// percent-rank (wf_place_popularity_scored, metro-relative) clears this bar.
// Shared by PlaceCard (home.js) and DetailSheet so the threshold can't drift
// between the card and the sheet for the same place.
export const TRENDING_POPULARITY_THRESHOLD = 0.75;
// 44×44px minimum interactive target (design standard, stricter than WCAG).
export const TARGET = 44;

// ─── Line icons (premium redesign, v5.55) ───────────────────────────────────
// ONE icon language for UI chrome: 24-viewbox stroke icons matching the
// bottom nav's existing style (stroke 2, round caps). Emoji remain only as
// CONTENT (weather glyphs, the user's list-icon picker, place pins) — never
// as navigation, category identity, or section chrome.
const ICON_PATHS = {
  sparkles: <><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" /></>,
  gem: <><path d="M6 3h12l4 6-10 12L2 9l4-6z" /><path d="M2 9h20" /><path d="M12 21L8 9l4-6 4 6-4 12" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M15.5 3.13a4 4 0 0 1 0 7.75" /></>,
  heart: <path d="M20.4 4.6a5.5 5.5 0 0 0-7.8 0L12 5.2l-.6-.6a5.5 5.5 0 0 0-7.8 7.8l.6.6L12 20.8l7.8-7.8.6-.6a5.5 5.5 0 0 0 0-7.8z" />,
  ticket: <><path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2.5 2.5 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2.5 2.5 0 0 0 0-6z" /><path d="M13 5v2" /><path d="M13 11v2" /><path d="M13 17v2" /></>,
  car: <><path d="M5 11l1.7-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.8 1.3L19 11" /><path d="M3 16v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" /><path d="M3 16h18" /><circle cx="7" cy="18.5" r="1.6" /><circle cx="17" cy="18.5" r="1.6" /></>,
  wallet: <><path d="M20 7H5a2 2 0 0 1-2-2 2 2 0 0 1 2-2h13v4" /><path d="M3 5v13a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1" /><path d="M16 13.5h.01" /></>,
  dice: <><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="2.6" /></>,
  calendar: <><rect x="4" y="5.4" width="16" height="15" rx="2.4" /><path d="M8 3.4v3.4" /><path d="M16 3.4v3.4" /><path d="M4 10.4h16" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4" /><path d="M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" /></>,
  masks: <><path d="M4 4h7v7a3.5 3.5 0 0 1-7 0V4z" /><path d="M13 9h7v7a3.5 3.5 0 0 1-7 0V9z" /><path d="M6 7.2h.01" /><path d="M9 7.2h.01" /><path d="M15 12.2h.01" /><path d="M18 12.2h.01" /><path d="M6 9a2 2 0 0 0 3 0" /><path d="M18.5 14.6a2 2 0 0 0-3 0" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16" /><path d="M17 4v16" /><path d="M3 9h4" /><path d="M3 15h4" /><path d="M17 9h4" /><path d="M17 15h4" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01" /><path d="M15 9.5h.01" /></>,
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="17.5" cy="20" r="1.4" /><path d="M2.5 3.5h3l2.5 12.5h10.5l2-8.5H6.6" /></>,
  leaf: <><path d="M4 20c0-9 5-15 16-16-1 11-7 16-16 16z" /><path d="M4 20c3-6 7-10 12-12" /></>,
  glass: <path d="M5.5 3.5h13L12 12v6.5M8 21.5h8" />,
  utensils: <><path d="M7 3.6v7" /><path d="M4.5 3.6v3.9a2.5 2.5 0 0 0 5 0V3.6" /><path d="M7 13.4v7" /><path d="M15.9 3.9c-1.6 1.6-2.3 4.4-1.6 6.6.2.6.7 1 1.3 1h1.2v9" /></>,
  palette: <><path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.4.5.6 1 .3 1.6-.4.7-1.6 1.1-2.8 1.1z" /><path d="M7.5 10.5h.01" /><path d="M11 7h.01" /><path d="M15.5 8.5h.01" /></>,
  activity: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.4" /><circle cx="9" cy="9.5" r="1.6" /><path d="M21 15.5l-5-5-9 9" /></>,
  cloudrain: <><path d="M17.5 17a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A4 4 0 0 0 7 17h10.5z" /><path d="M8.5 19.5v2" /><path d="M12 19.5v2" /><path d="M15.5 19.5v2" /></>,
};
export function Icon({ name, size = 18, color = "currentColor", strokeWidth = 2, style, ...rest }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }} {...rest}>{paths}</svg>
  );
}

// Navigation + category line icons (the "FINAL MENU" set, founder-approved).
// Moved here from home.js in the v5.55 redesign so every surface — bottom nav,
// CategoryMenu, the community sheet — draws category identity from ONE icon
// language instead of forking into emoji.
export function NavIcon({ name, color, size, strokeWidth }) {
  const sz = size || 23;
  const p = { width: sz, height: sz, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: strokeWidth || 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "home") return (<svg {...p}><path d="M4 12 L12 4.5 L20 12" /><path d="M6 10.5 V19.5 H18 V10.5" /><path d="M10 19.5 V14 H14 V19.5" /></svg>);
  if (name === "events") return (<svg {...p}><rect x="4" y="5.4" width="16" height="15" rx="2.4" /><path d="M8 3.4v3.4" /><path d="M16 3.4v3.4" /><path d="M4 10.4h16" /><circle cx="12" cy="15" r="1.7" /></svg>);
  if (name === "map") return (<svg {...p}><path d="M9 4.5 L3 7 V19.5 L9 17 L15 19.5 L21 17 V4.5 L15 7 L9 4.5 Z" /><path d="M9 4.5 V17" /><path d="M15 7 V19.5" /></svg>);
  if (name === "saved") return (<svg {...p}><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>);
  if (name === "food") return (<svg {...p}><path d="M7 3v6" /><path d="M5 3v4" /><path d="M9 3v4" /><path d="M7 9v12" /><path d="M16.5 3c-1.6 1-2.3 3-2.3 5.2 0 1.7 1 2.5 2.3 2.7V21" /></svg>);
  if (name === "nightlife") return (<svg {...p}><path d="M5 5h14l-7 8-7-8Z" /><path d="M12 13v6" /><path d="M8.5 19.5h7" /></svg>);
  if (name === "attractions") return (<svg {...p}><circle cx="12" cy="9.5" r="5.8" /><circle cx="12" cy="9.5" r="1.2" /><path d="M12 4.9v3.4" /><path d="M12 10.7v3.4" /><path d="M7.4 9.5h3.4" /><path d="M13.2 9.5h3.4" /><path d="M8.8 6.3l2.3 2.3" /><path d="M12.9 10.4l2.3 2.3" /><path d="M15.2 6.3l-2.3 2.3" /><path d="M11.1 10.4l-2.3 2.3" /><path d="M12 15.3 8.6 21" /><path d="M12 15.3 15.4 21" /><path d="M6.8 21h10.4" /></svg>);
  if (name === "beach") return (<svg {...p}><circle cx="12" cy="12" r="4.3" /><path d="M12 2.7v2.4" /><path d="M12 18.9v2.4" /><path d="M2.7 12h2.4" /><path d="M18.9 12h2.4" /><path d="M5.6 5.6l1.7 1.7" /><path d="M16.7 16.7l1.7 1.7" /><path d="M18.4 5.6l-1.7 1.7" /><path d="M7.3 16.7l-1.7 1.7" /></svg>);
  if (name === "hotels") return (<svg {...p}><rect x="5" y="3.8" width="14" height="17.2" rx="1.6" /><path d="M10.2 21v-4.2h3.6V21" /><path d="M8.4 7.4h1.7" /><path d="M13.9 7.4h1.7" /><path d="M8.4 11.4h1.7" /><path d="M13.9 11.4h1.7" /></svg>);
  if (name === "family") return (<svg {...p}><circle cx="8" cy="6" r="2.4" /><circle cx="16.4" cy="6.4" r="2" /><circle cx="14.2" cy="12.8" r="1.5" /><path d="M4.3 20v-5.2a3.7 3.7 0 0 1 7.4 0V20" /><path d="M13.4 20v-3.3a2.8 2.8 0 0 1 5.6 0V20" /><path d="M12.6 20v-2.6a1.9 1.9 0 0 1 3.2-1.4" /></svg>);
  if (name === "shopping") return (<svg {...p}><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 8V6.4a3 3 0 0 1 6 0V8" /></svg>);
  if (name === "coupons") return (<svg {...p}><path d="M20.6 12.6 L13.4 19.8 a2.1 2.1 0 0 1-3 0 L4.2 13.6 a2.1 2.1 0 0 1-.6-1.5 V5.7 a2.1 2.1 0 0 1 2.1-2.1 h6.4 a2.1 2.1 0 0 1 1.5.6 l7 7 a2.1 2.1 0 0 1 0 3 Z" /><circle cx="8.6" cy="8.6" r="1.5" /></svg>);
  if (name === "itinerary") return (<svg {...p}><circle cx="5.5" cy="18.3" r="1.7" /><path d="M5.5 16.6 C5.5 12 17 13.6 17 9" strokeDasharray="1.5 2" /><path d="M17 3 C14.9 3 13.2 4.7 13.2 6.8 C13.2 9.5 17 12.2 17 12.2 C17 12.2 20.8 9.5 20.8 6.8 C20.8 4.7 19.1 3 17 3 Z" /><circle cx="17" cy="6.7" r="1.3" /></svg>);
  // v5.7x (home-menu consolidation): "Best of" tile (trophy/medal) and the
  // Take-a-chance icon button (two crossing arrows) beside search.
  if (name === "award") return (<svg {...p}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4" /><path d="M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" /></svg>);
  if (name === "shuffle") return (<svg {...p}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15 21 21" /><path d="M4 4 9 9" /></svg>);
  return null;
}

// ─── Image pipeline (premium redesign, Phase 3) ─────────────────────────────
// The fallback-state decision lives in lib/imageState.js (pure, JSX-free) so
// scripts/test-image-fallback.mjs can unit-test it; re-exported here for the
// components below.
export { imageDisplayState } from "../../lib/imageState.js";

// Branded artwork fallback — the last link in the chain, shared by every
// image surface (cards, hero, tiles) so a dead URL always ends here, never a
// gray box. Matches the share-card prompt's "ends at branded artwork" rule.
export function BrandedImageFallback({ style }) {
  return (
    <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #161B22 0%, #1C2230 55%, #232B3A 100%)" }} aria-hidden="true">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" style={{ opacity: 0.5 }}>
        <path d="M12 2.5C8.13 2.5 5 5.63 5 9.5c0 4.7 5.95 10.2 6.5 10.7a.74.74 0 0 0 1 0c.55-.5 6.5-6 6.5-10.7 0-3.87-3.13-7-7-7Z" />
        <circle cx="12" cy="9.4" r="2.4" />
      </svg>
    </div>
  );
}

// Calm brand pin (was GlowPin: halo rings + radial bloom + drop shadow — the
// arcade-glow look the redesign removes). Same export name so every call
// site keeps working; the mark itself is now quiet.
export function GlowPin({ size = 26 }) {
  const s = size;
  return (
    <span style={{ position: "relative", width: s, height: s, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#CBD5E1" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Z" /><circle cx="12" cy="10" r="3" fill="#0D1117" /></svg>
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

export { priceGlyphs } from "../../lib/dining.js";

export function scoreLabel(wf) {
  // B15: derive the display score through toDisplayScore (0-100 -> 0-10, and null
  // for null / 0 / negative / invalid) so scoreLabel agrees with the badge's
  // "Score pending" edge instead of rendering "0.0" or "-0.0" on a degenerate wf.
  // The word bands still read the 0-100 wfScore.
  const d = toDisplayScore(wf);
  if (d == null) return null;
  const s = d.toFixed(1);
  let word = "Fair";
  if (wf >= 95) word = "Exceptional";
  else if (wf >= 90) word = "Excellent";
  else if (wf >= 85) word = "Great";
  else if (wf >= 80) word = "Very good";
  else if (wf >= 70) word = "Good";
  return { s, word };
}

// Compact Wayfind Score chip (v6.30) — the inline form of the score for tight
// surfaces (map previews, related-place rows, surprise, menus) where the full
// badge won't fit. GLOBAL RULE: every place shows the Wayfind Score, never the
// raw Google star. Falls back to the star ONLY when there is no wfScore yet, so
// a slot is never empty.
export function PlaceScoreChip({ p, size = 12 }) {
  // v6.40: self-healing — a row that arrives without a precomputed wfScore but
  // WITH real rating signals gets its Score computed right here, with the same
  // Bayesian formula the ranking uses (lib/google.js wayfindScore — the one
  // score mechanism, everywhere). "Score pending" is now reserved for rows
  // with no signals at all, which cardComplete() keeps off cards entirely.
  let s = toDisplayScore(p && p.wfScore);
  if (s == null && p && Number(p.rating) > 0) s = toDisplayScore(wayfindScore(Number(p.rating), Number(p.reviews != null ? p.reviews : p.userRatingCount) || 0));
  if (s == null) {
    // Honest pending state — never a fabricated number, never the raw Google
    // star. Missing / invalid / stale score data resolves here safely.
    return <span aria-label="Wayfind Score pending" style={{ display: "inline-flex", alignItems: "center", color: SCORE_TOKENS.muted, fontSize: size, fontWeight: 700, letterSpacing: 0.2 }}>Score pending</span>;
  }
  const band = getScoreBand(s);
  const col = BAND_COLOR[band];
  return (
    <span aria-label={`Wayfind Score ${s.toFixed(1)} out of 10`} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: col, color: "#0B0B0C", fontWeight: 800, fontSize: size, padding: "1px 7px 1px 5px", borderRadius: 6, lineHeight: 1.35 }} title={`Wayfind Score ${s.toFixed(1)} / 10`}>
      <svg width={size - 1} height={size - 1} viewBox="0 0 24 24" fill="none" stroke={pinGlyphColor(band)} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="2.4" fill={pinGlyphColor(band)} stroke="none" /></svg>
      {s.toFixed(1)}
    </span>
  );
}

// ─── Wayfind Score badge (v6.27) ─────────────────────────────────────────────
// ONE reusable component for the four score bands (lib/score.js decides the
// band; this only draws). Compact horizontal design: dark navy rounded surface,
// 2px band-colored outline, band-colored pin panel left, "WAYFIND" label over
// the big score with a small /10. Color is never the only signal — the number
// always renders and the accessible name carries the score. Invalid scores
// never reach here (callers gate on isValidScore); if one does, render nothing.
export function WayfindScoreBadge({ score, confidence, modelVersion, onOpen, size = 1 }) {
  if (!isValidScore(score)) return null;
  const band = getScoreBand(score);
  const bandColor = BAND_COLOR[band];
  const glyph = pinGlyphColor(band);
  const s = (n) => Math.round(n * size);
  const aria = `Wayfind Score ${score.toFixed(1)} out of 10${confidence ? `, ${confidence} confidence` : ""}`;
  return (
    <button
      type="button"
      className="wayfind-score-badge"
      data-score-band={band}
      data-model-version={modelVersion || undefined}
      aria-label={aria}
      onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : (e) => e.stopPropagation()}
      style={{
        display: "inline-flex", alignItems: "stretch", padding: 0,
        background: SCORE_TOKENS.bg, border: `2px solid ${bandColor}`,
        borderRadius: s(10), overflow: "hidden", cursor: onOpen ? "pointer" : "default",
        lineHeight: 1, textAlign: "left",
      }}
    >
      <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: s(26), background: bandColor, flexShrink: 0 }}>
        <svg width={s(14)} height={s(14)} viewBox="0 0 24 24" fill="none" stroke={glyph} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
          <circle cx="12" cy="10" r="2.6" fill={glyph} stroke="none" />
        </svg>
      </span>
      <span style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: s(1), padding: `${s(4)}px ${s(8)}px ${s(4)}px ${s(7)}px` }}>
        <span style={{ fontSize: s(7.5), fontWeight: 800, letterSpacing: "0.8px", color: SCORE_TOKENS.muted }}>WAYFIND</span>
        <span style={{ fontSize: s(15), fontWeight: 800, color: SCORE_TOKENS.text, display: "flex", alignItems: "baseline", gap: s(2) }}>
          {score.toFixed(1)}
          <span style={{ fontSize: s(8.5), fontWeight: 700, color: SCORE_TOKENS.muted }}>/10</span>
        </span>
      </span>
    </button>
  );
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
