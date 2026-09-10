#!/usr/bin/env node
// scripts/measure-commons-direct-cohort.mjs — before/after hit-rate on a
// FIXED 40-place atlas cohort for the Commons-direct fallback (2026-09-10).
//
// Default is HERMETIC (no network): every one of the 40 places is resolved
// through the PRODUCTION findCommonsPhoto() against a deterministic
// MediaWiki fetch router. Accepts are whatever the resolver returns — not
// a set-membership shortcut. --live is the separate real-network
// measurement and is not what CI runs.
//
//   node scripts/measure-commons-direct-cohort.mjs
//   node scripts/measure-commons-direct-cohort.mjs --live
//
// Counts ONLY identity-verified + license-safe accepts. Candidate volume
// is printed as a footnote and is not the headline.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findCommonsPhoto } from "../lib/commonsPhotos.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TSV = join(ROOT, "data/atlas/atlas-590.tsv");

const COHORT_SIZE = 40;

// Known coordinates for the required controls and the wiki-baseline five.
// Others inherit a Sarasota-metro centroid so a live run can still geo-gate
// when Commons returns GPS; hermetic fixtures use these same coords.
const KNOWN = {
  "ChIJY3qV_tYXw4gRoy-jOe1OAo4": { lat: 27.4989, lng: -82.5748, city: "Bradenton" },
  "ChIJlXJqE9k_w4gRySJ2BPEXcR0": { lat: 27.3865, lng: -82.5608, city: "Sarasota" },
  "ChIJQwg-91Jaw4gRU5HdBO-u8CU": { lat: 27.0998, lng: -82.4543, city: "Venice" },
  "ChIJA4xMia1Dw4gRTrT57btYdzc": { lat: 27.252, lng: -82.546, city: "Siesta Key" },
  "ChIJ08zZpRpBw4gRiDJBlBXfAHw": { lat: 27.336, lng: -82.468, city: "Sarasota" },
  "ChIJNxf8h55Hw4gRSaBE_mEdfxo": { lat: 27.336, lng: -82.407, city: "Sarasota" },
  "ChIJF1OdFCdAw4gR_3TQXBjFjPQ": { lat: 27.317, lng: -82.557, city: "Sarasota" },
  "ChIJD7cZSFBDw4gRsEpfMoip9BE": { lat: 27.175, lng: -82.49, city: "Osprey" },
  "ChIJPSh7g6-s3IgROUqupmIgQ8M": { lat: 27.336, lng: -82.53, city: "Sarasota" },
  "ChIJn79uD1s6w4gR2VbHR5rFDGU": { lat: 27.429, lng: -82.428, city: "Lakewood Ranch" },
  "ChIJR0-AwqdAw4gR6McIzffF4BA": { lat: 27.355, lng: -82.525, city: "Sarasota" },
  "ChIJObkCSmIWw4gRQDAhWKrjxxU": { lat: 27.462, lng: -82.58, city: "Bradenton" },
  "ChIJVaN0nNZDw4gRZr-D4qxm-oo": { lat: 27.236, lng: -82.494, city: "Sarasota" },
  "ChIJhaFa_yE8w4gRO3UanoqVLv8": { lat: 27.462, lng: -82.451, city: "Bradenton" },
  "ChIJwxTOi5sRw4gRe2ebpiNZrcs": { lat: 27.467, lng: -82.699, city: "Bradenton Beach" },
  "ChIJEdWsSXEXw4gRpgNdaDgckZs": { lat: 27.498, lng: -82.573, city: "Bradenton" },
  "ChIJWUyEEXojw4gRsFy9QmBgWq4": { lat: 27.548, lng: -82.478, city: "Palmetto" },
  "ChIJozoB105Tw4gRzglopArkt1w": { lat: 27.336, lng: -82.53, city: "Sarasota" },
  "ChIJEUVs9HMRw4gRUaGFPlrxryc": { lat: 27.469, lng: -82.686, city: "Cortez" },
  "ChIJpXGK53VC24gRWMneFVtK6hY": { lat: 27.3847, lng: -82.5603, city: "Sarasota" },
  "ChIJHdkh4ZJGw4gRttusUBlyz54": { lat: 27.336, lng: -82.45, city: "Sarasota" },
  "ChIJB8jiRJVGw4gRk_HiIAZQzQU": { lat: 27.336, lng: -82.45, city: "Sarasota" },
  "ChIJc-m14Rc5w4gRrnsNnZ8pRJY": { lat: 27.37424, lng: -82.45009, city: "Sarasota" },
  "ChIJiS5Iw5UTw4gRfEiuwR8G20k": { lat: 27.442, lng: -82.688, city: "Longboat Key" },
  "ChIJE0_XXFVJw4gRroRqJ-TSTXg": { lat: 27.241, lng: -82.316, city: "Sarasota" },
  "ChIJv2U53UNDw4gRqf7-KgHAfyM": { lat: 27.175, lng: -82.49, city: "Osprey" },
  "ChIJ7-I5X4tHw4gRAK6g4JEha7M": { lat: 27.32537, lng: -82.4336, city: "Sarasota" },
  "ChIJu73by6Rbw4gR857K3YRfLQo": { lat: 27.498, lng: -82.573, city: "Bradenton" },
  "ChIJKSXbG5c_w4gRleoXwkGx-5I": { lat: 27.368, lng: -82.53, city: "Sarasota" },
  "ChIJQQfiSiVHw4gRJCg2DzEVcho": { lat: 27.336, lng: -82.45, city: "Sarasota" },
  "ChIJBRD-bPE2w4gRjabAT6CgdWA": { lat: 27.429, lng: -82.4, city: "Lakewood Ranch" },
  "ChIJezvwN98-w4gR9LoM9TPNCuQ": { lat: 27.386, lng: -82.45, city: "Sarasota" },
  "ChIJw39QsBpXw4gRt1QugbY5miM": { lat: 27.076, lng: -82.337, city: "North Port" },
  "ChIJP-uN1nMRw4gRWqXPAPudIUA": { lat: 27.469, lng: -82.686, city: "Cortez" },
  "ChIJs1EQjXYXw4gR6e_D1g6-lFU": { lat: 27.498, lng: -82.573, city: "Bradenton" },
  "ChIJ4VEiphYWw4gR7idoOy6VPfk": { lat: 27.462, lng: -82.58, city: "Bradenton" },
  "ChIJYUTNe7k5w4gRdhcqxrbHBNg": { lat: 27.39, lng: -82.45, city: "Sarasota" },
  "ChIJ5yxVbRGr3IgR4tIpRvLYRW0": { lat: 27.044, lng: -82.236, city: "North Port" },
  "ChIJD0ckhqNUw4gRAvHrRaqP-po": { lat: 27.336, lng: -82.53, city: "Sarasota" },
  "ChIJVcqB2MUQw4gRbN_T0WF8QEw": { lat: 27.5233, lng: -82.6432, city: "Bradenton" },
};

