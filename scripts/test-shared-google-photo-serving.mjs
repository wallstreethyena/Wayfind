import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const ID = "ChIJSHAREDphotoPlace123456";
const CREDIT = { name: "Exact photographer", uri: "https://www.google.com/maps/contrib/123", mapsUri: "https://www.google.com/maps/place/?q=place_id:" + ID, authors: [{ name: "Exact photographer", uri: "https://www.google.com/maps/contrib/123", photoUri: null }] };
let saved = null, state = "missing", grants = 0, google = 0, claims = 0, failed = 0;
const store = {
  read: async () => saved,
  claim: async () => { claims++; if (saved) return { state: "ready", photo: saved }; if (state !== "missing") return { state }; state = "pending"; return { state: "claimed", token: "test-lease" }; },
  save: async ({ placeId, token, credit }) => { check(placeId === ID && token === "test-lease", "save fenced to exact place and lease"); saved = { src: `/api/photo/stored/${ID}?v=${"a".repeat(64)}`, source: "google", credit }; state = "ready"; return saved; },
  fail: async () => { failed++; },
};
const base = { place: ID, googleSurface: true, retainGoogle: true, serverKey: "fixture-only", authorizeSpend: async () => { grants++; return true; } };
const deps = { photoStore: store, inventoryGet: async () => null, fetchOwnedUri: async () => { google++; return { uri: "https://lh3.googleusercontent.com/fixture", credit: CREDIT, upstream: "ok" }; }, breakerOpen: async () => null, storeWaitMs: 0 };
const first = await resolvePlacePhoto(base, deps);
check(first.reason === "google" && first.stored && first.location.startsWith("/api/photo/stored/"), "first paid request publishes saved bytes URL");
check(first.credit === CREDIT && grants === 1 && google === 1, "one authorized purchase preserves exact credit");
for (const w of [320, 640, 1280, 1600]) {
  const reuse = await resolvePlacePhoto({ ...base, w, probe: true, gateShut: true, serverKey: "" }, { ...deps, now: Date.now() + 400 * 86400000 });
  check(reuse.reason === "google-stored" && reuse.location === first.location && reuse.credit === CREDIT, "saved image survives future dates, width changes, no-spend and shut paid gate");
}
check(grants === 1 && google === 1 && claims === 1, "all repeat visitors use stored photo with no grant or Google call");
const readOnly = await resolvePlacePhoto({ ...base, googleSurface: false, storedSurface: true, probe: true }, deps);
check(readOnly.reason === "google-stored", "read-only credited JSON may reuse shared photo");
const uncredited = await resolvePlacePhoto({ ...base, googleSurface: false }, deps);
check(uncredited.reason === "not-google-surface", "saved bytes do not bypass attribution-capable response requirement");
saved = null;
for (const blocked of ["pending", "removed", "unavailable"]) {
  state = blocked;
  const r = await resolvePlacePhoto(base, deps);
  check(r.type === "miss" && google === 1 && grants === 1, `${blocked} never purchases again`);
}
state = "missing";
const denied = await resolvePlacePhoto({ ...base, authorizeSpend: async () => false }, deps);
check(denied.reason === "spend-denied" && google === 1 && failed === 1, "global denial releases claim without buying");
state = "missing";
const failSave = await resolvePlacePhoto(base, { ...deps, photoStore: { ...store, save: async () => null } });
check(failSave.reason === "owned-miss" && failSave.upstream === "storage-failed" && !failSave.location, "failed or removed acquisition never exposes a stale live URL");
check(failed === 2, "failed save releases only its claim");
state = "missing";
const concurrent = await Promise.all(Array.from({ length: 50 }, (_, i) => resolvePlacePhoto({ ...base, w: i % 2 ? 640 : 1600 }, deps)));
check(concurrent.every(x => x.location === concurrent[0].location) && google === 3 && grants === 3, "concurrent widths share one additional acquisition");

