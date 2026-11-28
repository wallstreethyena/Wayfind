// app/api/plan-my-day/route.js — the itinerary builder's server (owner,
// 2026-11-27: plan my day that ends in ticket links, grown the same day into
// an interactive itinerary builder that reads pasted travel notes).
//
// Two ways in:
//   { area, when, vibe }  quick picks from fixed lists. One shared cached plan
//                         per area/day/vibe, so a common request costs nothing.
//   { notes }             pasted notes (max 1,200 characters). The deterministic
//                         parser reads them first (lib/plannerParse.js); one
//                         small OpenAI call (lib/planMyDay.js NOTES_SYSTEM)
//                         fills gaps as checked JSON only. Cached by the notes.
// Then lib/itineraryBuilderServer.js builds the plan from real Wayfind places
// and events, and ONE more small OpenAI call writes the short "why" lines
// (validated, lib/planMyDay.js validatePlanCopy). If OpenAI is off, over its
// monthly lane cap, or fails, the plan still returns with Wayfind's own lines.
//
// Right now layer (owner, 2026-11-27: a differentiated experience Google and
// Yelp don't give): today's real forecast for the city (lib/plannerWeather.js)
// leans a rainy or very hot day indoors and says why, and every request that
// Wayfind could not fully answer is logged as a privacy safe gap row
// (lib/plannerGaps.js) for the end of day report. Neither ever blocks a plan.
//
// METERED OpenAI proxy: this path MUST stay in middleware.js's matcher
// (same-origin + per-IP limit). A second, tighter per-IP limit lives here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { siteTodayStr } from "../../../lib/siteTime.js";
import { cget, cset } from "../../../lib/serverCache.js";
import { openAiCopy } from "../../../lib/openAiCopy.js";
import {
  parsePlanRequest, plannerParsedFor, planCacheKey, PLAN_DAY_CACHE_TTL_MS,
  cleanNotes, notesForOpenAi, notesCacheKey, NOTES_SYSTEM, validateNotesIntent, parsedFromNotes,
  PLAN_DAY_SYSTEM, validatePlanCopy, stopFacts,
} from "../../../lib/planMyDay.js";
import { buildItinerary } from "../../../lib/itineraryBuilderServer.js";
import { GET as siteSearch } from "../search/route.js";
import { GET as christmasBrowseGet } from "../christmas/browse/route.js";
import { waitUntil } from "@vercel/functions";
import { fetchForecast, weatherLean, weatherNote, leanParsed } from "../../../lib/plannerWeather.js";
import { gapRow, logGap, uncoveredCityMessage } from "../../../lib/plannerGaps.js";
import { PLAN_SNAPSHOT_TTL_MS, newPlanRef, planSnapshot, planSnapshotKey, reengageConfigured } from "../../../lib/reengageServer.js";

const NO_STORE = { "cache-control": "no-store" };
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6; // fresh plans per visitor per minute; cached answers are cheap but still counted
const buckets = new Map();

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 64) || "anon";
  return (req.headers.get("x-real-ip") || "anon").trim().slice(0, 64);
}
function limited(ip, now = Date.now()) {
  const recent = (buckets.get(ip) || []).filter((t) => t > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) { buckets.set(ip, recent); return true; }
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) buckets.clear(); // bounded memory on a warm lambda
  return false;
}

const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** Store a gap row after the response. Never delays or breaks the visitor. */
function recordGap(row) {
  if (!row) return;
  const p = logGap(row).catch(() => false);
  try { waitUntil(p); } catch { /* local: best effort */ }
}

/** Forecast for the plan's city and dates; never throws. */
async function weatherFor(parsed, today) {
  try {
    const byDate = await fetchForecast(parsed && parsed.destination);
    const w = weatherLean(byDate, parsed && parsed.dates && parsed.dates.days);
    if (!w) return { w: null, parsed, view: null };
    const note = weatherNote(w, parsed.destination && parsed.destination.name, today);
    return { w, parsed: leanParsed(parsed, w), view: { date: w.date, rainPct: w.rainPct, feelsHighF: w.feelsHighF, lean: w.lean, note } };
  } catch {
    return { w: null, parsed, view: null };
  }
}

