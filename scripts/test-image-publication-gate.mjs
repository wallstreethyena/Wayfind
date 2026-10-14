#!/usr/bin/env node
// scripts/test-image-publication-gate.mjs — hermetic, CALL-based lock for
// lib/imagePublicationGate.js and scripts/check-new-content-images.mjs.
//
// Invokes checkImageRecord across fixtures for each rule x each content type
// (place, event, guide, blog), each rule with a positive AND a negative control,
// then SPAWNS the runner in --files mode against temp files to prove it exits
// non-zero on a bad fixture and zero on a good / imageless one. No network.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkImageRecord } from "../lib/imagePublicationGate.js";
import { FALL_COLLECTION_POSTER, FALL_EVENT_IMAGE_HOLDS } from "../lib/fallEventImage.js";
import { FALLBACK_PATH } from "../lib/placePhotoServe.js";
import { extractRecords, classifyFile } from "./check-new-content-images.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

const TYPES = ["place", "event", "guide", "blog"];
const COMMONS = { image: "https://upload.wikimedia.org/wikipedia/commons/a/a1/X.jpg", credit: "RayRR", license: "CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg" };
const PID_A = "ChIJaaaaaaaaaaaaaaaa";
const PID_B = "ChIJbbbbbbbbbbbbbbbb";
let fixtures = 0;

// expectCode: null => must pass; string => must fail with that code.
function fx(label, type, record, expectCode, ctx = {}) {
  fixtures += 1;
  const r = checkImageRecord(record === null ? null : { id: "fx", ...record }, { type, ...ctx });
  if (expectCode === null) ok(r.ok === true && r.problems.length === 0, `${label} [${type}]: expected PASS, got ${JSON.stringify(r.problems)}`);
  else ok(r.ok === false && r.problems.some((p) => p.code === expectCode), `${label} [${type}]: expected ${expectCode}, got ${JSON.stringify(r.problems)}`);
}

for (const t of TYPES) {
  // (1) malformed refs: negatives, then a positive control
  fx("empty string", t, { image: "" }, "IMG_MALFORMED");
  fx("javascript: url", t, { image: "javascript:alert(1)" }, "IMG_MALFORMED");
  fx("data: url", t, { image: "data:image/png;base64,AAAA" }, "IMG_MALFORMED");
  fx("non-https", t, { image: "http://upload.wikimedia.org/x.jpg" }, "IMG_MALFORMED");
  fx("whitespace", t, { image: " https://upload.wikimedia.org/x.jpg" }, "IMG_MALFORMED");
  fx("'undefined' placeholder", t, { image: "undefined" }, "IMG_MALFORMED");
  fx("'null' placeholder", t, { image: "null" }, "IMG_MALFORMED");
  fx("well-formed commons image", t, { ...COMMONS }, null);
  // (2) unsupported source
  fx("unknown host", t, { image: "https://cdn.randomblog.example/photo.jpg", credit: "x", license: "CC BY 4.0", sourceUrl: "https://x.example/p" }, "IMG_UNSUPPORTED_SOURCE");
  fx("google-hosted url", t, { image: "https://lh3.googleusercontent.com/p/AF1Qip" }, "IMG_UNSUPPORTED_SOURCE");
  fx("hotlink-refused host", t, { image: "https://assets.usghostadventures.com/a.jpg" }, "IMG_UNSUPPORTED_SOURCE");
  fx("own-origin hosted file", t, { image: "https://www.gowayfind.com/guides/x.webp" }, null);
  // (3) attribution
  fx("commons without credit", t, { image: COMMONS.image, license: COMMONS.license, sourceUrl: COMMONS.sourceUrl }, "IMG_CREDIT_MISSING");
  fx("commons without license", t, { image: COMMONS.image, credit: "RayRR", sourceUrl: COMMONS.sourceUrl }, "IMG_CREDIT_MISSING");
  fx("commons NC license", t, { ...COMMONS, license: "CC BY-NC 4.0" }, "IMG_LICENSE_BAD");
  fx("unsplash wrong license", t, { image: "https://images.unsplash.com/photo-1?w=1", credit: "A", license: "All rights reserved" }, "IMG_LICENSE_BAD");
  fx("unsplash with license and credit", t, { image: "https://images.unsplash.com/photo-1?w=1", credit: "A", license: "Unsplash License" }, null);
  fx("user-contributed without consent", t, { image: "https://www.gowayfind.com/u/1.jpg", source: "user", credit: "@someone" }, "IMG_CREDIT_MISSING");
  fx("user-contributed with consent and credit", t, { image: "https://www.gowayfind.com/u/1.jpg", source: "user", credit: "@someone", consent: true }, null);
  fx("affiliation claim in credit", t, { ...COMMONS, credit: "Wayfind partner" }, "IMG_CREDIT_MISSING");
  // (5) no image is VALID
  fx("no image key", t, { name: "No photo" }, null);
  fx("image null", t, { image: null }, null);
  fx("image undefined", t, { image: undefined, hero_image: null }, null);
  fx("explicit neutral fallback path", t, { image: FALLBACK_PATH }, null);
}

