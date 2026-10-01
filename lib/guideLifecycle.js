// lib/guideLifecycle.js — which guides are CURRENT and which ALREADY HAPPENED.
//
// Owner, 2026-09-23: guides for events that already passed, or dated editions
// that will not come back, must stop crowding the live guide surfaces and live
// in a place for guides that have already occurred.
//
// The rule is one optional field on a guide: `endsOn`, the LAST calendar day
// (Eastern, "YYYY-MM-DD") the guide is useful as a plan. A guide with no
// `endsOn` is evergreen and is never archived. A guide whose `endsOn` is before
// today moves to /guides/past.
//
// Archiving is a PROMOTION change, never a deletion: the article, its slug and
// its URL stay live forever (the DATED archive rule in lib/guides.js). Only the
// discovery surfaces (hub, footer, homepage local edit, in-app guide rails,
// paid landing cards, related links, continue card) read current guides; the
// article route, sitemap, analytics titles and SEO checks keep reading the
// full GUIDES registry.
//
// "Today" is always siteTodayStr() (Eastern), never a UTC slice, so a guide is
// not archived at 8 PM on its own last evening.

import { siteTodayStr } from "./siteTime.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The guide's last useful day, or null when it is evergreen / malformed. */
export function guideEndsOn(guide) {
  const v = guide && guide.endsOn;
  return typeof v === "string" && ISO_DAY.test(v) ? v : null;
}

/** True once the guide's last useful day is behind us (Eastern calendar). */
export function isGuidePast(guide, today = siteTodayStr()) {
  const end = guideEndsOn(guide);
  return Boolean(end) && today > end;
}

/** The registry minus anything that already happened. Same object shape. */
export function currentGuides(guides, today = siteTodayStr()) {
  const out = {};
  for (const [slug, g] of Object.entries(guides || {})) {
    if (!isGuidePast(g, today)) out[slug] = g;
  }
  return out;
}

/**
 * Guides that already happened, most recently ended first (ties by title),
 * each carrying its slug and a reader-facing end label.
 */
export function pastGuides(guides, today = siteTodayStr()) {
  const rows = [];
  for (const [slug, g] of Object.entries(guides || {})) {
    if (isGuidePast(g, today)) rows.push({ ...g, slug, endedOn: guideEndsOn(g), endedLabel: endedLabel(guideEndsOn(g)) });
  }
  return rows.sort((a, b) => (a.endedOn === b.endedOn ? String(a.title).localeCompare(String(b.title)) : a.endedOn < b.endedOn ? 1 : -1));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "September 19, 2026" from "2026-09-19". Pure string math, no timezone. */
export function endedLabel(iso) {
  if (!iso || !ISO_DAY.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
