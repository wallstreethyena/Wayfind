// lib/tripLogClient.js — browser calls for "Log your visit" and the rewards
// drawer. The bearer comes from the member's live Supabase session; nothing is
// cached in localStorage. Device position is asked for only when the member
// taps "I'm here now" and is sent once, for the distance check, never stored.
import { supabase } from "./supabase";

/** The live session bearer, or null. Shared by the community, leaderboard and push calls. */
export async function memberBearer() {
  return bearer();
}

async function bearer() {
  try {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const t = data && data.session && data.session.access_token;
    return t || null;
  } catch {
    return null;
  }
}

function offline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const OFFLINE = { ok: false, code: "offline", error: "You are offline. Try again when you are back online." };
const SIGNED_OUT = { ok: false, code: "sign_in", error: "Sign in to log visits and earn badges." };

async function call(method, body) {
  if (offline()) return OFFLINE;
  const t = await bearer();
  if (!t) return SIGNED_OUT;
  try {
    const r = await fetch("/api/trip-log", {
      method,
      headers: { Authorization: "Bearer " + t, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    let j = null;
    try { j = await r.json(); } catch {}
    if (j && typeof j === "object") return j;
    return { ok: false, code: "unavailable", error: "Something went wrong. Please try again." };
  } catch {
    return offline() ? OFFLINE : { ok: false, code: "network", error: "We could not reach Wayfind. Please try again." };
  }
}

export function fetchRewards() {
  return call("GET");
}

export function submitTripLog(body) {
  return call("POST", body);
}

/** One position read, high accuracy off, 8s cap. Resolves null on refusal or error. */
export function devicePosition(geo = typeof navigator !== "undefined" ? navigator.geolocation : null) {
  return new Promise((resolve) => {
    if (!geo || typeof geo.getCurrentPosition !== "function") return resolve(null);
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), 9000);
    try {
      geo.getCurrentPosition(
        (p) => { clearTimeout(timer); finish(p && p.coords ? { lat: p.coords.latitude, lng: p.coords.longitude } : null); },
        () => { clearTimeout(timer); finish(null); },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
      );
    } catch { clearTimeout(timer); finish(null); }
  });
}

export const REWARDS_OPEN_EVENT = "wf:rewards-open";
export function openRewardsDrawer() {
  try { window.dispatchEvent(new CustomEvent(REWARDS_OPEN_EVENT)); } catch {}
}
