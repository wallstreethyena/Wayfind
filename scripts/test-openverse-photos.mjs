// Regression for the second free licensed photo source (2026-11-20, owner:
// fill photo gaps from free sources, no Google spend). Executes the real
// finder against canned Openverse answers and the real worker against an
// in-memory database: identity, license, credit, no-answer handling, vault
// before serve, and the worklist never stealing a Commons retry.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findOpenversePhoto, openverseDepictsPlace, openverseLicenseCode, photoFromOpenverse, cityVariants, isOpenverseUnavailable } from "../lib/openversePhotos.js";
import { runOpenverseBackfill, selectOpenverseWorklist, describeOpenverseRun } from "../lib/openverseBackfill.js";
import { mayStorePermanently } from "../lib/photoLicense.js";
import { REPLAY_SOURCE_REF } from "../lib/placePhotoBackfill.js";

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

const res = (o) => ({ id: "ov-1", title: "The Barrymore Hotel Tampa Riverwalk", creator: "Stabbur's Master", license: "by-sa", license_version: "2.0",
  url: "https://live.staticflickr.com/65535/1_b.jpg", foreign_landing_url: "https://www.flickr.com/photos/x/1", filetype: "jpg", width: 1024, height: 683,
  attribution: '"The Barrymore Hotel Tampa Riverwalk" by Stabbur\'s Master is licensed under CC BY-SA 2.0. To view a copy of this license, visit https://x', tags: [{ name: "tampa" }], ...o });
const answer = (results, status = 200) => async () => ({ ok: status === 200, status, json: async () => ({ result_count: results.length, results }) });
const barrymore = { name: "The Barrymore Hotel Tampa Riverwalk", city: "Tampa" };

// ── Identity: exact place and town, never a lookalike. ─────────────────────
const exact = await findOpenversePhoto(barrymore, { doFetch: answer([res()]) });
ok(exact && exact.license === "cc-by-sa-2.0" && exact.source_ref === "openverse:ov-1", "exact title + town: accepted with its license code");
ok(exact.attribution_text === '"The Barrymore Hotel Tampa Riverwalk" by Stabbur\'s Master is licensed under CC BY-SA 2.0.', "credit is Openverse's own line, trimmed to its first sentence");
ok(exact.attribution_url === "https://www.flickr.com/photos/x/1", "credit links the https source page");
let why = null;
const animal = await findOpenversePhoto({ name: "Sun Bear", city: "St. Petersburg" }, { doFetch: answer([res({ title: "Sun bear at the zoo", tags: [{ name: "bear" }] })]), onReject: (r) => { why = r; } });
ok(animal === null && why === "openverse_identity_city_mismatch", "same words, different thing (a zoo animal): refused");
const elsewhere = openverseDepictsPlace(barrymore, res({ tags: [{ name: "chicago" }], title: "The Barrymore Hotel Tampa Riverwalk lobby" }));
ok(elsewhere.ok === true, "town in the title is enough");
const otherTown = openverseDepictsPlace({ name: "Columbia Restaurant", city: "Sarasota" }, res({ title: "Columbia Restaurant, Ybor City", tags: [{ name: "tampa" }] }));
ok(otherTown.ok === false && otherTown.reason === "openverse_identity_city_mismatch", "a chain's other branch (Tampa photo for the Sarasota place) is refused");
const partial = openverseDepictsPlace({ name: "Oak & Stone", city: "North Port" }, res({ title: "Oak tree and stone wall, North Port" }));
ok(partial.ok === false && partial.reason === "openverse_identity_title_mismatch", "name words scattered in a title are not the place name");
ok(openverseDepictsPlace({ name: "Sunken Gardens", city: "St. Petersburg" }, res({ title: "Sunken Gardens, Saint Petersburg" })).ok === true, "Saint/St spelling of the town matches");
ok(cityVariants("Fort Myers").includes("ft myers") && cityVariants("St. Petersburg").includes("st pete"), "town spelling variants");

