// lib/leaderboard.js — the community leaderboard (owner order 2026-11-27).
//
// Who appears: only members who switched the leaderboard on AND picked a public
// name. Nothing else about them is shown: no photo, no city, no visit list.
// What ranks them: this month's points from the rewards ledger, which the trip
// log rules already cap (8 logs a day, one per place a week) plus at most 3
// published guides a month (public.wf_award_guide). Ties go to the member with
// more visits logged on the spot.
//
// A public name is checked three ways before it is saved: a character and
// length rule (the same as the database check), a short blocklist of words
// that would make a name pose as Wayfind staff, and OpenAI moderation. A name
// that cannot be checked is not saved.
import { moderateText, takeUserGrant } from "./aiEngine.js";
import { verifiedMember } from "./tripLogServer.js";

export const NAME_RX = /^[A-Za-z0-9][A-Za-z0-9 ._'-]*[A-Za-z0-9]$/;
const RESERVED = /\b(wayfind|admin|moderator|official|staff|support|gabe|gabriel|santa|boo)\b/i;

export function validatePublicName(raw) {
  const name = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 24) return { ok: false, error: "Pick a name from 2 to 24 characters." };
  if (!NAME_RX.test(name)) return { ok: false, error: "Use letters, numbers, spaces, dots, apostrophes or dashes." };
  if (RESERVED.test(name)) return { ok: false, error: "That name is reserved. Try another one." };
  if (/[@]|https?:|www\./i.test(name) || /\d{6,}/.test(name)) return { ok: false, error: "Names cannot include contact details." };
  return { ok: true, name };
}

export function monthStr(todayStr) {
  return String(todayStr || "").slice(0, 7);
}

const svc = (cfg, extra = {}) => ({ apikey: cfg.service, Authorization: "Bearer " + cfg.service, ...extra });

export async function readLeaderboard(cfg, todayStr, fetchImpl = fetch) {
  if (!cfg) return null;
  try {
    const r = await fetchImpl(`${cfg.url}/rest/v1/rpc/wf_leaderboard`, {
      method: "POST",
      headers: svc(cfg, { "content-type": "application/json" }),
      body: JSON.stringify({ p_month: monthStr(todayStr), p_limit: 25 }),
      next: { revalidate: 300 },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map((x) => ({
      rank: Number(x.rank) || 0,
      name: String(x.public_name || ""),
      tier: String(x.tier || "local_scout"),
      points: Number(x.points) || 0,
      verified: Number(x.verified_visits) || 0,
      guides: Number(x.guides_published) || 0,
    })).filter((x) => x.name);
  } catch {
    return null;
  }
}

/** The member's own leaderboard settings. */
export async function readOwnSettings(cfg, token, fetchImpl = fetch) {
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_rewards_profile?select=public_name,leaderboard_opt_in&limit=1`, { headers: { apikey: cfg.anon, Authorization: "Bearer " + token }, cache: "no-store" });
  if (!r.ok) return null;
  const row = ((await r.json()) || [])[0] || {};
  return { publicName: row.public_name || null, optIn: row.leaderboard_opt_in === true };
}

/** POST { optIn, publicName }. Returns { status, body }. */
export async function saveSettings({ cfg, token, body, fetchImpl = fetch, deps = {} }) {
  if (!cfg) return { status: 503, body: { ok: false, code: "unconfigured", error: "The leaderboard is not available right now." } };
  const member = await verifiedMember(cfg, token, fetchImpl);
  if (!member) return { status: 401, body: { ok: false, code: "sign_in", error: "Sign in to join the leaderboard." } };
  const b = body && typeof body === "object" ? body : {};
  const optIn = b.optIn === true;
  const patch = { leaderboard_opt_in: optIn, updated_at: new Date().toISOString() };
  if (b.publicName !== undefined) {
    if (b.publicName === null || String(b.publicName).trim() === "") {
      patch.public_name = null;
    } else {
      const v = validatePublicName(b.publicName);
      if (!v.ok) return { status: 400, body: { ok: false, code: "invalid_name", error: v.error } };
      const grant = deps.takeUserGrant || takeUserGrant;
      if (!(await grant(member.id, "name_check"))) return { status: 429, body: { ok: false, code: "rate_limited", error: "Too many name changes today. Try again tomorrow." } };
      const mod = await (deps.moderateText || moderateText)(v.name);
      if (!mod || !mod.ok) return { status: 503, body: { ok: false, code: "unchecked", error: "We could not check that name right now. Please try again later." } };
      if (mod.flagged) return { status: 400, body: { ok: false, code: "invalid_name", error: "That name is not allowed. Try another one." } };
      patch.public_name = v.name;
    }
  }
  if (optIn && patch.public_name === null) return { status: 400, body: { ok: false, code: "need_name", error: "Pick a public name to join the leaderboard." } };
  // Make sure the row exists, then patch it (service role; the member was verified above).
  await fetchImpl(`${cfg.url}/rest/v1/wf_rewards_profile?on_conflict=user_id`, {
    method: "POST",
    headers: svc(cfg, { "content-type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify({ user_id: member.id }),
    cache: "no-store",
  });
  if (optIn && patch.public_name === undefined) {
    const own = await readOwnSettings(cfg, token, fetchImpl);
    if (!own || !own.publicName) return { status: 400, body: { ok: false, code: "need_name", error: "Pick a public name to join the leaderboard." } };
  }
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_rewards_profile?user_id=eq.${member.id}`, {
    method: "PATCH",
    headers: svc(cfg, { "content-type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (r.status === 409) return { status: 409, body: { ok: false, code: "taken", error: "That name is taken. Try another one." } };
  if (!r.ok) {
    let msg = "";
    try { const j = await r.json(); msg = String((j && (j.code || j.message)) || ""); } catch {}
    if (/23505|duplicate|unique/i.test(msg)) return { status: 409, body: { ok: false, code: "taken", error: "That name is taken. Try another one." } };
    return { status: 502, body: { ok: false, code: "unavailable", error: "We could not save that. Please try again." } };
  }
  const row = ((await r.json()) || [])[0] || {};
  return { status: 200, body: { ok: true, publicName: row.public_name || null, optIn: row.leaderboard_opt_in === true } };
}
