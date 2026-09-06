#!/usr/bin/env node
// scripts/test-drive-source-centers.mjs — Worth the Drive reads NON-INDEXED
// South Florida drive-source centres, and nothing else changed.
//
// THE BUG THIS LOCKS DOWN (poster audit 2026-09-06): a Miami reader's Worth
// the Drive rail was empty — pools.drive = 0 — because buildDrivePool only
// borrowed inventory from OTHER LANDING_CITIES within DRIVE_REACH_MI, and
// Miami has none. The owned Fort Lauderdale / Homestead inventory sat unread.
// The fix is a separate registry (lib/driveSourceCenters.js) that is NOT a
// landing city: it must add candidate centres for Miami, add nothing for the
// Gulf Coast, and emit zero sitemap URLs.
//
// Everything below is BEHAVIOUR: buildDrivePool is called for real (loaded
// through the same JSX loader the compute-budget guard uses) with the ranker
// and registries injected, and globalThis.fetch set to THROW so any network
// reach is a loud failure, never a silent pass.
//
// MUTATION CHECK (verified by hand 2026-09-06 before commit): deleting the
// `for (const slug of Object.keys(drive)) consider(slug, drive[slug], false);`
// line in lib/driveSourceCenters.js makes "Miami sees fort-lauderdale",
// "Miami sees homestead" and the RED/GREEN pair fail while every Gulf Coast
// control still passes — the union is load-bearing and nothing else is
// masking it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { DRIVE_SOURCE_CENTERS, driveCentersWithin } from "../lib/driveSourceCenters.js";
import { DRIVE_MIN_MI, DRIVE_REACH_MI } from "../lib/railSelect.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

// Registries from the REAL modules (landing.js pulls JSX, so it goes through
// the loader), so a drift in either registry is caught here, not in prod.
process.env.SUPABASE_URL = "https://fixture.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
delete process.env.GOOGLE_MAPS_SERVER_KEY;
const landingMod = await loadComponent(join(ROOT, "lib/landing.js"), ROOT);
const railsMod = await loadComponent(join(ROOT, "lib/railsData.js"), ROOT);
const LANDING_CITIES = landingMod.LANDING_CITIES;
const { buildDrivePool } = railsMod;
ok(typeof buildDrivePool === "function", "PROBE: buildDrivePool is exported from lib/railsData.js for injection");
ok(typeof landingMod.rankedForCenter === "function" && typeof landingMod.rankedFor === "function",
  "PROBE: landing.js exports both rankedFor (wrapper) and rankedForCenter (the path)");

const MIAMI = { lat: LANDING_CITIES.miami.lat, lng: LANDING_CITIES.miami.lng };
const SARASOTA = { lat: LANDING_CITIES.sarasota.lat, lng: LANDING_CITIES.sarasota.lng };
const REAL = { landingCities: LANDING_CITIES, driveCenters: DRIVE_SOURCE_CENTERS };
const slugsOf = (list) => list.map((c) => c.slug).sort();

