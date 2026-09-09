#!/usr/bin/env node
// scripts/test-photo-vault.mjs — hermetic regression lock for the permanent
// photo vault's CORE (2026-09-09): lib/photoLicense.js (the gate) and
// lib/photoVault.js (the store).
//
// THE INVARIANT THIS FILE EXISTS TO LOCK. "Anything we get from somewhere
// that costs, we store permanently" is a PROCUREMENT rule, not a hoarding
// one — Wayfind keeps what it is LICENSED to keep. Google's Places terms
// permit caching a place_id indefinitely and lat/lng for 30 days; photos are
// NOT among the caching exceptions (AGENTS.md §8), and Wayfind has an open
// ~$1,878 Google billing dispute besides. So a Google photo byte must never
// reach the `place-photos` bucket — enforced in code, not remembered — and
// this file is what keeps that true across every future edit to either
// module.
//
// HERMETIC: every network call any assertion below can trigger goes through
// an injected `fetch` (lib/photoVault.js's `deps.fetch`) whose every call is
// recorded with a `kind` (dbread / dbwrite / download / upload) derived from
// the URL and method, exactly like lib/commonsPhotos.js's own
// `calls.push(String(url))` fixtures. No real network call, no real
// database, no real storage bucket. Run standalone:
// `node scripts/test-photo-vault.mjs`.
//
// CALL-COUNT, NOT REASON-STRING. Every refusal assertion below proves its
// claim by counting calls on the injected fetch, per AGENTS.md's "assert on
// the CALL, not the string" — a reason string a stub could return unchanged
// either way is not evidence that no network request happened.
//
// RED-PROVE (done by hand, 2026-09-09, python mutations against the real
// source — never sed, per CLAUDE.md's BSD-sed caveat — each confirmed red,
// then restored and confirmed green again):
//   1. lib/photoLicense.js: neutralised the Google-by-name branch
//      (`if (isGoogleSourceLabel(...))` → `if (false && ...)`)             → A3/B1 red
//   2. lib/photoVault.js: neutralised the isGooglePhotoUrl relabel check    → B3 red
//   3. lib/photoVault.js: neutralised the gate's early-return              → B4/B5 red
//   4. lib/photoVault.js: neutralised the idempotency early-return         → D1/D2 red
//   5. lib/photoVault.js: leaked attribution_text into the storage PATCH   → C3 red
//   6. lib/photoVault.js: neutralised the non-image content-type refusal   → E1 red
//   7. lib/photoVault.js: neutralised the MAX_BYTES refusal                → E2 red
//   8. lib/photoVault.js: made the outer catch rethrow instead of fail-soft → F2 red
//   9. lib/photoLicense.js: neutralised the non-free-license rejection     → A5/A6/B5 red
// Every mutation was reverted and this file confirmed green again before
// moving to the next one.
import { mayStorePermanently, isGooglePhotoUrl, STORABLE_SOURCES } from "../lib/photoLicense.js";
import { storePhotoPermanently, vaultPublicUrl, MAX_BYTES, PLACE_PHOTOS_BUCKET } from "../lib/photoVault.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("test-photo-vault: FAIL — " + message);
};
const eq = (actual, expected, message) =>
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`
  );

// ── fixtures ─────────────────────────────────────────────────────────────
const PLACE_ID = "ChIJTestVaultPlace123456";
const ENV = { SUPABASE_URL: "https://fake-project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key" };
const SOURCE_URL = "https://upload.wikimedia.org/wikipedia/commons/a/aa/TestVaultPhoto.jpg";
const GOOGLE_HOSTED_URL = "https://lh3.googleusercontent.com/places/AAbbCC1122=s1600-w400";

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function imageResponse({ status = 200, contentType = "image/jpeg", bodyText = "fake-jpeg-bytes-not-real" } = {}) {
  const buf = Buffer.from(bodyText, "utf8");
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

/**
 * A routed fake fetch for storePhotoPermanently's four call shapes
 * (dbread / download / upload / dbwrite). Every call is classified and
 * recorded so a test can assert "zero calls of kind X" precisely, instead of
 * a single opaque total. An unrecognised URL throws — a test that expects a
 * call it did not fixture is a test bug, not a passing case.
 */
function makeFetch({ existingRow = null, download = imageResponse(), rowReadOk = true, uploadOk = true, patchOk = true } = {}) {
  const calls = [];
  const patchBodies = [];

  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = (init && init.method) || "GET";

    if (u.includes("/rest/v1/wf_place_photo") && method === "GET") {
      calls.push({ kind: "dbread", url: u });
      if (!rowReadOk) return jsonResponse(500, {});
      return jsonResponse(200, existingRow ? [existingRow] : []);
    }
    if (u.includes("/rest/v1/wf_place_photo") && method === "PATCH") {
      calls.push({ kind: "dbwrite", url: u });
      patchBodies.push(JSON.parse(init.body));
      return patchOk ? jsonResponse(204, {}) : jsonResponse(500, {});
    }
    if (u.includes("/storage/v1/object/")) {
      calls.push({ kind: "upload", url: u, headers: init.headers, bodyLength: init.body ? init.body.length : 0 });
      return uploadOk ? jsonResponse(200, { Key: u }) : jsonResponse(500, {});
    }
    if (u === SOURCE_URL || u === GOOGLE_HOSTED_URL) {
      calls.push({ kind: "download", url: u, headers: init.headers });
      return download;
    }
    throw new Error("test-photo-vault: unfixtured fetch call: " + u);
  };

  const kindCalls = (kind) => calls.filter((c) => c.kind === kind);
  return { fetchImpl, calls, patchBodies, kindCalls };
}

async function run() {
  // ── Section A — lib/photoLicense.js in isolation (pure, no I/O) ────────

  eq(STORABLE_SOURCES, ["wikimedia", "owner", "creator"], "A1: STORABLE_SOURCES is exactly the wf_place_photo source check constraint's list");

  eq(mayStorePermanently({ source: "google", license: "cc-by-sa-4.0" }), { allowed: false, reason: "google_places_terms_no_photo_caching" }, "A2: source=google is refused BY NAME even with a perfectly free licence");

  for (const spelling of ["Google", "GOOGLE", "google_places", "google-places", "GooglePlaces", "Google Places API"]) {
    eq(
      mayStorePermanently({ source: spelling, license: "cc0" }),
      { allowed: false, reason: "google_places_terms_no_photo_caching" },
      `A3: source spelled "${spelling}" is still refused as Google — the gate cannot be walked around by relabelling`
    );
  }

  for (const source of [undefined, null, "", "flickr", "instagram", "shutterstock"]) {
    eq(mayStorePermanently({ source, license: "cc-by-sa-4.0" }), { allowed: false, reason: "unknown_source" }, `A4: source=${JSON.stringify(source)} (absent/non-listed) fails closed as unknown_source`);
  }

  for (const license of [undefined, null, ""]) {
    eq(mayStorePermanently({ source: "wikimedia", license }), { allowed: false, reason: "unknown_license" }, `A5: licence=${JSON.stringify(license)} (absent/unrecognised) fails closed as unknown_license`);
  }

  eq(mayStorePermanently({ source: "wikimedia", license: "all-rights-reserved" }), { allowed: false, reason: "non_free_license" }, "A6: a recognised but non-free licence is refused as non_free_license, not folded into unknown_license");

  eq(mayStorePermanently({ source: "wikimedia", license: "cc-by-sa-4.0" }), { allowed: true, reason: "ok" }, "A7: wikimedia + a free CC licence is allowed");
  eq(mayStorePermanently({ source: "owner", license: "cc0" }), { allowed: true, reason: "ok" }, "A7b: owner + cc0 is allowed (positive control on the other two storable sources)");

  // ── A8 — RIGHTS-HELD SOURCES, IN THE SHAPE THEY ACTUALLY ARRIVE IN.
  //      A7b passed for the wrong reason and hid a real defect for the whole
  //      first cut of this lane: it labelled an OWNER photo "cc0", which
  //      matches Commons' CC regex, so it exercised the third-party licence
  //      path and never the owner path. A real owner row does not carry a CC
  //      code — it carries a rights statement like "Wayfind owned". Measured
  //      by CALLING the gate: every owner and creator photo was refused
  //      `non_free_license`, i.e. the most permanently-ours content in the
  //      vault was the one thing that could never enter it. Exactly backwards
  //      from the rule this vault exists to implement.
  //      This is CLAUDE.md's "a test whose setup never reaches the code path
  //      under test passes for a reason unrelated to the property asserted."
  //      Both halves are locked below: the allow, and the fail-closed. ──
  eq(mayStorePermanently({ source: "owner", license: "Wayfind owned" }), { allowed: true, reason: "ok" }, "A8: owner + a plain rights statement (NOT a CC code) is allowed — this is the shape an owned photo really arrives in");
  eq(mayStorePermanently({ source: "creator", license: "creator, consent on record" }), { allowed: true, reason: "ok" }, "A8: creator + a consent-on-record rights statement is allowed");
  for (const blank of ["", "   ", null, undefined]) {
    eq(mayStorePermanently({ source: "owner", license: blank }), { allowed: false, reason: "unknown_license" }, `A8: owner + ${JSON.stringify(blank)} rights still FAILS CLOSED — provenance is a different question from a CC code, not a weaker one`);
  }
  // The rights-held branch must not become a hole big enough to drive Google through.
  eq(mayStorePermanently({ source: "google", license: "Wayfind owned" }), { allowed: false, reason: "google_places_terms_no_photo_caching" }, "A8: a Google photo relabelled with an owner-style rights statement is STILL refused by name");
  eq(mayStorePermanently({ source: "getty", license: "Wayfind owned" }), { allowed: false, reason: "unknown_source" }, "A8: an unlisted source is not rescued by a rights statement either");

  ok(isGooglePhotoUrl(GOOGLE_HOSTED_URL) === true, "A8: a googleusercontent.com URL is recognised as Google-hosted regardless of any source label");
  ok(isGooglePhotoUrl(SOURCE_URL) === false, "A8b (negative control): an upload.wikimedia.org URL is NOT flagged as Google-hosted");
  ok(isGooglePhotoUrl("not a url") === false, "A8c: a malformed URL fails closed to false, never throws");

  // ── Section B — lib/photoVault.js: the gate refuses BEFORE any network call ──

  {
    const { fetchImpl, calls } = makeFetch();
    const r = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "google", license: "cc-by-sa-4.0" }, { fetch: fetchImpl, env: ENV });
    eq(r, { stored: false, reason: "google_places_terms_no_photo_caching" }, "B1: a declared google source is refused");
    eq(calls.length, 0, "B1: …and PROVEN by call count — zero fetch calls of any kind happened, not inferred from the reason string");
  }

  for (const spelling of ["GOOGLE", "google_places", "Google-Places"]) {
    const { fetchImpl, calls } = makeFetch();
    const r = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: spelling, license: "cc0" }, { fetch: fetchImpl, env: ENV });
    ok(r.stored === false, `B2: source spelled "${spelling}" is refused end-to-end through storePhotoPermanently`);
    eq(calls.length, 0, `B2: …with zero fetch calls for "${spelling}"`);
  }

  {
    // The relabelling attack: a caller (or a corrupted upstream row) claims
    // source="wikimedia" but the actual bytes live on a googleusercontent
    // host. Must still be refused, and still before any network call.
    const { fetchImpl, calls } = makeFetch();
    const r = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: GOOGLE_HOSTED_URL, source: "wikimedia", license: "cc-by-sa-4.0" }, { fetch: fetchImpl, env: ENV });
    eq(r, { stored: false, reason: "google_places_terms_no_photo_caching" }, "B3: a googleusercontent URL is refused even when mislabelled source=wikimedia");
    eq(calls.length, 0, "B3: …zero fetch calls — the URL-host check runs before the gate would need a network call to be walked around");
  }

  {
    const { fetchImpl, calls } = makeFetch();
    const r = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "flickr", license: "cc-by-sa-4.0" }, { fetch: fetchImpl, env: ENV });
    eq(r, { stored: false, reason: "unknown_source" }, "B4: an unknown source fails closed end-to-end");
    eq(calls.length, 0, "B4: …zero fetch calls");
  }

  {
    const { fetchImpl, calls } = makeFetch();
    const r = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "wikimedia", license: "" }, { fetch: fetchImpl, env: ENV });
    eq(r, { stored: false, reason: "unknown_license" }, "B5: an unknown/absent licence fails closed end-to-end");
    eq(calls.length, 0, "B5: …zero fetch calls");
  }

  // ── Section C — the happy path: accepted, stored, attribution preserved ──

  {
    const existingRow = { place_id: PLACE_ID, storage_path: null, bytes: null, content_type: null };
    const { fetchImpl, calls, patchBodies, kindCalls } = makeFetch({ existingRow });
    const r = await storePhotoPermanently(
      { placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "wikimedia", license: "cc-by-sa-4.0" },
      { fetch: fetchImpl, env: ENV }
    );

    ok(r.stored === true, "C1: a wikimedia CC photo is accepted (" + JSON.stringify(r) + ")");
    ok(typeof r.storagePath === "string" && r.storagePath.startsWith(PLACE_ID + "/"), "C1: …stored under a path keyed on the place id");
    eq(r.publicUrl, vaultPublicUrl(r.storagePath, ENV.SUPABASE_URL), "C1: …publicUrl matches vaultPublicUrl(storagePath, supabaseUrl)");
    ok(r.publicUrl.includes(`/storage/v1/object/public/${PLACE_PHOTOS_BUCKET}/`), "C1: …publicUrl points at the place-photos bucket's public path");
    eq(r.contentType, "image/jpeg", "C1: …content type carried through from the download response");
    ok(r.bytes > 0, "C1: …bytes recorded and positive");

    eq(kindCalls("upload").length, 1, "C2: exactly one upload call — the photo lands in the bucket");
    ok(kindCalls("upload")[0].url.includes(`/storage/v1/object/${PLACE_PHOTOS_BUCKET}/`), "C2: …uploaded to the place-photos bucket specifically");
    eq(kindCalls("upload")[0].headers["content-type"], "image/jpeg", "C2: …uploaded with the detected image content-type");

    eq(patchBodies.length, 1, "C3: exactly one row-write, patching storage fields onto the existing row");
    eq(
      Object.keys(patchBodies[0]).sort(),
      ["bytes", "content_type", "storage_path", "stored_at"].sort(),
      "C3: ATTRIBUTION PRESERVED — the patch touches ONLY the four storage columns, never attribution_text/attribution_url/license/source_ref"
    );
    eq(patchBodies[0].storage_path, r.storagePath, "C3: …and the written storage_path matches what was returned");
  }

  // ── Section D — idempotent: never fetch twice, never upload twice ──────

  {
    const alreadyStoredRow = { place_id: PLACE_ID, storage_path: `${PLACE_ID}/abc123.jpg`, bytes: 4096, content_type: "image/jpeg" };
    const { fetchImpl, kindCalls } = makeFetch({ existingRow: alreadyStoredRow });
    const r = await storePhotoPermanently(
      { placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "wikimedia", license: "cc-by-sa-4.0" },
      { fetch: fetchImpl, env: ENV }
    );

    ok(r.stored === true && r.alreadyStored === true, "D1: a second call for an already-stored place returns the existing storage, not a fresh store");
    eq(r.storagePath, alreadyStoredRow.storage_path, "D1: …the pre-existing storage_path is returned unchanged");
    eq(r.publicUrl, vaultPublicUrl(alreadyStoredRow.storage_path, ENV.SUPABASE_URL), "D1: …publicUrl derived from it");

    eq(kindCalls("download").length, 0, "D2: IDEMPOTENT — zero downloads of the source image (\"never fetch twice\")");
    eq(kindCalls("upload").length, 0, "D2: …zero uploads to storage");
    eq(kindCalls("dbwrite").length, 0, "D2: …zero row-writes — nothing was re-derived, the existing row was simply read back");
  }

  // ── Section E — refused content, never uploaded ─────────────────────────

  {
    const { fetchImpl, kindCalls } = makeFetch({
      existingRow: { place_id: PLACE_ID, storage_path: null, bytes: null, content_type: null },
      download: imageResponse({ contentType: "text/html" }),
    });
    const r = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "wikimedia", license: "cc0" }, { fetch: fetchImpl, env: ENV });
    eq(r, { stored: false, reason: "not_an_image" }, "E1: a non-image content-type is refused");
    eq(kindCalls("upload").length, 0, "E1: …never uploaded");
  }

  {
    const oversized = "a".repeat(MAX_BYTES + 1);
    const { fetchImpl, kindCalls } = makeFetch({
      existingRow: { place_id: PLACE_ID, storage_path: null, bytes: null, content_type: null },
      download: imageResponse({ contentType: "image/jpeg", bodyText: oversized }),
    });
    const r = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "wikimedia", license: "cc0" }, { fetch: fetchImpl, env: ENV });
    eq(r, { stored: false, reason: "too_large" }, `E2: a body over MAX_BYTES (${MAX_BYTES}) is refused`);
    eq(kindCalls("upload").length, 0, "E2: …never uploaded");
  }

  // ── Section F — never throws ─────────────────────────────────────────────

  {
    let threw = false;
    let result;
    try {
      result = await storePhotoPermanently(
        { placeId: null, sourceUrl: 12345, source: {}, license: [] },
        { fetch: async () => { throw new Error("boom — should never be reached"); }, env: ENV }
      );
    } catch {
      threw = true;
    }
    ok(!threw, "F1: malformed input (null placeId, non-string sourceUrl, object source/license) never throws");
    ok(result && result.stored === false, "F1: …and returns a well-formed refusal instead");
  }

  {
    const throwingFetch = async () => {
      throw new Error("simulated network failure");
    };
    let threw = false;
    let result;
    try {
      result = await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "wikimedia", license: "cc0" }, { fetch: throwingFetch, env: ENV });
    } catch {
      threw = true;
    }
    ok(!threw, "F2: a fetch that throws on every call (row-read included) never escapes storePhotoPermanently");
    ok(result && result.stored === false, "F2: …fails soft instead");
  }

  // ── Section G — vaultPublicUrl, pure ─────────────────────────────────────
  eq(
    vaultPublicUrl("abc/def.jpg", "https://fake-project.supabase.co"),
    "https://fake-project.supabase.co/storage/v1/object/public/place-photos/abc/def.jpg",
    "G1: vaultPublicUrl builds the expected public storage URL"
  );
  eq(vaultPublicUrl("", "https://x.supabase.co"), "", "G2: an empty storagePath yields an empty url, never a malformed one");
  eq(vaultPublicUrl("abc.jpg", ""), "", "G3: an empty supabaseUrl yields an empty url");
  // ── THE DOWNLOAD MUST IDENTIFY ITSELF ──────────────────────────────────
  //      Wikimedia's User-Agent policy refuses anonymous bulk traffic on
  //      upload.wikimedia.org. This download sent NO User-Agent, so the host
  //      429'd it and the vault reported "download_failed" — a reason that
  //      reads like a network blip and was actually us being told to say who
  //      we are. Measured live 2026-09-09 against the identical URL: 429
  //      with no UA, 200 with one. 12 of 46 resolved photos sat un-vaulted on
  //      exactly this, serving the origin hotlink instead of a copy Wayfind
  //      owns, which is the entire point of the vault.
  {
    const { fetchImpl, calls } = makeFetch({ existingRow: { place_id: PLACE_ID, storage_path: null, bytes: null, content_type: null } });
    await storePhotoPermanently({ placeId: PLACE_ID, sourceUrl: SOURCE_URL, source: "wikimedia", license: "cc-by-sa-4.0" }, { fetch: fetchImpl, env: ENV });
    const dl = calls.find((c) => c.kind === "download");
    ok(dl, "UA: the download happened");
    const hdrs = (dl && dl.headers) || {};
    const uaKey = Object.keys(hdrs).find((k) => k.toLowerCase() === "user-agent");
    ok(uaKey, "UA: the image download sends a User-Agent — Wikimedia 429s anonymous bulk traffic (headers seen: " + JSON.stringify(Object.keys(hdrs)) + ")");
    const ua = uaKey ? String(hdrs[uaKey]) : "";
    ok(/gowayfind\.com/i.test(ua), "UA: it identifies Wayfind with a contact URL, per Wikimedia's policy (got " + JSON.stringify(ua) + ")");
  }

}

await run();

if (failures) {
  console.error(`test-photo-vault: FAIL — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log(
  "test-photo-vault: OK — Google is refused by name and by URL-host relabelling (zero fetch calls, proven by count); unknown source/licence fail closed; a free Wikimedia photo stores with attribution untouched; a second store is idempotent (zero downloads/uploads); non-image and oversized bodies are refused; the vault never throws"
);
