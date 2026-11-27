// lib/dailyPicks.js — the one personalized pick a day for members who turned
// on Wayfind notifications in their browser (owner order 2026-11-27).
//
// LIMITS (each one enforced here, not only in the UI):
//   - opt in only: a row exists only after the member tapped "Turn on" and
//     their browser granted permission (lib/webPushClient.js enableDailyPicks);
//   - at most ONE a day: last_sent_on is the Eastern calendar day of the last
//     send and the cron runs once a day;
//   - quiet hours: nothing is sent outside 9 AM to 8 PM in the member's own
//     time zone (the cron runs mid morning Eastern; a member whose local clock
//     is outside the window is skipped that day);
//   - no pick, no push: a member with no logged visits and no planned places
//     gets nothing rather than a generic blast;
//   - real places only: the pick is an open, well rated wf_inventory row in
//     the metro the member actually visits or plans, in the category they use
//     most, never one they already logged and never yesterday's pick;
//   - one tap off: the Rewards drawer switch, or the browser's own setting.
//     A push service answering 404/410 deletes the row.
// PERSONAL DATA: the pick is chosen from the member's own Wayfind activity
// (their trip logs and itinerary stops). Nothing is sent to OpenAI, and the
// notification names only the public place.
import { createHash } from "node:crypto";
import { cleanPublicText } from "./aiEngine.js";
import { categoryLabel } from "./communityGuides.js";
import { sendWebPush, vapidFromEnv, isAllowedPushEndpoint } from "./webPush.js";
import { siteHourFloat } from "./nowContext.js";
import { QUIET_START_HOUR, QUIET_END_HOUR } from "./alertPolicy.js";

// Quiet hours have one source, shared with nearby picks: lib/alertPolicy.js.
export { QUIET_START_HOUR, QUIET_END_HOUR };
export const MAX_SUBS_PER_MEMBER = 5;
export const MAX_RECIPIENTS_PER_RUN = 2000;

export function localHour(tz, now = new Date()) {
  // An unknown zone means no send: siteHourFloat would fall back to the
  // server's own clock, which is not the member's.
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return null; }
  const h = Math.floor(siteHourFloat(now, tz));
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
}

export function inSendWindow(tz, now = new Date()) {
  const h = localHour(tz || "America/New_York", now);
  return h !== null && h >= QUIET_END_HOUR && h < QUIET_START_HOUR;
}

/** Most frequent value, ties broken by first seen. */
function mode(values) {
  const c = new Map();
  for (const v of values) if (v) c.set(v, (c.get(v) || 0) + 1);
  let best = null, n = 0;
  for (const [k, v] of c) if (v > n) { best = k; n = v; }
  return best;
}

/**
 * Taste from activity: the member's metro and favourite category, and the
 * places to skip. activityRows: [{ place_id, metro, category }].
 */
export function tasteFrom(activityRows) {
  const rows = (activityRows || []).filter((r) => r && r.metro && !/^city-/.test(r.metro));
  if (!rows.length) return null;
  return {
    metro: mode(rows.map((r) => r.metro)),
    category: mode(rows.map((r) => String(r.category || "").toLowerCase()).filter((c) => ["food", "attractions", "nightlife", "beach", "shopping"].includes(c))) || "food",
    seen: new Set(rows.map((r) => r.place_id)),
  };
}

/** Deterministic daily choice among candidates (same member, same day, same pick). */
export function choosePick(candidates, taste, { userId, dayStr, lastPickRef } = {}) {
  const pool = (candidates || []).filter((c) => c && c.place_id && !taste.seen.has(c.place_id) && c.place_id !== lastPickRef);
  if (!pool.length) return null;
  const h = createHash("sha256").update(String(userId) + "|" + String(dayStr)).digest();
  return pool[h.readUInt32BE(0) % Math.min(pool.length, 12)];
}

export function pickMessage(pick) {
  const area = cleanPublicText(pick.postal_city || pick.locality || "", 40);
  const cat = categoryLabel(pick.category);
  const title = cleanPublicText(area ? `Your pick today in ${area}` : "Your Wayfind pick today", 80);
  const facts = cleanPublicText(pick.editorial || "", 120);
  const body = cleanPublicText(facts ? `${pick.name}. ${facts}` : `${pick.name}. A top rated ${cat.toLowerCase()} spot near where you go.`, 170);
  return { title, body, url: "/p/" + encodeURIComponent(pick.place_id) + "?from=daily_pick", tag: "wf-daily-pick" };
}

// ── I/O ───────────────────────────────────────────────────────────────────
const svc = (cfg, extra = {}) => ({ apikey: cfg.key, Authorization: "Bearer " + cfg.key, ...extra });
async function rjson(r) { try { return await r.json(); } catch { return null; } }

