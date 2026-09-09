#!/usr/bin/env node
// scripts/test-commons-photos.mjs — the free permanent-photo lane's
// regression lock (2026-09-09).
//
// THE INCIDENT THIS PROTECTS AGAINST. Google's photo terms forbid storing a
// Places photo past 30 days; September's photos ledger is already exhausted
// at 950/950 while 10,028 cached photo URIs expire 2026-09-25..2026-10-04
// (measured 2026-09-09 — see supabase/migrations/20260909_wf_place_photo.sql
// for the full incident). lib/commonsPhotos.js is what makes it safe to
// store a Wikimedia Commons photo PERMANENTLY instead: it must never attach
// a photo to the wrong place (an unverified name-similarity match), and it
// must never store a photo whose license does not actually permit that —
// getting either wrong turns a fix for a rented-photo problem into a
// wrong-place-photo problem or a license-violation problem, both worse than
// the compass fallback this lane exists to retire.
//
// HERMETIC: every network call in every assertion below goes through an
// injected `fetch` (lib/commonsPhotos.js's `deps.fetch`, threaded into the
// SAME wikiOpensearch/wikiPageInfo lib/popularity.js uses — see that file's
// 2026-09-09 note on jf()'s fetchImpl param). No real network call, no real
// database. Run standalone: `node scripts/test-commons-photos.mjs`.
import { findCommonsPhoto, classifyLicense, buildAttributionText } from "../lib/commonsPhotos.js";
import { createWikimediaFetchPolicy } from "../lib/wikimediaFetchPolicy.js";