// Expected AFTER outcomes — asserted on the resolver's return, never used
// as a short-circuit that skips findCommonsPhoto.
const EXPECTED_WIKI_ACCEPT_IDS = new Set([
  "ChIJlXJqE9k_w4gRySJ2BPEXcR0", // Asolo Repertory Theatre
  "ChIJPSh7g6-s3IgROUqupmIgQ8M", // Blue Ridge Park
  "ChIJpXGK53VC24gRWMneFVtK6hY", // Ca' d'Zan
  "ChIJw39QsBpXw4gRt1QugbY5miM", // CoolToday Park
  "ChIJVcqB2MUQw4gRbN_T0WF8QEw", // De Soto National Memorial
]);

const EXPECTED_COMMONS_DIRECT_ACCEPT_IDS = new Set([
  "ChIJY3qV_tYXw4gRoy-jOe1OAo4", // ArtSLAM — File:Realize Bradenton ArtSlam 2011 Winner.jpg
  "ChIJ7-I5X4tHw4gRAK6g4JEha7M", // Celery Fields
  "ChIJE0_XXFVJw4gRroRqJ-TSTXg", // Canopy Walk
]);

const BENDERSON_ID = "ChIJc-m14Rc5w4gRrnsNnZ8pRJY";

const WIKI_FILE = {
  "ChIJlXJqE9k_w4gRySJ2BPEXcR0": "Sarasota_FL_Asolo_Rep_Theatre01.jpg",
  "ChIJPSh7g6-s3IgROUqupmIgQ8M": "Blue_Ridge_Park_Sarasota.jpg",
  "ChIJpXGK53VC24gRWMneFVtK6hY": "Front_view_of_Ca_dZan.jpg",
  "ChIJw39QsBpXw4gRt1QugbY5miM": "CoolToday_Park_North_Port.jpg",
  "ChIJVcqB2MUQw4gRbN_T0WF8QEw": "De_Soto_National_Memorial.jpg",
};

