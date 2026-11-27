#!/usr/bin/env node
// scripts/test-web-push.mjs — plain-node test for lib/webPush.js.
// Covers the RFC 8291 Appendix A vector, VAPID JWT, SSRF allow-list, limits.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  b64uDecode, b64uEncode, generateVapidKeys, vapidFromEnv, vapidAuthHeader,
  encryptPayload, isAllowedPushEndpoint, sendWebPush,
} from '../lib/webPush.js';

// --- RFC 8291 Appendix A ---
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  ecdh: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  prkKey: 'Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  prk: '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const enc = (salt) => {
  const dbg = {};
  const body = encryptPayload({
    p256dh: V.uaPublic, auth: V.auth, payload: V.plaintext,
    salt: b64uDecode(salt), localPrivateKey: b64uDecode(V.asPrivate), _debug: dbg,
  });
  return { body, dbg };
};
const { body, dbg } = enc(V.salt);
assert.equal(b64uEncode(dbg.ecdhSecret), V.ecdh, 'ecdh_secret');
assert.equal(b64uEncode(dbg.prkKey), V.prkKey, 'PRK_key');
assert.equal(b64uEncode(dbg.ikm), V.ikm, 'IKM');
assert.equal(b64uEncode(dbg.prk), V.prk, 'PRK');
assert.equal(b64uEncode(dbg.cek), V.cek, 'CEK');
assert.equal(b64uEncode(dbg.nonce), V.nonce, 'NONCE');
assert.equal(b64uEncode(body), V.body, 'RFC 8291 body');
// The vector test must be able to fail: a one-byte-different salt changes the body.
const salt2 = Buffer.from(b64uDecode(V.salt)); salt2[15] ^= 1;
assert.notEqual(b64uEncode(enc(b64uEncode(salt2)).body), V.body, 'salt change must change body');

// --- random keys / limits ---
const rnd = encryptPayload({ p256dh: V.uaPublic, auth: V.auth, payload: 'hi' });
assert.equal(rnd[20], 65);
assert.throws(() => encryptPayload({ p256dh: V.uaPublic, auth: V.auth, payload: 'x'.repeat(3001) }), /too large/);
assert.doesNotThrow(() => encryptPayload({ p256dh: V.uaPublic, auth: V.auth, payload: 'x'.repeat(3000) }));

// --- VAPID ---
const keys = generateVapidKeys();
assert.equal(b64uDecode(keys.publicKey).length, 65);
assert.equal(b64uDecode(keys.privateKey).length, 32);
const env = { NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY: keys.publicKey, WF_VAPID_PRIVATE_KEY: keys.privateKey };
const fromEnv = vapidFromEnv(env);
assert.equal(fromEnv.subject, 'https://www.gowayfind.com');
assert.equal(vapidFromEnv({}), null);
assert.equal(vapidFromEnv({ ...env, WF_VAPID_PRIVATE_KEY: generateVapidKeys().privateKey }), null, 'mismatched pair');
assert.equal(vapidFromEnv({ ...env, WF_VAPID_SUBJECT: 'http://x.com' }), null);
assert.equal(vapidFromEnv({ ...env, WF_VAPID_PRIVATE_KEY: 'abc' }), null);

const now = Math.floor(Date.now() / 1000);
const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
const hdr = vapidAuthHeader({ endpoint, subject: 'mailto:a@b.co', publicKey: keys.publicKey, privateKey: keys.privateKey, nowSec: now });
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(hdr);
assert.ok(m && m[4] === keys.publicKey, 'header shape');
const claims = JSON.parse(b64uDecode(m[2]).toString());
assert.equal(claims.aud, 'https://fcm.googleapis.com');
assert.equal(claims.sub, 'mailto:a@b.co');
assert.ok(claims.exp > now && claims.exp <= now + 12 * 3600);
const pub = b64uDecode(keys.publicKey);
const pubKey = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.subarray(1, 33)), y: b64uEncode(pub.subarray(33)) } });
const verify = (sig) => crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pubKey, dsaEncoding: 'ieee-p1363' }, sig);
assert.equal(verify(b64uDecode(m[3])), true, 'JWT signature verifies');
const bad = Buffer.from(b64uDecode(m[3])); bad[0] ^= 1;
assert.equal(verify(bad), false, 'tampered signature fails');

// --- allow-list ---
for (const ok of ['https://fcm.googleapis.com/x', 'https://updates.push.services.mozilla.com/x',
  'https://wns2.notify.windows.com/x', 'https://web.push.apple.com/x'])
  assert.equal(isAllowedPushEndpoint(ok), true, ok);
for (const no of ['https://evil.example.com/x', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x',
  'https://evilpush.apple.com.attacker.io/x', 'https://u:p@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'nonsense'])
  assert.equal(isAllowedPushEndpoint(no), false, no);

// --- sendWebPush ---
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const sub = { endpoint, keys: { p256dh: b64uEncode(ua.getPublicKey()), auth: b64uEncode(crypto.randomBytes(16)) } };
let seen;
const fake = (status) => async (url, init) => { seen = { url, init }; return { status }; };
let r = await sendWebPush({ subscription: sub, payload: { title: 't' }, vapid: fromEnv, topic: 'wf-daily', fetchImpl: fake(410) });
assert.deepEqual(r, { ok: false, status: 410, gone: true });
const h = seen.init.headers;
assert.equal(seen.url, endpoint);
assert.equal(h.TTL, '43200'); assert.equal(h.Urgency, 'normal'); assert.equal(h.Topic, 'wf-daily');
assert.equal(h['Content-Encoding'], 'aes128gcm'); assert.equal(h['Content-Type'], 'application/octet-stream');
assert.match(h.Authorization, /^vapid t=.+, k=.+$/);
assert.equal(seen.init.redirect, 'error'); assert.ok(seen.init.signal);
assert.ok(Buffer.isBuffer(seen.init.body) && seen.init.body.length > 86);
r = await sendWebPush({ subscription: sub, payload: {}, vapid: fromEnv, fetchImpl: fake(201) });
assert.deepEqual(r, { ok: true, status: 201, gone: false });
r = await sendWebPush({ subscription: sub, payload: {}, vapid: fromEnv, fetchImpl: fake(404) });
assert.equal(r.gone, true);
r = await sendWebPush({ subscription: sub, payload: {}, vapid: fromEnv, fetchImpl: async () => { throw new Error('net'); } });
assert.deepEqual(r, { ok: false, status: 0, gone: false });
let called = false;
r = await sendWebPush({ subscription: { ...sub, endpoint: 'https://evil.example.com/x' }, payload: {}, vapid: fromEnv, fetchImpl: async () => { called = true; return { status: 201 }; } });
assert.deepEqual(r, { ok: false, status: 0, gone: false });
assert.equal(called, false, 'evil endpoint never fetched');

console.log('PASS test-web-push: RFC 8291 vector + intermediates, VAPID ES256, allow-list, limits, sendWebPush');
