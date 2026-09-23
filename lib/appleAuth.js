// lib/appleAuth.js — Sign in with Apple server credentials (token exchange +
// revoke). Server only; never import this from client code.
//
// WHY THIS EXISTS. Apple App Store guideline 5.1.1(v) requires an account
// deletion flow that also offers to revoke the user's Sign in with Apple
// grant, not just sign them out locally. Revoking requires calling Apple's
// OAuth endpoints authenticated as OUR app, and Apple does that with a
// short-lived ES256 JWT ("client secret") signed by a Sign in with Apple
// private key registered in App Store Connect — see
// https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
// This module builds that JWT and calls the two endpoints the deletion route
// needs. Owner: Gabe, 2026-09-23.
//
// FAIL SOFT BY DESIGN, LIKE lib/jobPulse.js. appleConfigured() never throws;
// every other export throws a plain Error on failure so the caller (the
// deletion route) can catch it and record "apple: failed" without aborting
// the rest of the deletion. Nothing here ever logs a token, a code, or the
// signed JWT itself.

import { sign, createPrivateKey } from "node:crypto";

const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const AUD = "https://appleid.apple.com";
// Apple requires the client secret's exp to be at most 6 months out, but the
// only property that matters here is "short lived" — this JWT is minted
// fresh for one request and thrown away, so 5 minutes (300s) is plenty and
// keeps a captured value useless almost immediately.
const CLIENT_SECRET_TTL_SECONDS = 300;

function env(name) {
  return String(process.env[name] || "").trim();
}

function privateKeyPem() {
  const raw = env("APPLE_SIWA_PRIVATE_KEY");
  if (!raw) return "";
  // Most host dashboards cannot store a real multi-line secret, so the PEM
  // commonly arrives with literal backslash-n escapes instead of newlines.
  return raw.indexOf("\\n") >= 0 ? raw.replace(/\\n/g, "\n") : raw;
}

// Falls back to the bundle id used everywhere else in this repo
// (ios/App/App project.pbxproj, capacitor.config.ts) when unset.
export function appleClientId() {
  return env("APPLE_SIWA_CLIENT_ID") || "com.gowayfind.app";
}

/** True only when every Sign in with Apple server credential is present and the private key actually parses. */
export function appleConfigured() {
  if (!env("APPLE_TEAM_ID") || !env("APPLE_SIWA_KEY_ID") || !privateKeyPem()) return false;
  try {
    createPrivateKey(privateKeyPem());
    return true;
  } catch {
    return false;
  }
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Builds the ES256 JWT Apple requires as `client_secret` on /auth/token and
 * /auth/revoke. Throws (never returns a partial secret) when the Sign in
 * with Apple credentials are missing or the key does not parse — callers
 * that want to avoid the exception should check appleConfigured() first.
 */
export function appleClientSecret() {
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_SIWA_KEY_ID");
  const pem = privateKeyPem();
  if (!teamId || !keyId || !pem) throw new Error("Apple Sign in with Apple credentials are not configured");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now, exp: now + CLIENT_SECRET_TTL_SECONDS, aud: AUD, sub: appleClientId() };
  const signingInput = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(payload));
  const key = createPrivateKey(pem);
  // ES256 (JWS) signatures are the fixed-length "IEEE P1363" (r || s) form,
  // not the ASN.1 DER form node's default EC signing produces — dsaEncoding
  // is what makes the output a valid JWS signature Apple will accept.
  const signature = sign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  return signingInput + "." + base64url(signature);
}

/**
 * Exchanges a one-time Apple authorization code (from the native
 * AuthenticationServices sheet) for tokens — notably `refresh_token`, the
 * only token /auth/revoke accepts to durably kill the grant. `fetchImpl` is
 * injectable so tests never touch the real network.
 */
export async function exchangeCode(code, { fetchImpl = fetch } = {}) {
  if (!code) throw new Error("missing Apple authorization code");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: appleClientId(),
    client_secret: appleClientSecret(),
  });
  const r = await fetchImpl(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error("Apple token exchange failed: HTTP " + r.status);
  return json || {};
}

/**
 * Revokes a token at Apple so a deleted Wayfind account cannot be silently
 * reused to sign back in. `hint` is Apple's `token_type_hint`; pass the
 * refresh token (the default hint) when you have one — it revokes the whole
 * grant, not just one access token.
 */
export async function revokeToken(token, hint = "refresh_token", { fetchImpl = fetch } = {}) {
  if (!token) throw new Error("missing Apple token to revoke");
  const body = new URLSearchParams({
    client_id: appleClientId(),
    client_secret: appleClientSecret(),
    token,
    token_type_hint: hint,
  });
  const r = await fetchImpl(REVOKE_URL, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) throw new Error("Apple token revoke failed: HTTP " + r.status);
  return true;
}
