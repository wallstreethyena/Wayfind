// scripts/fall-discovery/lib/fetch.mjs — the ONE free-fetch primitive the
// pipeline uses. No paid API ever runs through this file: it is a plain
// `fetch()` against a URL the caller already has, with three guarantees the
// task brief requires — a per-fetch TIMEOUT, a 1MB CAP, and a user agent
// that identifies Wayfind rather than pretending to be a browser.
export const WAYFIND_FALL_UA =
  "WayfindFallDiscoveryBot/1.0 (+https://gowayfind.com/about; seasonal-offering verification; low-volume, polite)";
export const FETCH_TIMEOUT_MS = 15000;
export const MAX_FETCH_BYTES = 1024 * 1024; // 1 MB, per the task brief

// A SINGLE retry after a short backoff, for one reason: measured directly
// during this pipeline's first real run (2026-09-23), the same Toast
// ordering-page URL (order.toasttab.com/online/buddybrewsarasota) returned
// HTTP 403 on one run and 200 with the real menu on the next, seconds apart
// — bot-defense that is evidently probabilistic/rate-based rather than a
// hard block on this UA. One retry is cheap, stays well inside "polite", and
// measurably recovers real coverage a single attempt would silently lose as
// "insufficient". It never retries a genuine timeout twice in a row within
// the same fetch (see politeFetchOnce) — only the OUTER call retries once.
async function politeFetchOnce(url, { timeoutMs, maxBytes }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": WAYFIND_FALL_UA, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" },
    });
    let text = "";
    let truncated = false;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const remaining = maxBytes - total;
        if (remaining <= 0) { truncated = true; try { await reader.cancel(); } catch {} break; }
        const slice = value.length > remaining ? value.subarray(0, remaining) : value;
        chunks.push(Buffer.from(slice));
        total += slice.length;
        if (slice.length < value.length) { truncated = true; try { await reader.cancel(); } catch {} break; }
      }
      text = Buffer.concat(chunks).toString("utf8");
    } else {
      const full = await res.text();
      if (Buffer.byteLength(full, "utf8") > maxBytes) { text = full.slice(0, maxBytes); truncated = true; }
      else text = full;
    }
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, text, truncated, error: null };
  } catch (e) {
    const aborted = e && (e.name === "AbortError" || /aborted/i.test(String(e.message || "")));
    return { ok: false, status: 0, finalUrl: url, text: "", truncated: false, error: aborted ? "timeout" : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

const RETRY_DELAY_MS = 1200;

export async function politeFetch(url, { timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_FETCH_BYTES } = {}) {
  const first = await politeFetchOnce(url, { timeoutMs, maxBytes });
  if (first.ok) return first;
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  const second = await politeFetchOnce(url, { timeoutMs, maxBytes });
  return second.ok ? second : first; // report the FIRST failure's status/error when both attempts fail
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const PUBLISHED_PATTERNS = [
  /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/i,
  /property=["']article:published_time["']\s+content=["'](\d{4}-\d{2}-\d{2})/i,
  /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/i,
  /property=["']article:modified_time["']\s+content=["'](\d{4}-\d{2}-\d{2})/i,
];

// Best-effort structural extraction of a publish/modified date from raw HTML
// (JSON-LD `datePublished`, OpenGraph `article:published_time`, and their
// `*modified*` twins as a fallback). Returns null rather than guessing —
// callers that already KNOW a source's publish date (the seeded
// data/fall-discovery/official-sources.json entries this run's research
// produced) pass it explicitly instead of relying on this.
export function extractPublishedAt(html) {
  for (const rx of PUBLISHED_PATTERNS) {
    const m = rx.exec(String(html || ""));
    if (m) return m[1];
  }
  return null;
}

// Bounded-concurrency map — the task brief's "polite concurrency <= 3".
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
