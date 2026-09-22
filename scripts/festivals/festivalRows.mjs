// scripts/festivals/festivalRows.mjs
//
// The ONE definition of what a verified festival row must look like before it
// may be written to public.wf_events. Pure: no network, no clock, no Supabase.
// Used by make-batches.mjs (queue), publish.mjs (write) and the guard
// scripts/check-florida-festivals-import.mjs (CI). See
// docs/FLORIDA_FESTIVALS_IMPORT.md for the full workflow.

export const CATEGORIES = Object.freeze(["festival", "food", "music", "arts", "seasonal", "holiday", "halloween"]);
export const FL_BOX = Object.freeze({ minLat: 24.3, maxLat: 31.1, minLng: -87.7, maxLng: -79.8 });

// Columns a verified row may carry. Anything else is refused, so an agent can
// never write link-health, timestamps, scores or place ids by accident.
export const ALLOWED_COLUMNS = Object.freeze([
  "event_id", "event_series_id", "slug", "year", "timezone", "event_status", "city", "county", "state",
  "category", "subcategory", "tags", "audience", "event_name", "short_title", "start_date", "end_date",
  "start_time", "end_time", "select_nights", "schedule_note", "venue", "address", "lat", "lng",
  "is_free", "price_min", "price_max", "card_hook", "official_event_url", "official_ticket_url",
  "source_url", "source_type", "source_tier", "verification_confidence", "last_verified_at", "verify_note",
]);

const AGGREGATOR = /festivalguidesandreviews\.com|allevents\.in|eventbrite\.[a-z.]+\/d\/|facebook\.com\/events\/search/i;
const DASH = /[\u2013\u2014]/;