function stopsIn(itinerary) {
  return ((itinerary && itinerary.days) || []).reduce((n, d) => n + ((d.stops || []).length), 0);
}

/**
 * Re-engagement (PR 1): give an ok answer a planRef and keep a server held
 * snapshot of it for 7 days, so "email me this plan" can send what the SERVER
 * built, never what the browser claims. With the feature OFF (the same
 * reengageConfigured() the email route gates on) the answer goes out unchanged:
 * no planRef, no cache write. The write rides waitUntil so it never delays the
 * response, and a failure here never touches the plan itself.
 * Called only AFTER the shared plan cache is written, so planRef never lands
 * in that shared entry (each response gets its own).
 */
function withPlanRef(out) {
  try {
    if (!reengageConfigured()) return out;
    const snap = planSnapshot(out);
    if (!snap) return out;
    const planRef = newPlanRef();
    const p = cset(planSnapshotKey(planRef), snap, PLAN_SNAPSHOT_TTL_MS).catch(() => {});
    try { waitUntil(p); } catch { /* local: best effort */ }
    return { ...out, planRef };
  } catch {
    return out;
  }
}

/**
 * Strip the private cache field before a cached answer goes out. A cached hit
 * mints a planRef (a 7 day cache write) only with the feature on AND the visitor
 * under the per-IP limit, so a cache hit loop cannot be used to fill the store.
 */
function fromCache(v, ip) {
  const { _gap, ...rest } = v;
  recordGap(_gap || null);
  const out = { ...rest, cached: true };
  if (!reengageConfigured() || limited(ip)) return out;
  return withPlanRef(out);
}

