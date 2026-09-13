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
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { stripTrackingParams, findCommonsPhoto, classifyLicense, buildAttributionText, isUnavailableReason, verifyCommonsFileIdentity, splitPlacePrimaryName, commonsSearchQueries, distinctivePlaceTokens, inferPlaceCity, titleDepictsPlace, isCommonsImageTitle, rankCommonsTitles, placeBranchTokens, COMMONS_BRANCH_GEO_MI, NO_DIRECT_COMMONS_REASON, WIKI_FALLTHROUGH_REASONS } from "../lib/commonsPhotos.js";
import { createWikimediaFetchPolicy } from "../lib/wikimediaFetchPolicy.js";
import { mayStorePermanently } from "../lib/photoLicense.js";
import { nameSim } from "../lib/popularity.js";

let failures = 0;
const fail = (m) => { console.error("test-commons-photos: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };
const eq = (a, b, m) => { if (a !== b) fail(m + ` (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); };
const eqStrip = (input, expected, m) => { const got = stripTrackingParams(input); ok(got === expected, m + " (got " + JSON.stringify(got) + ")"); };

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
// The REAL shape en.wikipedia.org returns for piprop=original ALONE: an
// `original` object and NO `pageimage` key. Measured live 2026-09-09 against
// "Siesta Key, Florida". PAGE_IMAGES_HIT hand-writes a `pageimage` key beside
// `original`, which only comes back when piprop also asks for `name` — so the
// fixture was greener than production and hid the defect below.
const PAGE_IMAGES_ORIGINAL_ONLY = {
  query: { pages: { 111: { title: "Test Museum", original: { source: "https://upload.wikimedia.org/wikipedia/commons/a/aa/TestMuseum.jpg", width: 1024, height: 768 } } } },
};

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
      if (v && v.__status) return jsonResponse(v.__status, v.body || {});
      return jsonResponse(200, v);
    }
    if (String(url).includes("commons.wikimedia.org")) {
      if (String(url).includes("list=search") || String(url).includes("srsearch=")) {
        const v = pick("commonsSearch", { query: { search: [] } });
        if (v === "throw") throw new Error("simulated commons search network failure");
        if (v && v.__status) return jsonResponse(v.__status, v.body || {});
        return jsonResponse(200, v);
      }
      const v = pick("commons", COMMONS_INFO_FREE);
      if (v === "throw") throw new Error("simulated commons network failure");
      if (v && v.__status) return jsonResponse(v.__status, v.body || {});
      return jsonResponse(200, v);
    }
    if (String(url).includes("prop=pageimages")) {
      const v = pick("pageImages", PAGE_IMAGES_HIT);
      if (v === "throw") throw new Error("simulated pageimages network failure");
      if (v && v.__status) return jsonResponse(v.__status, v.body || {});
      return jsonResponse(200, v);
    }
    if (String(url).includes("prop=pageprops")) {
      const v = pick("pageInfo", PAGE_INFO_MATCH);
      if (v === "throw") throw new Error("simulated pageinfo network failure");
      if (v && v.__status) return jsonResponse(v.__status, v.body || {});
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
    ok(photo === null, "a non-free-licensed Commons lead image (Free Art License, not in the recognised CC/public-domain set) must not resolve to a photo");
    ok(
      reason === NO_DIRECT_COMMONS_REASON,
      `a wiki-path license miss is a legitimate no-result and falls through to Commons-direct; empty Commons search stays ${NO_DIRECT_COMMONS_REASON} (got ${reason})`
    );
    ok(calls.some((u) => u.includes("commons.wikimedia.org")), "the license rejection must happen AFTER the Commons file was actually inspected, not as a shortcut before it");
    ok(calls.some((u) => String(u).includes("list=search")), "a definitive wiki-path license miss MUST fall through to Commons-direct search");
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

  // ── THE PRODUCTION SHAPE: NO INJECTED FETCH ────────────────────────────
  //      Every other assertion in this file passes deps.fetch. Production
  //      never does — lib/placePhotoBackfill.js calls findCommonsPhoto(place)
  //      with no fetch at all. `doFetch` defaulted to `undefined`, and
  //      lib/popularity.js's wikiOpensearch/wikiPageInfo tolerate that (their
  //      jf() falls back to the global) so steps 1-2 passed, while timedFetch
  //      invokes doFetch(url, ...) DIRECTLY and threw TypeError into its bare
  //      catch — surfacing as the honest-looking reject "no_lead_image".
  //      Measured 2026-09-09: EVERY place resolved no_lead_image in
  //      production and the pageimages request was never sent at all. The
  //      whole lane was a guaranteed no-op with a fully green guard suite.
  //      This is the only assertion here that exercises the real code path.
  {
    const { fetchImpl, calls } = makeFetch({});
    const saved = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    let out = null;
    let why = null;
    try {
      out = await findCommonsPhoto(PLACE, { onReject: (r) => { why = r; } });
    } finally {
      globalThis.fetch = saved;
    }
    ok(out && out.image_url, "NO-INJECTED-FETCH: findCommonsPhoto resolves a photo with deps.fetch ABSENT — the shape lib/placePhotoBackfill.js actually calls (got reject: " + why + ")");
    ok(calls.some((u) => String(u).includes("prop=pageimages")), "NO-INJECTED-FETCH: the pageimages request is actually SENT — proven by call list, not by a reason string");
  }

  // ── THE REQUEST MUST ASK FOR THE FIELD IT THEN REQUIRES ─────────────────
  //      fetchLeadImageFilename requires page.pageimage. piprop=original does
  //      NOT return pageimage; only a piprop including `name` does. Asserting
  //      the OUTGOING URL, because a fixture can always be written to return a
  //      field the real endpoint would not.
  {
    const { fetchImpl, calls } = makeFetch({});
    await findCommonsPhoto(PLACE, { fetch: fetchImpl });
    const pi = calls.map(String).find((u) => u.includes("prop=pageimages")) || "";
    ok(pi, "PIPROP: a pageimages request was made");
    const piprop = decodeURIComponent((pi.match(/piprop=([^&]*)/) || [])[1] || "");
    ok(piprop.split("|").includes("name"), "PIPROP: piprop must include `name`, or the API returns no pageimage and every lead-image lookup fails (got piprop=" + piprop + ")");
  }

  // ── THE FIXTURE MUST NOT BE GREENER THAN THE REAL API ───────────────────
  //      Fed the real piprop=original-only shape, the resolver must fall out
  //      as no_lead_image. That keeps PAGE_IMAGES_HIT honest: it is only a
  //      valid fixture BECAUSE the request now asks for `name`.
  {
    let why = null;
    const { fetchImpl } = makeFetch({ pageImages: PAGE_IMAGES_ORIGINAL_ONLY });
    const out = await findCommonsPhoto(PLACE, { fetch: fetchImpl, onReject: (r) => { why = r; } });
    ok(!out && why === NO_DIRECT_COMMONS_REASON, "REAL-SHAPE: an `original`-only pageimages response (no pageimage key) is a legitimate no-lead-image and falls through to empty Commons-direct (got " + why + ")");
  }

  // ── TRACKING PARAMS NEVER ENTER A PERMANENT LIBRARY ─────────────────────
  {
    eqStrip("https://upload.wikimedia.org/x.jpg?utm_source=en.wikipedia.org&utm_campaign=api", "https://upload.wikimedia.org/x.jpg", "STRIP: utm_* params are removed");
    eqStrip("https://upload.wikimedia.org/x.jpg?width=800&utm_source=api", "https://upload.wikimedia.org/x.jpg?width=800", "STRIP: non-utm params survive");
    eqStrip("https://upload.wikimedia.org/x.jpg", "https://upload.wikimedia.org/x.jpg", "STRIP: a clean url is unchanged");
    eqStrip("not a url", "", "STRIP: an unparseable url becomes empty so the caller's falsy check catches it");
  }

  // ── SECTION C — "THE REQUEST FAILED" MUST NOT BE FILED AS "THE ANSWER WAS
  //    NO" ────────────────────────────────────────────────────────────────
  //
  //   lib/placePhotoBackfill.js writes a PERMANENT `status:"rejected"` row for
  //   every null this resolver returns, and its own header states the rule:
  //   "EVERY WRITE IS EFFECTIVELY ONE-SHOT ... this worker never re-decides a
  //   place it has already decided." Before 2026-09-09 every failure mode in
  //   this file collapsed into the same null with the same honest-sounding
  //   reason, so a Wikimedia 429 at step 1 was recorded forever as "Wikipedia
  //   has no article for this place" — indistinguishable afterwards from a
  //   real miss, and unrecoverable.
  //
  //   That was survivable at 25 decisions/day. At the 600/day this lane runs
  //   as of v8.56.14 it is not, and lib/wikimediaFetchPolicy.js makes it
  //   worse on purpose: it answers a SYNTHETIC 429 to everything queued
  //   during a Retry-After window, so ONE real 429 can cascade into a whole
  //   run of permanent wrong rejections.
  //
  //   The rule under test: an outcome is DEFINITIVE only when a response
  //   arrived, was 2xx, parsed, and the answer was empty. Everything else is
  //   `unavailable_*`, which the worker leaves undecided and retries.
  {
    const STEPS = [
      { key: "opensearch", reason: "unavailable_opensearch", empty: [PLACE.name, [], [], []], emptyReason: NO_DIRECT_COMMONS_REASON },
      { key: "pageInfo", reason: "unavailable_pageinfo", empty: { query: { pages: {} } }, emptyReason: null },
      { key: "pageImages", reason: "unavailable_lead_image", empty: { query: { pages: { 1: {} } } }, emptyReason: NO_DIRECT_COMMONS_REASON },
      { key: "commons", reason: "unavailable_imageinfo", empty: { query: { pages: { 1: {} } } }, emptyReason: NO_DIRECT_COMMONS_REASON },
    ];

    // C1 (THE HEADLINE INVARIANT) — a 429, a 500, and a thrown fetch at each
    // of the four steps all report `unavailable_*`, never a `no_*` verdict.
    for (const step of STEPS) {
      for (const [label, injected] of [
        ["429", { __status: 429, body: {} }],
        ["500", { __status: 500, body: {} }],
        ["throw", "throw"],
      ]) {
        const { photo, reason, calls } = await resolve({ [step.key]: injected });
        ok(!photo, `C1 ${step.key}/${label}: no photo is returned`);
        if (step.key === "opensearch" || step.key === "pageImages" || step.key === "commons") {
          ok(
            !calls.some((u) => String(u).includes("list=search") || String(u).includes("srsearch=")),
            `C1 ${step.key}/${label}: a wiki TRANSPORT failure must NOT fall through to Commons-direct search`
          );
        }
        ok(
          reason === step.reason,
          `C1 ${step.key}/${label}: a request that did not succeed reports ${step.reason}, never a definitive miss (got ${JSON.stringify(reason)})`
        );
        ok(
          isUnavailableReason(reason),
          `C1 ${step.key}/${label}: and isUnavailableReason() — the SAME predicate lib/placePhotoBackfill.js branches on — agrees it is not a decision`
        );
      }
    }

    // C2 (POSITIVE CONTROL) — the definitive path must still work, or C1
    // could pass merely because every outcome became `unavailable_*`. A 2xx
    // carrying an empty answer keeps its original `no_*` / `identity_*`
    // reason and IS a decision the worker may record permanently.
    for (const step of STEPS) {
      const { photo, reason } = await resolve({ [step.key]: step.empty });
      ok(!photo, `C2 ${step.key}: an empty 2xx answer still yields no photo`);
      ok(
        reason && !isUnavailableReason(reason),
        `C2 ${step.key} (positive control): a 2xx that genuinely answered "nothing here" stays a DEFINITIVE rejection the worker may record (got ${JSON.stringify(reason)})`
      );
      if (step.emptyReason) {
        ok(reason === step.emptyReason, `C2 ${step.key}: and keeps its pre-existing reason ${step.emptyReason} (got ${JSON.stringify(reason)})`);
      } else {
        ok(String(reason).startsWith("identity_"), `C2 ${step.key}: an article that answered but did not verify stays an identity_* rejection (got ${JSON.stringify(reason)})`);
      }
    }

    // C3 — the policy's SYNTHETIC 429. This is the cascade path: the response
    // never left the process, so treating it as evidence about Commons would
    // be inventing a fact. Driven through the REAL controller, not a stub.
    {
      let real = 0;
      const upstream = async (url) => {
        real++;
        // First call is a genuine 429 carrying Retry-After; that arms the
        // window, and everything after it is answered synthetically.
        return { ok: false, status: 429, headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "30" : null) }, json: async () => ({}) };
      };
      const policy = createWikimediaFetchPolicy(upstream);
      let reason = null;
      const photo = await findCommonsPhoto(PLACE, { fetch: policy.fetch, onReject: (r) => { reason = r; } });
      ok(!photo, "C3: a throttled resolve returns no photo");
      ok(reason === "unavailable_opensearch", `C3: a 429 answered by the Wikimedia fetch policy reports unavailable_opensearch (got ${JSON.stringify(reason)})`);
      ok(policy.remainingBackoffMs() > 0, "C3: and the real policy did arm its Retry-After window, which is what makes the next candidates synthetic");
      ok(!policy.canRequest(), "C3: canRequest() is false during that window — the signal lib/placePhotoBackfill.js uses to stop starting candidates at all");
      ok(real >= 1, "C3 (sanity): the upstream fetch was actually reached at least once");
    }

    // C4 — the predicate itself, pinned. The worker's whole branch hangs on
    // it, so a silent widening (e.g. matching every reason) must fail here.
    ok(isUnavailableReason("unavailable_opensearch"), "C4: unavailable_* is not a decision");
    ok(isUnavailableReason("error:boom"), "C4: an unexpected exception is not evidence Commons lacks a photo");
    ok(!isUnavailableReason("no_wiki_candidate"), "C4: an observed empty wiki search IS a decision (wiki-only mode)");
    ok(!isUnavailableReason(NO_DIRECT_COMMONS_REASON), "C4: an observed empty Commons-direct search IS a decision");
    ok(!isUnavailableReason("no_lead_image"), "C4: an observed article with no lead image IS a decision");
    ok(!isUnavailableReason("license_non_free_license"), "C4: an observed non-free licence IS a decision");
    ok(!isUnavailableReason("identity_disambiguation"), "C4: an observed identity mismatch IS a decision");
    ok(!isUnavailableReason(null) && !isUnavailableReason(undefined) && !isUnavailableReason(42), "C4: a missing or non-string reason is not silently treated as unavailable");
    ok(WIKI_FALLTHROUGH_REASONS.includes("no_wiki_candidate") && WIKI_FALLTHROUGH_REASONS.includes("no_lead_image"), "C4: legitimate wiki-path empties are in the fall-through set");
    ok(!WIKI_FALLTHROUGH_REASONS.includes("identity_disambiguation") && !WIKI_FALLTHROUGH_REASONS.includes("unavailable_opensearch"), "C4: identity_* and unavailable_* are NEVER fall-through reasons");
  }

  // ── D — COMMONS-DIRECT FALLBACK (after definitive no_wiki_candidate) ──
  {
    const BENDERSON = {
      name: "Camp Gladiator - Nathan Benderson Park",
      lat: 27.37424,
      lng: -82.45009,
      city: "Sarasota",
      place_id: "ChIJc-m14Rc5w4gRrnsNnZ8pRJY",
    };
    const WALLENDA_FILE = {
      title: "File:Nik Wallenda walking over Nathan Benderson Park.jpg",
      filename: "Nik Wallenda walking over Nathan Benderson Park.jpg",
      description: "Nik Wallenda tightrope walk at Nathan Benderson Park",
      categories: ["Category:Nathan Benderson Park", "Category:Nik Wallenda"],
      lat: 27.37424,
      lng: -82.45009,
    };
    const ASOLO = {
      name: "Asolo Repertory Theatre",
      lat: 27.3865,
      lng: -82.5608,
      city: "Sarasota",
      place_id: "ChIJlXJqE9k_w4gRySJ2BPEXcR0",
    };
    const ASOLO_FILE = {
      title: "File:Sarasota FL Asolo Rep Theatre01.jpg",
      filename: "Sarasota FL Asolo Rep Theatre01.jpg",
      description: "Asolo Repertory Theatre in Sarasota, Florida",
      categories: ["Category:Theatres in Florida", "Category:Sarasota, Florida"],
      lat: 27.3865,
      lng: -82.5608,
    };

    ok(splitPlacePrimaryName(BENDERSON.name) === "Camp Gladiator", "D0: primary entity of the Camp Gladiator row is the gym, not the park");
    ok(distinctivePlaceTokens("Camp Gladiator").includes("gladiator"), "D0: 'gladiator' is a distinctive token the Wallenda file cannot satisfy");

    const locSim = nameSim(BENDERSON.name, "Nathan Benderson Park");
    ok(
      locSim >= 0.55,
      `D1 MUTATION CONTROL: nameSim(place.name, "Nathan Benderson Park") is ${locSim.toFixed(2)} (≥ CONFIDENCE_FLOOR 0.55). A matcher that accepted location-suffix overlap would attach the Wallenda/Benderson park photo to the gym. The reject below is what keeps that mutation red.`
    );
    const bendersonIdent = verifyCommonsFileIdentity(BENDERSON, WALLENDA_FILE);
    ok(!bendersonIdent.ok, "D1 (THE HEADLINE INVARIANT): a Nik Wallenda / Benderson Park crowd photo must NOT verify as Camp Gladiator");
    ok(
      bendersonIdent.reason === "identity_title_mismatch" || bendersonIdent.reason === "identity_name_mismatch",
      `D1: reject reason is identity_title_mismatch (title has no Gladiator tokens) or identity_name_mismatch (got ${JSON.stringify(bendersonIdent.reason)})`
    );
    ok(!titleDepictsPlace(BENDERSON, WALLENDA_FILE), "D1: Wallenda/Benderson title does not depict the Camp Gladiator entity");

    const asoloIdent = verifyCommonsFileIdentity(ASOLO, ASOLO_FILE);
    ok(asoloIdent.ok, `D2: File:Sarasota FL Asolo Rep Theatre01.jpg must verify as Asolo Repertory Theatre (got ${JSON.stringify(asoloIdent)})`);
    ok(titleDepictsPlace(ASOLO, ASOLO_FILE), "D2: Asolo distinctive tokens appear in the file TITLE, not only a caption");

    const geoMismatch = verifyCommonsFileIdentity(ASOLO, { ...ASOLO_FILE, lat: 40.71, lng: -74.01 });
    ok(!geoMismatch.ok && geoMismatch.reason === "identity_geo_mismatch", "D2b: the same Asolo filename with NYC coordinates is a geo mismatch — name is not enough");

    const nameOnly = verifyCommonsFileIdentity({ name: ASOLO.name }, { title: ASOLO_FILE.title, description: ASOLO_FILE.description, categories: ASOLO_FILE.categories });
    ok(!nameOnly.ok && nameOnly.reason === "identity_no_geo_or_city", "D2c: name overlap with neither file geo nor city is refused");

    eq(inferPlaceCity(BENDERSON), "Sarasota", "D3: an explicit city wins over coords inference");
    const inferred = inferPlaceCity({ lat: BENDERSON.lat, lng: BENDERSON.lng });
    ok(inferred.length > 0, `D3: coords-only inventory still infers a city (got ${JSON.stringify(inferred)})`);
    const queries = commonsSearchQueries({ name: BENDERSON.name, lat: BENDERSON.lat, lng: BENDERSON.lng });
    ok(queries.every((q) => !/^"?Nathan Benderson Park"?$/.test(q)), "D3: Commons search never queries the location suffix alone");
    ok(queries.some((q) => q.includes("Camp Gladiator")), "D3: Commons search does query the primary entity");
    ok(
      queries.some((q) => q.includes(inferred)),
      `D3: inferred city is included in a search query (inferred=${JSON.stringify(inferred)} queries=${JSON.stringify(queries)})`
    );
    const celeryQ = commonsSearchQueries({ name: "Celery Fields", city: "Sarasota" });
    ok(celeryQ[0] === '"Celery Fields" Sarasota', `D3: city-qualified search is FIRST so PDFs from the bare name cannot starve the inspect budget (got ${JSON.stringify(celeryQ)})`);

    function commonsSearchHit(title) {
      return { query: { search: [{ ns: 6, title }] } };
    }
    function commonsFileInfo({ title, filename, extmetadata, lat, lon }) {
      return {
        query: {
          pages: {
            1: {
              title,
              coordinates: lat != null ? [{ lat, lon }] : [],
              categories: [{ title: "Category:Buildings in Florida" }],
              imageinfo: [
                {
                  url: `https://upload.wikimedia.org/wikipedia/commons/a/aa/${filename}`,
                  width: 1200,
                  height: 800,
                  descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
                  extmetadata,
                },
              ],
            },
          },
        },
      };
    }
    const ASOLO_META = {
      Artist: { value: "Ebyabe" },
      License: { value: "cc-by-sa-3.0" },
      LicenseShortName: { value: "CC BY-SA 3.0" },
      ImageDescription: { value: "Asolo Repertory Theatre in Sarasota, Florida" },
    };
    const WALLENDA_META = {
      Artist: { value: "A photographer" },
      License: { value: "cc-by-sa-4.0" },
      LicenseShortName: { value: "CC BY-SA 4.0" },
      ImageDescription: { value: "Nik Wallenda at Nathan Benderson Park" },
    };

    {
      const { fetchImpl, calls } = makeFetch({
        opensearch: OPENSEARCH_EMPTY,
        commonsSearch: commonsSearchHit("File:Nik Wallenda walking over Nathan Benderson Park.jpg"),
        commons: commonsFileInfo({
          title: "File:Nik Wallenda walking over Nathan Benderson Park.jpg",
          filename: "Nik_Wallenda_Benderson.jpg",
          extmetadata: WALLENDA_META,
          lat: 27.37424,
          lon: -82.45009,
        }),
      });
      let reason = null;
      const photo = await findCommonsPhoto(BENDERSON, { fetch: fetchImpl, onReject: (r) => { reason = r; } });
      ok(photo === null, "D4 (END-TO-END NEGATIVE): Camp Gladiator + Wallenda Commons hit must not resolve a photo");
      ok(
        reason === "commons_identity_title_mismatch" || reason === "commons_identity_name_mismatch",
        `D4: terminal reason is commons_identity_title_mismatch (got ${JSON.stringify(reason)})`
      );
      ok(calls.some((u) => String(u).includes("list=search")), "D4: the Commons-direct search actually ran (wiki was empty)");
      ok(!isUnavailableReason(reason), "D4: a wrong-entity hit is a DECISION, not a deferral — replay must not loop it");
    }

    {
      const { fetchImpl, calls } = makeFetch({
        opensearch: OPENSEARCH_EMPTY,
        commonsSearch: commonsSearchHit("File:Sarasota FL Asolo Rep Theatre01.jpg"),
        commons: commonsFileInfo({
          title: "File:Sarasota FL Asolo Rep Theatre01.jpg",
          filename: "Sarasota_FL_Asolo_Rep_Theatre01.jpg",
          extmetadata: ASOLO_META,
          lat: 27.3865,
          lon: -82.5608,
        }),
      });
      let reason = null;
      const photo = await findCommonsPhoto(ASOLO, { fetch: fetchImpl, onReject: (r) => { reason = r; } });
      ok(!!photo, `D5 (END-TO-END POSITIVE): Asolo + File:Sarasota FL Asolo Rep Theatre01.jpg must resolve (reason: ${reason})`);
      if (photo) {
        ok(photo.source_ref === "File:Sarasota_FL_Asolo_Rep_Theatre01.jpg" || photo.source_ref === "File:Sarasota FL Asolo Rep Theatre01.jpg" || /Asolo/i.test(photo.source_ref), `D5: source_ref is the Commons file (got ${photo.source_ref})`);
        ok(photo.license.toLowerCase().includes("cc"), `D5: license is a recognised CC code (got ${photo.license})`);
        ok(photo.attribution_text.length > 0, "D5: attribution_text is populated");
        ok(/^https:\/\//.test(photo.image_url) && !/googleusercontent/i.test(photo.image_url), "D5: image_url is a Wikimedia URL, never Google");
      }
      ok(calls.some((u) => String(u).includes("list=search")), "D5: Commons-direct search ran because wiki was empty");
      ok(!calls.some((u) => /places\.googleapis|googleusercontent/i.test(String(u))), "D5: zero Google media hosts on the Commons-direct path");
    }

    {
      const { fetchImpl, calls } = makeFetch({
        opensearch: OPENSEARCH_EMPTY,
        commonsSearch: commonsSearchHit("File:Sarasota FL Asolo Rep Theatre01.jpg"),
        commons: commonsFileInfo({
          title: "File:Sarasota FL Asolo Rep Theatre01.jpg",
          filename: "Sarasota_FL_Asolo_Rep_Theatre01.jpg",
          extmetadata: ASOLO_META,
          lat: 27.3865,
          lon: -82.5608,
        }),
      });
      let reason = null;
      const photo = await findCommonsPhoto(ASOLO, { fetch: fetchImpl, wikiOnly: true, onReject: (r) => { reason = r; } });
      ok(photo === null && reason === "no_wiki_candidate", `D6: wikiOnly stops at no_wiki_candidate and does not search Commons (got ${reason})`);
      ok(!calls.some((u) => String(u).includes("list=search")), "D6: wikiOnly must not issue a Commons file search — this is the measurement baseline");
    }

    {
      const { photo, reason, calls } = await resolve({
        opensearch: OPENSEARCH_EMPTY,
        commonsSearch: { __status: 429, body: {} },
      });
      ok(!photo && reason === "unavailable_commons_search", `D7: a 429 on Commons-direct search is unavailable_*, never a terminal miss (got ${reason})`);
      ok(isUnavailableReason(reason), "D7: the worker must defer, not reject");
      ok(calls.some((u) => String(u).includes("list=search")), "D7: the search was actually attempted");
    }

    {
      const { photo, reason } = await resolve({ opensearch: OPENSEARCH_EMPTY, commonsSearch: { query: { search: [] } } });
      ok(!photo && reason === NO_DIRECT_COMMONS_REASON, `D8: empty Commons-direct search is the new terminal miss (got ${reason})`);
      ok(!isUnavailableReason(reason), "D8: and it IS a decision the worker may file");
    }

    const CAZAN = {
      name: "Ca' d'Zan",
      lat: 27.3847,
      lng: -82.5603,
      city: "Sarasota",
      place_id: "ChIJpXGK53VC24gRWMneFVtK6hY",
    };
    const CAZAN_META = {
      Artist: { value: "A photographer" },
      License: { value: "cc-by-sa-4.0" },
      LicenseShortName: { value: "CC BY-SA 4.0" },
      ImageDescription: { value: "Front view of Ca' d'Zan, The Ringling, Sarasota" },
      ObjectName: { value: "Front view of Ca' d'Zan" },
    };
    const CELERY = {
      name: "Celery Fields",
      lat: 27.32537,
      lng: -82.4336,
      city: "Sarasota",
      place_id: "ChIJ7-I5X4tHw4gRAK6g4JEha7M",
    };
    const CELERY_FILE = {
      title: "File:Painted bunting at Celery Fields in Sarasota, Florida.jpg",
      filename: "Painted bunting at Celery Fields in Sarasota, Florida.jpg",
      description: "Painted bunting at Celery Fields, Sarasota",
      objectName: "Painted bunting at Celery Fields",
      categories: ["Category:Celery Fields", "Category:Sarasota, Florida"],
      lat: 27.32537,
      lng: -82.4336,
    };

    ok(!isCommonsImageTitle("File:Celery Fields trail map.pdf"), "D9: a Commons PDF is not an inspectable photo");
    ok(isCommonsImageTitle("File:Painted bunting at Celery Fields in Sarasota, Florida.jpg"), "D9: a Commons JPEG is an inspectable photo");
    const ranked = rankCommonsTitles(CELERY, [
      "File:Celery Fields trail map.pdf",
      "File:Random park.pdf",
      "File:Painted bunting at Celery Fields in Sarasota, Florida.jpg",
    ]);
    ok(ranked.length === 1 && ranked[0].includes("Painted bunting"), "D9: rankCommonsTitles drops PDFs and keeps the identity-bearing JPEG");
    ok(verifyCommonsFileIdentity(CELERY, CELERY_FILE).ok, `D9: Celery Fields JPEG verifies (got ${JSON.stringify(verifyCommonsFileIdentity(CELERY, CELERY_FILE))})`);

    const bayFile = {
      title: "File:Sarasota Bay.JPG",
      filename: "Sarasota Bay.JPG",
      description: "View toward Ca' d'Zan from Sarasota Bay",
      categories: ["Category:Ca' d'Zan", "Category:Sarasota, Florida"],
      lat: 27.3847,
      lng: -82.5603,
    };
    const bayIdent = verifyCommonsFileIdentity(CAZAN, bayFile);
    ok(!bayIdent.ok && bayIdent.reason === "identity_title_mismatch", `D10: a generic Sarasota Bay city photo must not attach to Ca' d'Zan even when the caption names the mansion (got ${JSON.stringify(bayIdent)})`);

    const sameName = verifyCommonsFileIdentity(
      { name: "Centennial Park", lat: 27.498, lng: -82.573, city: "Bradenton" },
      {
        title: "File:Centennial Park Atlanta.jpg",
        description: "Centennial Olympic Park in Atlanta",
        categories: ["Category:Parks in Atlanta"],
        lat: 33.76,
        lng: -84.39,
      }
    );
    ok(!sameName.ok && sameName.reason === "identity_geo_mismatch", `D11: ambiguous same-name place in another city is a geo reject (got ${JSON.stringify(sameName)})`);

    const wrongCity = verifyCommonsFileIdentity(
      { name: "Asolo Repertory Theatre", city: "Sarasota" },
      { title: "File:Asolo Rep Theatre Tampa.jpg", description: "Asolo touring production in Tampa", categories: ["Category:Tampa, Florida"] }
    );
    ok(
      !wrongCity.ok && (wrongCity.reason === "identity_city_mismatch" || wrongCity.reason === "identity_branch_mismatch"),
      `D12: correct name, wrong city, no file GPS is refused (city or branch proof — got ${JSON.stringify(wrongCity)})`
    );

    {
      const { fetchImpl } = makeFetch({
        opensearch: OPENSEARCH_EMPTY,
        commonsSearch: commonsSearchHit("File:Sarasota FL Asolo Rep Theatre01.jpg"),
        commons: commonsFileInfo({
          title: "File:Sarasota FL Asolo Rep Theatre01.jpg",
          filename: "Sarasota_FL_Asolo_Rep_Theatre01.jpg",
          extmetadata: {
            Artist: { value: "Ebyabe" },
            License: { value: "fal" },
            LicenseShortName: { value: "Free Art License" },
            ImageDescription: { value: "Asolo Repertory Theatre in Sarasota, Florida" },
          },
          lat: 27.3865,
          lon: -82.5608,
        }),
      });
      let reason = null;
      const photo = await findCommonsPhoto(ASOLO, { fetch: fetchImpl, onReject: (r) => { reason = r; } });
      ok(photo === null && reason === "license_non_free_license", `D13: a verified-identity Commons file with a non-free license is rejected (got ${reason})`);
    }

    {
      const { fetchImpl, calls } = makeFetch({
        opensearch: OPENSEARCH_EMPTY,
        commonsSearch: commonsSearchHit("File:Front view of Ca' d'Zan.jpg"),
        commons: commonsFileInfo({
          title: "File:Front view of Ca' d'Zan.jpg",
          filename: "Front_view_of_Ca_dZan.jpg",
          extmetadata: CAZAN_META,
          lat: 27.3847,
          lon: -82.5603,
        }),
      });
      let reason = null;
      const photo = await findCommonsPhoto(CAZAN, { fetch: fetchImpl, onReject: (r) => { reason = r; } });
      ok(!!photo, `D14 (SECOND LIVE-SHAPED POSITIVE): Ca' d'Zan + File:Front view of Ca' d'Zan.jpg must resolve via Commons-direct (reason: ${reason})`);
      if (photo) {
        const vault = mayStorePermanently({ source: "wikimedia", license: photo.license });
        ok(vault.allowed, `D14: accepted Commons-direct photo is vaultable through mayStorePermanently (got ${JSON.stringify(vault)})`);
        ok(/^https:\/\//.test(photo.image_url) && !/googleusercontent/i.test(photo.image_url), "D14: image_url is Wikimedia, never Google Places bytes");
        ok(photo.attribution_text.length > 0 && photo.attribution_url.length > 0, "D14: provenance/attribution preserved");
      }
      ok(calls.some((u) => String(u).includes("list=search")), "D14: Commons-direct search ran because wiki was empty");
    }

    {
      const { fetchImpl, calls } = makeFetch({
        opensearch: ["Asolo Repertory Theatre", ["Asolo Repertory Theatre"], [""], ["https://en.wikipedia.org/wiki/Asolo_Repertory_Theatre"]],
        pageInfo: {
          query: {
            pages: {
              111: {
                title: "Asolo Repertory Theatre",
                pageprops: {},
                coordinates: [{ lat: 27.3865, lon: -82.5608 }],
                categories: [{ title: "Category:Theatres in Florida" }],
                extract: "Asolo Repertory Theatre is a professional theatre in Sarasota, Florida.",
              },
            },
          },
        },
        pageImages: PAGE_IMAGES_NONE,
        commonsSearch: commonsSearchHit("File:Sarasota FL Asolo Rep Theatre01.jpg"),
        commons: commonsFileInfo({
          title: "File:Sarasota FL Asolo Rep Theatre01.jpg",
          filename: "Sarasota_FL_Asolo_Rep_Theatre01.jpg",
          extmetadata: ASOLO_META,
          lat: 27.3865,
          lon: -82.5608,
        }),
      });
      let reason = null;
      const photo = await findCommonsPhoto(ASOLO, { fetch: fetchImpl, onReject: (r) => { reason = r; } });
      ok(!!photo, `D15: a verified wiki article with no lead image falls through to Commons-direct and accepts the real Asolo file (reason: ${reason})`);
      ok(calls.some((u) => String(u).includes("prop=pageimages")), "D15: the wiki lead-image lookup actually ran");
      ok(calls.some((u) => String(u).includes("list=search")), "D15: Commons-direct actually ran after no_lead_image");
    }

    {
      // D5 already accepted Asolo via Commons-direct. Pin vaultability on that shape too.
      const { fetchImpl } = makeFetch({
        opensearch: OPENSEARCH_EMPTY,
        commonsSearch: commonsSearchHit("File:Sarasota FL Asolo Rep Theatre01.jpg"),
        commons: commonsFileInfo({
          title: "File:Sarasota FL Asolo Rep Theatre01.jpg",
          filename: "Sarasota_FL_Asolo_Rep_Theatre01.jpg",
          extmetadata: ASOLO_META,
          lat: 27.3865,
          lon: -82.5608,
        }),
      });
      const photo = await findCommonsPhoto(ASOLO, { fetch: fetchImpl });
      const vault = photo ? mayStorePermanently({ source: "wikimedia", license: photo.license }) : { allowed: false };
      ok(!!photo && vault.allowed, "D16: Asolo Commons-direct accept is active-and-vaultable (source=wikimedia + free license)");
      ok(!mayStorePermanently({ source: "google", license: "cc-by-sa-4.0" }).allowed, "D16: Google Places bytes stay un-vaultable even with a free-looking license string");
    }

    {
      const ARTSLAM = { name: "ArtSLAM at Bradenton Riverwalk", lat: 27.4989, lng: -82.5748, city: "Bradenton" };
      const slamIdent = verifyCommonsFileIdentity(ARTSLAM, {
        title: "File:Realize Bradenton ArtSlam 2011 Winner.jpg",
        description: "Realize Bradenton ArtSlam 2011 winner",
        categories: ["Category:Bradenton, Florida"],
        lat: 27.4989,
        lng: -82.5748,
      });
      ok(slamIdent.ok, `D18: File:Realize Bradenton ArtSlam 2011 Winner.jpg verifies as ArtSLAM (got ${JSON.stringify(slamIdent)})`);
      const riverwalkOnly = verifyCommonsFileIdentity(ARTSLAM, {
        title: "File:Bradenton Riverwalk.jpg",
        description: "ArtSLAM event at Bradenton Riverwalk",
        categories: ["Category:ArtSLAM", "Category:Bradenton, Florida"],
        lat: 27.4989,
        lng: -82.5748,
      });
      ok(!riverwalkOnly.ok && riverwalkOnly.reason === "identity_title_mismatch", `D18: a generic Riverwalk neighborhood photo must not attach to ArtSLAM even when the caption names the org (got ${JSON.stringify(riverwalkOnly)})`);
    }

    {
      // D19 — BRANCH IDENTITY. Production has real multi-branch rows
      // (Sky Zone, Club Pilates, PopStroke) ~8–10 miles apart. GPS ≤ 15mi
      // is metro, not "this branch." A generic brand title plus a
      // coordinate 10 miles away must not attach.
      const LWR = { name: "Sky Zone - Lakewood Ranch", lat: 27.429, lng: -82.428, city: "Lakewood Ranch" };
      const SRQ = { name: "Sky Zone - Sarasota", lat: 27.336, lng: -82.468, city: "Sarasota" };
      ok(placeBranchTokens(LWR).includes("lakewood"), `D19: Lakewood Ranch suffix tokens include lakewood (got ${JSON.stringify(placeBranchTokens(LWR))})`);
      ok(placeBranchTokens(SRQ).includes("sarasota"), `D19: Sarasota suffix tokens include sarasota (got ${JSON.stringify(placeBranchTokens(SRQ))})`);
      const genericSky = {
        title: "File:Sky Zone trampoline park.jpg",
        filename: "Sky Zone trampoline park.jpg",
        description: "A Sky Zone trampoline park",
        objectName: "Sky Zone trampoline park",
        categories: ["Category:Trampoline parks"],
        lat: 27.429,
        lng: -82.428,
      };
      const genericLwr = verifyCommonsFileIdentity(LWR, genericSky);
      const genericSrq = verifyCommonsFileIdentity(SRQ, genericSky);
      ok(!genericLwr.ok && genericLwr.reason === "identity_branch_mismatch", `D19: generic Sky Zone title + GPS at Lakewood Ranch must NOT attach to Sky Zone - Lakewood Ranch (got ${JSON.stringify(genericLwr)})`);
      ok(!genericSrq.ok && genericSrq.reason === "identity_branch_mismatch", `D19: the same generic file must NOT attach to Sky Zone - Sarasota either (got ${JSON.stringify(genericSrq)})`);
      const lwrFile = {
        title: "File:Sky Zone Lakewood Ranch.jpg",
        filename: "Sky Zone Lakewood Ranch.jpg",
        description: "Sky Zone in Lakewood Ranch, Florida",
        objectName: "Sky Zone Lakewood Ranch",
        categories: ["Category:Lakewood Ranch, Florida"],
        lat: 27.429,
        lng: -82.428,
      };
      const lwrOnLwr = verifyCommonsFileIdentity(LWR, lwrFile);
      const lwrOnSrq = verifyCommonsFileIdentity(SRQ, lwrFile);
      ok(lwrOnLwr.ok, `D19: File:Sky Zone Lakewood Ranch.jpg verifies the Lakewood Ranch branch (got ${JSON.stringify(lwrOnLwr)})`);
      ok(!lwrOnSrq.ok && lwrOnSrq.reason === "identity_branch_mismatch", `D19 (CROSS-ATTACH LOCK): the Lakewood Ranch file must not verify as Sky Zone - Sarasota ~8mi away (got ${JSON.stringify(lwrOnSrq)})`);
      ok(lwrOnSrq.dist == null || lwrOnSrq.dist <= 15, "D19: the reject is branch identity, not the 15mi metro geo gate — GPS success must not skip needing the suffix");

      const pilatesA = { name: "Club Pilates", lat: 27.336, lng: -82.53, city: "Sarasota" };
      const pilatesB = { name: "Club Pilates", lat: 27.429, lng: -82.428, city: "Lakewood Ranch" };
      eq(placeBranchTokens(pilatesA).length, 0, "D19: a suffix-less Club Pilates display name has no branch tokens");
      const pilatesGeneric = {
        title: "File:Club Pilates studio.jpg",
        filename: "Club Pilates studio.jpg",
        description: "A Club Pilates studio",
        objectName: "Club Pilates studio",
        categories: ["Category:Pilates"],
        lat: 27.336,
        lng: -82.53,
      };
      const pilatesNear = verifyCommonsFileIdentity(pilatesA, pilatesGeneric);
      const pilatesFar = verifyCommonsFileIdentity(pilatesB, pilatesGeneric);
      ok(pilatesNear.ok, `D19: suffix-less short brand + campus-tight GPS (≤ ${COMMONS_BRANCH_GEO_MI}mi) may accept (got ${JSON.stringify(pilatesNear)})`);
      ok(!pilatesFar.ok && pilatesFar.reason === "identity_branch_mismatch", `D19: the same generic Club Pilates file ~8mi away must NOT attach to the other branch (got ${JSON.stringify(pilatesFar)})`);
      ok(pilatesFar.dist != null && pilatesFar.dist > COMMONS_BRANCH_GEO_MI && pilatesFar.dist < 15, `D19: the far Club Pilates reject sits inside the old 15mi gate and outside the branch gate (dist=${pilatesFar.dist})`);

      {
        const { fetchImpl } = makeFetch({
          opensearch: OPENSEARCH_EMPTY,
          commonsSearch: commonsSearchHit("File:Sky Zone trampoline park.jpg"),
          commons: commonsFileInfo({
            title: "File:Sky Zone trampoline park.jpg",
            filename: "Sky_Zone_trampoline_park.jpg",
            extmetadata: {
              Artist: { value: "A photographer" },
              License: { value: "cc-by-sa-4.0" },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              ImageDescription: { value: "A Sky Zone trampoline park" },
              ObjectName: { value: "Sky Zone trampoline park" },
            },
            lat: 27.429,
            lon: -82.428,
          }),
        });
        let reasonLwr = null;
        let reasonSrq = null;
        const photoLwr = await findCommonsPhoto(LWR, { fetch: fetchImpl, onReject: (r) => { reasonLwr = r; } });
        const photoSrq = await findCommonsPhoto(SRQ, { fetch: fetchImpl, onReject: (r) => { reasonSrq = r; } });
        ok(photoLwr === null && reasonLwr === "commons_identity_branch_mismatch", `D19e: end-to-end, generic Sky Zone file must not resolve for Lakewood Ranch (got ${reasonLwr})`);
        ok(photoSrq === null && reasonSrq === "commons_identity_branch_mismatch", `D19e: end-to-end, generic Sky Zone file must not resolve for Sarasota (got ${reasonSrq})`);
      }
      {
        const { fetchImpl } = makeFetch({
          opensearch: OPENSEARCH_EMPTY,
          commonsSearch: commonsSearchHit("File:Sky Zone Lakewood Ranch.jpg"),
          commons: commonsFileInfo({
            title: "File:Sky Zone Lakewood Ranch.jpg",
            filename: "Sky_Zone_Lakewood_Ranch.jpg",
            extmetadata: {
              Artist: { value: "A photographer" },
              License: { value: "cc-by-sa-4.0" },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              ImageDescription: { value: "Sky Zone in Lakewood Ranch, Florida" },
              ObjectName: { value: "Sky Zone Lakewood Ranch" },
            },
            lat: 27.429,
            lon: -82.428,
          }),
        });
        let reasonSrq = null;
        const photoLwr = await findCommonsPhoto(LWR, { fetch: fetchImpl });
        const photoSrq = await findCommonsPhoto(SRQ, { fetch: fetchImpl, onReject: (r) => { reasonSrq = r; } });
        ok(!!photoLwr, `D19e: branch-specific Lakewood Ranch file resolves for that branch (reason if any: missing)`);
        ok(photoSrq === null && reasonSrq === "commons_identity_branch_mismatch", `D19e (CROSS-ATTACH LOCK): that same file must not resolve for Sky Zone - Sarasota (got ${reasonSrq})`);
      }
    }

    {
      // MUTATION RED-PROVE. If identity continue is deleted, the Wallenda
      // file is assigned to Camp Gladiator. This block watches the mutation
      // land, then proves that assignment happens — which is the red D4
      // exists to catch. A no-op replace must fail THIS block, not look like
      // a passing guard.
      const srcPath = fileURLToPath(new URL("../lib/commonsPhotos.js", import.meta.url));
      const src = readFileSync(srcPath, "utf8");
      const ANCHOR = "    const ident = verifyCommonsFileIdentity(place, rec);\n    if (!ident.ok) {\n      lastIdentityReason = ident.reason || \"unverified\";\n      continue;\n    }";
      ok(src.includes(ANCHOR), "D17 MUTATION ANCHOR: the identity-continue in resolveDirectCommons is present so the red-prove can actually land");
      const mutated = src.replace(
        ANCHOR,
        "    const ident = verifyCommonsFileIdentity(place, rec);\n    if (!ident.ok) {\n      lastIdentityReason = ident.reason || \"unverified\";\n    }"
      );
      ok(mutated !== src && !mutated.includes(ANCHOR), "D17: watched mutation applied — identity continue was removed (a silent no-op replace must not pass)");
      const rewritten = mutated.replace(
        /from "\.\/popularity\.js"/,
        `from ${JSON.stringify(new URL("../lib/popularity.js", import.meta.url).href)}`
      );
      const tmp = join(mkdtempSync(join(tmpdir(), "wf-commons-mut-")), "commonsPhotos.mjs");
      writeFileSync(tmp, rewritten);
      try {
        const M = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
        const { fetchImpl } = makeFetch({
          opensearch: OPENSEARCH_EMPTY,
          commonsSearch: commonsSearchHit("File:Nik Wallenda walking over Nathan Benderson Park.jpg"),
          commons: commonsFileInfo({
            title: "File:Nik Wallenda walking over Nathan Benderson Park.jpg",
            filename: "Nik_Wallenda_Benderson.jpg",
            extmetadata: WALLENDA_META,
            lat: 27.37424,
            lon: -82.45009,
          }),
        });
        const forced = await M.findCommonsPhoto(BENDERSON, { fetch: fetchImpl });
        ok(!!forced, "D17 MUTATION RED: forcing the identity continue off assigns the Wallenda/Benderson photo to Camp Gladiator — this is the red the D4 guard exists to catch");
        if (forced) {
          ok(/Wallenda|Benderson/i.test(forced.source_ref || ""), `D17: the forced assignment is specifically the Wallenda/Benderson file (got ${forced.source_ref})`);
        }
      } finally {
        try { unlinkSync(tmp); } catch { /* tmp cleanup */ }
      }
    }
  }

  if (failures) {
    console.error(`test-commons-photos: ${failures} FAILED`);
    process.exit(1);
  }
  console.log("test-commons-photos: OK — wiki identity + license gates, Commons-direct after legitimate wiki empties, title-level identity, Benderson/Camp Gladiator negative + mutation-red, same-brand branches cannot cross-attach, Asolo and Ca'd'Zan positives, vaultable, and unavailable_* still never becoming a permanent rejection");
}

main().catch((e) => {
  console.error(`test-commons-photos: FAIL — ${(e && e.stack) || e}`);
  process.exit(1);
});
