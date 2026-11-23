// lib/plannerArrival.js — what Santa already knows when Itinerary opens.
//
// Owner 2026-11-23: after a date plan he opened Itinerary and Santa said
// "Which Florida city, and which dates?" The city, the night and the saved
// stop were already on the device. This module reads those signals and writes
// the first line so it names what is known and asks only for what is missing.
// A later open of the same thread resumes it. Nothing here invents a place,
// a price, an hour or a person's name.

import { parsePlannerCity } from "./plannerParse.js";
import { mergeTripMaps } from "./trips.js";
import {
  PLANNER_BROWSE_KEY,
  PLANNER_HANDOFF_KEY,
  readPlannerHandoff,
  sanitizeHandoff,
} from "./itineraryHandoff.js";

export const PLANNER_THREAD_KEY = "wf_planner_thread_v1";
const THREAD_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const THREAD_MAX_CHARS = 20000;
const BROWSE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CENTER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VIBES = {
  dinner: "Dinner",
  tonight: "Drinks",
  bite: "Something quick",
  hidden: "Somewhere new",
  drive: "A little trip",
  surprise: "Surprise me",
};
const VIBE_BY_LABEL = new Map(Object.entries(VIBES).map(([, label]) => [label.toLowerCase(), label]));
const NOT_A_CITY = /^(unsorted|trip|shared trip|florida|fl|this map area)$/i;