async function writeCopy(result, titleHint) {
  const stops = result.itinerary.days.flatMap((d) => d.stops);
  const extras = result.pool.slice(0, 10);
  const user = JSON.stringify({
    plan: titleHint,
    days: result.itinerary.days.map((d) => ({ date: d.date, stops: d.stops.map((s) => stopFacts({ ...s, slotLabel: s.fixedTime || s.slot, itemType: s.kind })) })),
    alternatives: extras.map((x) => stopFacts({ ...x, itemType: x.kind })),
  });
  const res = await openAiCopy("plan_day", { system: PLAN_DAY_SYSTEM, user, json: true, temperature: 0.5 });
  const copy = validatePlanCopy(res.ok ? res.json : null, stops.map((s) => ({ ...s, itemType: s.kind, slotLabel: s.fixedTime || s.slot })), extras, result.itinerary.title);
  const byId = new Map(copy.stops.map((c) => [c.id, c]));
  const extraById = new Map(extras.map((x) => [x.id, x]));
  return {
    ...result,
    itinerary: {
      ...result.itinerary,
      title: copy.title,
      intro: copy.intro,
      days: result.itinerary.days.map((d) => ({
        ...d,
        stops: d.stops.map((s) => {
          const c = byId.get(s.id);
          return { ...s, why: (c && c.why) || s.why, alt: c && c.altId && extraById.get(c.altId) ? extraById.get(c.altId) : null };
        }),
      })),
    },
    source: copy.source,
  };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ ok: false, code: "INVALID_JSON" }, 400);
    const today = siteTodayStr();
    const deps = { siteSearch, christmasBrowseGet };
    const notes = cleanNotes(body.notes);

    if (notes) {
      const key = notesCacheKey(notes, today);
      const hit = await cget(key).catch(() => null);
      if (hit && hit.v && hit.v.ok) return json(fromCache(hit.v, clientIp(req)));
      if (limited(clientIp(req))) return json({ ok: false, code: "RATE_LIMITED", message: "One moment, then try again." }, 429);
      const aiNotes = notesForOpenAi(notes);
      const read = aiNotes
        ? await openAiCopy("plan_day", { system: NOTES_SYSTEM, user: JSON.stringify({ today, notes: aiNotes }), json: true, temperature: 0 })
        : null;
      const intent = validateNotesIntent(read?.ok ? read.json : null, today);
      const parsedNotes = parsedFromNotes(notes, intent, today);
      if (parsedNotes.clarify) {
        const askedCity = read?.ok && read.json ? read.json.city : null;
        recordGap(gapRow({ mode: "notes", outcome: "NEED_CITY", requestedCity: askedCity }));
        return json({ ok: false, code: "NEED_CITY", message: uncoveredCityMessage(askedCity) || parsedNotes.clarify }, 200);
      }
      const wx = await weatherFor(parsedNotes.parsed, today);
      const built = await buildItinerary(wx.parsed, { mustInclude: parsedNotes.mustInclude, deps });
      if (!built.ok) {
        recordGap(gapRow({ mode: "notes", outcome: "NO_PLAN", parsed: wx.parsed, unmatched: parsedNotes.mustInclude, weatherLean: wx.w && wx.w.lean }));
        return json({ ok: false, code: "NO_PLAN", message: "We could not find enough Wayfind picks for that yet. Try a nearby city or fewer limits." }, 200);
      }
      const out = { ok: true, ...(await writeCopy(built, parsedNotes.parsed.destination.name)), weather: wx.view };
      const gap = gapRow({ mode: "notes", outcome: "OK", parsed: wx.parsed, stopCount: stopsIn(out.itinerary), dayCount: (out.itinerary.days || []).length, unmatched: built.unmatched, weatherLean: wx.w && wx.w.lean });
      recordGap(gap);
      await cset(key, { ...out, _gap: gap }, PLAN_DAY_CACHE_TTL_MS).catch(() => {});
      return json(withPlanRef(out));
    }

    const picks = parsePlanRequest(body, today);
    if (!picks) return json({ ok: false, code: "INVALID_PICKS", message: "Pick a city, a day and a vibe." }, 400);
    const parsed0 = plannerParsedFor(picks);
    if (!parsed0) return json({ ok: false, code: "UNKNOWN_CITY" }, 400);
    const wx = await weatherFor(parsed0, today);
    const key = planCacheKey(picks) + (wx.w && wx.w.lean ? "|w:" + wx.w.lean : "");
    const hit = await cget(key).catch(() => null);
    if (hit && hit.v && hit.v.ok) return json(fromCache(hit.v, clientIp(req)));
    if (limited(clientIp(req))) return json({ ok: false, code: "RATE_LIMITED", message: "One moment, then try again." }, 429);
    const built = await buildItinerary(wx.parsed, { deps });
    if (!built.ok) {
      recordGap(gapRow({ mode: "picks", outcome: "NO_PLAN", parsed: wx.parsed, weatherLean: wx.w && wx.w.lean }));
      return json({ ok: false, code: "NO_PLAN", message: "We could not find enough Wayfind picks for that yet. Try another vibe or a nearby city." }, 200);
    }
    const out = { ok: true, ...(await writeCopy(built, `${picks.area.name}, ${picks.vibe.label}`)), weather: wx.view };
    const gap = gapRow({ mode: "picks", outcome: "OK", parsed: wx.parsed, stopCount: stopsIn(out.itinerary), dayCount: (out.itinerary.days || []).length, weatherLean: wx.w && wx.w.lean });
    recordGap(gap);
    await cset(key, { ...out, _gap: gap }, PLAN_DAY_CACHE_TTL_MS).catch(() => {});
    return json(withPlanRef(out));
  } catch {
    return json({ ok: false, code: "UNAVAILABLE", message: "The planner is taking a break. Try again in a minute." }, 200);
  }
}
