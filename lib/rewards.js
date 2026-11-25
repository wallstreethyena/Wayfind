// lib/rewards.js — the rules for trip logs, points, tiers and badges.
//
// The database (supabase/migrations/20261125180000_wf_trip_rewards.sql,
// public.wf_log_visit) awards the POINTS and keeps the counters, so a member's
// balance can never be written from a browser. This module is the single place
// the TIER and BADGE rules live; both the API route and the drawer read them,
// and scripts/test-trip-rewards.mjs asserts POINTS here matches the SQL.
//
// Pure: no window, no fetch. Safe on the server and in plain Node tests.

export const POINTS = Object.freeze({ visit: 10, verified: 15, localIntel: 5 });
export const GIVEAWAY_MONTHLY_CAP = 10;
export const DAILY_LOG_CAP = 8;
export const DUPLICATE_WINDOW_DAYS = 7;
export const MAX_BACKDATE_DAYS = 14;
// A device inside this many miles of the place counts as a NEARBY visit.
export const NEARBY_MILES = 0.5;

export const TIERS = Object.freeze([
  Object.freeze({ id: "local_scout", name: "Local Scout", minPoints: 0 }),
  Object.freeze({ id: "florida_insider", name: "Florida Insider", minPoints: 150 }),
  Object.freeze({ id: "wayfind_trailblazer", name: "Wayfind Trailblazer", minPoints: 500 }),
]);

// Each badge is earned from the profile counters alone, so it is reproducible
// and verifiable from the ledger.
export const BADGES = Object.freeze([
  Object.freeze({ id: "first_visit", name: "First Visit", how: "Log your first visit", test: (p) => p.visits >= 1 }),
  Object.freeze({ id: "on_the_spot", name: "On the Spot", how: "Log 3 visits while you are there", test: (p) => p.verified_visits >= 3 }),
  Object.freeze({ id: "local_intel", name: "Local Intel", how: "Share crowd, vibe or timing on 5 visits", test: (p) => p.intel_visits >= 5 }),
  Object.freeze({ id: "event_goer", name: "Event Goer", how: "Log 3 event visits", test: (p) => p.event_visits >= 3 }),
  Object.freeze({ id: "ten_spots", name: "Ten Spots", how: "Visit 10 different places", test: (p) => p.distinct_refs >= 10 }),
]);

// Public giveaway is OFF until the owner turns it on. A real prize promotion
// needs official rules, a no purchase necessary entry, and possibly state
// registration first. Entries still accrue in the ledger so nothing is lost,
// but the UI never mentions a giveaway or a prize while this is false.
export function giveawayPublic(env) {
  const e = env || (typeof process !== "undefined" ? process.env : {}) || {};
  return String(e.NEXT_PUBLIC_WF_GIVEAWAY_PUBLIC || "").trim() === "1";
}

export const CROWD = Object.freeze(["quiet", "steady", "busy", "packed"]);
export const VIBE = Object.freeze(["chill", "lively", "romantic", "family", "local", "touristy"]);
export const BEST_TIME = Object.freeze(["morning", "midday", "afternoon", "evening", "late"]);
export const WAIT = Object.freeze(["none", "short", "long"]);

