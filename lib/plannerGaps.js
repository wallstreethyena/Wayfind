// lib/plannerGaps.js — what visitors asked the planner for that Wayfind could
// not answer, and the end of day report built from it (owner, 2026-11-27: "if
// it's not on Wayfind, I want them to report to me so that we can add them").
//
// PRIVACY LINE. A gap row holds only the planner's structured reading of a
// request: the city, interest words, party type, budget word, day count, how
// many stops came back, and the names of places the visitor asked for that
// Wayfind does not have. The visitor's own words are never stored, and every
// name is checked for personal data (email, phone, card, account id) before
// it is kept. No IP, no user id, no session.
//
// HONEST LEADS. The report may look a missing name up on the web through the
// capped AI engine. What comes back is a LEAD with the page it came from,
// never a fact: nothing here writes a place, hours, a date or a photo into
// Wayfind. Adding a place stays a reviewed step that checks the official site.
import { findPersonalData } from "./aiEngine.js";

const SLUG_RX = /^[a-z0-9]+([_-][a-z0-9]+)*$/;
const WORD_RX = /^[a-z_]{2,24}$/;
export const GAP_OUTCOMES = Object.freeze(["OK", "THIN", "NO_PLAN", "NEED_CITY", "UNAVAILABLE"]);
export const THIN_STOPS_PER_DAY = 3;
const MAX_NAMES = 6;

/** A requested name that is safe and useful to keep, or null. PURE. */
export function cleanGapName(raw) {
  const s = String(raw || "").replace(/\s*\(no open day in this plan\)\s*$/i, "").replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
  if (s.length < 3 || !/[a-z]/i.test(s)) return null;
  if (findPersonalData(s)) return null;
  if (/https?:|www\.|@/i.test(s)) return null;
  return s;
}