// ── License: commercial reuse with edits only. ─────────────────────────────
ok(openverseLicenseCode(res({ license: "by-nc" })) === null && openverseLicenseCode(res({ license: "by-nd" })) === null, "NC and ND never pass");
ok(openverseLicenseCode(res({ license: "cc0" })) === "cc0" && openverseLicenseCode(res({ license: "pdm" })) === "pdm", "CC0 and Public Domain Mark pass");
ok(photoFromOpenverse(res({ url: "http://insecure/x.jpg" })) === null && photoFromOpenverse(res({ filetype: "svg" })) === null, "non-https or non-photo files are refused");
const vaultGate = mayStorePermanently({ source: "openverse", license: exact.license });
ok(vaultGate.allowed === true, "the vault gate accepts an Openverse photo with a free license");
ok(mayStorePermanently({ source: "openverse", license: "cc-by-nc-2.0" }).allowed === false, "the vault gate still refuses a non-free license under the openverse label");

// ── No answer is never a verdict. ──────────────────────────────────────────
let r429 = null;
const limited = await findOpenversePhoto(barrymore, { doFetch: answer([], 429), onReject: (r) => { r429 = r; } });
ok(limited === null && isOpenverseUnavailable(r429), "429 is 'no answer', not a rejection");
let none = null;
await findOpenversePhoto(barrymore, { doFetch: answer([]), onReject: (r) => { none = r; } });
ok(none === "openverse_no_results" && !isOpenverseUnavailable(none), "an empty answer is a real verdict");

// ── Worklist never takes what Commons will still retry. ────────────────────
const picked = selectOpenverseWorklist(["a", "b", "c", "d"], [
  { place_id: "a", source: "wikimedia", status: "rejected", source_ref: "rejected:identity_title_mismatch" },
  { place_id: "b", source: "wikimedia", status: "rejected", source_ref: REPLAY_SOURCE_REF },
  { place_id: "c", source: "openverse", status: "rejected", source_ref: "openverse-rejected:openverse_no_results" },
]);
ok(picked.length === 1 && picked[0] === "a", "only places Wikimedia closed for good, never a Commons replay, never one Openverse already decided, never one with no verdict yet");

// ── Worker against an in-memory database. ──────────────────────────────────
function fakeDb() {
  const db = {
    queue: [{ place_id: "P1", status: "open" }, { place_id: "P2", status: "open" }, { place_id: "P3", status: "open" }],
    photo: new Map([
      ["P1", { place_id: "P1", source: "wikimedia", status: "rejected", source_ref: "rejected:identity_geo_mismatch" }],
      ["P2", { place_id: "P2", source: "wikimedia", status: "rejected", source_ref: "rejected:no_direct_commons_candidate" }],
      ["P3", { place_id: "P3", source: "wikimedia", status: "rejected", source_ref: "rejected:identity_name_mismatch" }],
    ]),
    inv: [
      { place_id: "P1", name: "The Barrymore Hotel Tampa Riverwalk", postal_city: "Tampa", status: "OPERATIONAL", lat: 27.9, lng: -82.4 },
      { place_id: "P2", name: "Tiny Cafe", locality: "Bradenton", status: "OPERATIONAL", lat: 27.5, lng: -82.5 },
      { place_id: "P3", name: "Jock Lindsey's Hangar Bar", locality: "Lake Buena Vista", status: "OPERATIONAL", lat: 28.37, lng: -81.5 },
    ],
    statusLog: [],
  };
  const doFetch = async (url, init = {}) => {
    const u = new URL(url);
    const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
    if (u.hostname === "api.openverse.org") {
      const q = u.searchParams.get("q");
      if (q.includes("Barrymore")) return reply({ results: [res()] });
      if (q.includes("Jock")) return reply({ results: [res({ id: "ov-3", title: "Jock Lindsey's Hangar Bar", tags: [{ name: "lake buena vista" }] })] });
      return reply({ results: [] });
    }
    const path = u.pathname;
    if (path.endsWith("/wf_photo_repair_queue") && (!init.method || init.method === "GET")) return reply(db.queue);
    if (path.endsWith("/wf_photo_repair_queue") && init.method === "PATCH") {
      const id = decodeURIComponent(u.searchParams.get("place_id").slice(3));
      db.queue.find((q) => q.place_id === id).status = JSON.parse(init.body).status;
      return reply(null, 204);
    }
    if (path.endsWith("/wf_place_photo") && (!init.method || init.method === "GET")) return reply([...db.photo.values()]);
    if (path.endsWith("/wf_place_photo") && init.method === "POST") {
      for (const row of JSON.parse(init.body)) { db.photo.set(row.place_id, { ...row }); db.statusLog.push(row.place_id + ":" + row.status); }
      return reply(null, 201);
    }
    if (path.endsWith("/wf_place_photo") && init.method === "PATCH") {
      const id = decodeURIComponent(u.searchParams.get("place_id").slice(3));
      Object.assign(db.photo.get(id), JSON.parse(init.body));
      db.statusLog.push(id + ":" + db.photo.get(id).status);
      return reply(null, 204);
    }
    if (path.endsWith("/wf_inventory")) return reply(db.inv);
    throw new Error("unexpected fetch " + url);
  };
  return { db, doFetch };
}

