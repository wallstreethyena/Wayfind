#!/usr/bin/env node
// scripts/test-event-hero-provenance.mjs — hermetic, CALL-based lock for
// scripts/lib/eventHeroProvenance.mjs (classifyEventHero) and the runner
// scripts/classify-event-hero-provenance.mjs (injected fake fetch; no network, no disk writes).
import { classifyEventHero, buildProvenanceIndex, nameOverlap } from "./lib/eventHeroProvenance.mjs";
import { run } from "./classify-event-hero-provenance.mjs";
import { allEventPhotoPaths, mayHostEventPhotos } from "../lib/eventPhotos.js";

let pass = 0, fixtures = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };
const PID = "ChIJkeel000000000000", PID2 = "ChIJother00000000000";
const ref = (p) => `/api/photo?ref=${encodeURIComponent(`places/${p}/photos/AUabc`)}&w=800`;
const prov = buildProvenanceIndex([
  { photos: [{ file: "reg.webp", source_url: "https://commons.wikimedia.org/wiki/File:Legoland_Florida_sign.jpg", creator: "A. Heneen", license: "CC BY-SA", depicted_venue: "LEGOLAND" }] },
  { "noprov-credit.webp": { source: "https://commons.wikimedia.org/wiki/File:Credit_less.jpg", license: "CC BY-SA" } },
]);
const ctx = { inventoryNames: { [PID]: "Keel Farms", [PID2]: "Dakin Dairy Farms" }, provenance: prov };
const owned = allEventPhotoPaths()[0];
const ownedEvent = Object.keys((await import("../lib/eventPhotos.js")).EVENT_PHOTO_SETS)[0];

function fx(name, row, want, c = ctx) {
  fixtures++;
  const r = classifyEventHero({ event_id: "e1", event_name: "Fall Fest", ...row }, c);
  ok(r.class === want.class && r.action === want.action, `${name}: got ${r.class}/${r.action} (${r.reason}), want ${want.class}/${want.action}`);
  if (want.newKind !== undefined) ok(r.newKind === want.newKind, `${name}: newKind ${r.newKind} want ${want.newKind}`);
  if (want.action === "clear") ok(r.newImage === null && r.newKind === null, `${name}: clear must set image+kind null`);
  else ok(r.newImage === undefined, `${name}: non-clear must not set newImage`);
  ok(typeof r.reason === "string" && r.reason.length > 0, `${name}: reason present`);
  return r;
}

// venue-photo-route
fx("pid == own place_id", { venue: "Whatever", place_id: PID, hero_image: ref(PID) }, { class: "venue-photo-route", action: "label-venue", newKind: "venue" });
fx("own place_id via place= param", { place_id: PID, hero_image: `/api/photo?place=${PID}&w=640` }, { class: "venue-photo-route", action: "label-venue", newKind: "venue" });
fx("inventory name matches venue", { venue: "Keel Farms", hero_image: ref(PID) }, { class: "venue-photo-route", action: "label-venue", newKind: "venue" });
fx("different venue's photo", { venue: "Dakin Dairy Farms", hero_image: ref(PID) }, { class: "venue-photo-route", action: "clear" });
fx("place_id set but PID differs, venue mismatch", { venue: "Dakin Dairy Farms", place_id: PID2, hero_image: ref(PID) }, { class: "venue-photo-route", action: "clear" });
fx("no venue (event-name-based)", { venue: "", hero_image: ref(PID) }, { class: "venue-photo-route", action: "clear" });
fx("citywide venue", { venue: "Citywide Sarasota", hero_image: ref(PID) }, { class: "venue-photo-route", action: "clear" });
fx("venue equals event name", { event_name: "Keel Farms", venue: "Keel Farms", hero_image: ref(PID) }, { class: "venue-photo-route", action: "clear" });
fx("PID unknown in inventory", { venue: "Keel Farms", hero_image: ref("ChIJunknown000000000") }, { class: "venue-photo-route", action: "clear" });
fx("empty inventory name", { venue: "Keel Farms", hero_image: ref(PID) }, { class: "venue-photo-route", action: "clear" }, { ...ctx, inventoryNames: { [PID]: "" } });
fx("partial overlap below 0.6", { venue: "Keel Farms Brewery Tasting Room", hero_image: ref(PID) }, { class: "venue-photo-route", action: "clear" });
fx("api/photo with no place or ref", { venue: "Keel Farms", hero_image: "/api/photo?w=800" }, { class: "venue-photo-route", action: "clear" });
ok(nameOverlap("Keel Farms", "Keel Farms") === 1 && nameOverlap("", "Keel") === 0, "nameOverlap controls");