// ── 1. Registry hygiene: a drive centre is not a landing city ─────────────
{
  const overlap = Object.keys(DRIVE_SOURCE_CENTERS).filter((s) => s in LANDING_CITIES);
  eq(overlap, [], "DRIVE_SOURCE_CENTERS ∩ LANDING_CITIES is empty — a drive centre must never also be an indexed landing city");
  for (const [slug, c] of Object.entries(DRIVE_SOURCE_CENTERS)) {
    ok(c && typeof c.name === "string" && c.state === "FL" && Number.isFinite(c.lat) && Number.isFinite(c.lng),
      `${slug} carries the LANDING_CITIES row shape {name,state,lat,lng}`);
  }
  ok(Object.isFrozen(DRIVE_SOURCE_CENTERS), "DRIVE_SOURCE_CENTERS is frozen (registry, not scratch)");
  const src = readFileSync(join(ROOT, "lib/driveSourceCenters.js"), "utf8");
  ok(!/from "\.\/landing(\.js)?"/.test(src), "driveSourceCenters.js does not import landing.js (no cycle, plain-node importable)");
  ok(!/googleapis|places\.googleapis|searchText|fetch\(/.test(src), "driveSourceCenters.js has no network path of its own");
}

// ── 2. Miami's candidate centres: union of landing + drive-source ─────────
{
  const miami = driveCentersWithin(MIAMI, DRIVE_REACH_MI, ["miami"], REAL);
  ok(miami.some((c) => c.slug === "fort-lauderdale" && c.indexed === false),
    "Miami sees fort-lauderdale as an eligible NON-indexed neighbouring source centre (configured centre inside reach)");
  ok(miami.some((c) => c.slug === "homestead" && c.indexed === false),
    "Miami sees homestead as an eligible NON-indexed source centre (canonical civic centre inside reach)");
  ok(!miami.some((c) => c.slug === "miami"), "the reader's own pooled city is excluded");
  // Outside the reach: a fixture centre at West Palm Beach (~66 mi) is ignored.
  const withFar = driveCentersWithin(MIAMI, DRIVE_REACH_MI, ["miami"], {
    landingCities: LANDING_CITIES,
    driveCenters: { ...DRIVE_SOURCE_CENTERS, "west-palm-beach": { name: "West Palm Beach", state: "FL", lat: 26.7153, lng: -80.0534 } },
  });
  ok(!withFar.some((c) => c.slug === "west-palm-beach"), "a source centre outside DRIVE_REACH_MI is ignored");
  eq(slugsOf(withFar), slugsOf(miami), "…and adding it changes nothing else");
  // Collision: a landing slug always wins; a drive twin never shadows it.
  const collide = driveCentersWithin(MIAMI, DRIVE_REACH_MI, [], {
    landingCities: LANDING_CITIES,
    driveCenters: { ...DRIVE_SOURCE_CENTERS, miami: { name: "Miami (drive twin)", state: "FL", lat: MIAMI.lat, lng: MIAMI.lng } },
  });
  const miamiRows = collide.filter((c) => c.slug === "miami");
  ok(miamiRows.length === 1 && miamiRows[0].indexed === true && miamiRows[0].center === LANDING_CITIES.miami,
    "a slug present in both registries resolves to the LANDING city exactly once — the drive twin is dropped");
  const collidePooled = driveCentersWithin(MIAMI, DRIVE_REACH_MI, ["miami"], {
    landingCities: LANDING_CITIES,
    driveCenters: { ...DRIVE_SOURCE_CENTERS, miami: { name: "Miami (drive twin)", state: "FL", lat: MIAMI.lat, lng: MIAMI.lng } },
  });
  ok(!collidePooled.some((c) => c.slug === "miami"), "…even when the landing city is already pooled, the drive twin cannot slip in behind it");
}

// ── 3. Gulf Coast controls: Sarasota / Bradenton / Parrish unchanged ──────
{
  for (const slug of ["sarasota", "bradenton", "parrish"]) {
    const o = { lat: LANDING_CITIES[slug].lat, lng: LANDING_CITIES[slug].lng };
    const withDrive = driveCentersWithin(o, DRIVE_REACH_MI, [slug], REAL);
    const withoutDrive = driveCentersWithin(o, DRIVE_REACH_MI, [slug], { landingCities: LANDING_CITIES, driveCenters: {} });
    eq(slugsOf(withDrive), slugsOf(withoutDrive), `${slug}: candidate centre set is identical with and without DRIVE_SOURCE_CENTERS`);
    ok(withDrive.every((c) => c.indexed === true), `${slug}: every candidate is an indexed landing city (no South Florida centre leaks west)`);
    ok(withoutDrive.length > 0, `CONTROL: ${slug} still has neighbouring landing cities (the pre-existing Gulf Coast behaviour)`);
  }
}

// ── 4. buildDrivePool behaviour with an injected ranker, fetch THROWS ─────
const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b, c, d) => R_EARTH_MI * 2 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
// Place a venue at an exact distance/bearing from the reader (due north).
const at = (origin, mi) => ({ lat: origin.lat + mi / 69.0, lng: origin.lng });
const venue = (id, origin, mi, extra) => ({ id, name: id, ...at(origin, mi), _s: 50, reviews: 100, ...extra });

