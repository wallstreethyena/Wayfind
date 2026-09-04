#!/usr/bin/env node
// scripts/check-live-reads.mjs — A LIVE SURFACE READS LIVE.
//
// THE BUG THIS LOCKS (production, 2026-09-03). In the App Router, `fetch` is
// cached by default and the Data Cache is keyed by REQUEST URL, shared across
// routes, and retained across deployments. fetchCuratedEvents() issues ONE
// PostgREST URL that three routes want:
//
//   /florida-events         revalidate = 3600  <- populates the entry
//   /florida-events/[slug]  revalidate = 3600  <- populates the entry
//   /api/events/fall        dynamic = force-dynamic
//
// `force-dynamic` makes the ROUTE dynamic. It does not stop that route from
// being handed an entry another route already cached. Measured on the live
// site: the AUGTOBER rail served HorsePower for Kids — a row de-dated to
// `unannounced` two hours earlier — and hid 21 events seeded in the same
// window, while /api/events (limit=200, a different URL, a different entry)
// showed the correct set. A cache-epoch bump could not help: the staleness was
// one layer BELOW the rail's own cache, in the HTTP read.
//
// A retired event that keeps showing is precisely what the date discipline
// exists to prevent, so this guard asserts the fix BY CALLING IT, not by
// reading the source: liveFetch is invoked against a stub and must set
// cache:"no-store" while preserving every other option.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveFetch } from "../lib/supabase.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. liveFetch, EXECUTED against a stub ──────────────────────────────────
const seen = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { seen.push({ input, init }); return Promise.resolve({ ok: true }); };
try {
  await liveFetch("https://example.test/rest/v1/wf_events?select=*");
  await liveFetch("https://example.test/x", { method: "POST", headers: { a: "b" }, signal: "SIG" });
} finally {
  globalThis.fetch = realFetch;
}
ok(seen.length === 2, `liveFetch delegates to fetch (${seen.length} calls seen)`);
ok(seen.every((c) => c.init && c.init.cache === "no-store"), "every liveFetch request carries cache:'no-store' — the Data Cache cannot answer it");
ok(seen[1].init.method === "POST" && seen[1].init.headers.a === "b" && seen[1].init.signal === "SIG",
  "…and it preserves method, headers and signal (an abort signal still aborts)");
ok(seen[0].input === "https://example.test/rest/v1/wf_events?select=*", "…and never rewrites the URL, so PostgREST semantics are untouched");

// ── 2. the live surfaces ask for it; the ISR pages deliberately do not ─────
const fallRoute = read("app/api/events/fall/route.js");
const eventsRoute = read("app/api/events/route.js");
const hub = read("app/florida-events/page.js");
const detail = read("app/florida-events/[slug]/page.js");
ok(/fetchCuratedEvents\(\{[^}]*fresh:\s*true[^}]*\}\)/.test(fallRoute), "the fall rail reads fresh");
ok(/fetchCuratedEvents\(\{[^}]*fresh:\s*true[^}]*\}\)/.test(eventsRoute), "the events feed reads fresh");
ok(/export const revalidate = 3600/.test(hub) && !/fresh:\s*true/.test(hub), "the /florida-events hub keeps its hourly cache on purpose");
ok(/export const revalidate = 3600/.test(detail) && !/fresh:\s*true/.test(detail), "the event page keeps its hourly cache on purpose");

// ── 3. the plumbing, in syntactic position ────────────────────────────────
const curated = read("lib/curatedEvents.js");
const supa = read("lib/supabase.js");
ok(/export async function fetchCuratedEvents\(\{[^}]*fresh = false[^}]*\}/.test(curated), "fetchCuratedEvents accepts `fresh`, defaulting to the cached client");
ok(/const db = fresh \? supabaseLive : supabase;/.test(curated) && /const query = db\s*\n?\s*\.from\("wf_events"\)/.test(curated),
  "…and the flag actually selects the client the query runs on");
ok(/export const supabaseLive =/.test(supa) && /global: \{ fetch: liveFetch \}/.test(supa), "supabaseLive is built with the no-store fetch");
ok(/persistSession: false/.test(supa.slice(supa.indexOf("let live = null;"))), "the live client holds no session — it is a read path, not an auth path");
ok(/storageKey: "wf-supabase-live-reader"/.test(supa.slice(supa.indexOf("let live = null;"))), "the live reader cannot contend with the signed-in client's auth storage key");

console.log(fail ? `check-live-reads: FAIL — ${fail} failed, ${pass} passed` : `check-live-reads: OK — ${pass} assertions; the live rail cannot be served an ISR page's hour-old rows`);
process.exit(fail ? 1 : 0);
