// Merchant-only validation. Never request affiliate URLs or emit commerce events.
import { rawPathDeepLink, sidOf } from './deals.js';

export function destinationHealth(status) {
  if (status >= 200 && status < 300) return true;
  if (status === 404 || status === 410) return false;
  return null; // challenges, rate limits, server errors, unresolved redirects, timeouts
}

export function safeMerchantUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      /^(www\.)?undercovertourist\.com$/i.test(u.hostname) && !u.search && !u.hash;
  } catch { return false; }
}

export function trackedDeal(affiliate, destination) {
  return safeMerchantUrl(destination) && affiliate === rawPathDeepLink(destination, sidOf(affiliate));
}

export async function probeMerchant(destination, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const seen = new Set();
  let url = destination;
  try {
    for (let hop = 0; hop <= 3; hop++) {
      if (!safeMerchantUrl(url) || seen.has(url)) return { status: 0, reason: 'unsafe-or-loop' };
      seen.add(url);
      const response = await fetcher(url, { redirect: 'manual', signal: controller.signal,
        headers: { 'User-Agent': 'Wayfind-Link-Health/1.0' } });
      const status = response.status;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (status < 300 || status >= 400) return { status, reason: 'merchant-response' };
      if (!location) return { status: 0, reason: 'missing-location' };
      url = new URL(location, url).href;
      if (new URL(url).pathname.replace(/\/$/, '') !== new URL(destination).pathname.replace(/\/$/, '')) {
        return { status: 0, reason: 'destination-changed' };
      }
    }
    return { status: 0, reason: 'redirect-limit' };
  } catch { return { status: 0, reason: 'request-failed' }; }
  finally { clearTimeout(timer); }
}

export function healthPatch(row, status) {
  const healthy = destinationHealth(status);
  if (healthy === true) return { link_ok: true, fail_count: 0 };
  if (healthy === null) {
    // Unknown must not erase a previous quarantine or count as a new failure.
    return { link_ok: row.link_ok === false ? false : null, fail_count: row.fail_count || 0 };
  }
  const count = (row.fail_count || 0) + 1;
  return { link_ok: count >= 2 || row.link_ok === false ? false : null, fail_count: count };
}
