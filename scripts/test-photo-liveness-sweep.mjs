#!/usr/bin/env node
/**
 * scripts/test-photo-liveness-sweep.mjs — lib/photoLivenessSweep.js evicts
 * cached Google photo links the host refuses, before a reader sees a blank.
 *
 * Production (2026-09-17): Universal Orlando Resort rendered blank because
 * /api/photo served a cached lh3 link that answered 403; 55 of 1,993 served
 * links were dead. Locks: dead -> evicted; alive -> vok re-stamped in place
 * (never a fresh ToS clock); unknown -> untouched; non-Google rows skipped;
 * deadline respected; the photo-warm cron runs the sweep first; the request
 * path revalidates within hours, not a day. Hermetic: all I/O injected.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./lib/nodeResolveHook.mjs", import.meta.url);

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const { runPhotoLivenessSweep } = await import("../lib/photoLivenessSweep.js");
const L = await import("../lib/photoUriLiveness.js");

const G = (n) => `https://lh3.googleusercontent.com/place-photos/FIXTURE${n}=s4800-w640`;
const rows = [
  { k: "photo|places/ChIJA/photos/a|640", v: { uri: G("dead"), vok: 1 } },
  { k: "photo|places/ChIJB/photos/b|640", v: { uri: G("alive"), vok: 2 } },
  { k: "photo|places/ChIJC/photos/c|640", v: { uri: G("flaky") } },
  { k: "photo|places/ChIJD/photos/d|640", v: { uri: "https://gbh.supabase.co/storage/v1/object/public/place-photos/x.jpg" } },
  { k: "rails|v1|x", v: { uri: G("notphoto") } },
];
const verdicts = { dead: L.PHOTO_URI_DEAD, alive: L.PHOTO_URI_ALIVE, flaky: L.PHOTO_URI_UNKNOWN };
const evicted = [], marked = [], probed = [];
const res = await runPhotoLivenessSweep({
  now: () => 5000,
  deadlineAt: 10_000,
  listRows: async (limit) => { ok(limit === 300, "S0: default limit is 300"); return rows; },
  probe: async (uri) => { probed.push(uri); return verdicts[/FIXTURE(\w+)=/.exec(uri)[1]]; },
  evict: async (k) => { evicted.push(k); return true; },
  markValid: async (k, v) => { marked.push([k, v]); return true; },
});
ok(res.listed === 5 && res.checked === 3 && res.skipped === 2, `S1: 3 Google photo rows checked, 2 skipped (got ${JSON.stringify(res)})`);
ok(res.dead === 1 && res.evicted === 1 && evicted[0] === rows[0].k, "S2: the dead link's row is evicted");
ok(res.alive === 1 && marked.length === 1 && marked[0][0] === rows[1].k && marked[0][1].vok === 5000 && marked[0][1].uri === G("alive"), "S3: the live row's vok is re-stamped in place");
ok(res.unknown === 1 && !evicted.includes(rows[2].k) && !marked.some(([k]) => k === rows[2].k), "S4: an unknown verdict leaves the row untouched");
ok(!probed.some((u) => /supabase|notphoto/.test(u)) && /supabase/.test("x.supabase.co"), "S5: vault copies and non-photo keys are never probed (positive control included)");

// Deadline
let t = 0;
const slow = await runPhotoLivenessSweep({ now: () => (t += 10), deadlineAt: 25, concurrency: 1, listRows: async () => rows.slice(0, 3), probe: async () => L.PHOTO_URI_ALIVE, evict: async () => true, markValid: async () => true });
ok(slow.checked < 3, `S6: the sweep stops at its deadline (checked ${slow.checked})`);

// Failures never throw
const broken = await runPhotoLivenessSweep({ listRows: async () => { throw new Error("db down"); } });
ok(broken.listed === 0 && broken.checked === 0, "S7: a failed listing is an empty sweep, not a crash");
const throwing = await runPhotoLivenessSweep({ now: () => 1, deadlineAt: 2, listRows: async () => rows.slice(0, 1), probe: async () => L.PHOTO_URI_DEAD, evict: async () => { throw new Error("x"); }, markValid: async () => true });
ok(throwing.dead === 1 && throwing.evicted === 0, "S8: a failed eviction is counted, not thrown");

// Request-path timing
ok(L.PHOTO_URI_REVALIDATE_MS <= 3 * 3600_000 && L.PHOTO_URI_VALIDATE_GRACE_MS <= 3600_000, "T1: request-time revalidation happens within hours, not a day");
ok(L.PHOTO_REDIRECT_TTL_SECONDS <= 3 * 3600, "T2: a Google photo redirect is cached downstream for at most three hours");

// Wiring
const route = readFileSync(new URL("../app/api/cron/photo-warm/route.js", import.meta.url), "utf8");
ok(/runPhotoLivenessSweep\(/.test(route) && route.indexOf("runPhotoLivenessSweep(") < route.indexOf("runPhotoWarm({"), "W1: the photo-warm cron sweeps dead links before warming");
ok(/if \(process\.env\.VERCEL_ENV !== "production"\)/.test(route) && route.indexOf('VERCEL_ENV !== "production"') < route.indexOf("runPhotoLivenessSweep("), "W2: the sweep only runs in production");

if (fail.length) {
  console.error(`test-photo-liveness-sweep: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-photo-liveness-sweep: OK — ${pass} assertions`);
