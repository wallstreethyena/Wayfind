import { createClient } from "@supabase/supabase-js";

// Clean a possibly messy env value: strip surrounding whitespace, quotes,
// and any stray trailing slash so a copy/paste mistake can't break anything.
function clean(v) {
  if (!v) return "";
  return String(v).trim().replace(/^['"]+|['"]+$/g, "");
}

const rawUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
// Supabase is always https. If the value was saved as http:// (or with no
// scheme), normalize it so a small mistake in the dashboard can't break auth.
const url = /^http:\/\//i.test(rawUrl)
  ? rawUrl.replace(/^http:\/\//i, "https://")
  : (/^https?:\/\//i.test(rawUrl) ? rawUrl : (rawUrl ? "https://" + rawUrl : ""));
const anon = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Only build a client when the URL really is an http(s) URL and the key looks
// like a real token. Anything else -> null, so the app (and the build) keep
// working exactly as before, just without accounts. createClient is also
// wrapped so it can never throw during build/prerender.
const looksValid = /^https?:\/\/[^\s]+\.[^\s]+/i.test(url) && anon.length > 20;

let client = null;
if (looksValid) {
  try {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch {
    client = null;
  }
}

export const supabase = client;
export const hasSupabase = !!client;

// THE LIVE READER (2026-09-03) — a second client whose every request is
// `cache: "no-store"`.
//
// WHAT WENT WRONG. In the App Router `fetch` is cached by default and the Data
// Cache is keyed by the REQUEST URL, SHARED ACROSS ROUTES, and retained across
// deployments. lib/curatedEvents.fetchCuratedEvents() issues one PostgREST URL,
// and three routes ask for it:
//
//   /florida-events        revalidate = 3600   <- populates the entry
//   /florida-events/[slug] revalidate = 3600   <- populates the entry
//   /api/events/fall       dynamic = force-dynamic
//
// `force-dynamic` makes the ROUTE dynamic; it does not stop that route from
// reading an entry another route already cached. So the AUGTOBER rail — the
// surface the owner looks at most — served hour-old events: on 2026-09-03 it
// showed HorsePower for Kids, a row de-dated to `unannounced` two hours
// earlier, and hid 21 events seeded in the same window. The rail's own epoch
// bump could not help: the staleness was one layer below it, in the HTTP read.
// (/api/events was accidentally immune — it passes limit=200, a different URL,
// so it lands on a different cache entry. That is luck, not a design.)
//
// A retired event that keeps showing is the exact failure the owner's date
// discipline exists to prevent, so a LIVE surface reads live. ISR pages keep
// the cached client on purpose: they revalidate hourly by design, and their
// job is to be cheap.
const liveFetch = (input, init = {}) => fetch(input, { ...init, cache: "no-store" });

let live = null;
if (looksValid) {
  try {
    live = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: liveFetch },
    });
  } catch {
    live = null;
  }
}

/** The uncached twin of `supabase`, for reads a live surface must not stale. */
export const supabaseLive = live || client;
/** Exported for scripts/check-live-reads.mjs, which calls it with a stub fetch. */
export { liveFetch };
