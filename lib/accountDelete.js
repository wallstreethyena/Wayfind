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

// The Supabase identity row for "apple", if the account has one. Its `id`
// (or, on older rows, identity_data.sub) is Apple's own subject id for this
// person — the thing to compare a fresh credential's identity token against.
function userAppleIdentityId(user) {
  try {
    const identities = (user && user.identities) || [];
    const identity = identities.find((i) => i && i.provider === "apple");
    if (!identity) return null;
    return identity.id || (identity.identity_data && identity.identity_data.sub) || null;
  } catch {
    return null;
  }
}

// Decodes a JWT's payload without verifying the signature — client side,
// this is only ever compared against Supabase's own record of the SAME
// account's Apple identity id, never trusted as an authentication decision.
function jwtSub(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = typeof atob === "function" ? atob(b64 + pad) : "";
    const payload = JSON.parse(json);
    return typeof (payload && payload.sub) === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// True for the one Apple error that must ABORT deletion entirely: the person
// dismissed the native Sign in with Apple sheet. AppleSignInPlugin.swift
// rejects that case with code APPLE_SIGN_IN_CANCELLED; the message check is a
// fallback for any path that only carries a human-readable string. Every
// OTHER Apple error (network, APPLE_SIGN_IN_BUSY, a missing identity token)
// must NOT stop deletion — it only means the server cannot revoke the Apple
// grant, which deleteAccount already treats as best effort.
function isAppleCancel(err) {
  const code = err && err.code;
  const message = err && typeof err.message === "string" ? err.message : "";
  return code === "APPLE_SIGN_IN_CANCELLED" || /cancel/i.test(message);
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
  // revoke the Sign in with Apple grant. A FAILURE here (network, a missing
  // token, Apple's sheet busy) must not block deletion — it only means Apple
  // cannot be told to revoke. A CANCEL is different: the person was shown
  // Apple's own sheet and backed out, so deletion itself must stop here,
  // never fall through to the server call as if nothing happened.
  let appleAuthorizationCode = null;
  if (isNative() && hasAppleIdentity(user)) {
    try {
      const cred = await nativeAppleCredential();
      const code = (cred && cred.profile && cred.profile.authorizationCode) || null;
      if (code) {
        // Send the code only when the identity token Apple just issued is
        // for the SAME Apple account this Supabase user is linked to — a
        // mismatched code would ask Apple to revoke a different person's
        // grant. `still proceed` per spec: a mismatch degrades to no code,
        // it never aborts deletion the way a cancel does.
        const tokenSub = jwtSub(cred && cred.token);
        const identitySub = userAppleIdentityId(user);
        appleAuthorizationCode = (tokenSub && identitySub && tokenSub === identitySub) ? code : null;
      }
    } catch (e) {
      if (isAppleCancel(e)) return { ok: false, error: "Deletion cancelled." };
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