export async function memberActivity(cfg, userId, fetchImpl = fetch) {
  const [lr, ir] = await Promise.all([
    fetchImpl(`${cfg.url}/rest/v1/wf_trip_logs?user_id=eq.${userId}&ref_kind=eq.place&select=ref_id&order=created_at.desc&limit=40`, { headers: svc(cfg), cache: "no-store" }),
    fetchImpl(`${cfg.url}/rest/v1/wf_itinerary_items?user_id=eq.${userId}&kind=eq.place&select=ref_id&order=created_at.desc&limit=40`, { headers: svc(cfg), cache: "no-store" }),
  ]);
  const ids = [...new Set([...(lr.ok ? (await rjson(lr)) || [] : []), ...(ir.ok ? (await rjson(ir)) || [] : [])].map((x) => String(x.ref_id || "").replace(/__day_\d{4}-\d{2}-\d{2}$/, "")).filter((id) => /^[A-Za-z0-9_:.-]{3,200}$/.test(id)))].slice(0, 60);
  if (!ids.length) return [];
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_inventory?place_id=in.(${ids.map((id) => encodeURIComponent(`"${id}"`)).join(",")})&select=place_id,metro,category`, { headers: svc(cfg), cache: "no-store" });
  return r.ok ? (await rjson(r)) || [] : [];
}

export async function pickCandidates(cfg, taste, fetchImpl = fetch) {
  const q = `${cfg.url}/rest/v1/wf_inventory?metro=eq.${encodeURIComponent(taste.metro)}&category=eq.${encodeURIComponent(taste.category)}&excluded=not.is.true&select=place_id,name,category,locality,postal_city,status,editorial,signals&order=signals->rating.desc.nullslast&limit=60`;
  const r = await fetchImpl(q, { headers: svc(cfg), cache: "no-store" });
  if (!r.ok) return [];
  return ((await rjson(r)) || []).filter((p) => String(p.status || "OPERATIONAL").toUpperCase() === "OPERATIONAL" && p.signals && typeof p.signals.rating === "number" && p.signals.rating >= 4.5 && p.name);
}

/**
 * One daily run. Returns counts. `todayStr` is the Eastern day.
 */
export async function runDailyPicks({ cfg, todayStr, env = process.env, now = new Date(), fetchImpl = fetch, send = sendWebPush }) {
  const vapid = vapidFromEnv(env);
  if (!vapid) return { ok: false, reason: "vapid_unconfigured", attempted: 0, sent: 0 };
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_web_push_subscriptions?or=(last_sent_on.is.null,last_sent_on.lt.${todayStr})&fail_count=lt.5&select=id,user_id,endpoint,p256dh,auth,tz,last_pick_ref,fail_count&order=user_id.asc&limit=${MAX_RECIPIENTS_PER_RUN}`, { headers: svc(cfg), cache: "no-store" });
  if (!r.ok) return { ok: false, reason: "read_failed", attempted: 0, sent: 0 };
  const subs = (await rjson(r)) || [];
  const byUser = new Map();
  for (const s of subs) { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); }
  let attempted = 0, sent = 0, skippedQuiet = 0, skippedNoPick = 0, gone = 0, failed = 0;
  for (const [userId, list] of byUser) {
    const open = list.filter((s) => inSendWindow(s.tz, now) && isAllowedPushEndpoint(s.endpoint));
    if (!open.length) { skippedQuiet += list.length; continue; }
    const taste = tasteFrom(await memberActivity(cfg, userId, fetchImpl));
    if (!taste) { skippedNoPick += 1; continue; }
    const pick = choosePick(await pickCandidates(cfg, taste, fetchImpl), taste, { userId, dayStr: todayStr, lastPickRef: open[0].last_pick_ref });
    if (!pick) { skippedNoPick += 1; continue; }
    const msg = pickMessage(pick);
    for (const s of open) {
      attempted += 1;
      const res = await send({ subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload: msg, vapid, ttl: 6 * 3600, urgency: "normal", topic: "daily-pick", fetchImpl });
      if (res && res.ok) {
        sent += 1;
        await fetchImpl(`${cfg.url}/rest/v1/wf_web_push_subscriptions?id=eq.${s.id}`, { method: "PATCH", headers: svc(cfg, { "content-type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ last_sent_on: todayStr, last_pick_ref: pick.place_id, fail_count: 0, updated_at: new Date().toISOString() }), cache: "no-store" });
      } else if (res && res.gone) {
        gone += 1;
        await fetchImpl(`${cfg.url}/rest/v1/wf_web_push_subscriptions?id=eq.${s.id}`, { method: "DELETE", headers: svc(cfg, { Prefer: "return=minimal" }), cache: "no-store" });
      } else {
        failed += 1;
        // Mark the day as used so a flaky push service cannot cause a second send today.
        await fetchImpl(`${cfg.url}/rest/v1/wf_web_push_subscriptions?id=eq.${s.id}`, { method: "PATCH", headers: svc(cfg, { "content-type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ last_sent_on: todayStr, fail_count: Math.min(100, (Number(s.fail_count) || 0) + 1), updated_at: new Date().toISOString() }), cache: "no-store" });
      }
    }
  }
  return { ok: true, attempted, sent, skippedQuiet, skippedNoPick, gone, failed };
}
