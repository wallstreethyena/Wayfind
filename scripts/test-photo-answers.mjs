// Behavior test for lib/photoAnswers.js — the single per-page answer for a place's photo.
// Executes the real module with scripted fetches (no network, no spend).
import assert from "node:assert/strict";
import { forgetPlacePhoto, getPlacePhoto, resetPhotoAnswers, photoAnswerStats, normalizePhotoAnswer, mapsLinkForPlace, MAX_ATTEMPTS, RETRY_DELAY_MS } from "../lib/photoAnswers.js";
import { cardPhotoRequest, fetchCardPhoto, railPhotoSrc } from "../lib/cardPhotoRequest.js";
import { fetchLivePhoto } from "../lib/livePhoto.js";

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

const A = "ChIJAAAAAAAAAAAAAAAAAAAA", B = "ChIJBBBBBBBBBBBBBBBBBBBB";
const jsonRes = (body, headers = {}, status = 200) => ({ ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });
const google = (id, extra = {}) => ({ src: "https://lh3.example/" + id + ".jpg", source: "google", credit: { name: "Author " + id, uri: "https://maps.example/c/" + id, mapsUri: "https://maps.google.com/?cid=" + id, authors: [{ name: "Author " + id, uri: "https://maps.example/c/" + id }], ...extra } });
const scripted = (fn) => { const calls = []; const f = async (url, init) => { calls.push(url); return fn(url, calls.length, init); }; f.calls = calls; return f; };

// 1. Pairing: each place gets ITS OWN src and credit; answers never cross.
resetPhotoAnswers();
const byPlace = scripted((url) => jsonRes(google(new URL(url, "https://x").searchParams.get("place"))));
const pa = await getPlacePhoto(A, { surface: "card", fetchImpl: byPlace }), pb = await getPlacePhoto(B, { surface: "card", fetchImpl: byPlace });
ok(pa.src.includes(A) && pa.credit.name.endsWith(A) && pa.placeId === A, "A's photo carries A's credit");
ok(pb.src.includes(B) && pb.credit.name.endsWith(B) && pb.placeId === B, "B's photo carries B's credit");
ok(pa.credit.mapsUri.endsWith(A) && pb.credit.mapsUri.endsWith(B), "source links stay with their photo");

// 2. Reuse: card, viewer, detail and a remount all share ONE purchase.
resetPhotoAnswers();
const once = scripted(() => jsonRes(google(A)));
const c1 = await fetchCardPhoto(cardPhotoRequest("/api/photo?place=" + A), once);
const c2 = await fetchCardPhoto(cardPhotoRequest("/api/photo?place=" + A), once);   // remount
const d1 = await fetchLivePhoto(A, once);                                          // detail page opened
const p50 = await Promise.all(Array.from({ length: 50 }, () => getPlacePhoto(A, { surface: "detail", fetchImpl: once })));
eq(once.calls.length, 1, "card + remount + detail + 50 concurrent = exactly 1 request");
ok(c1 === c2 && c2 === d1 && p50.every((x) => x === c1), "every surface gets the identical {src, credit} object");
ok(new URL(once.calls[0], "https://x").searchParams.get("s") === "card", "first asker's surface is used");

// 3. Concurrent first asks across surfaces dedupe in flight.
resetPhotoAnswers();
let release; const gate = new Promise((r) => { release = r; });
const slow = scripted(async () => { await gate; return jsonRes(google(A)); });
const both = Promise.all([getPlacePhoto(A, { surface: "card", fetchImpl: slow }), getPlacePhoto(A, { surface: "detail", fetchImpl: slow })]);
release(); await both;
eq(slow.calls.length, 1, "simultaneous card + detail ask once");