async function runPool({ driveCenters = DRIVE_SOURCE_CENTERS, origin = MIAMI, pooled = ["miami"], byCenter = {}, pools = {} } = {}) {
  const calls = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("NETWORK REACHED — buildDrivePool must be inventoryOnly and offline in this guard"); };
  try {
    const rank = async (cat, center, opts, citySlug) => {
      calls.push({ cat, center, opts, citySlug });
      // Match by name, not identity: the loader transpiles railsData into its
      // own module graph, so its LANDING_CITIES rows are distinct objects.
      const all = { ...LANDING_CITIES, ...driveCenters };
      const key = Object.keys(all).find((s) => all[s].name === center.name);
      const rows = (byCenter[key] && byCenter[key][cat]) || [];
      return rows.map((r) => ({ ...r }));
    };
    const rows = await buildDrivePool(pools, origin, pooled, null, { rank, registries: { driveCenters } });
    return { rows, calls };
  } finally {
    globalThis.fetch = prevFetch;
  }
}

{
  // RED: the pre-Lane-B world (no drive-source registry) — Miami gets nothing.
  const red = await runPool({ driveCenters: {}, byCenter: { "fort-lauderdale": { "things-to-do": [venue("ftl-1", MIAMI, 20)] } } });
  eq(driveCentersWithin(MIAMI, DRIVE_REACH_MI, ["miami"], { landingCities: LANDING_CITIES, driveCenters: {} }).length, 0,
    "RED: with the old Miami-only configuration, no neighbouring landing centre exists within DRIVE_REACH_MI");
  eq(red.rows, [], "RED: the old configuration produces the prior empty-neighbour drive pool for Miami");
  eq(red.calls.length, 0, "RED: …and the ranker is never even called");

  // GREEN: the real registry — Fort Lauderdale + Homestead are read, both cats.
  const inBand = venue("ftl-inband", MIAMI, 20);
  const tooNear = venue("ftl-near", MIAMI, DRIVE_MIN_MI - 1);
  const tooFar = venue("hms-far", MIAMI, DRIVE_REACH_MI + 1);
  const dupA = venue("shared-place", MIAMI, 18, { _s: 60 });
  const dupB = venue("shared-place", MIAMI, 18, { _s: 60 });
  const beach = venue("ftl-beach", MIAMI, 22, { _s: 55, reviews: 900 });
  const lowRank = venue("hms-low", MIAMI, 24, { _s: 40 });
  const tieMore = venue("hms-tie-more", MIAMI, 23, { _s: 50, reviews: 500 });
  const tieLess = venue("hms-tie-less", MIAMI, 23, { _s: 50, reviews: 5 });
  const green = await runPool({
    byCenter: {
      "fort-lauderdale": { "things-to-do": [inBand, tooNear, dupA, tieLess], beaches: [beach] },
      homestead: { "things-to-do": [tooFar, dupB, lowRank, tieMore] },
    },
    pools: { "things-to-do": [{ id: "already-pooled" }] },
  });
  const ids = green.rows.map((r) => r.id);
  ok(ids.includes("ftl-inband"), "an eligible in-band venue survives");
  const survivor = green.rows.find((r) => r.id === "ftl-inband");
  ok(survivor && Math.abs(survivor.distMi - hav(MIAMI.lat, MIAMI.lng, survivor.lat, survivor.lng)) < 1e-9,
    "…with distMi measured from the READER, not the source centre");
  eq(survivor && survivor._neighbour, "fort-lauderdale", "…stamped with the centre slug it was borrowed from");
  ok(!ids.includes("ftl-near"), `a returned venue below DRIVE_MIN_MI (${DRIVE_MIN_MI}) is rejected`);
  ok(!ids.includes("hms-far"), `a returned venue above DRIVE_REACH_MI (${DRIVE_REACH_MI}) is rejected`);
  eq(ids.filter((i) => i === "shared-place").length, 1, "duplicate place IDs from two centres appear once");
  ok(ids.includes("ftl-beach"), "beaches from a drive centre are read too (things-to-do + beaches, unchanged cats)");
  eq(ids, ["shared-place", "ftl-beach", "hms-tie-more", "ftl-inband", "hms-tie-less", "hms-low"],
    "ranking stays governed by the existing path: _s desc, then reviews desc — the ranker's own order is not trusted");
  // The ranker is the ONLY thing consulted, and always inventoryOnly.
  const centersCalled = new Set(green.calls.map((c) => c.center.name)).size;
  eq(centersCalled, 2, "both drive-source centres were ranked (Fort Lauderdale + Homestead)");
  eq(green.calls.length, 4, "2 centres x 2 cats = 4 ranker calls, one per job (no extra fan-out)");
  ok(green.calls.every((c) => c.opts && c.opts.inventoryOnly === true && c.opts.skipEditorial === true && c.opts.withPhotos === true),
    "every ranker call is inventoryOnly + skipEditorial + withPhotos — no Google/Places path exists on this rail");
  ok(green.calls.every((c) => c.citySlug === undefined), "a non-indexed centre passes NO landing slug (it can never enter the nightlife census branch)");
  ok(green.calls.every((c) => ["things-to-do", "beaches"].includes(c.cat)), "only things-to-do + beaches are read");
}