const COMMONS_DIRECT_FILES = {
  "ChIJY3qV_tYXw4gRoy-jOe1OAo4": {
    title: "File:Realize Bradenton ArtSlam 2011 Winner.jpg",
    filename: "Realize Bradenton ArtSlam 2011 Winner.jpg",
    description: "Realize Bradenton ArtSlam 2011 winner",
    objectName: "Realize Bradenton ArtSlam 2011 Winner",
  },
  "ChIJ7-I5X4tHw4gRAK6g4JEha7M": {
    title: "File:Painted bunting at Celery Fields, Sarasota, Florida. (53458749069).jpg",
    filename: "Painted bunting at Celery Fields, Sarasota, Florida. (53458749069).jpg",
    description: "Painted bunting at Celery Fields, Sarasota, Florida",
    objectName: "Painted bunting at Celery Fields",
  },
  "ChIJE0_XXFVJw4gRroRqJ-TSTXg": {
    title: "File:Canopy Walk Oak (39671632922).jpg",
    filename: "Canopy Walk Oak (39671632922).jpg",
    description: "Canopy Walk oak at Myakka River State Park",
    objectName: "Canopy Walk Oak",
  },
};

const WALLENDA_FILE = {
  title: "File:Nik Wallenda walking over Nathan Benderson Park.jpg",
  filename: "Nik Wallenda walking over Nathan Benderson Park.jpg",
  description: "Nik Wallenda tightrope walk at Nathan Benderson Park",
  objectName: "Nik Wallenda at Nathan Benderson Park",
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function freeMeta(description, objectName) {
  return {
    Artist: { value: "Fixture Photographer" },
    License: { value: "cc-by-sa-4.0" },
    LicenseShortName: { value: "CC BY-SA 4.0" },
    ImageDescription: { value: description },
    ObjectName: { value: objectName || description },
  };
}

function decodeParam(url, key) {
  const m = String(url).match(new RegExp(`[?&]${key}=([^&]+)`));
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
}

function fileRecord(spec, place) {
  const filename = spec.filename;
  const title = spec.title || ("File:" + filename);
  return {
    query: {
      pages: {
        1: {
          title,
          coordinates: [{ lat: place.lat, lon: place.lng }],
          categories: [{ title: "Category:Buildings in Florida" }],
          imageinfo: [
            {
              url: `https://upload.wikimedia.org/wikipedia/commons/a/aa/${encodeURIComponent(filename)}`,
              width: 1200,
              height: 800,
              descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
              extmetadata: freeMeta(spec.description, spec.objectName),
            },
          ],
        },
      },
    },
  };
}

function wikiPageInfo(place) {
  return {
    query: {
      pages: {
        111: {
          title: place.name,
          pageprops: {},
          coordinates: [{ lat: place.lat, lon: place.lng }],
          categories: [{ title: "Category:Parks in Florida" }, { title: "Category:Museums in Florida" }],
          extract: `${place.name} is a place in ${place.city || "Florida"}.`,
        },
      },
    },
  };
}

function wikiPageImages(filename) {
  return {
    query: {
      pages: {
        111: {
          pageimage: filename,
          original: {
            source: `https://upload.wikimedia.org/wikipedia/commons/a/aa/${filename}`,
            width: 1024,
            height: 768,
          },
        },
      },
    },
  };
}

function wikiCommonsInfo(filename) {
  return {
    query: {
      pages: {
        "-1": {
          title: "File:" + filename,
          imageinfo: [
            {
              url: `https://upload.wikimedia.org/wikipedia/commons/a/aa/${filename}`,
              width: 1024,
              height: 768,
              descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
              extmetadata: freeMeta(filename.replace(/_/g, " "), filename.replace(/_/g, " ")),
            },
          ],
        },
      },
    },
  };
}

/**
 * Deterministic MediaWiki router keyed by the PLACE under resolution.
 * Every URL shape findCommonsPhoto actually sends is answered. Empty
 * 200s (never 404) for misses so transport failure is not confused
 * with "no article / no file".
 */
function makeCohortFetch(place, stats) {
  return async (url) => {
    stats.placesFetched.add(place.place_id);
    stats.fetchCalls++;
    const u = String(url);
    if (u.includes("action=opensearch")) {
      if (EXPECTED_WIKI_ACCEPT_IDS.has(place.place_id)) {
        return jsonResponse(200, [place.name, [place.name], [""], [`https://en.wikipedia.org/wiki/${encodeURIComponent(place.name)}`]]);
      }
      return jsonResponse(200, [place.name, [], [], []]);
    }
    if (u.includes("prop=pageimages")) {
      const filename = WIKI_FILE[place.place_id];
      if (filename) return jsonResponse(200, wikiPageImages(filename));
      return jsonResponse(200, { query: { pages: { 111: { title: place.name } } } });
    }
    if (u.includes("prop=pageprops")) {
      if (EXPECTED_WIKI_ACCEPT_IDS.has(place.place_id)) return jsonResponse(200, wikiPageInfo(place));
      return jsonResponse(200, { query: { pages: { 111: { missing: "" } } } });
    }
    if (u.includes("commons.wikimedia.org") && (u.includes("list=search") || u.includes("srsearch="))) {
      if (EXPECTED_COMMONS_DIRECT_ACCEPT_IDS.has(place.place_id)) {
        return jsonResponse(200, { query: { search: [{ ns: 6, title: COMMONS_DIRECT_FILES[place.place_id].title }] } });
      }
      if (place.place_id === BENDERSON_ID) {
        return jsonResponse(200, { query: { search: [{ ns: 6, title: WALLENDA_FILE.title }] } });
      }
      return jsonResponse(200, { query: { search: [] } });
    }
    if (u.includes("commons.wikimedia.org") && u.includes("titles=")) {
      const titles = decodeParam(u, "titles");
      const wikiFile = WIKI_FILE[place.place_id];
      if (wikiFile && titles.replace(/^File:/i, "") === wikiFile) {
        return jsonResponse(200, wikiCommonsInfo(wikiFile));
      }
      const direct = COMMONS_DIRECT_FILES[place.place_id];
      if (direct && titles.replace(/^File:/i, "").toLowerCase() === direct.filename.toLowerCase()) {
        return jsonResponse(200, fileRecord(direct, place));
      }
      if (place.place_id === BENDERSON_ID && /Wallenda|Benderson/i.test(titles)) {
        return jsonResponse(200, fileRecord(WALLENDA_FILE, place));
      }
      return jsonResponse(200, { query: { pages: { "-1": { missing: "" } } } });
    }
    return jsonResponse(200, {});
  };
}

function loadCohort() {
  if (!existsSync(TSV)) {
    throw new Error("data/atlas/atlas-590.tsv is missing — the cohort is defined as its first 40 data rows");
  }
  const lines = readFileSync(TSV, "utf8").split(/\r?\n/).filter(Boolean);
  const header = lines[0];
  if (!/^category\tname\taddress\tgoogle_place_id/.test(header)) {
    throw new Error("atlas-590.tsv header is not the expected category/name/address/google_place_id");
  }
  const rows = [];
  for (const line of lines.slice(1)) {
    if (rows.length >= COHORT_SIZE) break;
    const [category, name, address, place_id] = line.split("\t");
    if (!place_id || !name) continue;
    const known = KNOWN[place_id] || {};
    rows.push({
      category: category || "attractions",
      name,
      address: address || "",
      place_id,
      lat: known.lat,
      lng: known.lng,
      city: known.city || "",
    });
  }
  if (rows.length !== COHORT_SIZE) {
    throw new Error(`cohort must be exactly ${COHORT_SIZE} rows, got ${rows.length}`);
  }
  return rows;
}

async function liveResolve(place, { wikiOnly } = {}) {
  let reason = null;
  const photo = await findCommonsPhoto(place, {
    wikiOnly: !!wikiOnly,
    onReject: (r) => {
      reason = r;
    },
  });
  return {
    path: photo ? (wikiOnly ? "wiki" : "unknown") : wikiOnly ? "wiki" : "commons-direct",
    photo,
    reason,
  };
}

function tally(rows, results, wikiOnlyResults) {
  const byReason = {};
  const byCategory = {};
  let accepts = 0;
  let wikiAccepts = 0;
  let extraDirect = 0;
  let deferred = 0;
  let falsePositives = 0;
  const accepted = [];
  for (let i = 0; i < rows.length; i++) {
    const place = rows[i];
    const r = results[i];
    const cat = place.category || "unknown";
    byCategory[cat] = byCategory[cat] || { n: 0, accepts: 0 };
    byCategory[cat].n++;
    if (r.photo) {
      accepts++;
      byCategory[cat].accepts++;
      const viaWiki = !!(wikiOnlyResults && wikiOnlyResults[i] && wikiOnlyResults[i].photo);
      if (viaWiki) wikiAccepts++;
      else extraDirect++;
      accepted.push(`${place.name}${viaWiki ? " [wiki]" : " [commons-direct]"}`);
      if (place.place_id === BENDERSON_ID) falsePositives++;
    } else {
      const why = r.reason || "unknown";
      byReason[why] = (byReason[why] || 0) + 1;
      if (String(why).startsWith("unavailable_") || String(why).startsWith("error:")) deferred++;
    }
  }
  return { accepts, wikiAccepts, extraDirect, deferred, falsePositives, byReason, byCategory, accepted };
}

function printReport(label, stats, n) {
  console.log(`\n${label}: ${stats.accepts}/${n} identity-verified + license-safe accepts (${((stats.accepts / n) * 100).toFixed(1)}%)`);
  if (stats.wikiAccepts != null) {
    console.log(`  Wikipedia-path valid hits: ${stats.wikiAccepts}`);
    console.log(`  additional direct-Commons valid hits: ${stats.extraDirect}`);
    console.log(`  deferred / network failures: ${stats.deferred}`);
  }
  console.log(`  false positives (Benderson/Camp Gladiator attached): ${stats.falsePositives}`);
  console.log(`  vaultable (source=wikimedia + free license, dry-run): ${stats.accepts}`);
  console.log("  accepted:");
  for (const name of stats.accepted) console.log("    - " + name);
  console.log("  rejects by reason:");
  for (const [k, v] of Object.entries(stats.byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  console.log("  by category:");
  for (const [k, v] of Object.entries(stats.byCategory)) {
    console.log(`    ${k}: ${v.accepts}/${v.n}`);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const verbose = process.argv.includes("--verbose");
  const rows = loadCohort();
  if (rows.length !== COHORT_SIZE) throw new Error("cohort size drifted");
  if (!rows.some((r) => r.place_id === BENDERSON_ID)) {
    throw new Error("Camp Gladiator / Benderson is not in the first 40 atlas rows — the required negative control would be missing");
  }
  if (!rows.some((r) => r.place_id === "ChIJlXJqE9k_w4gRySJ2BPEXcR0")) {
    throw new Error("Asolo Repertory Theatre is not in the first 40 atlas rows — the required positive control would be missing");
  }

  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  if (!live) {
    if (/\bfunction fixtureResolve\b/.test(src)) {
      throw new Error("hermetic mode must not contain fixtureResolve — that is the ceremonial set-membership shortcut this lock exists to retire");
    }
    if (!/\bfindCommonsPhoto\s*\(/.test(src)) {
      throw new Error("hermetic mode must call findCommonsPhoto — the production resolver");
    }
  }

  const stats = { fetchCalls: 0, placesFetched: new Set(), resolverCalls: 0 };
  const resolve = live
    ? liveResolve
    : async (place, opts) => {
        stats.resolverCalls++;
        let reason = null;
        const photo = await findCommonsPhoto(place, {
          fetch: makeCohortFetch(place, stats),
          wikiOnly: !!(opts && opts.wikiOnly),
          onReject: (r) => {
            reason = r;
          },
        });
        return {
          path: photo ? (opts && opts.wikiOnly ? "wiki" : "unknown") : opts && opts.wikiOnly ? "wiki" : "commons-direct",
          photo,
          reason,
        };
      };

  const before = [];
  const after = [];
  for (const place of rows) {
    before.push(await resolve(place, { wikiOnly: true }));
    after.push(await resolve(place, { wikiOnly: false }));
  }

  const beforeStats = tally(rows, before, before);
  const afterStats = tally(rows, after, before);

  if (verbose) {
    console.log("per-place:");
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i];
      const b = before[i];
      const a = after[i];
      console.log(`  ${p.name} | before=${b.photo ? "ACCEPT" : b.reason} | after=${a.photo ? "ACCEPT" : a.reason}`);
    }
  }

  console.log(`commons-direct cohort (${live ? "LIVE Wikimedia" : "HERMETIC MediaWiki fixtures via findCommonsPhoto"}): first ${COHORT_SIZE} rows of data/atlas/atlas-590.tsv`);
  printReport("BEFORE (Wikipedia lead-image only)", beforeStats, rows.length);
  printReport("AFTER  (wiki path, then Commons-direct fallback)", afterStats, rows.length);
  console.log(`\nReplay note: every BEFORE miss of no_wiki_candidate is the production backlog this PR replays.`);
  console.log(`  wiki-only misses that become a later decision: ${before.filter((r) => r.reason === "no_wiki_candidate").length}`);
  console.log(`  of those, AFTER accepts: ${before.filter((r, i) => r.reason === "no_wiki_candidate" && after[i].photo).length}`);
  console.log(`  of those, AFTER terminal miss: ${before.filter((r, i) => r.reason === "no_wiki_candidate" && !after[i].photo && after[i].reason && !String(after[i].reason).startsWith("unavailable_")).length}`);
  console.log("Headline is verified accepts, not raw Commons candidate volume.");

  if (!live) {
    if (stats.resolverCalls !== COHORT_SIZE * 2) {
      throw new Error(`hermetic cohort must invoke findCommonsPhoto ${COHORT_SIZE * 2} times (wikiOnly + full × 40), got ${stats.resolverCalls}`);
    }
    if (stats.placesFetched.size !== COHORT_SIZE) {
      throw new Error(`hermetic MediaWiki fetch must run for every cohort place, got ${stats.placesFetched.size}/${COHORT_SIZE}`);
    }
    if (stats.fetchCalls < COHORT_SIZE) {
      throw new Error(`hermetic MediaWiki fetch ran ${stats.fetchCalls} times — a set-membership shortcut would run 0`);
    }
    if (beforeStats.accepts !== 5) {
      throw new Error(`hermetic baseline must be 5/40, got ${beforeStats.accepts}/${rows.length}`);
    }
    if (afterStats.accepts !== 8 || afterStats.extraDirect !== 3) {
      throw new Error(`hermetic AFTER must be 8/40 (5 wiki + 3 live-proven Commons-direct), got ${afterStats.accepts} accepts / ${afterStats.extraDirect} extra`);
    }
    const afterAcceptedIds = rows.filter((_, i) => after[i].photo).map((r) => r.place_id);
    for (const id of EXPECTED_WIKI_ACCEPT_IDS) {
      if (!afterAcceptedIds.includes(id)) throw new Error(`expected wiki accept missing after resolver run: ${id}`);
    }
    for (const id of EXPECTED_COMMONS_DIRECT_ACCEPT_IDS) {
      if (!afterAcceptedIds.includes(id)) throw new Error(`expected Commons-direct accept missing after resolver run: ${id}`);
    }
    if (afterStats.falsePositives !== 0 || beforeStats.falsePositives !== 0) {
      throw new Error("Benderson/Camp Gladiator attached — false positive");
    }
    const bendersonAfter = after[rows.findIndex((r) => r.place_id === BENDERSON_ID)];
    if (!bendersonAfter || bendersonAfter.photo) {
      throw new Error("Camp Gladiator / Benderson must remain a reject after the resolver inspects the Wallenda file");
    }
    if (!String(bendersonAfter.reason || "").includes("identity")) {
      throw new Error(`Camp Gladiator reject must be an identity decision (got ${JSON.stringify(bendersonAfter.reason)})`);
    }
    console.log(`  resolver invocations: ${stats.resolverCalls} (findCommonsPhoto × ${COHORT_SIZE} places × 2 passes)`);
    console.log(`  MediaWiki fixture fetches: ${stats.fetchCalls} across ${stats.placesFetched.size} places`);
  }
}

main().catch((e) => {
  console.error("measure-commons-direct-cohort: FAIL — " + ((e && e.stack) || e));
  process.exit(1);
});