function json(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function getItem(store, key) {
  try {
    return store && typeof store.getItem === "function" ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

export function acceptCityName(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text || NOT_A_CITY.test(text)) return "";
  const parsed = parsePlannerCity(text);
  if (parsed && parsed.name) return parsed.name;
  const head = text.split(",")[0].trim();
  const fromHead = head !== text ? parsePlannerCity(head) : null;
  if (fromHead && fromHead.name) return fromHead.name;
  if (head.length > 32 || !/^[A-Za-z][A-Za-z .']*$/.test(head) || NOT_A_CITY.test(head)) return "";
  return "";
}

function iso(raw) {
  const s = String(raw || "").trim();
  return ISO.test(s) ? s : "";
}

function fresh(at, now, maxAge) {
  const n = Number(at);
  if (!n || n > now + 60 * 1000) return false;
  return now - n <= maxAge;
}

function vibeOf(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (VIBES[s]) return VIBES[s];
  return VIBE_BY_LABEL.get(s) || "";
}

function partyPhrase(party, source) {
  const p = String(party || "").trim().toLowerCase();
  if (p === "family") return "for your family";
  if (p === "solo" || p === "1") return "just you";
  if (/^\d+$/.test(p)) {
    const n = Number(p);
    if (n === 2) return "for the two of you";
    if (n > 2 && n <= 12) return "party of " + n;
  }
  if (p === "couple" || (!p && source === "date")) return "for the two of you";
  return "";
}

export function formatArrivalDates(start, end) {
  const a = iso(start);
  const b = iso(end);
  if (!a) return "";
  const day = (d, withYear) => MONTHS[Number(d.slice(5, 7)) - 1] + " " + Number(d.slice(8, 10)) + (withYear ? " " + d.slice(0, 4) : "");
  if (!b || b === a) return day(a, false);
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  if (lo.slice(0, 7) === hi.slice(0, 7)) return day(lo, false) + " to " + Number(hi.slice(8, 10));
  if (lo.slice(0, 4) === hi.slice(0, 4)) return day(lo, false) + " to " + day(hi, false);
  return day(lo, true) + " to " + day(hi, true);
}

function sameOriginPath(referrer, origin) {
  const raw = String(referrer || "");
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (origin && u.origin !== origin) return "";
    return u.pathname || "";
  } catch {
    return raw.startsWith("/") && !raw.startsWith("//") ? raw.split("?")[0] : "";
  }
}

function sourceFromPath(path) {
  const p = String(path || "");
  if (p === "/ask" || p.startsWith("/ask/")) return "date";
  if (p.startsWith("/guides/")) return "guide";
  if (p.startsWith("/events") || p.startsWith("/florida-events")) return "event";
  if (p === "/date-night" || p.startsWith("/date-night/")) return "date";
  return "";
}

function fromClause(source, query) {
  if (source === "date") return "from the date you just set";
  if (source === "guide") return "from the guide you were reading";
  if (source === "event") return "from the event you opened";
  if (source === "search" && query) return "from your search for " + query;
  return "";
}

function safeQuery(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (s.length < 2 || !/^[A-Za-z0-9 ']+$/.test(s) || /\bbest\b/i.test(s)) return "";
  return s;
}

function placeOf(raw, tripCity) {
  if (!raw || typeof raw !== "object") return null;
  const place = raw.place && typeof raw.place === "object" ? raw.place : raw;
  const name = String(place.name || raw.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const id = String(place.id || raw.id || name || "");
  if (!id && !name) return null;
  const city = acceptCityName(place.city || raw.city || "") || acceptCityName(tripCity) || "";
  const day = iso(raw.day) || iso(place.day) || iso(place.date) || "";
  return { id: id || name, name, city, day };
}

function collectStops(trips, lists, liked) {
  const stops = [];
  const seen = new Set();
  const push = (row) => {
    if (!row) return;
    const key = row.id || row.name;
    if (!key || seen.has(key)) return;
    seen.add(key);
    stops.push(row);
  };
  for (const trip of Object.values(trips || {})) {
    if (!trip || typeof trip !== "object" || !Array.isArray(trip.items)) continue;
    for (const it of trip.items) push(placeOf(it, trip.city));
  }
  const listPlaces = [];
  if (lists && typeof lists === "object") {
    for (const list of Object.values(lists)) {
      const places = list && (list.places || list.items);
      if (Array.isArray(places)) listPlaces.push(...places);
    }
  }
  for (const p of listPlaces) push(placeOf(p, ""));
  if (liked && typeof liked === "object" && !Array.isArray(liked)) {
    for (const p of Object.values(liked)) push(placeOf(p, ""));
  }
  return stops;
}

function tripCities(trips) {
  const names = [];
  const seen = new Set();
  for (const trip of Object.values(trips || {})) {
    if (!trip || !Array.isArray(trip.items) || !trip.items.length) continue;
    const city = acceptCityName(trip.city);
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(city);
  }
  return names;
}

function tripByCity(trips, city) {
  if (!city) return null;
  let best = null;
  for (const trip of Object.values(trips || {})) {
    if (!trip || !Array.isArray(trip.items)) continue;
    if (acceptCityName(trip.city).toLowerCase() !== city.toLowerCase()) continue;
    if (!best || trip.items.length > best.items.length) best = trip;
  }
  return best;
}

function datesFromTrip(trip, today) {
  if (!trip) return { start: "", end: "" };
  const days = [];
  const push = (d) => {
    const clean = iso(d);
    if (clean && (!today || clean >= today)) days.push(clean);
  };
  push(trip.startDate);
  push(trip.endDate);
  for (const it of trip.items || []) {
    push(it && it.day);
    push(it && it.place && it.place.date);
  }
  if (!days.length) return { start: "", end: "" };
  days.sort();
  return { start: days[0], end: days[days.length - 1] };
}

function emptyArrival() {
  return {
    city: "",
    startDate: "",
    endDate: "",
    dateLabel: "",
    vibe: "",
    party: "",
    partyPhrase: "",
    source: "",
    fromClause: "",
    savedCount: 0,
    savedNames: [],
    savedKind: "",
    ambiguousCities: [],
    tripKey: "",
    missing: ["city", "dates"],
    hasContext: false,
  };
}

export function readPlannerSources(localStore, sessionStore, loc) {
  const where = loc || {};
  const now = Number(where.now) || Date.now();
  const primary = json(getItem(localStore, "wayfind_trips")) || {};
  const legacy = json(getItem(localStore, "wf_trips_v1")) || {};
  return {
    trips: mergeTripMaps(primary, legacy),
    lists: json(getItem(localStore, "wayfind_lists")),
    liked: json(getItem(localStore, "wf_liked_items")),
    center: json(getItem(localStore, "wf_center")),
    invite: json(getItem(localStore, "wf_invite_recipient_v1")),
    handoff: readPlannerHandoff(sessionStore, now) || sanitizeHandoff(json(getItem(sessionStore, PLANNER_HANDOFF_KEY)), now),
    browse: json(getItem(sessionStore, PLANNER_BROWSE_KEY)),
    search: where.search || "",
    pathname: where.pathname || "",
    referrer: where.referrer || "",
    origin: where.origin || "",
    now,
  };
}

/**
 * Pure. `sources` is the snapshot from readPlannerSources plus an optional
 * `detail` (the open event) and `today` (Eastern YYYY-MM-DD).
 */
export function collectPlannerArrival(sources) {
  const src = sources || {};
  const now = Number(src.now) || Date.now();
  const today = iso(src.today);
  const detail = src.detail || {};
  const params = new URLSearchParams(String(src.search || "").replace(/^\?/, ""));
  const trips = src.trips && typeof src.trips === "object" ? src.trips : {};
  const handoff = src.handoff && fresh(src.handoff.at, now, 6 * 60 * 60 * 1000) ? src.handoff : (src.handoff && !src.handoff.at ? src.handoff : null);
  const browse = src.browse && fresh(src.browse.at, now, BROWSE_MAX_AGE_MS) ? src.browse : null;
  const invite = src.invite && fresh(src.invite.ts, now, INVITE_MAX_AGE_MS) ? src.invite : null;
  const center = src.center && src.center.manual === true && fresh(src.center.ts, now, CENTER_MAX_AGE_MS) ? src.center : null;

  const explicitCity = acceptCityName(detail.city) || acceptCityName(params.get("city")) || (handoff && acceptCityName(handoff.city)) || "";
  const cities = tripCities(trips);
  let city = explicitCity;
  let ambiguousCities = [];
  if (!city && cities.length === 1) city = cities[0];
  else if (!city && cities.length > 1) ambiguousCities = cities.slice(0, 3);

  const stops = collectStops(trips, src.lists, src.liked);
  if (!city && !ambiguousCities.length) {
    const stopCities = [];
    const seen = new Set();
    for (const stop of stops) {
      if (!stop.city || seen.has(stop.city.toLowerCase())) continue;
      seen.add(stop.city.toLowerCase());
      stopCities.push(stop.city);
    }
    if (stopCities.length === 1) city = stopCities[0];
  }
  if (!city && !ambiguousCities.length && invite) city = acceptCityName(invite.city);
  if (!city && !ambiguousCities.length && browse) {
    city = acceptCityName(browse.city) || acceptCityName(parsePlannerCity(browse.query || "") && parsePlannerCity(browse.query || "").name);
  }
  if (!city && !ambiguousCities.length && center) city = acceptCityName(center.loc);

  const explicitStart = iso(detail.startDate) || iso(params.get("date") || params.get("start")) || (handoff && iso(handoff.date)) || "";
  const explicitEnd = iso(detail.endDate) || iso(params.get("end")) || (handoff && iso(handoff.end)) || "";
  let startDate = explicitStart;
  let endDate = explicitEnd && (!startDate || explicitEnd >= startDate) ? explicitEnd : "";
  if (!startDate) {
    const dated = datesFromTrip(city ? tripByCity(trips, city) : (cities.length === 1 ? tripByCity(trips, cities[0]) : null), today);
    startDate = dated.start;
    endDate = dated.end && dated.end !== dated.start ? dated.end : "";
  }
  if (!startDate && browse && iso(browse.date) && (!today || browse.date >= today)) startDate = browse.date;

  const vibe = vibeOf(detail.activity) || vibeOf(params.get("activity")) || (handoff && vibeOf(handoff.activity)) || "";
  const party = String(detail.party || params.get("party") || (handoff && handoff.party) || "").trim().toLowerCase();
  const referrerPath = sameOriginPath(src.referrer, src.origin);
  const source = (detail.source && fromClause(detail.source, "") ? detail.source : "")
    || (handoff && handoff.source)
    || sourceFromPath(referrerPath)
    || (browse && fresh(browse.at, now, 2 * 60 * 60 * 1000) ? sourceFromPath(browse.path) : "")
    || "";
  const query = browse && fresh(browse.at, now, 2 * 60 * 60 * 1000) ? safeQuery(browse.query) : "";
  const clause = fromClause(source, source === "search" ? query : "");

  const namedPool = city ? stops.filter((s) => s.city && s.city.toLowerCase() === city.toLowerCase()) : stops;
  const names = [];
  for (const stop of namedPool) {
    if (stop.name && !names.some((n) => n.toLowerCase() === stop.name.toLowerCase())) names.push(stop.name);
    if (names.length === 2) break;
  }
  if (handoff && handoff.placeName && !names.some((n) => n.toLowerCase() === handoff.placeName.toLowerCase())) {
    const inTrips = stops.some((s) => s.name && s.name.toLowerCase() === handoff.placeName.toLowerCase());
    if (!inTrips) {
      stops.push({ id: "handoff:" + handoff.placeName, name: handoff.placeName, city, day: "" });
      if (names.length < 2) names.push(handoff.placeName);
    }
  }
  const tripStopIds = new Set();
  for (const trip of Object.values(trips)) {
    for (const it of (trip && trip.items) || []) if (it && it.id != null) tripStopIds.add(String(it.id));
  }
  const savedKind = tripStopIds.size || (handoff && handoff.placeName) ? "saved" : (stops.length ? "liked" : "");
  const savedCount = new Set(stops.map((s) => s.id || s.name)).size;

  let tripKey = "";
  const chosenTrip = city ? tripByCity(trips, city) : null;
  if (chosenTrip && chosenTrip.key) tripKey = chosenTrip.key;
  else if (!city) {
    const only = Object.values(trips).filter((t) => t && Array.isArray(t.items) && t.items.length);
    if (only.length === 1 && only[0].key) tripKey = only[0].key;
  }

  const missing = [];
  if (!city) missing.push("city");
  if (!startDate) missing.push("dates");
  const phrase = partyPhrase(party, source);
  const dateLabel = formatArrivalDates(startDate, endDate);
  const hasContext = Boolean(city || startDate || vibe || phrase || savedCount || clause || ambiguousCities.length);
  if (!hasContext) return emptyArrival();
  return {
    city,
    startDate,
    endDate: endDate || (startDate ? startDate : ""),
    dateLabel,
    vibe,
    party,
    partyPhrase: phrase,
    source,
    fromClause: clause,
    savedCount,
    savedNames: names,
    savedKind,
    ambiguousCities,
    tripKey,
    missing,
    hasContext: true,
  };
}

function spotClause(arrival) {
  const n = arrival.savedCount || 0;
  if (!n) return "";
  const names = arrival.savedNames || [];
  const liked = arrival.savedKind === "liked";
  const noun = liked ? "place" : "spot";
  const tail = liked ? "you liked" : "you saved";
  if (!liked && names.length === n && n === 1) return "I kept " + names[0];
  if (!liked && names.length === n && n === 2) return "I kept " + names[0] + " and " + names[1];
  if (liked && names.length === n && n === 1) return "I kept " + names[0] + ", the place you liked";
  if (liked && names.length === n && n === 2) return "I kept " + names[0] + " and " + names[1] + ", places you liked";
  return "I kept the " + n + " " + noun + (n === 1 ? "" : "s") + " " + tail;
}

function closer(voice, arrival) {
  const missing = arrival.missing || [];
  const needCity = missing.includes("city");
  const needDates = missing.includes("dates");
  const ambiguous = Array.isArray(arrival.ambiguousCities) && arrival.ambiguousCities.length > 1;
  if (!needCity && !needDates) return "I'll build the day.";
  if (ambiguous && needCity && needDates) return "Which city, and which dates?";
  if (ambiguous && needCity) return "Which city?";
  if (voice === "santa") {
    if (needCity && needDates) return "Which Florida city, and which dates?";
    if (needCity) return "Which Florida city?";
    return "Which dates do I pack the sleigh for?";
  }
  if (voice === "boo") {
    if (needCity && needDates) return "Which Florida city, and which dates?";
    if (needCity) return "Which Florida city?";
    return "Which dates do I haunt?";
  }
  if (needCity && needDates) return "Which Florida city, and which dates?";
  if (needCity) return "Which Florida city?";
  return "Which dates?";
}

/** First line. Empty when nothing is known, so the sheet keeps its stock hello. */
export function plannerArrivalGreeting(voice, arrival) {
  if (!arrival || !arrival.hasContext) return "";
  const bits = [];
  if (arrival.fromClause) bits.push(arrival.fromClause);
  const where = [arrival.city, arrival.dateLabel].filter(Boolean).join(" ");
  if (where) bits.push(where);
  const vibeParty = [arrival.vibe ? String(arrival.vibe).toLowerCase() : "", arrival.partyPhrase].filter(Boolean).join(" ");
  if (vibeParty) bits.push(vibeParty);
  const ambiguous = Array.isArray(arrival.ambiguousCities) && arrival.ambiguousCities.length > 1 && !arrival.city;
  if (ambiguous) bits.push("spots in " + humanCityList(arrival.ambiguousCities));
  const spots = ambiguous ? "" : spotClause(arrival);
  let sentence;
  if (!bits.length && spots) sentence = spots;
  else if (spots) sentence = "Got it, " + bits.join(", ") + ", and " + spots;
  else if (bits.length) sentence = "Got it, " + bits.join(", ");
  else return "";
  if (!/[.!?]$/.test(sentence)) sentence += ".";
  return sentence + " " + closer(voice, arrival);
}

/** The one line a ready plan sends. Empty until a city and a date are both known. */
export function plannerArrivalPrompt(arrival) {
  if (!arrival || !arrival.city || !arrival.startDate) return "";
  let sentence = "Build my day in " + arrival.city;
  if (arrival.dateLabel) sentence += " on " + arrival.dateLabel;
  const extra = [];
  if (arrival.vibe) extra.push(String(arrival.vibe).toLowerCase());
  if (arrival.partyPhrase) extra.push(arrival.partyPhrase);
  if (arrival.savedCount === 1 && arrival.savedNames && arrival.savedNames[0]) extra.push("keep " + arrival.savedNames[0]);
  else if (arrival.savedCount > 1) extra.push("keep the " + arrival.savedCount + " spots I saved");
  if (extra.length) sentence += ", " + extra.join(", ");
  return sentence + ".";
}

function humanCityList(cities) {
  if (!cities || cities.length < 2) return "";
  if (cities.length === 2) return cities[0] + " and " + cities[1];
  return cities.slice(0, -1).join(", ") + " and " + cities[cities.length - 1];
}

export function packPlannerThread(state) {
  const s = state || {};
  const messages = [];
  for (const m of Array.isArray(s.messages) ? s.messages : []) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string") continue;
    const text = m.text.replace(/\s+/g, " ").trim().slice(0, 400);
    if (!text) continue;
    messages.push({ role: m.role, text });
    if (messages.length > 16) messages.shift();
  }
  if (!messages.some((m) => m.role === "user")) return null;
  let proposedPlan = null;
  if (s.proposedPlan && Array.isArray(s.proposedPlan.days)) {
    try {
      const raw = JSON.stringify(s.proposedPlan);
      if (raw.length <= THREAD_MAX_CHARS) proposedPlan = JSON.parse(raw);
    } catch { /* a plan that cannot be stored is omitted; the words remain */ }
  }
  return {
    v: 1,
    authUserId: s.authUserId ? String(s.authUserId).slice(0, 80) : null,
    voice: s.voice === "santa" || s.voice === "boo" ? s.voice : "wayfind",
    activeTripKey: s.activeTripKey ? String(s.activeTripKey).slice(0, 80) : "",
    city: acceptCityName(s.city) || "",
    messages,
    proposedPlan,
    savedAt: Number(s.now) || Date.now(),
  };
}

export function plannerThreadUsable(thread, authUserId, now = Date.now()) {
  if (!thread || thread.v !== 1 || !Array.isArray(thread.messages) || !thread.messages.length) return false;
  if (!thread.messages.some((m) => m && m.role === "user" && m.text)) return false;
  const savedAt = Number(thread.savedAt);
  if (!savedAt || now - savedAt > THREAD_MAX_AGE_MS || savedAt > now + 60 * 1000) return false;
  const stored = thread.authUserId || null;
  const current = authUserId || null;
  if (stored && stored !== current) return false;
  if (stored && !current) return false;
  return true;
}

export function loadPlannerThread(session) {
  const parsed = json(getItem(session, PLANNER_THREAD_KEY));
  return parsed && parsed.v === 1 ? parsed : null;
}

export function savePlannerThread(session, thread) {
  if (!session) return;
  try {
    if (!thread) session.removeItem(PLANNER_THREAD_KEY);
    else session.setItem(PLANNER_THREAD_KEY, JSON.stringify(thread));
  } catch { /* a full session store still leaves the open thread on screen */ }
}

/**
 * What opening the planner should do. Pure, so the sheet and the test share it.
 * mode keep: an in-memory thread is already on screen.
 * mode resume: a stored thread from this visit.
 * mode build: the visitor asked to build, and the city and date are known.
 * mode greet: say what is known. An empty text means the stock hello.
 * mode prompt: a caller already supplied the visitor's words.
 */
export function resolvePlannerOpen({ voice, reset, inMemoryMessages, storedThread, authUserId, arrival, detail, now }) {
  const memory = reset ? [] : (Array.isArray(inMemoryMessages) ? inMemoryMessages : []);
  const prompt = String((detail && detail.prompt) || "").trim().slice(0, 500);
  const build = Boolean(detail && detail.build) && !prompt;
  let thread = reset ? null : storedThread;
  let clearThread = false;
  if (thread && !plannerThreadUsable(thread, authUserId, now || Date.now())) thread = null;
  const city = (arrival && arrival.city) || "";
  if (thread && city && thread.city && String(thread.city).toLowerCase() !== city.toLowerCase()) {
    thread = null;
    clearThread = true;
  }
  const tripKey = (arrival && arrival.tripKey) || "";
  const base = { clearThread, tripKey, city, draft: "", submitPrompt: "", proposedPlan: null, messages: memory };
  const userSpoke = thread && thread.messages.some((m) => m && m.role === "user");
  if (memory.length && !prompt && !build) return { ...base, mode: "keep" };
  if (userSpoke && !prompt && (!build || (thread.city && city && String(thread.city).toLowerCase() === city.toLowerCase()))) {
    return {
      ...base,
      mode: "resume",
      messages: thread.messages,
      proposedPlan: thread.proposedPlan || null,
      city: city || thread.city || "",
    };
  }
  if (prompt) return { ...base, mode: "prompt", submitPrompt: prompt };
  const greet = plannerArrivalGreeting(voice || (detail && detail.voice) || "wayfind", arrival);
  const submit = build && arrival && arrival.city && arrival.startDate ? plannerArrivalPrompt(arrival) : "";
  if (submit) {
    return { ...base, mode: "build", messages: [{ role: "assistant", text: greet }], submitPrompt: submit };
  }
  const ready = arrival && arrival.hasContext && !(arrival.missing || []).includes("city") && !(arrival.missing || []).includes("dates");
  return {
    ...base,
    mode: "greet",
    messages: [{ role: "assistant", text: greet }],
    draft: ready ? plannerArrivalPrompt(arrival) : "",
  };
}
