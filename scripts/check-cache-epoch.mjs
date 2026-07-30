// scripts/check-cache-epoch.mjs — a fix upstream of a client cache is not shipped
// until the cache key moves.
//
// #466 fixed fetchPlaceDetail: the Maps SDK was being asked for "websiteUri"
// instead of "websiteURI", and since fetchFields validates the whole field array
// before issuing a request, reviews and hours were never fetched for ANY place.
// Two 30-day localStorage caches had already been filled from that nothing:
//
//   wf_lines    — /api/blurbs received an empty reviewText, so the line was
//                 written without the reviews it is meant to be grounded in
//   wf_insights — /api/insight took its no-reviews branch, so the flattened
//                 one-sentence "Why Wayfind picked this" was persisted as fact
//
// #466 stopped caching NEW failures. It could not evict what was already on
// disk. So production was fixed and real users stayed degraded for up to a
// month — and because a fresh browser profile has no cache, every automated
// check of the fix looked perfectly clean. That combination (correct code,
// stale clients, green verification) is what this guard exists to prevent
// recurring.
//
// The rule: both caches derive their key from ONE epoch constant, so
// invalidating them is a single edit that cannot be half-applied.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-cache-epoch: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const raw = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// Comment-stripped for the same reason as check-price-badge: the comments here
// NAME the legacy keys while explaining why they are legacy, and a text search
// cannot tell prose that names a forbidden literal from code that uses it.
const home = stripComments(raw);

// ------------------------------------------------------------- one epoch
const m = home.match(/const CACHE_EPOCH = (\d+);/);
ok(!!m, "app/home.js declares CACHE_EPOCH — the single knob that invalidates every client cache at once");
const epoch = Number(m[1]);
ok(epoch >= 2, `CACHE_EPOCH is ${epoch}. It must be >= 2: epoch 1 is the pre-#466 data, written while reviews and hours were never being fetched.`);

// Both keys derive from it. A literal key is how one cache gets bumped and the
// other quietly does not.
for (const k of ["LINES_KEY", "INSIGHTS_KEY"]) {
  const km = home.match(new RegExp(`const ${k} = ([^;]+);`));
  ok(!!km, `${k} is declared`);
  ok(/CACHE_EPOCH/.test(km[1]), `${k} is built from CACHE_EPOCH (found \`${km[1].trim()}\`) — a hardcoded key is how one cache gets bumped and the other silently keeps serving poisoned rows`);
}

// ------------------------------------------- nothing still reads the old keys
for (const legacy of ['"wf_lines"', '"wf_insights"']) {
  ok(!home.includes(legacy), `app/home.js no longer references the pre-epoch key ${legacy} in CODE — a single surviving read serves exactly the stale rows the epoch bump exists to abandon`);
}
// ...and every access goes through the derived constants.
const reads = [...home.matchAll(/localStorage\.(getItem|setItem)\(([^,)]+)/g)]
  .map((x) => x[2].trim())
  .filter((a) => /wf_lines|wf_insights|LINES_KEY|INSIGHTS_KEY/.test(a));
ok(reads.length >= 4, `expected at least 4 line/insight cache accesses, found ${reads.length} — the matcher is not seeing them, so the assertion below is vacuous`);
for (const a of reads) {
  ok(/^(LINES_KEY|INSIGHTS_KEY)$/.test(a), `cache access uses the derived constant, not \`${a}\``);
}

// --------------------------------------------------------------- self-test
// Prove the legacy-literal check would actually fire on code, and that
// comment-stripping is what keeps the explanation above from tripping it.
{
  if (!raw.includes('wf_lines')) fail("self-test: the raw source no longer mentions wf_lines at all — re-read this guard's header before changing it");
  const fixture = stripComments('const c = localStorage.getItem("wf_lines");');
  if (!fixture.includes('"wf_lines"')) fail("self-test: stripComments removed a real string literal, not just prose — the strip is too aggressive and every check above is unsound");
  const proseOnly = stripComments('// we used to read "wf_lines" here\nconst x = 1;');
  if (proseOnly.includes('"wf_lines"')) fail("self-test: stripComments did NOT remove the key named in a comment — the legacy-key assertions are running against prose");
  pass += 3;
}

console.log(`check-cache-epoch: OK — ${pass} assertions (CACHE_EPOCH ${epoch} is the one knob; both cache keys derive from it; no code path reads the pre-#466 keys; comment-stripping proven both directions)`);
