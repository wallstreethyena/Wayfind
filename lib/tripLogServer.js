// lib/tripLogServer.js — server side of "Log your visit".
//
// Every function takes an injected fetch so scripts/test-trip-log-route.mjs can
// drive the whole flow with no network. Reads of a member's own rewards go out
// with THAT member's token, so row level security, not this code, decides what
// comes back. The one write goes through public.wf_log_visit with the service
// role after the session and the place have been checked here.
import { validateTripLog, verifyVisit, intelCount, logErrorFor, rewardsSummary, tierFor, badgesFor } from "./rewards.js";

function cleanUrl(raw) {
  const s = String(raw || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  if (!s) return "";
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  return /^https:\/\//i.test(s) ? s : "https://" + s;
}

/** null when configuration is missing: the route answers 503, loudly, never a fake empty state. */
export function tripLogEnv(env = process.env) {
  const url = cleanUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const service = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anon = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(url) || service.length < 20 || anon.length < 20) return null;
  return { url, service, anon };
}

export function bearerFrom(req) {
  const m = String((req && req.headers && req.headers.get("authorization")) || "").match(/^Bearer\s+(\S{20,})$/i);
  return m ? m[1] : null;
}

/** The verified member, or null. Anonymous sessions do not count. */
export async function verifiedMember(cfg, token, fetchImpl = fetch) {
  if (!token) return null;
  try {
    const r = await fetchImpl(cfg.url + "/auth/v1/user", {
      headers: { apikey: cfg.anon, Authorization: "Bearer " + token },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || !/^[0-9a-f-]{36}$/i.test(String(u.id || "")) || u.is_anonymous === true) return null;
    return { id: String(u.id) };
  } catch {
    return null;
  }
}

// A missing coordinate stays null: Number(null) is 0, and (0, 0) must never be
// a place a device can be "near".
function coords(row) {
  const num = (v) => (v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const lat = num(row.lat), lng = num(row.lng);
  return lat === null || lng === null ? { lat: null, lng: null } : { lat, lng };
}

const svcHeaders = (cfg, extra = {}) => ({ apikey: cfg.service, Authorization: "Bearer " + cfg.service, ...extra });

/**
 * The place or event being logged, with coordinates for the distance check.
 * A place must be in our inventory, not excluded, and OPERATIONAL (a missing
 * status counts as open, as everywhere else on the site). An event must exist,
 * not be cancelled or postponed, and have started by the visit date.
 */
export async function loggableTarget(cfg, refKind, refId, visitedOn, fetchImpl = fetch) {
  try {
    if (refKind === "place") {
      const r = await fetchImpl(`${cfg.url}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(refId)}&select=place_id,name,lat,lng,status,excluded&limit=1`, { headers: svcHeaders(cfg), cache: "no-store" });
      if (!r.ok) return { ok: false, status: 502 };
      const row = (await r.json())[0];
      if (!row || row.place_id !== refId || row.excluded === true) return { ok: false, status: 404 };
      const st = String(row.status || "OPERATIONAL").toUpperCase();
      if (st !== "OPERATIONAL") return { ok: false, status: 410 };
      return { ok: true, ...coords(row) };
    }
    // event_id or slug; the value is already limited to [A-Za-z0-9_:.-] and is
    // quoted so a dot or colon cannot change the filter.
    const q = encodeURIComponent(`(event_id.eq."${refId}",slug.eq."${refId}")`);
    const r = await fetchImpl(`${cfg.url}/rest/v1/wf_events?or=${q}&select=event_id,slug,lat,lng,start_date,end_date,event_status&limit=1`, { headers: svcHeaders(cfg), cache: "no-store" });
    if (!r.ok) return { ok: false, status: 502 };
    const row = (await r.json())[0];
    if (!row || (String(row.event_id) !== refId && String(row.slug) !== refId)) return { ok: false, status: 404 };
    const es = String(row.event_status || "").toLowerCase();
    // Allow list (live statuses 2026-11-25: scheduled, completed, cancelled,
    // postponed, paused, unannounced). Only an event that is or was on can be visited.
    if (!["", "scheduled", "completed", "sold_out"].includes(es)) return { ok: false, status: 410 };
    if (row.start_date && String(row.start_date) > visitedOn) return { ok: false, status: 409, code: "not_started" };
    if (row.end_date && String(row.end_date) < visitedOn) return { ok: false, status: 409, code: "ended" };
    return { ok: true, ...coords(row) };
  } catch {
    return { ok: false, status: 502 };
  }
}

export async function readOwnRewards(cfg, token, fetchImpl = fetch) {
  const h = { apikey: cfg.anon, Authorization: "Bearer " + token };
  const [pr, lr] = await Promise.all([
    fetchImpl(`${cfg.url}/rest/v1/wf_rewards_profile?select=points,visits,verified_visits,intel_visits,event_visits,distinct_refs,giveaway_month,giveaway_entries&limit=1`, { headers: h, cache: "no-store" }),
    fetchImpl(`${cfg.url}/rest/v1/wf_trip_logs?select=ref_kind,ref_id,visited_on,verification&order=created_at.desc&limit=20`, { headers: h, cache: "no-store" }),
  ]);
  if (!pr.ok || !lr.ok) return null;
  const profile = (await pr.json())[0] || null;
  const logs = await lr.json();
  return { profile, logs: Array.isArray(logs) ? logs : [] };
}

export function monthOf(todayStr) {
  return String(todayStr || "").slice(0, 7);
}

/** POST body handling. Returns { status, body }. */
export async function handleTripLog({ cfg, token, body, todayStr, fetchImpl = fetch, env }) {
  if (!cfg) return { status: 503, body: { ok: false, code: "unconfigured", error: "Visit logging is not available right now." } };
  const member = await verifiedMember(cfg, token, fetchImpl);
  if (!member) return { status: 401, body: { ok: false, code: "sign_in", error: "Sign in to log your visit." } };
  const v = validateTripLog(body, todayStr);
  if (!v.ok) return { status: 400, body: { ok: false, code: "invalid", error: v.error } };
  const target = await loggableTarget(cfg, v.value.refKind, v.value.refId, v.value.visitedOn, fetchImpl);
  if (!target.ok) {
    const msg = target.status === 404 ? "We could not find that spot." : target.status === 410 ? "This spot is not open, so visits cannot be logged." : target.code === "not_started" ? "This event had not started on that date." : target.code === "ended" ? "This event had already ended on that date." : "We could not check that spot. Please try again.";
    return { status: target.status === 502 ? 502 : target.status, body: { ok: false, code: target.code || "target", error: msg } };
  }
  // The position check only means something for a visit happening now: a
  // back dated log is always self reported, whatever position comes with it.
  const ver = verifyVisit(v.value.visitedOn === todayStr ? v.device : null, target);
  const rpc = await fetchImpl(`${cfg.url}/rest/v1/rpc/wf_log_visit`, {
    method: "POST",
    headers: svcHeaders(cfg, { "content-type": "application/json" }),
    cache: "no-store",
    body: JSON.stringify({
      p_user_id: member.id,
      p_ref_kind: v.value.refKind,
      p_ref_id: v.value.refId,
      p_visited_on: v.value.visitedOn,
      p_verification: ver.verification,
      p_distance_band: ver.distance_band,
      p_crowd: v.value.crowd,
      p_vibe: v.value.vibe,
      p_best_time: v.value.bestTime,
      p_wait: v.value.wait,
    }),
  });
  if (!rpc.ok) {
    let msg = "";
    try { const j = await rpc.json(); msg = (j && (j.message || j.hint || j.details)) || ""; } catch {}
    const e = logErrorFor(msg);
    return { status: e.status, body: { ok: false, code: e.code, error: e.error } };
  }
  const out = await rpc.json();
  const profile = out && out.profile ? out.profile : null;
  // Keep the stored tier and badges in step with the rules in lib/rewards.js.
  // Best effort: the drawer recomputes from the counters on every read anyway.
  if (profile) {
    try {
      await fetchImpl(`${cfg.url}/rest/v1/wf_rewards_profile?user_id=eq.${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: svcHeaders(cfg, { "content-type": "application/json", Prefer: "return=minimal" }),
        cache: "no-store",
        body: JSON.stringify({ tier: tierFor(profile.points).id, badges: badgesFor(profile) }),
      });
    } catch {}
  }
  return {
    status: 200,
    body: {
      ok: true,
      verification: ver.verification,
      pointsAwarded: Number(out && out.points_awarded) || 0,
      intel: intelCount(v.value),
      rewards: rewardsSummary(profile, { monthStr: monthOf(todayStr), env }),
    },
  };
}

/** GET handling: the member's own status and recent visits. */
export async function handleRewardsRead({ cfg, token, todayStr, fetchImpl = fetch, env }) {
  if (!cfg) return { status: 503, body: { ok: false, code: "unconfigured", error: "Rewards are not available right now." } };
  const member = await verifiedMember(cfg, token, fetchImpl);
  if (!member) return { status: 401, body: { ok: false, code: "sign_in", error: "Sign in to see your rewards." } };
  const own = await readOwnRewards(cfg, token, fetchImpl);
  if (!own) return { status: 502, body: { ok: false, code: "unavailable", error: "We could not load your rewards. Please try again." } };
  return {
    status: 200,
    body: {
      ok: true,
      rewards: rewardsSummary(own.profile, { monthStr: monthOf(todayStr), env }),
      recent: own.logs.map((l) => ({ refKind: l.ref_kind, refId: l.ref_id, visitedOn: l.visited_on, verified: l.verification === "nearby" })),
    },
  };
}
