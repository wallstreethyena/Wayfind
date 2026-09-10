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
import { stripTrackingParams, findCommonsPhoto, classifyLicense, buildAttributionText, isUnavailableReason, verifyCommonsFileIdentity, splitPlacePrimaryName, commonsSearchQueries, distinctivePlaceTokens, NO_DIRECT_COMMONS_REASON } from "../lib/commonsPhotos.js";
import { createWikimediaFetchPolicy } from "../lib/wikimediaFetchPolicy.js";
import { nameSim } from "../lib/popularity.js";

let failures = 0;
const fail = (m) => { console.error("test-commons-photos: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };
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
    ok(!out && why === "no_lead_image", "REAL-SHAPE: an `original`-only pageimages response (no pageimage key) rejects as no_lead_image rather than inventing a filename (got " + why + ")");
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
      { key: "pageImages", reason: "unavailable_lead_image", empty: { query: { pages: { 1: {} } } }, emptyReason: "no_lead_image" },
      { key: "commons", reason: "unavailable_imageinfo", empty: { query: { pages: { 1: {} } } }, emptyReason: "no_commons_imageinfo" },
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
        if (step.key === "opensearch") {
          ok(
            !calls.some((u) => String(u).includes("list=search") || String(u).includes("srsearch=")),
            `C1 opensearch/${label}: a wiki TRANSPORT failure must NOT fall through to Commons-direct search`
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
    ok(bendersonIdent.reason === "identity_name_mismatch", `D1: reject reason is identity_name_mismatch (got ${JSON.stringify(bendersonIdent.reason)})`);

    const asoloIdent = verifyCommonsFileIdentity(ASOLO, ASOLO_FILE);
    ok(asoloIdent.ok, `D2: File:Sarasota FL Asolo Rep Theatre01.jpg must verify as Asolo Repertory Theatre (got ${JSON.stringify(asoloIdent)})`);

    const geoMismatch = verifyCommonsFileIdentity(ASOLO, { ...ASOLO_FILE, lat: 40.71, lng: -74.01 });
    ok(!geoMismatch.ok && geoMismatch.reason === "identity_geo_mismatch", "D2b: the same Asolo filename with NYC coordinates is a geo mismatch — name is not enough");

    const nameOnly = verifyCommonsFileIdentity({ name: ASOLO.name }, { title: ASOLO_FILE.title, description: ASOLO_FILE.description, categories: ASOLO_FILE.categories });
    ok(!nameOnly.ok && nameOnly.reason === "identity_no_geo_or_city", "D2c: name overlap with neither file geo nor city is refused");

    const queries = commonsSearchQueries(BENDERSON);
    ok(queries.every((q) => !/^"?Nathan Benderson Park"?$/.test(q)), "D3: Commons search never queries the location suffix alone");
    ok(queries.some((q) => q.includes("Camp Gladiator")), "D3: Commons search does query the primary entity");

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
      ok(reason === "commons_identity_name_mismatch", `D4: terminal reason is commons_identity_name_mismatch (got ${JSON.stringify(reason)})`);
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
  }

  if (failures) {
    console.error(`test-commons-photos: ${failures} FAILED`);
    process.exit(1);
  }
  console.log("test-commons-photos: OK — wiki identity + license gates, Commons-direct fallback after no_wiki_candidate, Benderson/Camp Gladiator negative, Asolo positive, and unavailable_* still never becoming a permanent rejection");
}

main().catch((e) => {
  console.error(`test-commons-photos: FAIL — ${(e && e.stack) || e}`);
  process.exit(1);
});