export function slugify(s) {
  return String(s || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}

/** event_id/slug for a name + year. A name that already carries the year is not doubled. */
export function festivalSlug(name, year) {
  const base = slugify(name).replace(new RegExp(`(^|-)${year}(-|$)`), "$1").replace(/-+$/, "");
  return `${base}-${year}`;
}

/** The DB row: every allowed column, and nothing that is only batch metadata. */
export function dbRow(row) {
  const out = Object.fromEntries(ALLOWED_COLUMNS.filter((k) => k in row).map((k) => [k, row[k]]));
  // wf_events.audience is NOT NULL. The brief lets a row say nothing about who
  // an event is for, and "nothing stated" is an empty list, not a null: sending
  // the null makes Postgres refuse the whole insert batch (23502).
  if (out.audience == null) out.audience = [];
  return out;
}

/** Which lead a publish/hold entry answers: lead_name when the organizer's name differs. */
export const leadKey = (r) => normName(r.lead_name || r.event_name);

export function normName(s) {
  return String(s || "").toLowerCase().replace(/\b(19|20)\d{2}\b/g, "").replace(/[^a-z0-9]+/g, "");
}

// ── "same event, different name" ────────────────────────────────────────────
// 2026-09-18: "Raprager Farms Fall Festival" went live beside the hand-curated
// "Raprager Family Farms Fall Pumpkin Festival". A live row within 10 km whose
// dates overlap and whose name is the SAME NAME SPELLED LONGER is that event.
//
// The test is subset, never overlap. Sharing one word is no evidence at all:
// the 10 km radius has already forced both rows into the same town, so the
// town's own name is the least distinctive word available. Matching on "any
// shared word" made "Orlando Latino Fest" a duplicate of "Haunted 5K & 10K at
// Orlando" and silently dropped a real festival. Requiring the shorter name's
// distinctive words to ALL appear in the longer one keeps the rename case
// (Raprager, ROCKtoberfest, John's Pass) and refuses the city-name case.
export const NAME_STOP = Object.freeze(new Set([
  "festival", "fest", "fall", "annual", "florida", "the", "and", "day", "days",
  "farm", "farms", "family", "city", "county", "2026", "2027",
]));

/** Words in a name that could identify an event: 4+ letters, not boilerplate. */
export function distinctiveWords(s) {
  return new Set(String(s || "").toLowerCase().replace(/['\u2019]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !NAME_STOP.has(w)));
}

/** Great-circle distance in km. */
export function kmBetween(a, b) {
  const R = 6371, t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Inclusive length of a row's date range, in days (0 when unparseable). */
export function spanDays(row) {
  const start = Date.parse(String(row?.start_date) + "T00:00:00Z");
  const end = Date.parse(String(row?.end_date || row?.start_date) + "T00:00:00Z");
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

/** True when two rows are one event under two spellings of its name. */
export function isSameEvent(a, b) {
  if (!a || !b) return false;
  for (const r of [a, b]) if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) return false;
  if (kmBetween(a, b) > 10) return false;
  const aEnd = a.end_date || a.start_date, bEnd = b.end_date || b.start_date;
  if (!(a.start_date <= bEnd && aEnd >= b.start_date)) return false;
  const wa = distinctiveWords(a.event_name), wb = distinctiveWords(b.event_name);
  const [small, big] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  // A name with no distinctive word of its own proves nothing.
  if (!small.size || ![...small].every((w) => big.has(w))) return false;
  // A SEASON IS NOT A FESTIVAL. "Crystal River Manatee Season" runs for months,
  // so a two-day "Florida Manatee Festival" inside it overlaps by definition and
  // the overlap proves nothing -- exactly like a shared town name. One shared
  // word cannot carry that match on its own; two can.
  if (spanDays(a) && spanDays(b)) {
    const longer = Math.max(spanDays(a), spanDays(b)), shorter = Math.min(spanDays(a), spanDays(b));
    if (longer >= 21 && longer >= 3 * shorter && small.size < 2) return false;
  }
  return true;
}

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const isHttps = (s) => typeof s === "string" && /^https:\/\/[^\s/]+\.[^\s/]+/.test(s);

/** Returns [] when the row may be published, else the list of reasons it may not. */
export function rowProblems(row, { today, now } = {}) {
  const p = [];
  if (!row || typeof row !== "object") return ["not an object"];
  // lead_name is batch metadata (the aggregator name this row answers), never a column.
  for (const k of Object.keys(row)) if (k !== "lead_name" && !ALLOWED_COLUMNS.includes(k)) p.push(`column not allowed: ${k}`);
  for (const k of ["event_id", "event_series_id", "slug", "event_name", "short_title", "city", "county", "venue", "address", "card_hook", "official_event_url", "source_url", "verify_note", "schedule_note"]) {
    if (typeof row[k] !== "string" || !row[k].trim()) p.push(`missing ${k}`);
  }
  if (row.state !== "FL") p.push("state must be FL");
  if (row.timezone !== "America/New_York" && row.timezone !== "America/Chicago") p.push("timezone must be America/New_York or America/Chicago");
  if (row.event_status !== "scheduled") p.push("event_status must be scheduled");
  if (!CATEGORIES.includes(row.category)) p.push(`category must be one of ${CATEGORIES.join(",")}`);
  if (!Array.isArray(row.tags) || !row.tags.includes("festival")) p.push("tags must be an array containing \"festival\"");
  if (!isDate(row.start_date) || !isDate(row.end_date)) p.push("start_date/end_date must be YYYY-MM-DD");
  else {
    if (row.end_date < row.start_date) p.push("end_date before start_date");
    if (today && row.end_date < today) p.push("event already over");
    if (Number(row.start_date.slice(0, 4)) !== row.year) p.push("year must equal start_date year");
  }
  if (row.slug !== row.event_id) p.push("slug must equal event_id");
  if (row.event_name && row.year && row.event_id !== festivalSlug(row.event_name, row.year)) p.push(`event_id must be ${festivalSlug(row.event_name, row.year)}`);
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) p.push("lat/lng must be numbers");
  else if (row.lat < FL_BOX.minLat || row.lat > FL_BOX.maxLat || row.lng < FL_BOX.minLng || row.lng > FL_BOX.maxLng) p.push("coordinates are not in Florida");
  if (!isHttps(row.official_event_url)) p.push("official_event_url must be https");
  if (row.official_ticket_url != null && !isHttps(row.official_ticket_url)) p.push("official_ticket_url must be https or null");
  for (const k of ["official_event_url", "official_ticket_url", "source_url"]) {
    if (row[k] && AGGREGATOR.test(row[k])) p.push(`${k} is an aggregator, not the organizer`);
  }
  if (row.source_type !== "official-organizer") p.push("source_type must be official-organizer");
  if (row.source_tier !== 1) p.push("source_tier must be 1");
  if (row.verification_confidence !== "high") p.push("verification_confidence must be high");
  if (typeof row.last_verified_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(row.last_verified_at) || Number.isNaN(Date.parse(row.last_verified_at))) p.push("last_verified_at must be an ISO timestamp");
  // wf_events_not_verified_in_the_future (DB check constraint) refuses a
  // verification stamped after the insert; catch it here, not at write time.
  else if (Date.parse(row.last_verified_at) > (now ?? Date.now()) + 60_000) p.push("last_verified_at is in the future");
  if (row.card_hook && (DASH.test(row.card_hook) || row.card_hook.length > 140)) p.push("card_hook must be under 140 chars with no long dashes");
  if (row.schedule_note && DASH.test(row.schedule_note)) p.push("schedule_note must not use long dashes (write \"to\")");
  for (const k of ["price_min", "price_max"]) if (row[k] != null && !(Number.isFinite(row[k]) && row[k] >= 0)) p.push(`${k} must be a number or null`);
  if (row.is_free != null && typeof row.is_free !== "boolean") p.push("is_free must be true, false or null");
  // audience may be unstated (null -> [] at write time) but never a non-list.
  if (row.audience != null && (!Array.isArray(row.audience) || row.audience.some((a) => typeof a !== "string")))
    p.push("audience must be an array of strings or null");
  if (row.is_free === true && (row.price_min > 0)) p.push("is_free contradicts price_min");
  return p;
}

/** A verified batch file: { batch, verified_by, verified_at, publish: [rows], hold: [{event_name, start_date, reason, url}] } */
export function batchProblems(file, opts) {
  const out = [];
  if (!file || !Array.isArray(file.publish) || !Array.isArray(file.hold)) return ["batch must have publish[] and hold[]"];
  const ids = new Set();
  file.publish.forEach((row, i) => {
    for (const msg of rowProblems(row, opts)) out.push(`publish[${i}] ${row?.event_name || "?"}: ${msg}`);
    if (ids.has(row?.event_id)) out.push(`publish[${i}] duplicate event_id ${row.event_id}`);
    ids.add(row?.event_id);
  });
  file.hold.forEach((h, i) => { if (!h || !h.event_name || !h.reason) out.push(`hold[${i}] needs event_name and reason`); });
  return out;
}