// Exercise defaultFetchOwnedUri itself: only transport is mocked. Advance the
// clock while consuming Details' body instead of waiting for a real timeout.
// The healthy control ensures a missing media call is not a broken fixture.
for (const slowDetails of [false, true]) {
  const deadlineId = slowDetails ? "ChIJDeadlineSlowPlace123456" : "ChIJDeadlineFastPlace123456";
  const originalNow = Date.now;
  const originalTimeout = AbortSignal.timeout;
  let clock = originalNow(), stored = 0, released = 0;
  const calls = [], timeouts = [];
  Date.now = () => clock;
  AbortSignal.timeout = ms => { timeouts.push(ms); return originalTimeout.call(AbortSignal, ms); };
  try {
    const result = await resolvePlacePhoto({
      place: deadlineId, googleSurface: true, retainGoogle: true,
      serverKey: "fixture-only", authorizeSpend: async () => true,
    }, {
      inventoryGet: async () => null, breakerOpen: async () => null,
      retryDelayMs: 0, refund: async () => true,
      photoStore: {
        read: async () => null,
        claim: async () => { clock += 5000; return { state: "claimed", token: "deadline-lease" }; },
        save: async ({ credit }) => { stored++; return { src: `/api/photo/stored/${deadlineId}`, credit }; },
        fail: async () => { released++; },
      },
      fetchImpl: async (url, init) => {
        calls.push(String(url));
        check(init.signal instanceof AbortSignal && !init.signal.aborted, "real Google transport receives a live acquisition AbortSignal");
        if (String(url).includes("?fields=photos")) {
          return { ok: true, status: 200, json: async () => {
            clock += slowDetails ? 25001 : 6000;
            return { photos: [{ name: `places/${deadlineId}/photos/exactPhoto`, authorAttributions: [{ displayName: "Deadline photographer", uri: CREDIT.uri }] }] };
          } };
        }
        return Response.json({ photoUri: "https://lh3.googleusercontent.com/deadline-fixture" });
      },
    });
    check(timeouts[0] === 25000, "claim time consumes the same 30-second acquisition budget");
    if (slowDetails) {
      check(calls.length === 1 && calls[0].includes("?fields=photos") && timeouts.length === 1, "Details body finishing after deadline cannot start media or its retry");
      check(result.type === "miss" && stored === 0 && released === 1, "expired real acquisition saves nothing and releases its lease");
    } else {
      check(calls.length === 2 && calls[1].includes("/media?") && timeouts[1] === 19000, "healthy media receives the remaining shared budget rather than a fresh deadline");
      check(result.reason === "google" && stored === 1 && released === 0 && result.credit.name === "Deadline photographer", "healthy real acquisition stores its matching live attribution");
    }
  } finally {
    Date.now = originalNow;
    AbortSignal.timeout = originalTimeout;
  }
}

// Source the real public route; retained answers must keep source and credit,
// and a free shared read must never be reported as a new Google purchase.
const src = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
let paidLogs = 0;
globalThis.__sharedPhotoRoute = {
  resolvePlacePhoto: async input => { check(input.retainGoogle === true && input.storedSurface === true, "public route enables retained credited results"); return { type: "redirect", reason: "google-stored", location: saved.src, credit: CREDIT }; },
  recordPhotoPurchase: async () => { paidLogs++; },
};
const prelude = `const {resolvePlacePhoto,recordPhotoPurchase}=globalThis.__sharedPhotoRoute;
const NextResponse={json:(body,init={})=>new Response(JSON.stringify(body),init),redirect:(url,init={})=>new Response(null,{...init,headers:{...init.headers,location:String(url)}})};
const gateShut=()=>true, isAutomatedPhotoReader=()=>true, creditedRequest=()=>false, placeIdFromRef=()=>'', findFreePhoto=async()=>null;
const PHOTO_REF_RX=/^places\\//, FALLBACK_PATH='/wf-photo-fallback.svg';
const recordPhotoOutcome=async()=>{},recordPhotoDeniedCeiling=async()=>{},recordReaderPhotoMiss=async()=>{};`;
try {
  const { GET } = await import("data:text/javascript," + encodeURIComponent(prelude + src.replace(/^import[^;]+;\n/gm, "")));
  const r = await GET(new Request(`https://www.gowayfind.com/api/photo?place=${ID}&s=card&fmt=json&nospend=1`));
  const j = await r.json();
  check(j.source === "google" && j.src === saved.src && j.credit.authors[0].name === CREDIT.name, "actual route retains Google source and same saved attribution");
  check(r.headers.get("cache-control") === "private, no-store" && paidLogs === 0, "metadata remains revocable and reuse is not counted as a purchase");
} finally { delete globalThis.__sharedPhotoRoute; }
console.log(`test-shared-google-photo-serving: OK (${checks} assertions)`);
