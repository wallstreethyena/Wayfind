// lib/placeLinkName.js — a place link in the address bar keeps the place's name.
//
// THE BUG THIS EXISTS FOR (2026-11-11): most /p/{id} visits arrive from a
// Wayfind card whose href is the bare /p/{id} (PostHog, 30 days: 4,548 /p
// pageviews, none with ?t=). A visitor who then shares from the browser's own
// share button, or copies the address bar, sends that bare link. The link
// preview (app/p/[id]/page.js generateMetadata) may only use a stored Google
// name while it is under 30 days old; 20,957 of 24,359 rows are older, so the
// preview fell back to "A spot worth your time" with no name at all.
//
// The in-app Share button already sends ?t=<name> (app/home.js placeShareUrl),
// and the preview already uses ?t= when the stored name is too old. This does
// the same for the address bar: once the sheet has opened the place, the name
// the visitor is looking at is written into ?t=, so every way of passing the
// link on carries it. No Google call, no stored data, no new spend.

const MAX = 80; // the same cut placeShareUrl uses

/**
 * The path+search to put in the address bar, or null to leave it alone.
 * Only on /p/{id} for the SAME place that opened, only when ?t= is missing,
 * and every other parameter is kept as it is.
 */
export function placePathWithName(pathname, search, place) {
  const m = /^\/p\/([^/]+)\/?$/.exec(String(pathname || ""));
  if (!m || !place || !place.id) return null;
  let pathId;
  try { pathId = decodeURIComponent(m[1]); } catch (e) { return null; }
  if (pathId !== String(place.id)) return null;
  const name = typeof place.name === "string" ? place.name.replace(/\s+/g, " ").trim().slice(0, MAX) : "";
  if (!name) return null;
  const params = new URLSearchParams(search || "");
  if (params.get("t")) return null;
  params.set("t", name);
  return `/p/${m[1]}?${params.toString()}`;
}
