// check-cache-refresh — the v6.35 "keep every card hot" contract, locked so a
// future edit CANNOT silently reintroduce the 30-day cold cliff, turn the
// background refresh into a blocking (user-slowing) call, or let the refresh
// worker be weaponized into fetching arbitrary Google queries. Same posture as
// check-hours/check-cards: read the REAL source and fail the build on drift.
import { readFileSync } from "fs";

const fail = (m) => { console.error("check-cache-refresh: FAIL — " + m); process.exit(1); };
const read = (p) => { try { return readFileSync(new URL(p, import.meta.url), "utf8"); } catch { fail("missing protected file: " + p); } };

const cache = read("../lib/serverCache.js");
const search = read("../app/api/places/search/route.js");
const refresh = read("../app/api/places/refresh/route.js");

// ── 1. The jitter engine + its ToS-critical bound ────────────────────────────
if (!/export function refreshAgeFor\(/.test(cache)) fail("serverCache lost refreshAgeFor()");
if (!/export function refreshDue\(/.test(cache)) fail("serverCache lost refreshDue()");
// The refresh window MUST stay under 30 days — this is what guarantees a card is
// re-fetched BEFORE its 30-day expiry, so no user ever hits a cold entry.
if (!/REFRESH_MAX_MS\s*=\s*2[0-9]\s*\*\s*DAY/.test(cache)) fail("REFRESH_MAX_MS must be 20-29*DAY — it MUST stay < 30 days (ToS + no cold cliff)");
if (/REFRESH_MAX_MS\s*=\s*(3[0-9]|[4-9][0-9])\s*\*\s*DAY/.test(cache)) fail("REFRESH_MAX_MS reached/exceeded 30*DAY — the cold cliff is back");
// cget must SURFACE `due` so the read path can act on it.
if (!/due:\s*refreshDue\(/.test(cache)) fail("cget no longer surfaces `due` (refreshDue) — the read path can't trigger refresh-ahead");

// ── 2. The read path pokes a refresh — and NEVER blocks the user on it ───────
if (!/function pokeRefresh\(/.test(search)) fail("pokeRefresh() helper is missing from the search route");
if (!/if \(fresh\.due\) pokeRefresh\(/.test(search)) fail("search route no longer pokes a refresh on a due cache hit — the day-31 cliff is back");
if (/await\s+pokeRefresh/.test(search)) fail("pokeRefresh is AWAITED — a refresh must never block/slow the user's response");
if (!/fetch\(u,/.test(search) || !/\.catch\(\(\) => \{\}\)/.test(search)) fail("the refresh poke's fetch is not fire-and-forget (must be `fetch(u, …).catch(() => {})`, never awaited)");
if (!/REFRESH_FIRED/.test(search)) fail("the per-key poke throttle (REFRESH_FIRED) is gone — a burst could stampede the refresh worker");

// ── 3. The refresh worker is BOUNDED (can't be weaponized) + de-duped ────────
if (!/const cur = await cget\(/.test(refresh)) fail("refresh worker no longer checks the existing entry first — it could fetch ARBITRARY new queries");
if (!/not cached/.test(refresh)) fail("refresh worker lost its 'only touch existing entries' guard");
if (!/MIN_GAP_MS/.test(refresh)) fail("refresh worker lost its de-dupe window (MIN_GAP_MS) — a poke burst could spike Google spend");
if (!/key mismatch/.test(refresh)) fail("refresh worker lost the key-consistency check (params must reconstruct the requested key)");

// ── 4. The two routes MUST build the SAME cache key + request the SAME fields ─
// (or the worker refreshes the wrong row, or writes a differently-shaped result).
const KEYSIG = '"v1", q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), Math.round(radius / 1000), n';
if (!search.includes(KEYSIG)) fail("search route cache-key formula changed — update the refresh worker to match");
if (!refresh.includes(KEYSIG)) fail("refresh worker cache-key formula drifted from the search route (would refresh the wrong entry)");
for (const field of ["places.regularOpeningHours", "places.photos", "places.businessStatus", "places.priceLevel"]) {
  if (!refresh.includes(field)) fail("refresh worker field mask drifted from the search route (missing " + field + ")");
}

console.log("check-cache-refresh: OK — refresh-ahead locked (jitter < 30d · non-blocking poke · bounded+deduped worker · key/mask parity)");
