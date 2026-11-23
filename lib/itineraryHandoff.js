// lib/itineraryHandoff.js — what a date plan is allowed to carry into Itinerary.
//
// The agreed plan used to cross the door as /itinerary?city=&date= and then
// home.js replaced that address with a bare /itinerary, so Santa opened on
// "which city, and which dates?" (owner, 2026-11-23). These helpers keep the
// city, the dates, the activity and the party, and drop everything else.
// No names, notes, invite keys or coordinates. No imports, so the homepage
// can use this file without pulling the planner into first paint.

export const PLANNER_HANDOFF_KEY = "wf_planner_handoff_v1";
export const PLANNER_BROWSE_KEY = "wf_planner_browse_v1";
export const HANDOFF_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVITIES = new Set(["dinner", "tonight", "bite", "hidden", "drive", "surprise"]);
const PARTIES = new Set(["couple", "family", "solo"]);
const NOT_A_CITY = /^(unsorted|trip|shared trip|florida|fl)$/i;

function cleanCity(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!s || NOT_A_CITY.test(s) || !/^[A-Za-z][A-Za-z .']*$/.test(s)) return "";
  return s;
}

function cleanIso(raw) {
  const s = String(raw || "").trim();
  return ISO.test(s) ? s : "";
}

function cleanActivity(raw) {
  const s = String(raw || "").trim().toLowerCase().slice(0, 24);
  return ACTIVITIES.has(s) ? s : "";
}

function cleanParty(raw) {
  const s = String(raw || "").trim().toLowerCase().slice(0, 8);
  if (PARTIES.has(s)) return s;
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 12) return String(n);
  }
  return "";
}

function cleanPlaceName(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!s || /[\r\n]/.test(s)) return "";
  return s;
}

function asParams(input) {
  if (!input) return new URLSearchParams();
  if (typeof input.get === "function") return input;
  const raw = String(input).replace(/^\?/, "");
  return new URLSearchParams(raw);
}

/** City, date, end, activity, party. Drops plan, names, notes and anything else. */
export function itineraryHandoffQuery(input) {
  const sp = asParams(input);
  const keep = new URLSearchParams();
  const city = cleanCity(sp.get("city"));
  const date = cleanIso(sp.get("date") || sp.get("start"));
  let end = cleanIso(sp.get("end"));
  if (end && date && end < date) end = "";
  if (end && end === date) end = "";
  const activity = cleanActivity(sp.get("activity"));
  const party = cleanParty(sp.get("party"));
  if (city) keep.set("city", city);
  if (date) keep.set("date", date);
  if (end) keep.set("end", end);
  if (activity) keep.set("activity", activity);
  if (party) keep.set("party", party);
  return keep;
}

/**
 * Where /itinerary?go= lands, and whether that arrival asked to build the day.
 * `plan=1` opens the planner once. It is not written back into the address bar,
 * so a refresh resumes instead of planning again.
 */
export function itineraryArrivalDetail(input) {
  const sp = asParams(input);
  const keep = itineraryHandoffQuery(sp);
  const href = "/itinerary" + (keep.toString() ? "?" + keep.toString() : "");
  const build = sp.get("plan") === "1";
  return {
    href,
    build,
    detail: build
      ? {
          surface: "itinerary_arrival",
          pathname: "/itinerary",
          city: keep.get("city") || "",
          startDate: keep.get("date") || "",
          endDate: keep.get("end") || "",
          activity: keep.get("activity") || "",
          party: keep.get("party") || "",
          build: true,
        }
      : null,
  };
}

/** The link the date plan uses. `build` adds plan=1 for the one landing open. */
export function itineraryPlanHref(fields) {
  const f = fields || {};
  const sp = new URLSearchParams();
  if (f.city) sp.set("city", f.city);
  if (f.date) sp.set("date", f.date);
  if (f.end) sp.set("end", f.end);
  if (f.activity) sp.set("activity", f.activity);
  if (f.party) sp.set("party", f.party);
  const keep = itineraryHandoffQuery(sp);
  if (f.build) keep.set("plan", "1");
  const s = keep.toString();
  return "/itinerary" + (s ? "?" + s : "");
}

const SOURCES = new Set(["date", "guide", "event", "search"]);

export function sanitizeHandoff(input, now = Date.now()) {
  const src = input || {};
  const source = SOURCES.has(src.source) ? src.source : "";
  const city = cleanCity(src.city);
  const date = cleanIso(src.date);
  let end = cleanIso(src.end);
  if (end && date && end < date) end = "";
  const activity = cleanActivity(src.activity);
  const party = cleanParty(src.party);
  const placeName = cleanPlaceName(src.placeName);
  if (!source && !city && !date && !activity && !party && !placeName) return null;
  const at = Number(src.at) > 0 ? Number(src.at) : now;
  return { v: 1, source, city, date, end: end || "", activity, party, placeName, at };
}

export function writePlannerHandoff(session, input, now = Date.now()) {
  if (!session || typeof session.setItem !== "function") return false;
  const clean = sanitizeHandoff(input, now);
  if (!clean) return false;
  try {
    session.setItem(PLANNER_HANDOFF_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export function readPlannerHandoff(session, now = Date.now()) {
  if (!session || typeof session.getItem !== "function") return null;
  let parsed = null;
  try {
    const raw = session.getItem(PLANNER_HANDOFF_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  const clean = sanitizeHandoff(parsed, now);
  if (!clean) return null;
  if (!Number(clean.at) || now - Number(clean.at) > HANDOFF_MAX_AGE_MS || Number(clean.at) > now + 60 * 1000) return null;
  return clean;
}
