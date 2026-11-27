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
  cleanNotes, notesCacheKey, NOTES_SYSTEM, validateNotesIntent, parsedFromNotes,
  PLAN_DAY_SYSTEM, validatePlanCopy, stopFacts,
} from "../../../lib/planMyDay.js";
import { buildItinerary } from "../../../lib/itineraryBuilderServer.js";
import { GET as siteSearch } from "../search/route.js";
import { GET as christmasBrowseGet } from "../christmas/browse/route.js";

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
      if (hit && hit.v && hit.v.ok) return json({ ...hit.v, cached: true });
      if (limited(clientIp(req))) return json({ ok: false, code: "RATE_LIMITED", message: "One moment, then try again." }, 429);
      const read = await openAiCopy("plan_day", { system: NOTES_SYSTEM, user: JSON.stringify({ today, notes }), json: true, temperature: 0 });
      const intent = validateNotesIntent(read.ok ? read.json : null, today);
      const parsedNotes = parsedFromNotes(notes, intent, today);
      if (parsedNotes.clarify) return json({ ok: false, code: "NEED_CITY", message: parsedNotes.clarify }, 200);
      const built = await buildItinerary(parsedNotes.parsed, { mustInclude: parsedNotes.mustInclude, deps });
      if (!built.ok) return json({ ok: false, code: "NO_PLAN", message: "We could not find enough Wayfind picks for that yet. Try a nearby city or fewer limits." }, 200);
      const out = { ok: true, ...(await writeCopy(built, parsedNotes.parsed.destination.name)) };
      await cset(key, out, PLAN_DAY_CACHE_TTL_MS).catch(() => {});
      return json(out);
    }

    const picks = parsePlanRequest(body, today);
    if (!picks) return json({ ok: false, code: "INVALID_PICKS", message: "Pick a city, a day and a vibe." }, 400);
    const key = planCacheKey(picks);
    const hit = await cget(key).catch(() => null);
    if (hit && hit.v && hit.v.ok) return json({ ...hit.v, cached: true });
    if (limited(clientIp(req))) return json({ ok: false, code: "RATE_LIMITED", message: "One moment, then try again." }, 429);
    const parsed = plannerParsedFor(picks);
    if (!parsed) return json({ ok: false, code: "UNKNOWN_CITY" }, 400);
    const built = await buildItinerary(parsed, { deps });
    if (!built.ok) return json({ ok: false, code: "NO_PLAN", message: "We could not find enough Wayfind picks for that yet. Try another vibe or a nearby city." }, 200);
    const out = { ok: true, ...(await writeCopy(built, `${picks.area.name}, ${picks.vibe.label}`)) };
    await cset(key, out, PLAN_DAY_CACHE_TTL_MS).catch(() => {});
    return json(out);
  } catch {
    return json({ ok: false, code: "UNAVAILABLE", message: "The planner is taking a break. Try again in a minute." }, 200);
  }
}
