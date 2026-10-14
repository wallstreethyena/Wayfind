#!/usr/bin/env node
// Paid photo purchasing is reachable ONLY for a real Google place id, and the
// image publication gate sits in front of every write path that sets an image.
// Hermetic: injected ledger/inventory/fetch doubles, no network, no env verdicts.
//
// Part 1 (CALL): resolvePlacePhoto with a counting authorizeSpend.
// Part 2 (CALL + static): gateImageForWrite refuses a bad image and keeps the row;
//   every wired write path imports and calls it BEFORE the write.
import { readFileSync } from "node:fs";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";
import { gateImageForWrite } from "../lib/imageWriteGate.js";

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL: " + m); process.exit(1); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const src = (p) => strip(readFileSync(new URL("../" + p, import.meta.url), "utf8"));

// ── Part 1: the paid path ────────────────────────────────────────────────
async function run(input, inv = null) {
  let grants = 0, fetches = 0;
  const res = await resolvePlacePhoto(
    { w: 640, googleSurface: true, gateShut: false, probe: false, serverKey: "test-key", ...input,
      authorizeSpend: async () => { grants++; return { ok: true }; } },
    { inventoryGet: async () => inv, probeUri: async () => "alive", breakerOpen: async () => null, tripBreaker: async () => {},
      fetchOwnedUri: async () => { fetches++; return { uri: null, upstream: "server", retried: false, refunded: 0 }; } },
  );
  return { res, grants, fetches };
}

const REAL = "ChIJ_5yVrBY13YgRwSgyH1hrRjg";
const pos = await run({ place: REAL });
ok(pos.grants === 1 && pos.fetches === 1, `positive control: a real Google place id reaches authorizeSpend and Google (grants=${pos.grants}, fetches=${pos.fetches})`);
const posRef = await run({ ref: `places/${REAL}/photos/AUy1YQ` });
ok(posRef.grants === 1, "positive control: a ref embedding a real place id reaches authorizeSpend");

for (const slug of ["siesta-key-beach-guide-2026", "christmas-lights-tampa-bay", "fall-festival-sarasota-2026-10-24", "evt_0123456789abcdef0123"]) {
  const r = await run({ place: slug });
  ok(r.grants === 0 && r.fetches === 0, `${slug}: zero authorizeSpend calls and zero Google calls (grants=${r.grants})`);
  ok(r.res.reason === "not-place-id" && r.res.type === "empty", `${slug}: named outcome not-place-id (got ${r.res.reason})`);
  const rr = await run({ ref: `places/${slug}/photos/AUy1YQ` });
  ok(rr.grants === 0 && rr.res.reason === "not-place-id", `${slug}: a ref embedding it is refused before authorizeSpend`);
}
// the refusal precedes the gate/key/probe checks, so it holds even for a shut gate
ok((await run({ place: "christmas-lights-tampa-bay", gateShut: true })).res.reason === "not-place-id", "slug refusal is independent of gate state");
// free rung survives: an owned photo for the same slug-shaped id still serves
const owned = await run({ place: "christmas-lights-tampa-bay" }, { photo_url: "https://cdn.example.com/owned/x.jpg" });
ok(owned.res.type === "redirect" && owned.res.reason === "inventory" && owned.grants === 0, "owned/inventory photo still serves for a slug-shaped id with zero grants");