{
  const { db, doFetch } = fakeDb();
  const vaultCalls = [];
  const storePhoto = async (args) => {
    vaultCalls.push(args);
    if (args.placeId === "P3") return { stored: false, reason: "download_failed" };
    db.photo.get(args.placeId).storage_path = args.placeId + "/x.jpg";
    return { stored: true };
  };
  const out = await runOpenverseBackfill({ sbEnv: { url: "https://db.test", key: "k" }, doFetch, storePhoto, spacingMs: 0 });
  ok(out.ok && out.worklist === 3 && out.attempted === 3, "worker takes the three eligible places");
  ok(out.active === 1 && db.photo.get("P1").status === "active" && db.photo.get("P1").source === "openverse", "a vaulted match goes live as an openverse row");
  ok(db.statusLog.indexOf("P1:stale") >= 0 && db.statusLog.indexOf("P1:stale") < db.statusLog.indexOf("P1:active"), "it is written unserved (stale) and switched on only after Wayfind's own copy exists");
  ok(db.queue.find((q) => q.place_id === "P1").status === "recovered", "the repair row is closed");
  ok(db.photo.get("P2").status === "rejected" && db.photo.get("P2").source_ref === "openverse-rejected:openverse_no_results", "no licensed photo: recorded once, not retried hourly");
  ok(db.photo.get("P3").status === "rejected" && /^openverse-unvaulted:download_failed$/.test(db.photo.get("P3").source_ref) && db.queue.find((q) => q.place_id === "P3").status === "open", "a failed vault copy never serves a hotlink and keeps the repair row open");
  ok(vaultCalls.every((c) => c.source === "openverse" && c.license.startsWith("cc-")), "vault receives the openverse source and license");
  ok(/1 active, 2 rejected \(1 unvaulted\)/.test(describeOpenverseRun(out)), "pulse note says what happened");
}
{
  const { db, doFetch } = fakeDb();
  const limitedFetch = async (url, init) => (new URL(url).hostname === "api.openverse.org" ? { ok: false, status: 429, json: async () => ({}) } : doFetch(url, init));
  const out = await runOpenverseBackfill({ sbEnv: { url: "https://db.test", key: "k" }, doFetch: limitedFetch, storePhoto: async () => ({ stored: true }), spacingMs: 0 });
  ok(out.attempted === 0 && out.deferred === 1 && /^unavailable_openverse_429$/.test(out.stoppedOn), "rate limited: the run stops at once");
  ok([...db.photo.values()].every((r) => r.source === "wikimedia"), "and records no verdict for places it never got an answer for");
}

// ── Wiring. ────────────────────────────────────────────────────────────────
const mig = read("supabase/migrations/20261120220000_wf_place_photo_openverse_source.sql");
ok(/'openverse'::text/.test(mig) && /'wikimedia'::text, 'owner'::text, 'creator'::text/.test(mig), "migration keeps the three sources and adds openverse");
const route = read("app/api/cron/place-photos-openverse/route.js");
ok(/auth !== "Bearer " \+ secret/.test(route) && /recordPulse\("place-photos-openverse"/.test(route), "cron is secret-gated and pulses");
const cron = JSON.parse(read("vercel.json")).crons.find((c) => c.path.startsWith("/api/cron/place-photos-openverse"));
ok(cron && /limit=8/.test(cron.path) && cron.schedule === "15 * * * *", "hourly at :15, 8 places (192/day, under Openverse's 200/day)");
const photoRoute = read("app/api/photo/route.js");
ok(/LICENSED_SOURCES\.has\(/.test(photoRoute), "an Openverse photo is labelled licensed, never 'permitted' (business permission)");
const lane = read("lib/openversePhotos.js") + read("lib/openverseBackfill.js") + route;
ok(/OPENVERSE_UA = "WayfindBot\/1\.0 \(https:\/\/gowayfind\.com\)"/.test(lane), "generic Wayfind identity, no personal contact");

console.log("test-openverse-photos: OK — " + assertions + " assertions");