// ── 5. Publication: a drive-only centre adds NO sitemap URL ──────────────
{
  const sm = readFileSync(join(ROOT, "app/sitemap.js"), "utf8");
  ok(/Object\.keys\(LANDING_CITIES\)/.test(sm), "PROBE: the sitemap enumerates landing URLs from LANDING_CITIES");
  ok(!/DRIVE_SOURCE_CENTERS|driveSourceCenters/.test(sm), "the sitemap never consults the drive-source registry");
  // Behaviour: build the sitemap's own landing + event-window URL sets from
  // the same registry it reads and prove the drive slugs are absent.
  const landingUrls = Object.keys(landingMod.LANDING_CATS).flatMap((cat) => Object.keys(LANDING_CITIES).map((city) => `/${cat}/${city}`));
  for (const slug of Object.keys(DRIVE_SOURCE_CENTERS)) {
    ok(!landingUrls.some((u) => u.endsWith(`/${slug}`)), `no /<cat>/${slug} landing URL exists`);
  }
  const checkSitemap = readFileSync(join(ROOT, "scripts/check-sitemap.mjs"), "utf8");
  ok(!/DRIVE_SOURCE_CENTERS|driveSourceCenters/.test(checkSitemap), "check-sitemap does not know the drive registry either — nothing indexes it");
}

// ── 6. Constants untouched: the fix did not widen the band ────────────────
{
  eq(DRIVE_MIN_MI, 12, "DRIVE_MIN_MI stays 12");
  eq(DRIVE_REACH_MI, 27, "DRIVE_REACH_MI stays 27 — South Florida was fixed by a registry, not by moving the horizon");
  const rd = readFileSync(join(ROOT, "lib/railsData.js"), "utf8");
  ok(/d >= DRIVE_MIN_MI && d <= DRIVE_REACH_MI/.test(rd), "buildDrivePool still admits rows only inside the [DRIVE_MIN_MI, DRIVE_REACH_MI] band");
  ok(!/searchOnce|googleapis/.test(rd.slice(rd.indexOf("async function buildDrivePool"), rd.indexOf("export async function loadRailPlaces"))),
    "buildDrivePool's body names no Google path");
}

console.log(`test-drive-source-centers: ${fail ? "FAIL" : "OK"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