// 4. Missing attribution. A valid Google photo with no author names is KEPT and
//    always carries a Google Maps link (API's, else the place-id link for THIS place).
resetPhotoAnswers();
const noAuthors = scripted(() => jsonRes({ src: "https://lh3.example/x.jpg", source: "google", credit: { mapsUri: "https://maps.google.com/?cid=1" } }));
const k1 = await getPlacePhoto(A, { fetchImpl: noAuthors });
ok(k1 && eq(k1.credit.authors, [], "no authors -> empty list") === undefined, "photo without author names is not hidden");
resetPhotoAnswers();
const noMaps = scripted(() => jsonRes({ src: "https://lh3.example/x.jpg", source: "google", credit: {} }));
const k2 = await getPlacePhoto(A, { fetchImpl: noMaps });
ok(k2 && k2.credit.mapsUri === mapsLinkForPlace(A) && k2.credit.mapsUri.includes(A) && k2.credit.mapsUri.startsWith("https://www.google.com/maps/"), "missing mapsUri falls back to this place's Google Maps link");
ok(!normalizePhotoAnswer("short", { src: "https://x/y.jpg", source: "google", credit: {} }).photo, "no usable place id and no mapsUri -> not shown");
ok(!normalizePhotoAnswer(A, { src: "http://insecure/x.jpg", source: "google", credit: {} }).photo, "non-https src rejected");
ok(!normalizePhotoAnswer(A, { src: "//evil.example/x.jpg", source: "wayfind" }).photo, "protocol-relative src rejected");
eq(normalizePhotoAnswer(A, { src: "/images/own.jpg", source: "wayfind", credit: null }).photo.src, "/images/own.jpg", "owned photo passes with no Google label");
ok(normalizePhotoAnswer(A, { src: "https://lh3.example/x.jpg", source: "google", credit: { mapsUri: "javascript:alert(1)" } }).photo.credit.mapsUri.startsWith("https://www.google.com/maps/"), "non-https mapsUri never used");

// 4b. forgetPlacePhoto drops ONLY that place's kept answer (both keys), so an
//     image-load recovery re-asks the server; other places stay kept.
resetPhotoAnswers();
const fg = scripted((url) => jsonRes(google(new URL(url, "https://x").searchParams.get("place"))));
await getPlacePhoto(A, { surface: "card", fetchImpl: fg }); await getPlacePhoto(A, { surface: "card", nospend: true, fetchImpl: fg }); await getPlacePhoto(B, { surface: "card", fetchImpl: fg });
eq(fg.calls.length, 3, "three distinct keys asked once each");
forgetPlacePhoto(A); forgetPlacePhoto("not-a-place-id");
await getPlacePhoto(A, { surface: "card", nospend: true, fetchImpl: fg }); await getPlacePhoto(B, { surface: "card", fetchImpl: fg });
eq(fg.calls.length, 4, "forgotten place is asked again; the other place is still reused");
await getPlacePhoto(A, { surface: "card", fetchImpl: fg });
eq(fg.calls.length, 4, "the spend-capable answer is KEPT: an image error can never cause a second purchase");
ok(/nospend=1/.test(fg.calls[3]), "the recovery re-ask carries nospend=1");

// 5. Temporary failure recovery: one delayed retry, then success is kept.
resetPhotoAnswers();
let t = 1000; const now = () => t;
const flaky = scripted((u, i) => i === 1 ? jsonRes({ src: null, source: "none", credit: null }, { "x-wayfind-photo-result": "spend-denied" }) : jsonRes(google(A)));
eq(await getPlacePhoto(A, { fetchImpl: flaky, now }), null, "budget refusal is not a photo");
eq(await getPlacePhoto(A, { fetchImpl: flaky, now }), null, "asking again inside the delay makes NO request");
eq(flaky.calls.length, 1, "no request before RETRY_DELAY_MS");
t += RETRY_DELAY_MS + 1;
const rec = await getPlacePhoto(A, { fetchImpl: flaky, now });
ok(rec && rec.src.includes(A), "recovers after the delay");
eq(flaky.calls.length, 2, "recovery cost exactly one more request");
await getPlacePhoto(A, { fetchImpl: flaky, now }); eq(flaky.calls.length, 2, "recovered photo is reused");

// 6. Exhausted retries: bounded, then final. 5xx / throw / 429 / bad JSON are all transient.
for (const [label, mk] of [["5xx", () => jsonRes({}, {}, 503)], ["429", () => jsonRes({}, {}, 429)], ["throw", () => { throw new Error("offline"); }], ["badjson", () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error("bad"); } })], ["quota-open", () => jsonRes({ src: null, source: "none" }, { "x-wayfind-photo-result": "quota-open" })]]) {
  resetPhotoAnswers(); t = 5000;
  const dead = scripted(mk);
  for (let i = 0; i < 40; i++) { await getPlacePhoto(A, { fetchImpl: dead, now }); t += RETRY_DELAY_MS + 1; }
  eq(dead.calls.length, MAX_ATTEMPTS, label + ": 40 asks over 13 minutes = exactly " + MAX_ATTEMPTS + " requests, no loop");
  eq(photoAnswerStats().final, 1, label + ": exhausted state is final");
}

