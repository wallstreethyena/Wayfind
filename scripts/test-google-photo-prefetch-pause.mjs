#!/usr/bin/env node
// Lock: background PRE-FETCH of Google place photos is OFF unless an operator sets
// GOOGLE_PHOTO_PREFETCH=on (owner, 2026-10-08; Google Maps Platform Terms 3.2.3(a)(i)
// "will not pre-fetch, index, store, reshare, or rehost Google Maps Content", 3.2.3(b)
// No Caching; Place Photos (New) docs "You cannot cache a photo name").
//
// Covers BOTH background pre-fetchers:
//   1. lib/creditedPhotoWarm.js blockedReason() -> CALLED with the switch unset/odd/on.
//   2. app/api/cron/photo-warm/route.js -> SOURCE check (comments stripped): the
//      googlePhotoPrefetchAllowed() guard returns before runPhotoWarm( is called. The
//      route imports Supabase/Next modules that this hermetic runner cannot load, so this
//      half is positional, not executed; it is red-proved by deleting the guard.
// False-positive surface: 2 files, 1 env name.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0; const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

const P = await import("../lib/googlePhotoPolicy.js");
ok(P.PREFETCH_ENV === "GOOGLE_PHOTO_PREFETCH", "the switch is GOOGLE_PHOTO_PREFETCH");
ok(P.googlePhotoPrefetchAllowed({}) === false, "unset = paused (fail safe)");
for (const v of ["", "1", "true", "yes", "off", "0"]) ok(P.googlePhotoPrefetchAllowed({ GOOGLE_PHOTO_PREFETCH: v }) === false, `"${v}" = paused`);
ok(P.googlePhotoPrefetchAllowed({ GOOGLE_PHOTO_PREFETCH: "on" }) === true, "CONTROL: 'on' resumes");
ok(P.googlePhotoPrefetchAllowed({ GOOGLE_PHOTO_PREFETCH: " ON " }) === true, "CONTROL: ' ON ' resumes (trim, case)");

const keep = { ...process.env };
Object.assign(process.env, { WAYFIND_GATE: "free", VERCEL_ENV: "production", CREDITED_PHOTO_WARM_MONTH_CAP: "800", GOOGLE_MAPS_SERVER_KEY: "k", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "s" });
delete process.env.GOOGLE_PHOTO_PREFETCH;
const W = await import("../lib/creditedPhotoWarm.js");
ok(W.blockedReason() === "prefetch-paused", `credited-photos warm is paused with the switch unset (got ${W.blockedReason()})`);
process.env.GOOGLE_PHOTO_PREFETCH = "on";
ok(W.blockedReason() === null, `CONTROL: with the switch on and a full env the warm is not blocked (got ${W.blockedReason()})`);
for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
Object.assign(process.env, keep);

const src = readFileSync(path.join(ROOT, "app/api/cron/photo-warm/route.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const guard = src.indexOf("if (!googlePhotoPrefetchAllowed())");
const call = src.indexOf("await runPhotoWarm(");
ok(guard > 0, "photo-warm route calls googlePhotoPrefetchAllowed() (source check)");
ok(guard > 0 && call > guard, "the pre-fetch guard sits BEFORE runPhotoWarm( (source check, not executed)");
const block = guard > 0 ? src.slice(guard, call) : "";
ok(/return Response\.json\(/.test(block) && /recordPulse\("photo-warm"/.test(block), "the paused branch records a pulse and returns before any photo request");

if (bad.length) { console.error("test-google-photo-prefetch-pause: FAIL\n - " + bad.join("\n - ")); process.exit(1); }
console.log(`test-google-photo-prefetch-pause: OK — ${n} assertions (switch default-off by call; credited warm paused by call; photo-warm guard before runPhotoWarm by source; 2 files, 1 env name)`);