// route + telemetry wiring
const route = src("app/api/photo/route.js");
ok(/result\.reason === "not-place-id" \? "not-place-id"/.test(route), "route records the not-place-id outcome class");
ok(/result\.reason === "not-page-request" \? "not-page-request"/.test(route), "positive control: the route probe finds the sibling not-page-request mapping");
const health = src("app/api/health/photos/route.js");
ok(/NAMED_OUTCOME_CLASSES = new Set\(\[[^\]]*"not-place-id"/.test(health), "health: not-place-id is a NAMED outcome class");
ok(/NAMED_OUTCOME_CLASSES = new Set\(\[[^\]]*"visitor-cap"/.test(health), "positive control: health probe finds a known sibling class");
const audit = src("scripts/lib/photoInventoryAudit.mjs");
ok(/GENUINE = new Set\(\[[^\]]*"not-place-id"/.test(audit), "inventory audit: not-place-id is GENUINE");
ok(/GENUINE = new Set\(\[[^\]]*"visitor-cap"/.test(audit), "positive control: audit probe finds a known sibling class");
const alerts = readFileSync(new URL("../lib/commandCenter/alerts.js", import.meta.url), "utf8");
ok(alerts.includes("ledger-timeout"), "positive control: the alert source lists real failure classes");
ok(!alerts.includes("not-place-id"), "alerts: not-place-id is an expected refusal, never a failure count");

// ── Part 2: the image publication gate on write paths ────────────────────
const bad = gateImageForWrite({ event_id: "e1", event_name: "X", hero_image: "javascript:alert(1)" }, { type: "event" }, () => {});
ok(bad.refused && bad.record.hero_image === null && bad.record.event_name === "X", "bad image refused (image nulled) while the record itself is kept");
ok(bad.problems.some((p) => p.code === "IMG_MALFORMED"), "refusal carries the gate's problem codes");
const logged = []; gateImageForWrite({ event_id: "e2", hero_image: "https://example.com/x.jpg" }, { type: "event" }, (m) => logged.push(m));
ok(logged.length === 1 && /e2/.test(logged[0]) && /IMG_UNSUPPORTED_SOURCE/.test(logged[0]), "refusal logs the id and codes");
const good = gateImageForWrite({ event_id: "e3", venue: "V", hero_image: "/api/photo?place=" + REAL + "&w=800" }, { type: "event" }, () => {});
ok(!good.refused && good.record.hero_image.includes(REAL), "positive control: a valid venue photo passes untouched");
ok(!gateImageForWrite({ event_id: "e4", hero_image: null }, { type: "event" }, () => {}).refused, "no image is a valid state, never refused");

// each wired path: imports the helper, calls it, and the call precedes the write
const PATHS = [
  ["scripts/backfill-event-heroes-2026-08-26.mjs", "gateImageForWrite({ event_id", "method: \"PATCH\""],
  ["scripts/seed-fall-2026.mjs", "gateImageForWrite(r,", "rest/v1/wf_events?on_conflict"],
  ["scripts/seed-fall-sarasota-2026.mjs", "gateImageForWrite(r,", "rest/v1/wf_events?on_conflict"],
  ["scripts/seed-fall-instagram-finds-sep06.mjs", "gateImageForWrite(r,", "rest/v1/wf_events?on_conflict"],
  ["scripts/ingest-verified-2026-08-26.mjs", "gateImageForWrite(sideshowRow", "NONE"], // inline in the write body: asserted separately below
  ["app/api/cron/hero-images/route.js", "imageRefused(pick.place_id", "from(\"wf_hero_images\").upsert"],
];
for (const [file, call, write] of PATHS) {
  const s = src(file);
  ok(/import \{ gateImageForWrite \} from "[./]+\/lib\/imageWriteGate\.js";/.test(s), `${file}: imports gateImageForWrite`);
  const iCall = s.indexOf(call), iWrite = write === "NONE" ? Infinity : s.indexOf(write);
  ok(iCall > 0 && iWrite > 0, `${file}: finds the gate call and the write it protects`);
  ok(iCall < iWrite, `${file}: gate call is placed before the write`);
}
ok(/wf_events\?on_conflict=event_id`[^;]{0,200}JSON\.stringify\(\[gateImageForWrite\(sideshowRow/.test(src("scripts/ingest-verified-2026-08-26.mjs")), "ingest-verified-2026-08-26: the events insert body is the gated record");
const cron = src("app/api/cron/hero-images/route.js");
ok((cron.match(/!imageRefused\(/g) || []).length === 2, "cron: both hero rows (buzz, family) are gated before rows.push");
ok(/gateImageForWrite\(\{ type: "place"/.test(cron), "cron: gates the place image record");
console.log(`photo-not-place-id: ${n} assertions ok`);
