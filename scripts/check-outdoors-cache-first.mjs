// scripts/check-outdoors-cache-first.mjs — locks the v6.51 fix for "the beach
// tab takes a long time" (owner, with screenshot: stalled loading skeletons on
// Home while parks/beaches/piers were still resolving).
//
// Root cause: app/api/outdoors/route.js fans out to NPS + RIDB + OpenStreetMap
// (Overpass). Overpass is DOCUMENTED in that file as unreliable from cloud
// IPs — a live miss is "the NORM from Vercel, not the exception" — and the
// route already keeps a 7-day durable Supabase cache for exactly that case.
// But the cache was only ever consulted AFTER the live attempt had already
// run out its ~4.5s wall and failed, so the fast path never actually got
// used: every cold OSM miss cost the full ~4-4.5s before the route could
// respond at all, and Google/Foursquare results sat behind it because
// lib/sources.js searchPlaces() Promise.all's all three sources together.
//
// The fix is resolveOsm(): the live Overpass attempt and the cache lookup
// start on the SAME tick, and a cache HIT short-circuits the response the
// moment it lands (~100-300ms) instead of waiting out the live wall first.
// The live attempt keeps running in the background to refresh the cache for
// next time. A geo bucket with genuinely no cache still costs the full wall
// — nothing got slower, the common (already-seen-this-area) case got much
// faster. These assertions are STRUCTURAL (they read the route's source),
// matching how the rest of this codebase locks server-route behavior that
// can't be invoked directly without mocking three live upstream APIs.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-outdoors-cache-first: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const src = readFileSync(new URL("../app/api/outdoors/route.js", import.meta.url), "utf8");
// Strip comments so prose can never make an assertion pass for the wrong
// reason (the exact failure mode check-editorial-publish.mjs guards against).
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok(code.length > src.length * 0.25, "stripping comments left the code intact — a runaway /* would blank the file and every assertion below would pass for the wrong reason");

// 1. The cache-first resolver exists, and its body starts the live attempt
//    BEFORE awaiting the cache lookup — both must fire on the same tick, or
//    the cache check just becomes a second sequential wait.
const fnAt = code.indexOf("async function resolveOsm(");
ok(fnAt >= 0, "resolveOsm() exists — the cache-first race that fixes the hang");
const fnEnd = code.indexOf("\n}", fnAt);
const fnBody = fnAt >= 0 && fnEnd > fnAt ? code.slice(fnAt, fnEnd) : "";
const liveAt = fnBody.indexOf("wall(fromOSM(");
const cacheAt = fnBody.indexOf("await osmCacheGet(");
ok(liveAt >= 0 && cacheAt >= 0 && liveAt < cacheAt, "the live Overpass attempt is started BEFORE the cache lookup is awaited — they must race, not run in sequence");
ok(/const live = wall\(fromOSM\(lat, lng, radius\)\);/.test(fnBody) && !new RegExp("await live[^P]").test(fnBody.slice(0, cacheAt)), "the live promise is not awaited until AFTER the cache check has already returned — awaiting it early would defeat the race");

// 2. A cache hit is used IMMEDIATELY — it must not also wait for `live`.
ok(/if \(Array\.isArray\(cached\) && cached\.length\) \{/.test(fnBody), "a cache hit is checked and used without waiting for the live attempt to settle");
ok(/live\.then\(\(r\) => \{ if \(r && r\.ok && r\.places\.length\) osmCacheSet\(osmKey, r\.places\); \}\)\.catch\(\(\) => \{\}\);/.test(fnBody), "the live attempt still refreshes the cache in the background when a cache hit already answered the request — self-healing is preserved, not removed");
ok(/osmFrom: "cached"/.test(fnBody) && /osmFrom: "live"/.test(fnBody), "the response is still honest about which path answered (cached vs live) — counts.osm never lies about its source");

// 3. No cache hit -> falls through to the SAME live wall as before (no
//    regression: an unseen geo bucket still costs at most the ~4.5s wall).
ok(/const r = await live;/.test(fnBody), "with no cache hit, the route falls back to the already-in-flight live attempt — not a fresh one, so no double wait");

// 4. The cache lookup itself is bounded — an unbounded Supabase read here
//    would silently re-introduce a hang this fix is supposed to remove.
const cacheGetAt = code.indexOf("async function osmCacheGet(");
const cacheGetBody = cacheGetAt >= 0 ? code.slice(cacheGetAt, code.indexOf("\n}", cacheGetAt)) : "";
ok(/new AbortController\(\)/.test(cacheGetBody) && /setTimeout\(\(\) => ctrl\.abort\(\), 2500\)/.test(cacheGetBody) && /signal: ctrl\.signal/.test(cacheGetBody), "the cache lookup is bounded (2.5s abort) — an unbounded Supabase read could out-wait the live attempt it is meant to beat");

// 5. GET() actually uses the cache-first resolver, in the SAME fan-out as
//    NPS/RIDB — not sequenced after them, and not the old inline pattern.
const getAt = code.indexOf("export async function GET(");
const getBody = getAt >= 0 ? code.slice(getAt) : "";
ok(/Promise\.allSettled\(\[wall\(fromNPS\([^)]*\)\), wall\(fromRIDB\([^)]*\)\), resolveOsm\(lat, lng, radius, osmKey\)\]\)/.test(getBody), "NPS, RIDB and the cache-first OSM resolver all race together in ONE allSettled — OSM's cache check cannot add a sequential leg after the others");
ok(!/const kept = await osmCacheGet\(osmKey\);/.test(getBody), "the old sequential 'try live in full, THEN check cache' pattern in GET() is gone — that ordering is exactly what caused the hang");

// 6. Fail-soft + cost invariants from the original route are untouched.
ok(/Overpass servers aggressively throttle/.test(src), "the OSM-unreliability rationale stays documented — future edits should not un-learn why this exists");
ok(/TTL = 6 \* 3600 \* 1000/.test(src), "the 6h success mem-cache window is unchanged");
ok(/10 \* 60 \* 1000/.test(src), "the 10-minute failure mem-cache window is unchanged — a transient OSM outage still is not sticky");
ok(/OSM_KEEP_MS = 7 \* 24 \* 3600 \* 1000/.test(src), "the 7-day durable OSM cache window is unchanged");

console.log(`check-outdoors-cache-first: OK — ${pass} assertions (cache-first race fixes the hang; no regression to the uncached or fail-soft paths)`);
