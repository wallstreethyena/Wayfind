// scripts/local-calendars/leadParse.mjs — pure helpers that turn one Events
// Calendar (tribe) API event into a lead occurrence. No network, no clock, so
// scripts/check-local-calendars-import.mjs can test them hermetically.
//
// Facts only, by construction: occurrence() never reads the source's
// description, excerpt, image, organizer email or organizer phone.
import { NOT_ORGANIZER } from "./sources.mjs";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ").trim();
}

export function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
export const organizerLink = (u) => (u && /^https?:\/\//.test(u) && !NOT_ORGANIZER.test(host(u)) ? u.trim() : null);

// Recurring occurrences share the source slug with a trailing /YYYY-MM-DD/.
export function seriesKey(src, e) {
  const m = String(e.url || "").match(/\/event\/([^/]+)\/(?:\d{4}-\d{2}-\d{2}\/)?$/);
  const slug = m ? m[1] : decode(e.title).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${src.id}:${slug.replace(/-\d{4}-\d{2}-\d{2}$/, "")}`;
}

export function occurrence(src, e) {
  const v = e.venue && !Array.isArray(e.venue) ? e.venue : null;
  const orgs = Array.isArray(e.organizer) ? e.organizer : [];
  return {
    source: src.id,
    source_event_id: e.id,
    source_url: e.url,                                   // their page: provenance only, never published
    event_name: decode(e.title),
    start: e.start_date, end: e.end_date, all_day: !!e.all_day,
    timezone: e.timezone || "America/New_York",
    cost_text: decode(e.cost) || null,
    event_site: organizerLink(e.website),
    event_site_raw: e.website || null,
    venue: v ? decode(v.venue) : null,
    address: v ? decode(v.address).replace(/,\s*$/, "") || null : null,
    city: v ? decode(v.city).replace(/,\s*FL$/i, "") || null : null,
    zip: v?.zip || null,
    state: v ? (v.stateprovince || v.state || v.province || null) : null,
    venue_site: v ? organizerLink(v.website) : null,
    organizers: orgs.map((o) => ({ name: decode(o.organizer), site: organizerLink(o.website) })).filter((o) => o.name),
    categories: (e.categories || []).map((c) => decode(c.name)),
    featured: !!(e.featured || e.sticky),
    virtual: !!e.is_virtual,
  };
}