// eventbrite
fx("eventbrite no consent", { hero_image: "https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fx.jpg" }, { class: "eventbrite", action: "clear" });
fx("eventbrite with consent", { event_id: ownedEvent, hero_image: "https://img.evbuc.com/x.jpg" }, { class: "eventbrite", action: "keep" }, { ...ctx, mayHostEventPhotos: (id) => id === ownedEvent });
fx("eventbrite consent for other event", { event_id: "e1", hero_image: "https://img.evbuc.com/x.jpg" }, { class: "eventbrite", action: "clear" }, { ...ctx, mayHostEventPhotos: (id) => id === ownedEvent });

// licensed hotlink
fx("wikimedia with credit", { hero_image: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Legoland_Florida_sign.jpg" }, { class: "licensed-hotlink", action: "keep" });
fx("wikimedia thumb with credit", { hero_image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Legoland_Florida_sign.jpg/800px-Legoland_Florida_sign.jpg" }, { class: "licensed-hotlink", action: "keep" });
fx("wikimedia without record", { hero_image: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Unknown.jpg" }, { class: "licensed-hotlink", action: "clear" });
fx("wikimedia record lacks creator", { hero_image: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Credit_less.jpg" }, { class: "licensed-hotlink", action: "clear" });

// owned
if (owned) {
  fx("owned registered + consent", { event_id: ownedEvent, hero_image: owned.src }, { class: "owned", action: "keep" });
  ok(mayHostEventPhotos(ownedEvent), "registry consent real for control");
}
fx("owned unregistered", { hero_image: "/events/not-registered.jpg" }, { class: "owned", action: "flag" });
fx("owned via provenance file", { hero_image: "/guides/verified/reg.webp" }, { class: "owned", action: "keep", newKind: "venue" });
fx("owned dir but no row", { hero_image: "/guides/verified/missing.webp" }, { class: "owned", action: "flag" });

// third party + malformed
fx("random hotlink", { hero_image: "https://example.com/pic.jpg" }, { class: "third-party-hotlink", action: "clear" });
fx("http hotlink", { hero_image: "http://upload.wikimedia.org/a.jpg" }, { class: "third-party-hotlink", action: "clear" });
fx("protocol-relative", { hero_image: "//example.com/a.jpg" }, { class: "third-party-hotlink", action: "clear" });
fx("empty", { hero_image: "" }, { class: "malformed", action: "flag" });
fx("null", { hero_image: null }, { class: "malformed", action: "flag" });
fx("whitespace", { hero_image: "https://example.com/a b.jpg" }, { class: "malformed", action: "flag" });
{ fixtures++; const r = classifyEventHero(null, ctx); ok(r.class === "malformed" && r.action === "flag", "null row malformed"); }
{ fixtures++; const r = classifyEventHero({ event_id: "e", hero_image: "https://example.com/x.jpg", image_alt: "x" }, ctx); ok(r.newAlt === null, "image_alt nulled only when present on row"); }
{ fixtures++; const r = classifyEventHero({ event_id: "e", hero_image: "https://example.com/x.jpg" }, ctx); ok(!("newAlt" in r), "no newAlt when row lacks image_alt"); }

// ---- runner, fake fetch ----
const rows = [
  { event_id: "A", event_name: "Fall Fest", venue: "Keel Farms", place_id: null, hero_image: ref(PID), hero_image_kind: null },
  { event_id: "B", event_name: "Expo", venue: "Somewhere", place_id: null, hero_image: "https://img.evbuc.com/x.jpg", hero_image_kind: null },
  { event_id: "C", event_name: "Odd", venue: "x", place_id: null, hero_image: "/events/not-registered.jpg", hero_image_kind: null },
];
function harness({ failPatchAt = null, secret = "SECRET-KEY-123" } = {}) {
  const log = [], outs = [], files = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    log.push({ method, url, body: init.body, order: files.length });
    const j = (b, status = 200) => ({ ok: status < 400, status, json: async () => b });
    if (method === "PATCH") {
      const n = log.filter((l) => l.method === "PATCH").length;
      if (failPatchAt === n) return j({}, 500);
      return j([{ ok: 1 }]);
    }
    if (url.includes("/wf_inventory")) return j([{ place_id: PID, name: "Keel Farms" }]);
    return j(rows);
  };
  return { log, outs, files, opts: (argv, env) => ({ env: env || { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: secret }, argv, fetchImpl, out: (s) => outs.push(s), writeFile: (p, c) => files.push({ p, c, patchesBefore: log.filter((l) => l.method === "PATCH").length }), provenanceDocs: [] }) };
}
{
  const h = harness();
  const rc = await run(h.opts([]));
  ok(rc === 0, "dry run exits 0");
  ok(h.log.every((l) => l.method === "GET"), "dry run makes zero PATCH");
  ok(h.files.length === 0, "dry run writes no reverse file");
  ok(h.log.some((l) => /wf_inventory\?.*place_id=in\.\(/.test(l.url)), "inventory fetched with in.() chunk");
  ok(h.log[0].url.includes("hero_image_kind=is.null") && h.log[0].url.includes("hero_image=not.is.null"), "row filter: non-empty hero, null kind");
  ok(!h.outs.join("\n").includes("SECRET-KEY-123"), "key never printed");
  ok(/venue-photo-route \/ label-venue: 1/.test(h.outs.join("\n")) && /eventbrite \/ clear: 1/.test(h.outs.join("\n")) && /owned \/ flag: 1/.test(h.outs.join("\n")), "per-class summary");
}
{
  const h = harness();
  const rc = await run(h.opts(["--commit"]));
  ok(rc === 2 && h.log.length === 0, "--commit without --reverse-out refuses before any request");
  const h2 = harness();
  ok((await run(h2.opts(["--commit", "--reverse-out"]))) === 2 && h2.log.length === 0, "--reverse-out with no value refuses");
  const h3 = harness();
  ok((await run(h3.opts([], {}))) === 2 && h3.log.length === 0, "no env refuses, no request");
}
{
  const h = harness();
  const rc = await run(h.opts(["--commit", "--reverse-out", "/tmp/rev.sql"]));
  const patches = h.log.filter((l) => l.method === "PATCH");
  ok(rc === 0, "commit exits 0");
  ok(patches.length === 2, `commit patches only label-venue + clear (got ${patches.length}; flag row C untouched)`);
  ok(h.files.length === 1 && h.files[0].p === "/tmp/rev.sql" && h.files[0].patchesBefore === 0, "reverse file written before first PATCH");
  ok(/UPDATE public\.wf_events SET hero_image = '.*', hero_image_kind = NULL WHERE event_id = 'A';/.test(h.files[0].c) && !h.files[0].c.includes("'C'"), "reverse SQL restores old values, only changed rows");
  ok(patches.every((p) => /hero_image=eq\./.test(p.url) && /event_id=eq\./.test(p.url) && /hero_image_kind=is\.null/.test(p.url)), "CAS filter present on every PATCH");
  ok(JSON.parse(patches[0].body).hero_image_kind === "venue" && !("hero_image" in JSON.parse(patches[0].body)), "label-venue sets only kind");
  const b = JSON.parse(patches[1].body);
  ok(b.hero_image === null && b.hero_image_kind === null, "clear nulls image + kind");
}
{
  const h = harness({ failPatchAt: 1 });
  const rc = await run(h.opts(["--commit", "--reverse-out", "/tmp/rev.sql"]));
  ok(rc === 1 && h.log.filter((l) => l.method === "PATCH").length === 1, "stops on first HTTP error");
}

if (fail.length) {
  console.error(`test-event-hero-provenance: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  x " + m);
  process.exit(1);
}
console.log(`test-event-hero-provenance: OK — ${pass} assertions; ${fixtures} fixtures CALLED through classifyEventHero (venue-photo-route own/inventory/mismatch/no-venue/unknown, eventbrite +/- consent, wikimedia +/- credit, owned registered/unregistered, third-party, malformed); runner CALLED with fake fetch: dry run 0 PATCH, --commit refuses without --reverse-out, reverse file before first PATCH, CAS filter, stop on first error`);
