// lib/webPush.js — server-only Web Push (VAPID + RFC 8291 payload encryption)
// for the opt-in "one Wayfind pick a day" notification. Zero dependencies:
// node:crypto only. Callers: /api/push/web (subscribe/unsubscribe) and the
// daily cron sender.
//
// Design notes
//  - Fail closed: vapidFromEnv returns null on any missing/malformed key.
//  - SSRF guard: sendWebPush only ever POSTs to the known browser push
//    services (https, no credentials, default port). Subscription endpoints
//    are user-supplied, so this allow-list is the security boundary.
//  - sendWebPush never throws and never logs keys or payloads.
import crypto from 'node:crypto';

const MAX_PAYLOAD_BYTES = 3000; // push services cap at ~4096 incl. overhead
const RECORD_SIZE = 4096;

export function b64uEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function b64uDecode(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) {
    throw new Error('invalid base64url');
  }
  return Buffer.from(str, 'base64url');
}

function privateKeyObject(publicRaw, privateRaw) {
  return crypto.createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64uEncode(publicRaw.subarray(1, 33)),
      y: b64uEncode(publicRaw.subarray(33, 65)),
      d: b64uEncode(privateRaw),
    },
  });
}

export function generateVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), b64uDecode(jwk.x), b64uDecode(jwk.y)]);
  return { publicKey: b64uEncode(pub), privateKey: b64uEncode(b64uDecode(jwk.d)) };
}

// Returns { publicKey, privateKey, subject } or null (fail closed). Never logs keys.
export function vapidFromEnv(env = process.env) {
  try {
    const publicKey = String(env.NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY || '').trim();
    const privateKey = String(env.WF_VAPID_PRIVATE_KEY || '').trim();
    const subject = String(env.WF_VAPID_SUBJECT || 'https://www.gowayfind.com').trim();
    if (!publicKey || !privateKey) return null;
    if (!/^(https:\/\/|mailto:)/.test(subject)) return null;
    const pub = b64uDecode(publicKey);
    const priv = b64uDecode(privateKey);
    if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return null;
    // The pair must match, otherwise every push would be rejected anyway.
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    if (!ecdh.getPublicKey().equals(pub)) return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}

export function vapidAuthHeader({ endpoint, subject, publicKey, privateKey, nowSec, expSeconds = 12 * 3600 }) {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = { aud: new URL(endpoint).origin, exp: now + expSeconds, sub: subject };
  const signingInput =
    b64uEncode(JSON.stringify(header)) + '.' + b64uEncode(JSON.stringify(claims));
  const key = privateKeyObject(b64uDecode(publicKey), b64uDecode(privateKey));
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${signingInput}.${b64uEncode(sig)}, k=${publicKey}`;
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// RFC 8291 (Web Push encryption) + RFC 8188 (aes128gcm), single record.
// Returns the full request body Buffer. `_debug` is for the RFC test vector.
export function encryptPayload({ p256dh, auth, payload, salt, localPrivateKey, _debug }) {
  const data = typeof payload === 'string' ? Buffer.from(payload) : Buffer.from(payload || []);
  if (data.length > MAX_PAYLOAD_BYTES) throw new Error('payload too large');
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh');
  if (authSecret.length !== 16) throw new Error('bad auth');
  const saltBuf = salt ? Buffer.from(salt) : crypto.randomBytes(16);
  if (saltBuf.length !== 16) throw new Error('bad salt');

  const ecdh = crypto.createECDH('prime256v1');
  if (localPrivateKey) ecdh.setPrivateKey(Buffer.from(localPrivateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(saltBuf, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(Buffer.concat([data, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE);
  const body = Buffer.concat([saltBuf, rs, Buffer.from([asPublic.length]), asPublic, ct]);
  if (_debug) Object.assign(_debug, { ecdhSecret, prkKey, ikm, prk, cek, nonce });
  return body;
}

// SSRF guard: only the browsers' own push services.
export function isAllowedPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    if (u.port && u.port !== '443') return false;
    const h = u.hostname.toLowerCase();
    return (
      h === 'fcm.googleapis.com' ||
      h === 'web.push.apple.com' ||
      h.endsWith('.push.services.mozilla.com') ||
      h.endsWith('.notify.windows.com') ||
      h.endsWith('.push.apple.com')
    );
  } catch {
    return false;
  }
}

// Never throws. gone=true means the subscription is dead (404/410): delete it.
export async function sendWebPush({
  subscription,
  payload,
  vapid,
  ttl = 43200,
  urgency = 'normal',
  topic,
  fetchImpl = fetch,
}) {
  try {
    const endpoint = subscription && subscription.endpoint;
    const keys = (subscription && subscription.keys) || {};
    if (!vapid || !isAllowedPushEndpoint(endpoint)) return { ok: false, status: 0, gone: false };
    const body = encryptPayload({
      p256dh: keys.p256dh,
      auth: keys.auth,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}),
    });
    const headers = {
      TTL: String(Math.max(0, Math.floor(ttl))),
      Urgency: urgency,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: vapidAuthHeader({
        endpoint,
        subject: vapid.subject || 'https://www.gowayfind.com',
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      }),
    };
    if (topic && /^[A-Za-z0-9_-]{1,32}$/.test(topic)) headers.Topic = topic;
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const status = res.status;
    return { ok: status >= 200 && status < 300, status, gone: status === 404 || status === 410 };
  } catch {
    return { ok: false, status: 0, gone: false };
  }
}
