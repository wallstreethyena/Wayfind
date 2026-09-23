"use client";
// lib/accountDelete.js — client side of in-app account deletion (Apple App
// Store guideline 5.1.1(v)). Imported LAZILY from app/home.js, only once the
// user has typed the confirmation phrase in the Account sheet — deletion is
// a rare, user-initiated action, so this has no business sitting in the
// always-loaded bundle. Owner: Gabe, 2026-09-23.
import { isNative, nativeAppleCredential } from "./native";

function hasAppleIdentity(user) {
  try {
    if (user && Array.isArray(user.identities) && user.identities.some((i) => i && i.provider === "apple")) return true;
    const providers = user && user.app_metadata && user.app_metadata.providers;
    if (Array.isArray(providers) && providers.includes("apple")) return true;
  } catch {}
  return false;
}

// Everything the deletion route removed server side is also cleared here so
// a returning session on this device does not resurrect it — favorites,
// likes, dislikes, shares, local taste signal, the auth log, any recorded
// push token, custom lists (which is where Favorites itself actually lives,
// see "wayfind_lists" below), and the user's own tips/votes/reservations.
// Deliberately NOT cleared: wf_device (the anonymous device id — clearing it
// on deletion would only make the NEXT signed-out visit look like a new
// device, which helps nobody), wf_optout, and the intro/onboarding
// "seen" flags.
const PERSONAL_STORAGE_KEYS = [
  "wf_fav_base", "wf_liked_base", "wf_disliked_base", "wf_shared_base",
  "wf_liked", "wf_liked_items", "wf_disliked", "wf_disliked_items", "wf_shared_items",
  "wf_taste_local", "wf_authlog", "wf_push_token",
  "wayfind_lists", "wf_reservations", "wf_place_comments", "wf_place_notes",
  "wf_hook_likes", "wf_drive_votes",
];

/**
 * Deletes the signed-in user's Wayfind account and data. Never throws — every
 * failure comes back as { ok: false, error }, so the caller can always show
 * the person something and decide whether to keep them signed in.
 */
export async function deleteAccount({ supabase, user, deviceId }) {
  if (!supabase || !user) return { ok: false, error: "You are not signed in." };

  // Best effort: get a fresh Apple authorization code so the server can
  // revoke the Sign in with Apple grant. A cancel or failure here must not
  // block deletion — it only means Apple cannot be told to revoke.
  let appleAuthorizationCode = null;
  if (isNative() && hasAppleIdentity(user)) {
    try {
      const cred = await nativeAppleCredential();
      appleAuthorizationCode = (cred && cred.profile && cred.profile.authorizationCode) || null;
    } catch {
      appleAuthorizationCode = null;
    }
  }

  let accessToken = null;
  try {
    const { data } = await supabase.auth.getSession();
    accessToken = (data && data.session && data.session.access_token) || null;
  } catch {}
  if (!accessToken) return { ok: false, error: "Your session expired. Please sign in again and retry." };

  let response;
  try {
    response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + accessToken },
      body: JSON.stringify({
        confirm: "delete",
        deviceId: deviceId || undefined,
        appleAuthorizationCode: appleAuthorizationCode || undefined,
      }),
    });
  } catch {
    return { ok: false, error: "Could not reach Wayfind. Check your connection and try again." };
  }

  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || !payload || payload.ok !== true) {
    return { ok: false, error: "Could not delete your account. Please try again." };
  }

  // A server side sign out would itself fail once the account no longer
  // exists (there is nothing left on the server to invalidate) — scope:
  // "local" clears only this device's stored session, which is all that is
  // left to clear.
  try { await supabase.auth.signOut({ scope: "local" }); } catch {}

  for (const key of PERSONAL_STORAGE_KEYS) {
    try { localStorage.removeItem(key); } catch {}
  }

  return { ok: true };
}