// Google credit and (4) honesty: place + event semantics (check-event-photo-honesty)
for (const t of ["place", "event"]) {
  fx("google /api/photo venue photo", t, { hero_image: `/api/photo?place=${PID_A}&w=640`, hero_image_kind: "venue", place_id: PID_A }, null);
  fx("google claim with no /api/photo and no credit", t, { hero_image: "https://www.gowayfind.com/x.jpg", source: "google" }, "IMG_CREDIT_MISSING");
  fx("/api/photo naming no place", t, { hero_image: "/api/photo?w=640" }, "IMG_MALFORMED");
  fx("venue photo labelled event", t, { hero_image: `/api/photo?place=${PID_A}&w=640`, hero_image_kind: "event", place_id: PID_A }, "IMG_DISHONEST_KIND");
  fx("venue photo labelled venue", t, { hero_image: `/api/photo?place=${PID_A}&w=640`, hero_image_kind: "venue", place_id: PID_A }, null);
  fx("photo of venue X used for Y", t, { hero_image: `/api/photo?place=${PID_A}&w=640`, hero_image_kind: "venue", place_id: PID_B }, "IMG_WRONG_VENUE");
  fx("invalid hero_image_kind", t, { ...COMMONS, hero_image_kind: "stage" }, "IMG_DISHONEST_KIND");
  fx("collection poster as named photo", t, { hero_image: FALL_COLLECTION_POSTER }, "IMG_MISLEADING_FALLBACK");
  fx("stock scene as named photo", t, { hero_image: "/api/market-photo?query=food" }, "IMG_MISLEADING_FALLBACK");
  fx("pexels stock as named photo", t, { hero_image: "https://images.pexels.com/photos/1/a.jpeg", credit: "P", license: "Pexels License" }, "IMG_MISLEADING_FALLBACK");
}
fx("event venue photo with no kind label (venue by /api/photo semantics)", "event", { hero_image: `/api/photo?place=${PID_A}&w=640`, place_id: PID_A }, null);
const heldId = [...FALL_EVENT_IMAGE_HOLDS][0];
fx("event on image hold carries a photo", "event", { event_id: heldId, hero_image: `/api/photo?place=${PID_A}&w=640`, hero_image_kind: "venue" }, "IMG_MISLEADING_FALLBACK");
fx("event on image hold with neutral tile", "event", { event_id: heldId, hero_image: null }, null);
fx("unregistered /events photo (no consent record)", "event", { hero_image: "/events/not-registered.jpg" }, "IMG_UNREGISTERED_OWNED");
fx("registered consented /events photo", "event", { event_id: "mobius-night-market-2026-08", hero_image: "/events/mobius-night-market-hero.jpg", hero_image_kind: "event" }, null);
const PROV = { "goats.webp": { source: "https://unsplash.com/photos/x", license: "Unsplash License", creator: "R", depicted_venue: "Hunsader Farms, County Road 675, Bradenton" } };
fx("owned verified file with provenance, right venue", "event", { hero_image: "/guides/verified/goats.webp", hero_image_kind: "venue", venue: "Hunsader Farms" }, null, { provenance: PROV });
fx("owned verified file, wrong venue", "event", { hero_image: "/guides/verified/goats.webp", hero_image_kind: "venue", venue: "Keel Farms" }, "IMG_WRONG_VENUE", { provenance: PROV });
fx("owned verified file labelled event", "event", { hero_image: "/guides/verified/goats.webp", hero_image_kind: "event", venue: "Hunsader Farms" }, "IMG_DISHONEST_KIND", { provenance: PROV });
fx("owned verified file with no provenance row", "guide", { image: "/guides/verified/missing.webp" }, "IMG_CREDIT_MISSING", { provenance: PROV });
fx("guide cannot use a live Google photo", "guide", { image: `/api/photo?place=${PID_A}&w=640` }, "IMG_UNSUPPORTED_SOURCE");
fx("record is not an object", "event", null, "IMG_BAD_RECORD");
fx("unknown content type", "reel", { ...COMMONS }, "IMG_BAD_TYPE");

