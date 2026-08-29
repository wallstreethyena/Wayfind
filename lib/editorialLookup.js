// lib/editorialLookup.js — names + carried hooks for the Detail editorial rail.
//
// THE LAW (owner, 2026-08-20): every opened Detail sheet — place AND
// event-shaped — paints sourced Wayfind editorial when we hold it. List
// surfaces may keep events excluded (useEditorialHooks). Detail must not.
//
// This module is pure: no React, no fetch, no env, no Atlas JSON. The
// Detail sheet stays a tiny client fetch to /api/editorial; this owns the
// query names and the empty-slot fallback when the place already carries
// a sourced hook. Nothing here invents copy.

import { cirqueItaliaBlocksEditorial } from "./cirqueItalia.js";
import { toHookLine } from "./editorialHook.js";

// Same aspect keys WayfindTakeRail paints. A response with none of these
// is empty-slot — do not mount a hollow "Wayfind editorial" chrome bar.
export const EDITORIAL_RAIL_KEYS = [
  "why", "knownFor", "insiderMove", "proMove", "proof",
  "goodToKnow", "watchOut", "bestFor", "move", "foodMove",
  "drinkMove", "story", "vibe", "funFact",
];

export function hasSourcedEditorialFields(editorial) {
  if (!editorial || typeof editorial !== "object") return false;
  return EDITORIAL_RAIL_KEYS.some((k) => String(editorial[k] || "").trim());
}

// Event listings append a year or a calendar date ("Fair 2026",
// "Concert - Nov 12"). The stored note is keyed on the stable name.
// Venue suffixes ("Name - Van Wezel") are NOT stripped — those are a
// different place, and the venue is added as its own candidate instead.
export function stripEditorialNameSuffix(name) {
  let s = String(name || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/\s*[\(\[]\s*\d{4}\s*[\)\]]\s*$/g, "").trim();
  // Date before bare year: "Concert - Nov 12, 2026" must not become
  // "Concert - Nov 12," after a year-only strip, then miss the date.
  s = s.replace(/\s+[-–—|]\s+(?:(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*,?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\s*$/i, "").trim();
  s = s.replace(/\s+\d{4}\s*$/g, "").trim();
  return s;
}

export function collectEditorialNames(...raws) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const t = String(raw || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(t); }
    const stripped = stripEditorialNameSuffix(t);
    if (stripped && stripped !== t) {
      const sk = stripped.toLowerCase();
      if (!seen.has(sk)) { seen.add(sk); out.push(stripped); }
    }
  };
  for (const raw of raws) {
    if (Array.isArray(raw)) raw.forEach(add);
    else add(raw);
  }
  return out;
}

// Names to ask /api/editorial about for one opened card. Place name,
// event name, venue name; date/year suffixes stripped. Never invents
// copy — the route still returns none when nothing matches.
export function editorialQueryNames(detail) {
  if (!detail) return [];
  const ev = detail._event && typeof detail._event === "object" ? detail._event : null;
  return collectEditorialNames(
    detail.name,
    ev && ev.name,
    ev && ev.venue,
    ev && ev.venueName,
    detail.venue,
    detail.venueName,
  );
}

// Query string Detail sends to /api/editorial. Events are included —
// `_event` must not blank the request. Empty string means there is
// nothing to ask; the caller still applies carriedEditorial.
export function editorialRequestQuery(detail) {
  const names = editorialQueryNames(detail);
  const qs = new URLSearchParams();
  if (names[0]) qs.set("name", names[0]);
  if (names.length > 1) qs.set("also", names.slice(1).join("|"));
  if (detail && detail.id) qs.set("id", String(detail.id));
  return qs.toString();
}

// Extra names from the `also` query param (pipe-separated), plus suffix variants.
export function editorialNameCandidates(name, also) {
  const extras = Array.isArray(also)
    ? also
    : String(also || "").split("|").map((s) => s.trim()).filter(Boolean);
  return collectEditorialNames(name, extras);
}

// Empty-slot fallback: if the opened card already carries a sourced
// two-beat hook (knownFor / hook / editorialHook / whyGo), paint that
// even when the Atlas full-card fetch is empty. Address/hours/deal
// lines stay blank — toHookLine is the same gate every other surface uses.
export function carriedEditorial(detail) {
  if (!detail) return null;
  // Cirque Italia office / unknown pin: do not paint a carried tent hook.
  if (cirqueItaliaBlocksEditorial(detail)) return null;
  const ev = detail._event && typeof detail._event === "object" ? detail._event : null;
  const raw = detail.knownFor || detail.hook || detail.editorialHook
    || detail.whyGo || detail.why_here
    || (ev && (ev.knownFor || ev.hook || ev.editorialHook || ev.card_hook));
  const line = toHookLine(raw, detail.name || (ev && ev.name) || "");
  if (!line) return null;
  return { knownFor: line };
}