/** A city name the visitor asked for that Wayfind does not cover, or null. PURE. */
export function cleanRequestedCity(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s || s.length > 40 || !/^[A-Za-z][A-Za-z .'-]*$/.test(s)) return null;
  return s.replace(/-/g, " ");
}

/**
 * One gap row from a finished planner request. PURE. Returns null for a row
 * that would say nothing (a full, normal plan with no missing names).
 */
export function gapRow({ mode, outcome, parsed = null, requestedCity = null, stopCount = 0, dayCount = null, unmatched = [], weatherLean = null }) {
  const prefs = (parsed && parsed.preferences) || {};
  const metro = parsed && parsed.destination && SLUG_RX.test(String(parsed.destination.slug || "")) ? String(parsed.destination.slug).slice(0, 60) : null;
  const days = Number.isInteger(dayCount) ? dayCount : (parsed && parsed.dates && parsed.dates.dayCount) || null;
  const names = [...new Set((Array.isArray(unmatched) ? unmatched : []).map(cleanGapName).filter(Boolean))].slice(0, MAX_NAMES);
  let out = GAP_OUTCOMES.includes(outcome) ? outcome : "UNAVAILABLE";
  if (out === "OK" && days && stopCount < THIN_STOPS_PER_DAY * days) out = "THIN";
  if (out === "OK" && !names.length) return null;
  return {
    mode: mode === "notes" ? "notes" : "picks",
    outcome: out,
    metro,
    requested_city: metro ? null : cleanRequestedCity(requestedCity),
    interests: (Array.isArray(prefs.interests) ? prefs.interests : []).map(String).filter((x) => WORD_RX.test(x)).slice(0, 12),
    party: WORD_RX.test(String(prefs.partyType || "")) ? String(prefs.partyType) : null,
    kids: Number(prefs.kids) > 0,
    budget: WORD_RX.test(String(prefs.budget || "")) ? String(prefs.budget) : null,
    day_count: Number.isInteger(days) && days >= 1 && days <= 10 ? days : null,
    stop_count: Math.max(0, Math.min(60, Number(stopCount) || 0)),
    unmatched: names,
    weather_lean: weatherLean === "rain" || weatherLean === "heat" ? weatherLean : null,
  };
}

function sbConfig(env = process.env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

/** Store one gap row. Resolves true or false. Never throws, never blocks the visitor. */
export async function logGap(row, { env = process.env, fetchImpl = fetch } = {}) {
  if (!row) return false;
  const cfg = sbConfig(env);
  if (!cfg) return false;
  try {
    const r = await fetchImpl(cfg.url + "/rest/v1/wf_planner_gaps", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: cfg.key, Authorization: "Bearer " + cfg.key, Prefer: "return=minimal" },
      body: JSON.stringify(row),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ── the end of day report ─────────────────────────────────────────────────

function bump(map, key, by = 1) { if (key) map.set(key, (map.get(key) || 0) + by); }
const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

/** Group a day's gap rows into the report's facts. PURE. */
export function summarizeGaps(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byOutcome = new Map(), cities = new Map(), names = new Map(), thin = new Map(), weather = new Map();
  const nameCity = new Map();
  for (const r of list) {
    bump(byOutcome, r.outcome);
    if (r.outcome === "NEED_CITY" && r.requested_city) bump(cities, r.requested_city);
    for (const n of r.unmatched || []) {
      const key = n.toLowerCase();
      bump(names, key);
      if (!nameCity.has(key)) nameCity.set(key, { name: n, metro: r.metro || null });
    }
    if ((r.outcome === "THIN" || r.outcome === "NO_PLAN") && r.metro) {
      const want = (r.interests || []).length ? r.interests.join(" + ") : "anything";
      bump(thin, r.metro + " · " + want + (r.kids ? " · kids" : ""));
    }
    if (r.weather_lean) bump(weather, r.weather_lean);
  }
  return {
    requests: list.length,
    outcomes: Object.fromEntries(byOutcome),
    uncoveredCities: top(cities, 8).map(([city, count]) => ({ city, count })),
    missingPlaces: top(names, 12).map(([key, count]) => ({ ...nameCity.get(key), count })),
    thinSpots: top(thin, 8).map(([spot, count]) => ({ spot, count })),
    weatherLeans: Object.fromEntries(weather),
  };
}

const AGGREGATOR_RX = /(^|\.)(yelp|tripadvisor|facebook|instagram|google|goo\.gl|maps\.apple|foursquare|opentable|doordash|ubereats|grubhub|wikipedia|mapquest|yellowpages|bbb)\./i;

/** The first cited page that looks like the place's own site, else the first cited page. PURE. */
export function pickLeadUrl(urls) {
  const clean = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string" && /^https:\/\/[^\s/]+\.[^\s/]+/.test(u)).map((u) => u.split("#")[0].replace(/[?&]utm_[^&]+/g, "").replace(/\?$/, ""));
  const own = clean.find((u) => { try { return !AGGREGATOR_RX.test(new URL(u).hostname + "."); } catch { return false; } });
  return { url: own || clean[0] || null, official: !!own };
}

/** The web question for one missing place. PURE. */
export function leadQuestion(name, city) {
  const where = city ? `in or near ${city}, Florida` : "in Florida";
  return `Is there a business, attraction or event called "${name}" ${where}? Reply YES or NO first, then one short sentence. Cite its official website if it has one.`;
}

/** Read a search reply: first word YES or NO. PURE. */
export function readLeadAnswer(text) {
  const t = String(text || "").trim().toUpperCase();
  if (/^YES\b/.test(t)) return "yes";
  if (/^NO\b/.test(t)) return "no";
  return "unclear";
}

/** The plain text report for the main chat. PURE. No dashes, no visitor words. */
export function reportText(dateYmd, s, leads = []) {
  const lines = [];
  const asked = s.requests;
  const answered = (s.outcomes.OK || 0);
  lines.push(`Planner gap report for ${dateYmd}: ${asked} request${asked === 1 ? "" : "s"} needed attention.`);
  const parts = [];
  if (s.outcomes.NEED_CITY) parts.push(`${s.outcomes.NEED_CITY} asked for a city Wayfind doesn't cover`);
  if (s.outcomes.NO_PLAN) parts.push(`${s.outcomes.NO_PLAN} got no plan`);
  if (s.outcomes.THIN) parts.push(`${s.outcomes.THIN} got a thin plan`);
  if (answered) parts.push(`${answered} got a plan but named places we don't have`);
  if (parts.length) lines.push(parts.join("; ") + ".");
  if (s.uncoveredCities.length) lines.push("Cities people asked for: " + s.uncoveredCities.map((c) => `${c.city} (${c.count})`).join(", ") + ".");
  if (s.missingPlaces.length) {
    const byKey = new Map(leads.map((l) => [String(l.name).toLowerCase(), l]));
    lines.push("Places people named that Wayfind doesn't have:");
    for (const p of s.missingPlaces) {
      const l = byKey.get(String(p.name).toLowerCase());
      const where = p.metro ? ` near ${p.metro}` : "";
      let lead = "";
      if (l && l.answer === "yes" && l.url) lead = l.official ? ` Lead: ${l.url}` : ` Lead (not the official site): ${l.url}`;
      else if (l && l.answer === "no") lead = " Web check found no match.";
      lines.push(`- ${p.name}${where}, asked ${p.count}x.${lead}`);
    }
  }
  if (s.thinSpots.length) lines.push("Thin spots to build out: " + s.thinSpots.map((t) => `${t.spot} (${t.count})`).join(", ") + ".");
  if (s.weatherLeans.rain || s.weatherLeans.heat) lines.push(`Plans leaned indoors for weather: ${(s.weatherLeans.rain || 0)} rain, ${(s.weatherLeans.heat || 0)} heat.`);
  lines.push("Leads are web pages to check, not facts. Add a place only after checking its official site.");
  return lines.join("\n").replace(/[—–]/g, ",").slice(0, 6000);
}
