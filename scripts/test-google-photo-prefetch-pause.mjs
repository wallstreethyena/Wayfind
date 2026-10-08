#!/usr/bin/env node
// Lock: background PRE-FETCH of Google place photos is OFF unless an operator sets
// GOOGLE_PHOTO_PREFETCH=on (owner, 2026-10-08; Google Maps Platform Terms 3.2.3(a)(i)
// "will not pre-fetch, index, store, reshare, or rehost Google Maps Content", 3.2.3(b)
// No Caching; Place Photos (New) docs "You cannot cache a photo name").
//
// Covers BOTH background pre-fetchers:
//   1. lib/creditedPhotoWarm.js blockedReason() -> switch checked first (source here;
//      CALLED with the switch unset in scripts/test-credited-photo-warm.mjs).
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

// The credited-photos warm half is CALLED in scripts/test-credited-photo-warm.mjs
// (blockedReason() === "prefetch-paused" with the switch unset), which owns that
// module's env fixture; this file reads no ambient env (check-guard-hermeticity).
// Line comments only: this file contains "/*" inside strings, so a block-comment
// strip would swallow real code.
const warmSrc = readFileSync(path.join(ROOT, "lib/creditedPhotoWarm.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
const br = warmSrc.slice(warmSrc.indexOf("export function blockedReason"));
ok(/^export function blockedReason\(opts = \{\}\) \{\s*if \(!googlePhotoPrefetchAllowed\(\)\) return PREFETCH_PAUSED;/.test(br), "blockedReason() checks the pre-fetch switch FIRST (source check; behaviour is CALLED in test-credited-photo-warm)");

const src = readFileSync(path.join(ROOT, "app/api/cron/photo-warm/route.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const guard = src.indexOf("if (!googlePhotoPrefetchAllowed())");
const call = src.indexOf("await runPhotoWarm(");
ok(guard > 0, "photo-warm route calls googlePhotoPrefetchAllowed() (source check)");
ok(guard > 0 && call > guard, "the pre-fetch guard sits BEFORE runPhotoWarm( (source check, not executed)");
const block = guard > 0 ? src.slice(guard, call) : "";
ok(/return Response\.json\(/.test(block) && /recordPulse\("photo-warm"/.test(block), "the paused branch records a pulse and returns before any photo request");

if (bad.length) { console.error("test-google-photo-prefetch-pause: FAIL\n - " + bad.join("\n - ")); process.exit(1); }
console.log(`test-google-photo-prefetch-pause: OK — ${n} assertions (switch default-off by call; credited warm guard first by source (called in test-credited-photo-warm); photo-warm guard before runPhotoWarm by source; 2 files, 1 env name)`);