// 7. A definitive "no photo" never retries; unrelated places are unaffected.
resetPhotoAnswers(); t = 1;
const none = scripted(() => jsonRes({ src: null, source: "none", credit: null }, { "x-wayfind-photo-result": "no-photo" }));
for (let i = 0; i < 5; i++) { await getPlacePhoto(A, { fetchImpl: none, now }); t += RETRY_DELAY_MS + 1; }
eq(none.calls.length, 1, "genuine no-photo is asked once");
const other = scripted(() => jsonRes(google(B)));
ok((await getPlacePhoto(B, { fetchImpl: other, now })).placeId === B, "one place's miss never blocks another place");
const four = scripted(() => jsonRes({}, {}, 404)); resetPhotoAnswers();
await getPlacePhoto(A, { fetchImpl: four, now }); t += 999999; await getPlacePhoto(A, { fetchImpl: four, now });
eq(four.calls.length, 1, "404 is definitive");

// 8. nospend answers never poison the real answer.
resetPhotoAnswers();
const ns = scripted((u) => /nospend=1/.test(u) ? jsonRes({ src: null, source: "none" }, { "x-wayfind-photo-result": "no-photo" }) : jsonRes(google(A)));
await getPlacePhoto(A, { nospend: true, fetchImpl: ns });
ok((await getPlacePhoto(A, { fetchImpl: ns })).src.includes(A), "nospend miss does not hide the credited photo");

// 9. Invalid ids make no request; rail sources are always THIS place's own.
resetPhotoAnswers();
const never = scripted(() => { throw new Error("must not be called"); });
eq(await getPlacePhoto("bad", { fetchImpl: never }), null); eq(await fetchLivePhoto("short", never), null); eq(never.calls.length, 0, "bad ids never reach the network");
eq(railPhotoSrc({ id: A, photo: "/images/own.jpg" }), "/images/own.jpg", "owned photo first");
eq(railPhotoSrc({ id: A }), "/api/photo?place=" + A, "no stored photo -> its own place id");
eq(railPhotoSrc({ id: "evt-123" }), null, "non-place ids get no Google lane");
eq(railPhotoSrc(null), null);
eq(cardPhotoRequest(railPhotoSrc({ id: A })), "/api/photo?place=" + A + "&s=card&fmt=json&w=1200", "rail source becomes the credited card request for the same place");

// Temporary source/config/storage misses must not become permanent blank cards.
for (const reason of ["owned-miss", "unconfigured"]) {
  resetPhotoAnswers();
  const recover = scripted((u, i) => i === 1 ? jsonRes({ src: null, source: "none" }, { "x-wayfind-photo-result": reason }) : jsonRes(google(A)));
  eq(await getPlacePhoto(A, { fetchImpl: recover, now }), null, reason + " starts as a miss");
  t += RETRY_DELAY_MS + 1;
  ok((await getPlacePhoto(A, { fetchImpl: recover, now }))?.source === "google", reason + " can recover");
  eq(recover.calls.length, 2, reason + " gets one bounded retry");
}
resetPhotoAnswers();
const pending = scripted((u, i) => i === 1 ? jsonRes({ src: null, source: "none" }, { "x-wayfind-photo-result": "storage-pending" }) : jsonRes(google(A)));
ok((await getPlacePhoto(A, { fetchImpl: pending, now }))?.source === "google", "mounted card receives another visitor's completed save automatically");
eq(pending.calls.length, 2, "pending save gets exactly one immediate bounded follow-up");
resetPhotoAnswers();
const removed = scripted(() => jsonRes({ src: null, source: "none" }, { "x-wayfind-photo-result": "photo-removed" }));
await getPlacePhoto(A, { fetchImpl: removed, now }); t += RETRY_DELAY_MS + 1;
await getPlacePhoto(A, { fetchImpl: removed, now });
eq(removed.calls.length, 1, "owner removal is definitive for the client");
console.log("test-photo-answers: OK — " + n + " assertions; pairing, reuse, source/storage recovery, bounded retries and removal");