let failures = 0;
const fail = (m) => { console.error("test-commons-photos: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

// ── fixtures ─────────────────────────────────────────────────────────────
// A plausible, fully-resolvable place: Wikipedia carries coordinates for the
// SAME point wf_inventory has, so verifyWikiIdentity's geo-agreement check
// passes at distance 0 — no ambiguity about why identity clears here.
const PLACE = { name: "Test Museum", lat: 27.35, lng: -82.55 };

const OPENSEARCH_HIT = ["Test Museum", ["Test Museum"], [""], ["https://en.wikipedia.org/wiki/Test_Museum"]];
const OPENSEARCH_EMPTY = ["nope", [], [], []];

const PAGE_INFO_MATCH = {
  query: {
    pages: {
      111: {
        title: "Test Museum",
        pageprops: {},
        coordinates: [{ lat: 27.35, lon: -82.55 }],
        categories: [{ title: "Category:Museums in Florida" }],
        extract: "Test Museum is an art museum in Sarasota, Florida.",
      },
    },
  },
};

// Same title, but Wikipedia's coordinates are ~1,100 miles away (New York
// City) — verifyWikiIdentity's geo gate (80mi, lib/popularity.js
// WIKI_GEO_GATE_MI) must reject this as a different real-world place, not
// merely a same-named one.
const PAGE_INFO_GEO_MISMATCH = {
  query: {
    pages: {
      111: {
        title: "Test Museum",
        pageprops: {},
        coordinates: [{ lat: 40.7128, lon: -74.006 }],
        categories: [{ title: "Category:Museums in Florida" }],
        extract: "Test Museum is an art museum.",
      },
    },
  },
};

const PAGE_IMAGES_HIT = {
  query: { pages: { 111: { pageimage: "TestMuseum.jpg", original: { source: "https://upload.wikimedia.org/wikipedia/commons/a/aa/TestMuseum.jpg", width: 1024, height: 768 } } } },
};
const PAGE_IMAGES_NONE = { query: { pages: { 111: { title: "Test Museum" } } } };

function commonsInfo(extmetadata) {
  return {
    query: {
      pages: {
        "-1": {
          title: "File:TestMuseum.jpg",
          imageinfo: [
            {
              url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/TestMuseum.jpg",
              width: 1024,
              height: 768,
              descriptionurl: "https://commons.wikimedia.org/wiki/File:TestMuseum.jpg",
              extmetadata,
            },
          ],
        },
      },
    },
  };
}
const COMMONS_INFO_FREE = commonsInfo({ Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>' }, License: { value: "cc-by-sa-4.0" }, LicenseShortName: { value: "CC BY-SA 4.0" } });
const COMMONS_INFO_NO_ARTIST = commonsInfo({ License: { value: "cc0" }, LicenseShortName: { value: "CC0 1.0" } });
const COMMONS_INFO_NONFREE = commonsInfo({ Artist: { value: "Jane Doe" }, License: { value: "fal" }, LicenseShortName: { value: "Free Art License" } });

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/**
 * A routed fake fetch for findCommonsPhoto's four call shapes. `overrides`
 * replaces any of the four default (happy-path) fixtures; a value of
 * `"throw"` makes that call shape throw instead of responding, to exercise
 * the never-throws contract at each stage independently.
 */
function makeFetch(overrides = {}) {
  const calls = [];
  const pick = (key, dflt) => (key in overrides ? overrides[key] : dflt);
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("action=opensearch")) {
      const v = pick("opensearch", OPENSEARCH_HIT);
      if (v === "throw") throw new Error("simulated opensearch network failure");
      return jsonResponse(200, v);
    }
    if (String(url).includes("commons.wikimedia.org")) {
      const v = pick("commons", COMMONS_INFO_FREE);
      if (v === "throw") throw new Error("simulated commons network failure");
      return jsonResponse(200, v);
    }
    if (String(url).includes("prop=pageimages")) {
      const v = pick("pageImages", PAGE_IMAGES_HIT);
      if (v === "throw") throw new Error("simulated pageimages network failure");
      return jsonResponse(200, v);
    }
    if (String(url).includes("prop=pageprops")) {
      const v = pick("pageInfo", PAGE_INFO_MATCH);
      if (v === "throw") throw new Error("simulated pageinfo network failure");
      return jsonResponse(200, v);
    }
    return jsonResponse(404, {});
  };
  return { fetchImpl, calls };
}

async function resolve(overrides) {
  const { fetchImpl, calls } = makeFetch(overrides);
  let reason = null;
  let photo;
  try {
    photo = await findCommonsPhoto(PLACE, { fetch: fetchImpl, onReject: (r) => { reason = r; } });
  } catch (e) {
    // The assertion itself: findCommonsPhoto must never let an exception
    // escape, no matter what the injected fetch does.
    fail(`findCommonsPhoto threw (it must never throw): ${(e && e.stack) || e}`);
    photo = undefined;
  }
  return { photo, reason, calls };
}

async function main() {
  // ── 1. identity verification is required before a photo is attached ────
  {
    const { photo, reason, calls } = await resolve({ pageInfo: PAGE_INFO_GEO_MISMATCH });
    ok(photo === null, "a geo-mismatched candidate (same title, ~1,100mi away) must not resolve to a photo");
    ok(typeof reason === "string" && reason.startsWith("identity_"), `rejection reason must be identity-tagged, got: ${reason}`);
    ok(!calls.some((u) => u.includes("commons.wikimedia.org")), "identity must be verified BEFORE any Commons imageinfo call is made — the resolver must short-circuit, never spend a Commons round trip on an unverified candidate");
  }

  // Positive control for #1: the SAME fixtures with matching coordinates
  // must succeed — proves the geo check itself, not merely "always reject".
  {
    const { photo, reason } = await resolve({});
    ok(!!photo, `an identity-verified, free-licensed candidate must resolve to a photo, got null (reason: ${reason})`);
    if (photo) ok(photo.match_confidence > 0 && photo.match_confidence <= 1, `match_confidence must be in (0,1], got ${photo.match_confidence}`);
  }

  // ── 2. a non-free license is rejected ───────────────────────────────────
  {
    const { photo, reason, calls } = await resolve({ commons: COMMONS_INFO_NONFREE });
    ok(photo === null, "a non-free-licensed Commons file (Free Art License, not in the recognised CC/public-domain set) must not resolve to a photo");
    ok(reason === "license_non_free_license", `rejection reason must be license_non_free_license, got: ${reason}`);
    ok(calls.some((u) => u.includes("commons.wikimedia.org")), "the license rejection must happen AFTER the Commons file was actually inspected, not as a shortcut before it");
  }
  ok(classifyLicense({ License: { value: "cc-by-sa-4.0" } }).free === true, "classifyLicense: cc-by-sa-4.0 must be free");
  ok(classifyLicense({ License: { value: "cc0" } }).free === true, "classifyLicense: cc0 must be free");
  ok(classifyLicense({ LicenseShortName: { value: "Public domain" } }).free === true, "classifyLicense: 'Public domain' short name (no machine code) must be free");
  ok(classifyLicense({ License: { value: "fal" } }).free === false, "classifyLicense: Free Art License ('fal') must NOT be classified free — not clearly CC/public-domain");
  ok(classifyLicense({}).free === false, "classifyLicense: no license metadata at all must be rejected, never defaulted to free");
  ok(classifyLicense({ License: { value: "some-unrecognised-license-2026" } }).free === false, "classifyLicense: an unrecognised license string must be rejected, never guessed");

  // ── 3. attribution text and url are always populated on a returned photo ─
  {
    const { photo } = await resolve({});
    ok(!!photo && typeof photo.attribution_text === "string" && photo.attribution_text.length > 0, "attribution_text must be a non-empty string on a returned photo");
    ok(!!photo && typeof photo.attribution_url === "string" && /^https:\/\//.test(photo.attribution_url), "attribution_url must be a non-empty https URL on a returned photo");
    ok(!!photo && !photo.attribution_text.includes("<"), "attribution_text must be plain text — Commons' Artist field HTML must be stripped, not rendered raw");
  }
  {
    // No Artist metadata at all — the fallback must still produce non-empty
    // attribution, because a CC license without a credit line is a violated
    // license, not a cosmetic gap (the migration's own attribution_text
    // comment).
    const { photo } = await resolve({ commons: COMMONS_INFO_NO_ARTIST });
    ok(!!photo && photo.attribution_text.length > 0, "attribution_text must never be empty, even when Commons supplies no Artist field");
  }
  ok(buildAttributionText({}, { free: true, code: "cc0" }).length > 0, "buildAttributionText: must never return an empty string, even with empty extmetadata");
  ok(!buildAttributionText({ Artist: { value: '<b>Jane</b> <i>Doe</i>' } }, { code: "cc0" }).includes("<"), "buildAttributionText: must strip HTML out of the Artist field");

  // ── 4. the Commons hosts are covered by the fetch policy ────────────────
  {
    const armed = async (url) => {
      const policy = createWikimediaFetchPolicy(async () => ({ ok: false, status: 429, headers: { get: (k) => (k.toLowerCase() === "retry-after" ? "9" : null) } }));
      await policy.fetch(url);
      return policy.state().remainingBackoffMs > 0;
    };
    ok(await armed("https://en.wikipedia.org/w/api.php?action=query"), "sanity baseline: en.wikipedia.org must already arm the backoff on 429 (proves the probe itself works before trusting the new hosts)");
    ok(await armed("https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo"), "commons.wikimedia.org must arm the Retry-After backoff on 429 — it must be gated by isWikimediaUrl, not bypass it");
    ok(await armed("https://upload.wikimedia.org/wikipedia/commons/a/aa/TestMuseum.jpg"), "upload.wikimedia.org must arm the Retry-After backoff on 429 — it must be gated by isWikimediaUrl, not bypass it");
    ok(!(await armed("https://example.com/api")), "negative control: an unrelated host must NOT arm the backoff — proves the probe distinguishes Wikimedia hosts rather than arming on every 429");
  }
  {
    // Semaphore: WIKIMEDIA_MAX_CONCURRENCY (2) must bind on commons.wikimedia.org
    // requests exactly as it does on en.wikipedia.org ones — a request that
    // reached baseFetch means it got a concurrency slot.
    let inFlight = 0;
    const releasers = [];
    const policy = createWikimediaFetchPolicy((url) => {
      inFlight++;
      return new Promise((resolve) => releasers.push(() => { inFlight--; resolve({ ok: true, status: 200, headers: { get: () => null }, clone: () => ({ json: async () => ({}) }) }); }));
    });
    const p1 = policy.fetch("https://commons.wikimedia.org/w/api.php?titles=A");
    const p2 = policy.fetch("https://commons.wikimedia.org/w/api.php?titles=B");
    const p3 = policy.fetch("https://commons.wikimedia.org/w/api.php?titles=C");
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    ok(inFlight === 2, `at most WIKIMEDIA_MAX_CONCURRENCY (2) commons.wikimedia.org requests may be in flight at once, got ${inFlight}`);
    releasers.shift()();
    await p1;
    await Promise.resolve(); await Promise.resolve();
    ok(inFlight === 2, `releasing one slot must admit exactly the next queued commons.wikimedia.org request, got ${inFlight} in flight`);
    releasers.shift()(); await p2;
    releasers.shift()(); await p3;
  }

  // ── 5. a failed lookup returns null and never throws ────────────────────
  for (const [label, overrides] of [
    ["opensearch throws", { opensearch: "throw" }],
    ["opensearch returns no candidates", { opensearch: OPENSEARCH_EMPTY }],
    ["pageinfo throws", { pageInfo: "throw" }],
    ["pageimages throws", { pageImages: "throw" }],
    ["pageimages carries no lead image", { pageImages: PAGE_IMAGES_NONE }],
    ["commons imageinfo throws", { commons: "throw" }],
  ]) {
    const { photo, reason } = await resolve(overrides);
    ok(photo === null, `"${label}" must resolve to null, got: ${JSON.stringify(photo)}`);
    ok(typeof reason === "string" && reason.length > 0, `"${label}" must report a reason via onReject, got: ${reason}`);
  }
  // A place with no name at all — the most degenerate input this can receive.
  {
    const { fetchImpl } = makeFetch({});
    let threw = false;
    let result;
    try {
      result = await findCommonsPhoto({ name: "" }, { fetch: fetchImpl });
    } catch {
      threw = true;
    }
    ok(!threw, "findCommonsPhoto must not throw on a place with an empty name");
    ok(result === null, "a place with an empty name must resolve to null");
  }
  {
    // The never-throws contract must hold even when the CALLER's own
    // onReject hook is broken — a bug in the worker that consumes this
    // resolver must never take the resolver itself down.
    const { fetchImpl } = makeFetch({ opensearch: OPENSEARCH_EMPTY });
    let threw = false;
    try {
      await findCommonsPhoto(PLACE, { fetch: fetchImpl, onReject: () => { throw new Error("caller hook exploded"); } });
    } catch {
      threw = true;
    }
    ok(!threw, "findCommonsPhoto must not throw even when the caller's own onReject hook throws");
  }

  if (failures) {
    console.error(`test-commons-photos: ${failures} FAILED`);
    process.exit(1);
  }
  console.log("test-commons-photos: OK — identity gate, license gate, attribution population, Commons/upload fetch-policy coverage, and the never-throws contract all verified");
}

main().catch((e) => {
  console.error(`test-commons-photos: FAIL — ${(e && e.stack) || e}`);
  process.exit(1);
});
