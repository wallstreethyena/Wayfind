#!/usr/bin/env node
// STRUCTURAL-ONLY: prerender vs dynamic is decided by next build, which prebuild cannot run; asserts noStore() precedes the data read in Page().
// scripts/test-events-hub-not-prerendered.mjs — /events must never be served
// from a build-time render.
//
// fetchCuratedEvents() returns [] during `next build` (isSsgBuild: builds do
// not wait on Supabase). /events was an ISR page (revalidate 900), so next
// build prerendered it from that [] and every deploy served "Nothing verified
// is coming up in the next 14 days" plus an empty ItemList until the first
// revalidation. Found live 2026-11-27 (x-vercel-cache PRERENDER) while wf_events
// held 200 events starting inside the 14 day window.
//
// The rule, same as /florida-events (scripts/check-curated-events-read.mjs):
// the page calls noStore() BEFORE its first data read, so Next never bakes it,
// and the data still comes from the 15 minute unstable_cache reader.
// Checked on the comment-stripped Page function (role, not substring), with a
// probe that the function was found before any absence check.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../app/events/page.js", import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fn = strip(src).match(/export default async function Page\(\)\s*\{[\s\S]*?\n\}/);
let n = 0;
const ok = (label, f) => { try { f(); n++; } catch (e) { console.error("test-events-hub-not-prerendered: FAIL - " + label + "\n  " + e.message); process.exit(1); } };

ok("probe: the Page function is found", () => assert.ok(fn && fn[0].length > 200, "Page() not found"));
ok("noStore is imported from next/cache", () => assert.match(src, /import \{[^}]*\bunstable_noStore as noStore\b[^}]*\} from "next\/cache"/));
ok("noStore() runs before the first data read", () => {
  const body = fn[0];
  const a = body.indexOf("noStore();"); const b = body.indexOf("await upcomingReader(");
  assert.ok(a > 0, "noStore() is not called in Page()");
  assert.ok(b > 0, "probe: the data read moved; follow it");
  assert.ok(a < b, "noStore() must come before the data read");
});
ok("data still comes from the 15 minute cached reader", () => {
  assert.match(src, /unstable_cache\(/);
  assert.match(src, /\{ revalidate: 900, tags: \["curated-events"\] \}/);
});
ok("no force-static override undoes it", () => assert.doesNotMatch(strip(src), /export const dynamic = "force-static"/));
console.log("test-events-hub-not-prerendered: OK - " + n + " checks; /events renders per request from the cached read, never from a build-time []");
