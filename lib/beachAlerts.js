// Bounded recovery for the official point-specific feed. Never turn an outage
// or a malformed/truncated response into an empty (apparently clear) alert list.
export async function fetchPlanningAlerts(lat, lng, { fetchImpl = fetch, wait = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const url = `https://api.weather.gov/alerts/active?point=${lat},${lng}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let delay = 300;
    try {
      const r = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(4500), headers: {
        'User-Agent': 'Wayfind beach planning (https://gowayfind.com)', Accept: 'application/geo+json',
      } });
      if (!r.ok) {
        if (![408, 429, 500, 502, 503, 504].includes(r.status)) throw new Error(`NWS HTTP ${r.status}`);
        const retry = r.headers.get('retry-after');
        if (retry) {
          delay = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now();
          if (!Number.isFinite(delay) || delay > 1500) throw new Error(`NWS HTTP ${r.status}; backoff required`);
          delay = Math.max(0, delay);
        }
        if (attempt === 1) throw new Error(`NWS HTTP ${r.status}`);
      } else {
        const d = await r.json();
        if (!Array.isArray(d.features) || d.pagination?.next || d.features.some(f => !f?.properties || typeof f.properties.event !== 'string')) {
          throw new Error('Incomplete NWS alert response');
        }
        return d.features.map(f => f.properties).map(p => ({ event: p.event, headline: p.headline,
          issuedAt: p.sent, expiresAt: p.expires, instruction: p.instruction }));
      }
    } catch (e) {
      // Only transient transport errors retry. HTTP refusals and bad schemas
      // remain loud and do not repeatedly hit the provider.
      if (attempt === 1 || /^NWS HTTP|Incomplete NWS/.test(e.message)) throw e;
    }
    await wait(delay);
  }
  throw new Error('NWS alert feed unavailable');
}
