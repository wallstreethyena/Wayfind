#!/usr/bin/env node
// scripts/test-web-push-client.mjs — plain-node test for lib/webPushClient.js pure helpers.
import assert from 'node:assert/strict';
process.env.NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const c = await import('../lib/webPushClient.js');

// base64url decode
const u8 = c.base64UrlToUint8Array('AQL-_w');
assert.deepEqual([...u8], [1, 2, 254, 255]);
assert.equal(c.base64UrlToUint8Array(process.env.NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY).length, 65);

// SSR (no window) and native shell are unsupported
assert.equal(globalThis.window, undefined);
assert.equal(c.webPushSupported(), false);
assert.equal(c.pushPermission(), 'unsupported');
const mkWin = (extra = {}) => ({ navigator: { serviceWorker: {} }, PushManager: function () {}, Notification: { permission: 'default' }, ...extra });
assert.equal(c.webPushSupported(mkWin()), true);
assert.equal(c.webPushSupported(mkWin({ Capacitor: { isNativePlatform: () => true } })), false);
assert.equal(c.webPushSupported(mkWin({ Capacitor: { isNativePlatform: () => false } })), true);
assert.equal(c.webPushSupported({ navigator: {}, PushManager() {}, Notification: {} }), false);

// shouldOfferDailyPicks with fake storage
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
const DAY = 86400000, now = 1_800_000_000_000;
assert.equal(c.shouldOfferDailyPicks(store(), now), false, 'SSR: unsupported');
globalThis.window = mkWin();
const s = store();
assert.equal(c.shouldOfferDailyPicks(s, now), true);
c.noteDailyPicksOfferDismissed(s, now);
assert.equal(c.shouldOfferDailyPicks(s, now + 20 * DAY), false);
assert.equal(c.shouldOfferDailyPicks(s, now + 22 * DAY), true);
window.Notification.permission = 'granted';
assert.equal(c.shouldOfferDailyPicks(store(), now), false);
window.Notification.permission = 'denied';
assert.equal(c.shouldOfferDailyPicks(store(), now), false);
window.Notification.permission = 'default';
const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
assert.equal(c.shouldOfferDailyPicks(throwing, now), false);
assert.doesNotThrow(() => c.noteDailyPicksOfferDismissed(throwing, now));
delete globalThis.window;

console.log('PASS test-web-push-client: base64url, support detection, offer cooldown, storage safety');