ok(fixtures >= 40, `at least 40 fixtures (got ${fixtures})`);

// extraction + classification (CALLED)
ok(classifyFile("data/halloween-release-2026-10-13.json") === "data-json", "event data json is content");
ok(classifyFile("data/guide-pick-photos/x.json") === "guide-pick", "guide pick data is content");
ok(classifyFile("supabase/migrations/20261013_x.sql") === "sql", "migrations are content");
ok(classifyFile("content/blog/post.md") === "blog", "blog posts here are content");
ok(classifyFile("scripts/foo.mjs") === null, "scripts are not content");
{
  const sql = "update wf_events set hero_image = 'javascript:alert(1)' where event_id='a'; update wf_events set official_event_url='http://x.example/a.jpg' where 1=1;";
  const { records } = await extractRecords("supabase/migrations/20261014_x.sql", sql);
  ok(records.length === 1 && records[0].rec.image === "javascript:alert(1)", "sql extractor takes image-column literals only, not other URL columns");
  const md = await extractRecords("content/blog/p.md", "---\ntitle: T\nimage: undefined\n---\nbody");
  ok(md.records.length === 1 && md.records[0].rec.image === "undefined", "blog frontmatter image is extracted");
}

// the runner, SPAWNED: non-zero on a bad fixture, zero on good / imageless
const tmp = mkdtempSync(path.join(os.tmpdir(), "wf-img-gate-"));
try {
  mkdirSync(path.join(tmp, "data"), { recursive: true });
  const bad = path.join(tmp, "data", "bad-events.json");
  const good = path.join(tmp, "data", "good-events.json");
  const none = path.join(tmp, "data", "imageless-events.json");
  writeFileSync(bad, JSON.stringify({ new_events: [{ event_id: "e-bad", event_name: "Bad", hero_image: "javascript:alert(1)" }] }));
  writeFileSync(good, JSON.stringify({ new_events: [{ event_id: "e-good", event_name: "Good", hero_image: `/api/photo?place=${PID_A}&w=640`, hero_image_kind: "venue", place_id: PID_A }] }));
  writeFileSync(none, JSON.stringify({ new_events: [{ event_id: "e-none", event_name: "No photo", hero_image: null }] }));
  const run = (f) => spawnSync(process.execPath, [path.join(REPO, "scripts/check-new-content-images.mjs"), "--files", f], { cwd: REPO, encoding: "utf8" });
  const rb = run(bad), rg = run(good), rn = run(none);
  ok(rb.status === 1 && /IMG_MALFORMED/.test(rb.stderr), `runner exits 1 on a bad fixture (status ${rb.status}, stderr ${rb.stderr.slice(0, 120)})`);
  ok(rg.status === 0 && /1 new\/changed content file\(s\) scanned/.test(rg.stdout), `runner exits 0 on a good fixture (status ${rg.status})`);
  ok(rn.status === 0 && /1 record\(s\) checked/.test(rn.stdout), `runner exits 0 on an imageless event, the neutral-fallback state (status ${rn.status})`);
  const missing = run(path.join(tmp, "data", "nope.json"));
  ok(missing.status === 1, "runner exits 1 when an injected file does not exist");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (fail.length) {
  console.error(`test-image-publication-gate: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`test-image-publication-gate: OK — ${pass} assertions; ${fixtures} fixtures CALLED through checkImageRecord (4 content types x malformed/unsupported/attribution/no-image rules, place+event x honesty rules, each with a positive and a negative control); runner SPAWNED: exit 1 on bad, 0 on good and on an imageless event`);
