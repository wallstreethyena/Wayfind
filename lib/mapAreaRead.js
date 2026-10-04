// Client-owned paging lifecycle: every page settles; partial failure is explicit.
// The server validates owned candidates; the UI applies its final score floor
// after current-session evidence and shares that selected pool with pins.
export async function readCompleteMapArea({ bounds, origin, signal, fetcher = fetch, onPage = () => {}, timeoutMs = 15000 }) {
  const collected = [];
  const cursors = new Set();
  let cursor = '';
  do {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    let timeout;
    try {
      const params = new URLSearchParams({ ...bounds, originLat: origin.lat, originLng: origin.lng, ...(cursor ? { cursor } : {}) });
      const expired = new Promise((_, reject) => {
        timeout = setTimeout(() => { const error = new Error('Map area page deadline'); controller.abort(error); reject(error); }, timeoutMs);
      });
      const cancelled = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason || new Error('Map area cancelled')), { once: true });
      });
      const request = (async () => {
        const response = await fetcher('/api/places/map?' + params, { signal: controller.signal });
        if (!response.ok) throw new Error('Map area unavailable');
        const data = await response.json();
        if (!Array.isArray(data?.places) || typeof data.complete !== 'boolean') throw new Error('Invalid map area response');
        return data;
      })();
      const data = await Promise.race([request, expired, cancelled]);
      signal?.throwIfAborted();
      const next = data.nextCursor || '';
      if (!data.complete && (typeof next !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(next) || cursors.has(next) || (cursor && next <= cursor))) throw new Error('Incomplete map area response');
      if (data.complete && next) throw new Error('Invalid map area pagination');
      collected.push(...data.places);
      onPage([...collected]);
      cursor = next;
      cursors.add(cursor);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  } while (cursor);
  return collected;
}
