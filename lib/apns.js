// lib/apns.js — Apple Push Notification service (APNs) provider, server only.
//
// OWNER INTENT (Gabe, 2026-09-23). Wayfind's push-notification launch feature
// is "Weekend Picks Near You" (app/api/cron/weekend-picks). Before that can
// send a single real notification, something has to hold an APNs provider
// token and speak the HTTP/2 protocol Apple requires. This module is that,
// and nothing else — it does not decide WHO gets a push or WHEN; the caller
// (a cron route, a test route) owns that decision and this module only
// delivers what it is handed.
//
// DEPENDENCY-FREE ON PURPOSE. node:http2 does everything the APNs HTTP/2 API
// needs (a signed provider JWT in the Authorization header, one POST per
// device token) and node:crypto signs that JWT — no npm dependency pulls in
// its own APNs client, its own JWT library, or its own HTTP/2 pool. Per
// CLAUDE.md, no new dependency was added for this.
//
// TOKEN-BASED AUTH ONLY (the modern, non-expiring-certificate path). The
// provider token is an ES256 JWT: header {alg:"ES256", kid: APNS_KEY_ID},
// claims {iss: APNS_TEAM_ID, iat: now}. Apple accepts a token for up to 60
// minutes; this caches for ~50 so a run that spans the boundary always signs
// a fresh one before Apple would reject it, without re-signing on every send.
//
// NEVER LOG A TOKEN OR A KEY. Not the device token, not the provider JWT, not
// the private key material — a log line is not a secret store and this file
// is not the place that decides how loudly a failure gets reported (the
// caller is).
import { createPrivateKey, createSign } from "node:crypto";
import http2 from "node:http2";

const APNS_HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

// A device token whose response says it will NEVER accept another push to
// this app install — remove it, or every future send pays the round trip to
// be told the same thing again. `Reason: 410` (Gone) is the HTTP-status form
// of the same fact and is checked alongside these.
const INVALID_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

const TOKEN_TTL_MS = 50 * 60 * 1000; // Apple allows 60; refresh at 50 for headroom.
const DEFAULT_TIMEOUT_MS = 10000;

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Vercel/most env UIs cannot hold a real newline in a .p8 PEM, so the stored
// value carries literal backslash-n escapes. Accept either form.
function normalizePem(raw) {
  return String(raw == null ? "" : raw).trim().replace(/\\n/g, "\n");
}

function apnsEnv() {
  return String(process.env.APNS_ENV ?? "production").trim().toLowerCase();
}

function apnsHost() {
  return APNS_HOSTS[apnsEnv()] ?? APNS_HOSTS.production;
}

function apnsTopic() {
  const topic = String(process.env.APNS_TOPIC ?? "").trim();
  return topic || "com.gowayfind.app";
}

/** True once the three credentials APNs sign-in needs are all present. */
export function apnsConfigured() {
  return Boolean(
    String(process.env.APNS_TEAM_ID || "").trim() &&
    String(process.env.APNS_KEY_ID || "").trim() &&
    normalizePem(process.env.APNS_AUTH_KEY)
  );
}

let cachedToken = null; // { token, signedAt }

/**
 * The signed ES256 provider JWT APNs expects in the `authorization: bearer
 * <token>` header on every request. Cached for TOKEN_TTL_MS so a batch of
 * sends signs once, not once per device.
 *
 * Throws if APNs is not configured — callers check apnsConfigured() first
 * and degrade explicitly (jobCannotRun / 503), the same contract every other
 * provider in this repo follows; this function does not swallow that.
 */
export function providerToken() {
  const now = Date.now();
  if (cachedToken && now - cachedToken.signedAt < TOKEN_TTL_MS) return cachedToken.token;

  const teamId = String(process.env.APNS_TEAM_ID || "").trim();
  const keyId = String(process.env.APNS_KEY_ID || "").trim();
  const pem = normalizePem(process.env.APNS_AUTH_KEY);
  if (!teamId || !keyId || !pem) throw new Error("APNs is not configured (APNS_TEAM_ID/APNS_KEY_ID/APNS_AUTH_KEY)");

  const header = { alg: "ES256", kid: keyId };
  const claims = { iss: teamId, iat: Math.floor(now / 1000) };
  const signingInput =
    base64url(Buffer.from(JSON.stringify(header))) + "." + base64url(Buffer.from(JSON.stringify(claims)));

  const key = createPrivateKey(pem);
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // "ieee-p1363" is the raw r||s concatenation JWT's ES256 requires. Node's
  // DER default would produce a signature Apple rejects outright.
  const signature = signer.sign({ key, dsaEncoding: "ieee-p1363" });

  const token = signingInput + "." + base64url(signature);
  cachedToken = { token, signedAt: now };
  return token;
}

function buildApnsPayload({ title, body, url, badge }) {
  const aps = { alert: { title: String(title || ""), body: String(body || "") }, sound: "default" };
  if (Number.isFinite(badge)) aps.badge = badge;
  const payload = { aps };
  if (url) payload.url = url;
  return payload;
}

