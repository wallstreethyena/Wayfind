// lib/communityClient.js — browser calls for community guides and the
// leaderboard (owner order 2026-11-27). Same bearer and error shape as
// lib/tripLogClient.js; nothing is cached in localStorage.
import { shareOut } from "./shareOut.js";
import { memberBearer } from "./tripLogClient.js";

async function call(path, method, body) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, code: "offline", error: "You are offline. Try again when you are back online." };
  const t = await memberBearer();
  if (!t && method !== "GET") return { ok: false, code: "sign_in", error: "Sign in first." };
  try {
    const r = await fetch(path, {
      method,
      headers: { ...(t ? { Authorization: "Bearer " + t } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    let j = null;
    try { j = await r.json(); } catch {}
    return j && typeof j === "object" ? j : { ok: false, code: "unavailable", error: "Something went wrong. Please try again." };
  } catch {
    return { ok: false, code: "network", error: "We could not reach Wayfind. Please try again." };
  }
}

export const listMyGuides = () => call("/api/community-guides", "GET");
export const publishMyGuide = (localKey, showAuthor) => call("/api/community-guides", "POST", { localKey, showAuthor: showAuthor === true, consent: true });
export const unpublishMyGuide = (slug) => call("/api/community-guides", "DELETE", { slug });
export const readLeaderboardMe = () => call("/api/leaderboard", "GET");
export const saveLeaderboard = (optIn, publicName) => call("/api/leaderboard", "POST", { optIn: optIn === true, ...(publicName !== undefined ? { publicName } : {}) });

/**
 * Share through Wayfind's one share sheet (lib/shareOut.js): text message,
 * email, copy link or the phone's own share sheet, each an explicit tap.
 * Nothing is sent or copied until the member picks. Returns { how } where how
 * is "chooser", "native" or "failed".
 */
export function shareLink({ url, title, text }, onCopied) {
  return { how: shareOut({ url, title, text }, onCopied) };
}