export const LABELS = Object.freeze({
  crowd: { quiet: "Quiet", steady: "Steady", busy: "Busy", packed: "Packed" },
  vibe: { chill: "Chill", lively: "Lively", romantic: "Date night", family: "Family", local: "Locals", touristy: "Touristy" },
  best_time: { morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening", late: "Late night" },
  wait: { none: "No wait", short: "Short wait", long: "Long wait" },
});

const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

export function normalizeProfile(row) {
  const r = row && typeof row === "object" ? row : {};
  return {
    points: n(r.points),
    visits: n(r.visits),
    verified_visits: n(r.verified_visits),
    intel_visits: n(r.intel_visits),
    event_visits: n(r.event_visits),
    distinct_refs: n(r.distinct_refs),
    giveaway_month: typeof r.giveaway_month === "string" ? r.giveaway_month : null,
    giveaway_entries: Math.min(GIVEAWAY_MONTHLY_CAP, n(r.giveaway_entries)),
  };
}

export function tierFor(points) {
  const p = n(points);
  let t = TIERS[0];
  for (const tier of TIERS) if (p >= tier.minPoints) t = tier;
  return t;
}

export function nextTier(points) {
  const p = n(points);
  return TIERS.find((t) => t.minPoints > p) || null;
}

/** 0..1 progress from the current tier floor to the next tier. 1 at the top tier. */
export function tierProgress(points) {
  const p = n(points);
  const cur = tierFor(p);
  const nxt = nextTier(p);
  if (!nxt) return 1;
  const span = nxt.minPoints - cur.minPoints;
  return span > 0 ? Math.min(1, Math.max(0, (p - cur.minPoints) / span)) : 1;
}

export function badgesFor(profile) {
  const p = normalizeProfile(profile);
  return BADGES.filter((b) => b.test(p)).map((b) => b.id);
}

/** The full status the drawer shows. Giveaway fields only when it is public. */
export function rewardsSummary(profile, { monthStr = "", env } = {}) {
  const p = normalizeProfile(profile);
  const tier = tierFor(p.points);
  const nxt = nextTier(p.points);
  const earned = new Set(badgesFor(p));
  const out = {
    points: p.points,
    visits: p.visits,
    tier: { id: tier.id, name: tier.name },
    next: nxt ? { id: nxt.id, name: nxt.name, pointsToGo: nxt.minPoints - p.points } : null,
    progress: tierProgress(p.points),
    badges: BADGES.map((b) => ({ id: b.id, name: b.name, how: b.how, earned: earned.has(b.id) })),
  };
  if (giveawayPublic(env)) {
    out.giveawayEntries = monthStr && p.giveaway_month === monthStr ? p.giveaway_entries : 0;
  }
  return out;
}

/** Points the database will award for one log; for the success message only. */
export function pointsFor({ verification, intelCount }) {
  let pts = POINTS.visit;
  if (verification === "nearby") pts += POINTS.verified;
  if (n(intelCount) >= 2) pts += POINTS.localIntel;
  return pts;
}

export function haversineMiles(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const isCoord = (v, lim) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;

/**
 * Decide verification from the device position (optional) and the place's
 * stored coordinates. Neither position is returned or stored; only the band.
 */
export function verifyVisit(device, place) {
  const ok = device && place && isCoord(device.lat, 90) && isCoord(device.lng, 180) && isCoord(place.lat, 90) && isCoord(place.lng, 180);
  if (!ok) return { verification: "self_reported", distance_band: "unknown" };
  const mi = haversineMiles(device, place);
  const band = mi <= 0.25 ? "under_quarter_mile" : mi <= 1 ? "under_mile" : "farther";
  return { verification: mi <= NEARBY_MILES ? "nearby" : "self_reported", distance_band: band };
}

const pick = (v, list) => (typeof v === "string" && list.includes(v) ? v : null);
const REF_RX = /^[A-Za-z0-9_:.-]{3,200}$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function dayDiff(a, b) {
  return Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
}

/**
 * Validate the request body. Returns { ok, value } or { ok:false, error }.
 * Unknown fields are ignored; the device position is passed through for the
 * distance check only and is never part of the stored value.
 */
export function validateTripLog(body, todayStr) {
  const b = body && typeof body === "object" ? body : {};
  const refKind = b.refKind === "event" ? "event" : b.refKind === "place" ? "place" : null;
  if (!refKind) return { ok: false, error: "Pick a place or event to log." };
  const refId = typeof b.refId === "string" ? b.refId.trim() : "";
  if (!REF_RX.test(refId)) return { ok: false, error: "That place could not be found." };
  const visitedOn = typeof b.visitedOn === "string" && DATE_RX.test(b.visitedOn) ? b.visitedOn : todayStr;
  if (!DATE_RX.test(String(todayStr || ""))) return { ok: false, error: "Try again in a moment." };
  const back = dayDiff(todayStr, visitedOn);
  if (!Number.isFinite(back) || back < 0) return { ok: false, error: "Visits can only be logged for today or earlier." };
  if (back > MAX_BACKDATE_DAYS) return { ok: false, error: "Visits can be logged up to 14 days back." };
  const device = b.device && isCoord(b.device.lat, 90) && isCoord(b.device.lng, 180) ? { lat: b.device.lat, lng: b.device.lng } : null;
  return {
    ok: true,
    value: {
      refKind,
      refId,
      visitedOn,
      crowd: pick(b.crowd, CROWD),
      vibe: pick(b.vibe, VIBE),
      bestTime: pick(b.bestTime, BEST_TIME),
      wait: pick(b.wait, WAIT),
    },
    device,
  };
}

export function intelCount(v) {
  return ["crowd", "vibe", "bestTime", "wait"].filter((k) => v && v[k]).length;
}

/** Map a database error from wf_log_visit to a status and a plain message. */
export function logErrorFor(message) {
  const m = String(message || "");
  if (m.includes("WF_DUPLICATE")) return { status: 409, code: "duplicate", error: "You already logged this spot this week." };
  if (m.includes("WF_RATE_LIMITED")) return { status: 429, code: "rate_limited", error: "That is a lot of visits for one day. Try again tomorrow." };
  if (m.includes("WF_BAD_DATE")) return { status: 400, code: "bad_date", error: "Visits can be logged for today or up to 14 days back." };
  return { status: 502, code: "unavailable", error: "We could not save that visit. Please try again." };
}
