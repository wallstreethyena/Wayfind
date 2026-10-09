#!/usr/bin/env node
// Lock: background PRE-FETCH of Google place photos is OFF, and since 2026-10-08 (later) PROHIBITED
// outright: GOOGLE_PHOTO_PREFETCH=on no longer re-enables it (owner, 2026-10-08; Google Maps Platform Terms 3.2.3(a)(i)
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

// 2026-10-08 (later the same day): the pause became a PROHIBITION. GOOGLE_PHOTO_PREFETCH=on no longer
// re-enables anything; the policy module stays only as the legacy switch (asserted above) and nothing
// may let it back in. Executed half: both warm modules refuse with "on" set in the env they are handed.
const CW = await import("../lib/creditedPhotoWarm.js");
ok(CW.PREFETCH_PROHIBITED === "prefetch-prohibited", "creditedPhotoWarm exports PREFETCH_PROHIBITED");
ok(CW.blockedReason({ env: { GOOGLE_PHOTO_PREFETCH: "on" } }) === "prefetch-prohibited" && CW.blockedReason() === "prefetch-prohibited", "CALLED: blockedReason() is prohibited even with GOOGLE_PHOTO_PREFETCH=on");
const wr = await CW.warmCreditedPhotos({ placeIds: ["ChIJaaaaaaaaaaaaaaaaaaa"], deps: { readPairs: async () => { throw new Error("touched"); }, fetchOwned: async () => { throw new Error("touched"); } } });
ok(wr.blocked === "prefetch-prohibited" && wr.attempted === 0, "CALLED: warmCreditedPhotos makes no request and reports prohibited");
const PW = await import("../lib/photoWarm.js");
const pr = await PW.runPhotoWarm({ origin: "https://x.test", fetchImpl: async () => { throw new Error("touched"); }, max: 5 });
ok(PW.PHOTO_WARM_PROHIBITED === true && pr.paused === true && pr.pausedReason === "prefetch-prohibited" && pr.attempted === 0, "CALLED: runPhotoWarm is a constant no-op (prohibited, zero attempts)");

// Positional half. Line comments only for the lib file (it contains "/*" inside strings).
const warmSrc = readFileSync(path.join(ROOT, "lib/creditedPhotoWarm.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
const br = warmSrc.slice(warmSrc.indexOf("export function blockedReason"));
ok(/^export function blockedReason\(opts = \{\}\) \{\s*return PREFETCH_PROHIBITED;/.test(br), "blockedReason() returns PREFETCH_PROHIBITED as its FIRST statement (source check; behaviour CALLED above)");

ok(/if \(!googlePhotoPrefetchAllowed\(\)\)/.test("  if (!googlePhotoPrefetchAllowed()) {"), "CONTROL: the env-switch probe finds the old guard shape");
ok(/return Response\.json\(/.test("return Response.json({ ok: true })") && /recordPulse\("photo-warm"/.test('await recordPulse("photo-warm", {})'), "CONTROL: the return/pulse probes find known positives");
const strip = (f) => readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
{
  const src = strip("app/api/cron/photo-warm/route.js");
  const call = src.indexOf("await runPhotoWarm(");
  const guard = src.search(/if \(true\) \{/);
  ok(guard > 0 && call > guard, "photo-warm route: an UNCONDITIONAL guard (not googlePhotoPrefetchAllowed()) sits BEFORE runPhotoWarm( (source check, not executed: the route imports Supabase/Next modules this hermetic runner cannot load)");
  const block = guard > 0 ? src.slice(guard, call) : "";
  ok(/return Response\.json\(/.test(block) && /recordPulse\("photo-warm"/.test(block), "photo-warm route: the guard records a pulse and returns before any photo request");
  ok(!/if \(!googlePhotoPrefetchAllowed\(\)\)/.test(src), "photo-warm route: the env switch no longer decides anything");
}
{
  const src = strip("app/api/cron/credited-photos/route.js");
  const skip = src.search(/(?:^|[;}\n])\s*\{\s*const why = blockedReason\(\{ env: s \}\);\s*await recordPulse\("credited-photos"[^;]*;\s*return Response\.json\(\{ ok: true, skipped: true/);
  ok(skip > 0 && skip < src.indexOf("warmCreditedPhotos({") && skip < src.indexOf("loadBlogTargets("), "credited-photos route: an unconditional skip (blockedReason is prohibited) precedes every target read and the worker (source check)");
}

if (bad.length) { console.error("test-google-photo-prefetch-pause: FAIL\n - " + bad.join("\n - ")); process.exit(1); }
console.log(`test-google-photo-prefetch-pause: OK — ${n} assertions (legacy switch default-off by call; both warm modules prohibited by CALL even with the switch on; photo-warm and credited-photos route guards unconditional and before the worker by source; 4 files)`);
