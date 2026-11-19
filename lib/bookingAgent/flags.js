// Three switches, all off unless someone turns each one on.
//   1. BOOKING_AGENT_ENABLED === "1"
//   2. BOOKING_AGENT_SITE_OPENTABLE === "1"
//   3. wf_booking_agent_sites row for opentable has status "on" and is not paused
// A paused_until in the future or status paused/disabled is the kill switch.

import { DEFAULT_MAX_PER_HOUR } from "./constants.js";

export function refusalFor(env = {}, siteRow = null, now = Date.now()) {
  if (String(env.BOOKING_AGENT_ENABLED || "") !== "1") return "refused_flag_off";
  if (String(env.BOOKING_AGENT_SITE_OPENTABLE || "") !== "1") return "refused_flag_off";
  if (!siteRow || siteRow.status === "off" || siteRow.status == null) return "refused_flag_off";
  if (siteRow.status === "paused" || siteRow.status === "disabled") return "refused_kill_switch";
  if (siteRow.paused_until) {
    const until = Date.parse(siteRow.paused_until);
    if (Number.isFinite(until) && until > now) return "refused_kill_switch";
  }
  if (siteRow.status !== "on") return "refused_flag_off";
  return null;
}

/** True only when every switch is on and the site is not paused. */
export function agentEnabled(env = {}, siteRow = null, now = Date.now()) {
  return refusalFor(env, siteRow, now) === null;
}

/** Runs that may launch in the current hour. Unset means 6. A bad value means 0 (refuse), not a silent default. */
export function maxPerHour(env = {}) {
  if (env.BOOKING_AGENT_MAX_PER_HOUR == null || env.BOOKING_AGENT_MAX_PER_HOUR === "") return DEFAULT_MAX_PER_HOUR;
  const n = Number(env.BOOKING_AGENT_MAX_PER_HOUR);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 0;
}
