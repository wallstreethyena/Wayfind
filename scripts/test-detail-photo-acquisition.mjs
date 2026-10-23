// Execute Detail's shipped acquisition effect, derived gallery/credit and hero
// JSX together. A CardPhoto-only fixture never reaches this acquisition gate.
// All requests and time are deterministic; no network or paid provider calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { acquireDetailPhoto, fetchLivePhoto, isLivePlaceId, detailGalleryPhotos, liveCreditFor } from "../lib/livePhoto.js";
import { getPlacePhoto, resetPhotoAnswers, RETRY_DELAY_MS, MAX_ATTEMPTS } from "../lib/photoAnswers.js";
import { hasRealPlacePhoto, detailHeroLayout } from "../lib/detailHero.js";
import { PLACE_DETAIL_PHOTO_STANDARD } from "../lib/placeDetailPhotoStandard.js";

const source = readFileSync(process.argv[2] || new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
const ast = ts.createSourceFile("Detail.jsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let hero, credit;
function locate(node) {
  if (ts.isJsxElement(node)) {
    const attrs = node.openingElement.attributes.properties;
    if (attrs.some(p => p.name?.text === "data-detail-hero")) hero = node;
    if (attrs.some(p => p.name?.text === "data-detail-photo-credit")) credit = node;
  }
  ts.forEachChild(node, locate);
}
locate(ast);
assert.ok(hero && credit, "locates actual Detail hero and credit markup");
const start = source.indexOf("  const liveId = detail && !detail._event");
const end = source.indexOf("\n\n  return (", start);
assert.ok(start > 0 && end > start, "locates shipped Detail acquisition lifecycle");
const renderSource = `function render() { ${source.slice(start, end)}; return <>${hero.getText(ast)}${credit.getText(ast)}</>; }`;
const compiled = ts.transpileModule(renderSource, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
const walk = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...node.children.flatMap(walk)];
const A = "ChIJAAAAAAAAAAAAAAAAAAAA", B = "ChIJBBBBBBBBBBBBBBBBBBBB";
const place = id => ({ id, name: "Fixture " + id, photo: "/api/photo?place=" + id });
const response = (body, reason = "", status = 200) => ({ ok: status < 400, status, headers: { get: key => key === "x-wayfind-photo-result" ? reason : null }, json: async () => body });
const photo = (id, version = "v2", author = "Recovered author") => ({ src: `/api/photo/stored/${id}?v=${version}`, source: "google", credit: { name: author, mapsUri: "https://maps.google.com/?cid=" + id, authors: [{ name: author }] } });
const originals = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now, sessionStorage: globalThis.sessionStorage };
let clock, timers, timerId, calls, answer, storage;
function reset(script) {
  resetPhotoAnswers(); clock = 1000; timers = new Map(); timerId = 0; calls = []; answer = script; storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return answer(url, calls.length); };
  globalThis.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, at: clock + delay }); return timerId; };
  globalThis.clearTimeout = id => timers.delete(id);
  Date.now = () => clock;
}
function host(initial) {
  let detail = initial, hooks = [], cursor = 0, pending = [], dirty = false, tree;
  const useEffect = (fn, deps) => { const i = cursor++, old = hooks[i]; if (!old || deps.some((x,j) => !Object.is(x, old.deps[j]))) pending.push(() => { old?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; }); };
  const useRef = value => { const i = cursor++; return hooks[i] ||= { current: value }; };
  const ctx = { React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: "fragment" },
    useEffect, useRef, acquireDetailPhoto, fetchLivePhoto, isLivePlaceId, detailGalleryPhotos, liveCreditFor, hasRealPlacePhoto, detailHeroLayout, PLACE_DETAIL_PHOTO_STANDARD,
    setDetail(update) { detail = update(detail); dirty = true; }, C: {}, FallbackImg: "fixture-image", PhotoCredit: "fixture-credit",
    galleryIdx: 0, galleryRef: null, onGalleryScroll() {}, scrollGallery() {}, galleryBtn: () => ({}), setLightbox() {}, primaryCategory: () => "Food" };
  const run = new Function(...Object.keys(ctx), "detail", compiled + ";return render();");
  function render() { let count = 0; do { assert.ok(++count < 15, "Detail lifecycle settles"); dirty = false; cursor = 0; pending = []; tree = run(...Object.values(ctx), detail); for (const effect of pending) effect(); } while (dirty); }
  render();
  return { render, detail: () => detail, nodes: () => walk(tree), update(next) { detail = next; render(); }, unmount() { hooks.forEach(h => h?.cleanup?.()); } };
}
async function settle(h) { for (let i = 0; i < 12; i++) await Promise.resolve(); h.render(); }
async function advance(h, ms = RETRY_DELAY_MS + 1) {
  const target = clock + ms;
  while (true) {
    const next = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a,b) => a[1].at - b[1].at)[0];
    if (!next) break;
    clock = next[1].at; timers.delete(next[0]); next[1].fn(); await settle(h);
  }
  clock = target; await settle(h);
}
function samePlaceAndFreeRecovery(id, expected) {
  assert.equal(calls.length, expected, "exact request count");
  calls.forEach(({ url, init }, index) => {
    const params = new URL(url, "https://fixture.test").searchParams;
    assert.equal(params.get("place"), id, "every request keeps exact place identity");
    assert.equal(params.get("nospend"), index ? "1" : null, "only first request may spend");
    assert.equal(init.headers["x-wayfind-photo-surface"], "detail");
  });
}
function media(h) { return h.nodes().find(n => "data-detail-photo-media" in n.props); }
try {
  // Both HTTP errors and a budget/quota-shaped null are transient acquisition
  // misses, so the real Detail must eventually mount its image and matching credit.
  for (const first of [() => response({}, "", 503), () => response({ src: null, source: "none" }, "spend-denied")]) {
    reset((url, n) => n === 1 ? first() : response(photo(A)));
    const h = host(place(A)); await settle(h);
    assert.equal(h.detail()._liveDone, undefined, "transient miss leaves acquisition pending");
    assert.equal(h.nodes().filter(n => n.type === "fixture-image").length, 0, "no image can emit onError yet");
    assert.ok(media(h), "full-width pending frame exists before answer");
    const pendingFrame = media(h).props.style;
    assert.ok(h.nodes().some(n => "data-detail-photo-pending" in n.props), "pending state reserves media without a fake venue image");
    await advance(h, RETRY_DELAY_MS - 1); assert.equal(calls.length, 1, "no recovery before shared delay");
    await advance(h, 2);
    samePlaceAndFreeRecovery(A, 2);
    assert.equal(h.detail()._liveDone, true);
    assert.equal(h.detail()._live.placeId, A);
    const image = h.nodes().find(n => n.type === "fixture-image");
    const attribution = h.nodes().find(n => n.type === "fixture-credit");
    assert.equal(image.props.src, photo(A).src, "recovered exact stored version enters actual hero");
    assert.equal(attribution.props.credit.name, "Recovered author", "hero credit comes from same recovered answer");
    assert.equal(attribution.props.credit.source, "google");
    assert.equal(image.props.fit, "cover", "late photo fills the same default frame");
    assert.equal(media(h).props.style.width, "100%", "late success uses full sheet width");
    assert.equal(media(h).props.style.aspectRatio, "16 / 9", "late success uses shared landscape aspect");
    assert.equal(media(h).props.style.minHeight, 220);
    assert.equal(media(h).props.style.maxHeight, 420);
    assert.deepEqual(media(h).props.style, pendingFrame, "pending and late-success frame geometry is identical");
    assert.ok(!h.nodes().some(n => "data-detail-photo-preview" in n.props), "late photo never falls back to a square preview");
    await advance(h, RETRY_DELAY_MS * 20); assert.equal(calls.length, 2, "success clears all retry work");
    h.unmount(); assert.equal(timers.size, 0);
  }
  for (const reason of ["no-photo", "photo-removed", "negative-cached"]) {
    reset(() => response({ src: null, source: "none" }, reason));
    const h = host(place(A)); await settle(h); await advance(h, RETRY_DELAY_MS * 20);
    samePlaceAndFreeRecovery(A, 1);
    assert.equal(h.detail()._liveDone, true, reason + " is terminal");
    assert.equal(h.nodes().filter(n => n.type === "fixture-image").length, 0);
    assert.equal(media(h), undefined, "genuine no-photo removes the reserved media frame");
    assert.ok(h.nodes().some(n => n.children.includes("Photo unavailable")));
    assert.equal(timers.size, 0); h.unmount();
  }
  for (const reason of ["no-photo", "photo-removed"]) {
    reset((url, n) => n === 1 ? response({}, "", 503) : response({ src: null, source: "none" }, reason));
    const h = host(place(A)); await settle(h); await advance(h, RETRY_DELAY_MS * 20);
    samePlaceAndFreeRecovery(A, 2);
    assert.equal(h.detail()._liveDone, true, "definitive free-lane answer ends recovery");
    assert.equal(h.detail()._live, undefined);
    assert.equal(media(h), undefined, "free-lane no-photo/removal collapses the pending frame");
    assert.equal(h.nodes().filter(n => n.type === "fixture-credit").length, 0);
    assert.equal(timers.size, 0); h.unmount();
  }
  reset(() => response({}, "", 503));
  const exhausted = host(place(A)); await settle(exhausted); await advance(exhausted, RETRY_DELAY_MS * 50);
  samePlaceAndFreeRecovery(A, 1 + MAX_ATTEMPTS);
  assert.equal(exhausted.detail()._liveDone, true, "exhausted transient retries become unavailable");
  assert.equal(timers.size, 0); exhausted.unmount();

  reset((url, n) => n <= MAX_ATTEMPTS ? response({}, "", 503) : response(photo(A)));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await getPlacePhoto(A, { surface: "card" }); clock += RETRY_DELAY_MS;
  }
  assert.equal(calls.length, MAX_ATTEMPTS, "card exhausted the spend-capable lane first");
  const afterCard = host(place(A)); await settle(afterCard); await advance(afterCard);
  assert.equal(calls.length, MAX_ATTEMPTS + 1, "opening Detail adds exactly one successful free check");
  assert.equal(calls.filter(c => !new URL(c.url, "https://fixture.test").searchParams.has("nospend")).length, MAX_ATTEMPTS, "Detail never reopens the exhausted paid lane");
  assert.equal(new URL(calls.at(-1).url, "https://fixture.test").searchParams.get("nospend"), "1");
  assert.equal(afterCard.detail()._live.placeId, A, "Detail recovers after card exhausted transient failures");
  assert.equal(timers.size, 0); afterCard.unmount();

  reset(() => response({}, "", 503));
  for (const nospend of [false, true]) for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await getPlacePhoto(A, { surface: "card", nospend }); clock += RETRY_DELAY_MS;
  }
  const finalFreeLane = host(place(A)); await settle(finalFreeLane); await advance(finalFreeLane, RETRY_DELAY_MS * 50);
  assert.equal(calls.length, MAX_ATTEMPTS * 2, "Detail cannot reopen an exhausted shared free lane");
  assert.equal(finalFreeLane.detail()._liveDone, true);
  assert.equal(timers.size, 0); finalFreeLane.unmount();

  reset(() => response(photo(A, "healthy", "Initial author")));
  const healthy = host(place(A)); await settle(healthy); await advance(healthy, RETRY_DELAY_MS * 20);
  samePlaceAndFreeRecovery(A, 1); assert.equal(healthy.detail()._live.credit.name, "Initial author");
  assert.equal(timers.size, 0); healthy.unmount();

  reset(() => response(photo(A)));
  await getPlacePhoto(A, { surface: "card" });
  const cached = host(place(A)); await settle(cached);
  assert.equal(calls.length, 1, "Detail reuses preexisting card answer without another paid request");
  assert.equal(cached.detail()._live.placeId, A); cached.unmount();

  reset(() => response({}, "", 503));
  const closed = host(place(A)); await settle(closed); closed.unmount();
  assert.equal(timers.size, 0, "close cancels scheduled recovery");
  await advance(closed, RETRY_DELAY_MS * 20); assert.equal(calls.length, 1);

  reset((url, n) => n === 1 ? response({}, "", 503) : response(photo(A)));
  const firstConsumer = host(place(A)), secondConsumer = host(place(A));
  await settle(firstConsumer); await settle(secondConsumer); await advance(firstConsumer); await settle(secondConsumer);
  samePlaceAndFreeRecovery(A, 2);
  assert.equal(firstConsumer.detail()._live, secondConsumer.detail()._live, "simultaneous mounted consumers share one atomic answer");
  firstConsumer.unmount(); secondConsumer.unmount(); assert.equal(timers.size, 0);

  let resolveClosed;
  reset(() => new Promise(resolve => { resolveClosed = resolve; }));
  const pendingClose = host(place(A)); await settle(pendingClose); pendingClose.unmount();
  resolveClosed(response(photo(A))); await settle(pendingClose);
  assert.equal(pendingClose.detail()._live, undefined, "close discards a pending initial answer");
  assert.equal(pendingClose.detail()._liveDone, undefined);
  assert.equal(timers.size, 0);

  // Place switch after recovery begins: release A only after B has painted.
  let release;
  reset((url, n) => {
    const id = new URL(url, "https://fixture.test").searchParams.get("place");
    if (id === B) return response(photo(B, "other", "Other author"));
    return n === 1 ? response({}, "", 503) : new Promise(resolve => { release = resolve; });
  });
  const switched = host(place(A)); await settle(switched); await advance(switched);
  assert.equal(typeof release, "function", "recovery request is pending before switch");
  switched.update(place(B)); await settle(switched); release(response(photo(A))); await settle(switched);
  assert.equal(switched.detail().id, B);
  assert.equal(switched.detail()._live.placeId, B, "late A answer cannot replace B photo");
  assert.equal(switched.detail()._live.credit.name, "Other author", "late A cannot replace B credit");
  assert.equal(timers.size, 0); switched.unmount();

  // Same sheet identity but changed explicit place identity must also cancel.
  reset((url, n) => n === 1 ? new Promise(resolve => { release = resolve; }) : response(photo(B)));
  const alias = host({ ...place(A), id: "sheet-alias", placeId: A }); await settle(alias);
  alias.update({ ...place(B), id: "sheet-alias", placeId: B }); await settle(alias);
  release(response(photo(A))); await settle(alias);
  assert.equal(alias.detail()._live.placeId, B, "placeId dependency rejects stale alias response");
  assert.equal(calls.length, 2); alias.unmount();
  console.log("test-detail-photo-acquisition: OK — actual Detail effect + hero/credit: delayed free recovery, terminal misses/removal, bounded exhaustion, healthy reuse, cancellation and place switching");
} finally {
  globalThis.fetch = originals.fetch; globalThis.setTimeout = originals.setTimeout; globalThis.clearTimeout = originals.clearTimeout;
  globalThis.sessionStorage = originals.sessionStorage; Date.now = originals.now;
  resetPhotoAnswers();
}
