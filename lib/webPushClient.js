// lib/webPushClient.js — browser side of opt-in daily-pick Web Push.
// Pure module, safe to import during SSR (every browser touch is guarded).
// enableDailyPicks must be called from a user tap (permission prompt).
// Not used in the Capacitor native shell (that uses native APNs push).

const OFFER_KEY = 'wf_push_offer_dismissed_at';
const OFFER_COOLDOWN_MS = 21 * 24 * 3600 * 1000;
const SW_URL = '/wf-push-sw.js';

export function base64UrlToUint8Array(b64u) {
  const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
  const raw = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function webPushSupported(win = globalThis.window) {
  if (!win || !win.navigator) return false;
  try {
    if (win.Capacitor && win.Capacitor.isNativePlatform && win.Capacitor.isNativePlatform()) return false;
  } catch {
    return false;
  }
  if (!process.env.NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY) return false;
  return 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win;
}

export function pushPermission(win = globalThis.window) {
  if (!webPushSupported(win)) return 'unsupported';
  return win.Notification.permission;
}

export async function currentSubscription() {
  try {
    if (!webPushSupported()) return null;
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

const fail = (code, error) => ({ ok: false, code, error });

export async function enableDailyPicks(getBearer) {
  if (!webPushSupported()) return fail('unsupported', "This browser can't receive daily picks.");
  if (Notification.permission === 'denied') {
    return fail('blocked', 'Notifications are blocked in your browser settings.');
  }
  let token = null;
  try {
    token = await getBearer();
  } catch {
    token = null;
  }
  if (!token) return fail('signed_out', 'Sign in to get daily picks.');
  let sub = null;
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return fail(perm === 'denied' ? 'blocked' : 'dismissed',
        perm === 'denied' ? 'Notifications are blocked in your browser settings.' : 'No problem. You can turn on daily picks any time.');
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(process.env.NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY),
    });
    const res = await fetch('/api/push/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    if (!res.ok) {
      try { await sub.unsubscribe(); } catch {}
      return fail(res.status === 401 ? 'signed_out' : 'server',
        res.status === 401 ? 'Sign in to get daily picks.' : "We couldn't turn on daily picks. Please try again.");
    }
    return { ok: true, code: 'enabled', error: null };
  } catch {
    if (sub) { try { await sub.unsubscribe(); } catch {} }
    return fail('error', "We couldn't turn on daily picks. Please try again.");
  }
}

export async function disableDailyPicks(getBearer) {
  try {
    const sub = await currentSubscription();
    if (!sub) return { ok: true };
    const token = await getBearer();
    if (token) {
      await fetch('/api/push/web', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
    }
    await sub.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function shouldOfferDailyPicks(storage, now = Date.now()) {
  try {
    if (!webPushSupported() || pushPermission() !== 'default') return false;
    const s = storage ?? globalThis.localStorage;
    const at = Number(s.getItem(OFFER_KEY));
    return !(at && now - at < OFFER_COOLDOWN_MS);
  } catch {
    return false;
  }
}

export function noteDailyPicksOfferDismissed(storage, now = Date.now()) {
  try {
    (storage ?? globalThis.localStorage).setItem(OFFER_KEY, String(now));
  } catch {}
}