/** True when the given send result means the token will never work again. */
export function isInvalidPushResult(result) {
  if (!result) return false;
  if (result.status === 410) return true;
  return Boolean(result.reason && INVALID_REASONS.has(result.reason));
}

// One request on an already-open HTTP/2 session. Shared by sendPush (which
// owns a one-shot session) and sendPushBatch (which owns one session for the
// whole run) so the wire behaviour — headers, payload shape, timeout — never
// drifts between the two call shapes.
function sendOnSession(session, token, payload, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };

    const headers = {
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`,
      "apns-topic": apnsTopic(),
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
    };
    if (payload.collapseId) headers["apns-collapse-id"] = payload.collapseId;

    let req;
    try {
      req = session.request(headers);
    } catch (err) {
      finish({ ok: false, status: 0, reason: "RequestError", apnsId: null });
      return;
    }

    const timer = setTimeout(() => {
      try { req.close && req.close(); } catch (e) {}
      finish({ ok: false, status: 0, reason: "Timeout", apnsId: null });
    }, timeoutMs);

    let status = 0;
    let apnsId = null;
    let raw = "";
    req.on("response", (h) => {
      status = h[":status"] || 0;
      apnsId = h["apns-id"] || null;
    });
    try { req.setEncoding && req.setEncoding("utf8"); } catch (e) {}
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      clearTimeout(timer);
      let reason = null;
      if (raw) {
        try { reason = JSON.parse(raw).reason || null; } catch (e) {}
      }
      finish({ ok: status === 200, status, reason, apnsId });
    });
    req.on("error", () => {
      clearTimeout(timer);
      finish({ ok: false, status: 0, reason: "RequestError", apnsId: null });
    });

    try {
      req.end(JSON.stringify(buildApnsPayload(payload)));
    } catch (err) {
      clearTimeout(timer);
      finish({ ok: false, status: 0, reason: "RequestError", apnsId: null });
    }
  });
}

/**
 * Send one push. Opens its own HTTP/2 session and closes it — for more than
 * a handful of sends use sendPushBatch, which reuses one session.
 *
 * @returns {Promise<{ok:boolean, status:number, reason:string|null, apnsId:string|null}>}
 */
export async function sendPush(
  { token, title, body, url, collapseId, badge } = {},
  { connect = http2.connect, timeoutMs = DEFAULT_TIMEOUT_MS, host } = {}
) {
  const deviceToken = String(token || "").trim();
  if (!deviceToken) return { ok: false, status: 0, reason: "MissingToken", apnsId: null };
  if (!apnsConfigured()) return { ok: false, status: 0, reason: "Unconfigured", apnsId: null };

  let session;
  try {
    session = connect(host || apnsHost());
  } catch (err) {
    return { ok: false, status: 0, reason: "ConnectError", apnsId: null };
  }
  session.on("error", () => {});

  try {
    const result = await sendOnSession(session, deviceToken, { title, body, url, collapseId, badge }, timeoutMs);
    return result;
  } finally {
    try { session.close(); } catch (e) {}
  }
}

/**
 * Send the same payload to many tokens over ONE HTTP/2 session, with a
 * bounded number of requests in flight at once. Every invalid token (410, or
 * a reason meaning the token will never accept another push) is reported to
 * onInvalid so the caller can delete it — a batch cron is exactly the place
 * a dead token accumulates if nothing prunes it.
 *
 * @param {string[]} tokens
 * @param {{title:string, body:string, url?:string, collapseId?:string, badge?:number}} payload
 * @returns {Promise<Array<{token:string, ok:boolean, status:number, reason:string|null, apnsId:string|null}>>}
 */
export async function sendPushBatch(
  tokens,
  payload,
  { concurrency = 10, onInvalid, connect = http2.connect, timeoutMs = DEFAULT_TIMEOUT_MS, host } = {}
) {
  const list = Array.isArray(tokens) ? tokens.filter((t) => typeof t === "string" && t.trim()) : [];
  if (!list.length) return [];
  if (!apnsConfigured()) {
    return list.map((token) => ({ token, ok: false, status: 0, reason: "Unconfigured", apnsId: null }));
  }

  let session;
  try {
    session = connect(host || apnsHost());
  } catch (err) {
    return list.map((token) => ({ token, ok: false, status: 0, reason: "ConnectError", apnsId: null }));
  }
  session.on("error", () => {});

  const results = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const i = cursor++;
      const token = list[i];
      const result = await sendOnSession(session, token, payload, timeoutMs);
      if (isInvalidPushResult(result)) {
        try { onInvalid && onInvalid(token); } catch (e) {}
      }
      results[i] = { token, ...result };
    }
  }

  try {
    const workerCount = Math.max(1, Math.min(concurrency, list.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    try { session.close(); } catch (e) {}
  }
  return results;
}
