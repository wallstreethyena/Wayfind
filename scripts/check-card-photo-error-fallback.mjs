#!/usr/bin/env node
// STRUCTURAL-ONLY: pure regex over source (RailCard.js, IconicPlaceCard.js,
// ThingsToDoList.js), same technique as check-drop-photo-window.mjs and
// check-place-card-navigation.mjs. The actual runtime behavior this guard
// exists to lock — a failed <img> load swapping to the monogram in a real
// browser — was proven by direct production reproduction against
// gowayfind.com (mobile Chromium, 390x844; see below), not re-derived here
// via jsdom/render: React's onError only fires on a real image-decode
// failure, which a render harness with no network cannot produce honestly.
/**
 * scripts/check-card-photo-error-fallback.mjs — a photo `<img>` that FAILS TO
 * LOAD must fall back to the card's monogram, exactly like a photo that was
 * never there. No card may keep a broken, full-size, empty media box.
 *
 * THE BUG (owner report, 2026-09-07, mobile screenshots): Shake Station,
 * Chick-fil-A and Pomegranate Frozen Yogurt rendered with "the entire image
 * area" as a blank panel. All three carry a valid, current-generation
 * `photo_ref` in wf_inventory, and curling their `/api/photo?ref=` directly
 * returned 302 -> 200 image/jpeg with real bytes. The data was fine and the
 * endpoint worked on demand — so the hole was in the RENDER PATH, not the
 * record.
 *
 * LIVE EVIDENCE THIS IS A REAL, CURRENT FAILURE MODE, not a hunt for missing
 * data: reproducing against production on 2026-09-07 (mobile viewport,
 * Sarasota), the SAME place id (ChIJJZq0DJ1Bw4gRcuZ5y_XuNxM) served one photo
 * ref 302 -> ok and a DIFFERENT, equally well-formed photo ref for that same
 * place 404 ("owned-miss" — lib/placePhotoServe.js's resolvePlacePhoto
 * returns `{type:"miss"}` whenever the owned ref's upstream fetch fails, and
 * app/api/photo/route.js turns a miss into a 404). Google's upstream also
 * 429'd this session's own /api/places/search calls live — the rate limit
 * that can produce an owned-miss is not hypothetical, it fired during this
 * very investigation.
 *
 * THE ROOT CAUSE: the `photo ? <img> : <monogram>` gate every place-card
 * renderer uses is evaluated ONCE, at render time, from whether a `photo`
 * STRING exists. It is never re-evaluated when the browser actually tries to
 * fetch that string and the request errors:
 *
 *   - IconicPlaceCard.js's <img> carried NO onError handler at all. A 404 or
 *     network failure left it mounted and broken.
 *   - RailCard.js DID have an onError, but for every place card (photoFallback
 *     is wired only in app/components/screens/Events.js and ViatorRail.js,
 *     never for a place row) its only move on failure was
 *     `style.visibility = "hidden"` — the <img> disappears, the box does not.
 *   - app/components/ThingsToDoList.js's Viator tour-row <img> had the same
 *     gap as IconicPlaceCard: no onError at all.
 *
 * In every case `.wf-place-card-media` is sized by CSS
 * (`height:100%!important;min-height:176px!important`, WF_LAYOUT_CSS /
 * css.js), independent of the image's own intrinsic size or load state — so
 * a failed image leaves a fully-sized, perfectly empty panel. `alt=""` means
 * no browser broken-image glyph fills it either. That IS the reported
 * symptom, and it can happen to ANY place whose /api/photo request has a bad
 * moment, never only to a "bad record" — which is exactly why the owner said
 * not to patch the three named places.
 *
 * app/home.js's OWN canonical PlaceCard already solved this once, via
 * `FallbackImg` (tracks a `bad` state, swaps to `<BrandedImageFallback>` on
 * error) — the fix below gives RailCard.js, IconicPlaceCard.js and
 * ThingsToDoList.js's tour branch the same guarantee using the fallback each
 * of them ALREADY draws for "no photo at all" (`.wf-place-card-monogram`),
 * rather than inventing a second fallback visual.
 *
 * These three components are every runtime renderer of `.wf-place-card-media`
 * in the app (grep across app/ and lib/ for the class turns up exactly
 * app/home.js, ThingsToDoList.js, RailCard.js, IconicPlaceCard.js and
 * css.js/the stylesheet) — so this closes the failure class across every
 * card surface it can reach: Food and Activities and Family and Stays browse
 * lists (IconicPlaceCard, via DaypartRail / ThingsToDoList), every homepage
 * rail including Night Out (RailCard, via NightOutRails.js and friends), and
 * the Viator tour rows mixed into the Activities list (ThingsToDoList).
 *
 * WHAT THIS ASSERTS: each of the three files (a) keeps its error state KEYED
 * TO THE SRC STRING (`useState("")`, compared with `!==`) rather than a bare
 * boolean, so a different card reusing a memoized instance never inherits a
 * stale failure and a fresh photo replacing a stale one gets its own attempt;
 * (b) wires a real `onError` that reaches that state setter; (c) the img-vs-
 * monogram gate actually reads the error state, not only the presence of the
 * src; and (d) RailCard.js's old hide-without-replacing behavior
 * (`style.visibility = "hidden"`) is gone, not just supplemented.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");

let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

const RAIL = read("app/components/RailCard.js");
const ICONIC = read("app/components/IconicPlaceCard.js");
const TTD = read("app/components/ThingsToDoList.js");
const SERVE = read("lib/placePhotoServe.js");
const ROUTE = read("app/api/photo/route.js");

/* ── 0. THE TRIGGER CONDITION IS STILL REAL ────────────────────────────────
   Documents (and pins) why a runtime image failure is not a hypothetical:
   /api/photo genuinely 404s a well-formed, catalogued ref when the upstream
   fetch fails. If this path were ever changed to guarantee success, the
   fix below would still be correct (defence in depth) but the urgency claim
   above would need re-measuring — so it is pinned, not assumed. */
{
  ok(/type: "miss", location: null/.test(SERVE),
    "PROBE: resolvePlacePhoto still has an owned-miss branch (owned ref, upstream fetch failed) — the condition this guard exists for");
  ok(/result\.type === "empty"/.test(ROUTE) && /return NextResponse\.json\(\s*\{ error: "no photo" \}/.test(ROUTE),
    "…and app/api/photo/route.js still turns an unresolved owned ref into a real 404, not a branded-SVG redirect — so a client-side fallback is the only thing that can catch this case");
}

/* ── 1. RailCard.js ─────────────────────────────────────────────────────── */
{
  ok(/const \[imgFailed, setImgFailed\] = useState\(""\);/.test(RAIL),
    "RailCard tracks image failure keyed to the src string (useState(\"\")), not a bare boolean");
  ok(/photo && imgFailed !== photo/.test(RAIL),
    "RailCard's img-vs-monogram gate reads the error state, not only whether `photo` is truthy");
  ok(/setImgFailed\(photo\)/.test(RAIL),
    "RailCard's onError reaches the state setter on a failure with no (or an exhausted) fallback");
  ok(!/style\.visibility\s*=\s*"hidden"/.test(RAIL),
    "the old hide-without-replacing failure path is GONE — a hidden <img> inside a CSS-forced-size box is the same blank panel as no fallback at all");
}

/* ── 2. IconicPlaceCard.js ──────────────────────────────────────────────── */
{
  ok(/const \[imgFailed, setImgFailed\] = useState\(""\);/.test(ICONIC),
    "IconicPlaceCard tracks image failure keyed to the src string");
  ok(/photoUrl\(place\) && imgFailed !== photoUrl\(place\)/.test(ICONIC),
    "IconicPlaceCard's img-vs-monogram gate reads the error state");
  // Scoped to the media block specifically (check-drop-photo-window.mjs's own
  // technique) — this 700+ line file has other onError-shaped code, and a
  // guard answering a question it was not asking would pass on a reverted
  // media block as long as SOME onError existed anywhere in the file.
  const mi = ICONIC.indexOf('<div className="wf-place-card-media">');
  ok(mi > -1, "PROBE: the media block exists");
  // 2200 chars, not 900: the pre-existing v8.70 lazy-loading comment (the
  // .wf8-pcrail "lazy never fires" story) sits between the div and the
  // <img>, and is ~1450 chars on its own — measured, not guessed, so this
  // doesn't silently drift back to a too-narrow window later.
  const mediaBlock = ICONIC.slice(mi, mi + 2200);
  ok(/onError=\{\(\) => setImgFailed\(photoUrl\(place\)\)\}/.test(mediaBlock),
    "…and the <img> INSIDE that block (not merely somewhere in the file) wires onError to the failure state");
}

/* ── 3. ThingsToDoList.js's Viator tour-row branch ──────────────────────── */
{
  ok(/const \[imgFailed, setImgFailed\] = useState\(""\);/.test(TTD),
    "ThingsToDoList's tour card tracks image failure keyed to the src string");
  ok(/r\.image_url && imgFailed !== r\.image_url/.test(TTD),
    "the tour card's img-vs-monogram gate reads the error state");
  ok(/onError=\{\(\) => setImgFailed\(r\.image_url\)\}/.test(TTD),
    "…and the tour <img> wires onError to it");
}

/* ── 4. EVERY <img> INSIDE .wf-place-card-media STILL FALLS TO THE SAME
        MONOGRAM ON EITHER FAILURE MODE (missing OR broken) ─────────────── */
for (const [name, src] of [["RailCard.js", RAIL], ["IconicPlaceCard.js", ICONIC], ["ThingsToDoList.js", TTD]]) {
  ok(/wf-place-card-monogram/.test(src),
    `${name}: the monogram — an existing designed empty-state — is still what a failed OR missing photo falls to, never a second new fallback visual`);
}

/* ── 5. RED PROOFS — the assertions above can actually fail ──────────────── */
const RED = [
  ["a bare-boolean failure flag is detectable", () =>
    !/const \[imgFailed, setImgFailed\] = useState\(""\);/.test('const [imgFailed, setImgFailed] = useState(false);')],
  ["a gate that ignores the error state is detectable", () =>
    !/photo && imgFailed !== photo/.test('{photo\n  ? <img src={photo} onError={() => setImgFailed(true)} />\n  : <div className="wf-place-card-monogram" />}')],
  ["the pre-fix RailCard onError (hide, never replace) is detectable as the regression it is", () => {
    const fake = 'onError={(ev) => {\n  const fb = ev.currentTarget.dataset.fallback;\n  if (fb) { ev.currentTarget.dataset.fallback = ""; ev.currentTarget.src = fb; }\n  else { ev.currentTarget.style.visibility = "hidden"; }\n}}';
    return /style\.visibility\s*=\s*"hidden"/.test(fake) && !/setImgFailed\(photo\)/.test(fake);
  }],
  ["a pre-fix IconicPlaceCard <img> with no onError at all is detectable", () => {
    const fake = '<img\n  src={photoUrl(place)}\n  alt=""\n  loading={eagerMedia ? "eager" : "lazy"}\n  decoding="async"\n  style={{ objectFit: "cover" }}\n/>';
    return !/onError=\{\(\) => setImgFailed\(photoUrl\(place\)\)\}/.test(fake);
  }],
  ["an onError present ELSEWHERE in the file must not satisfy the media-block-scoped IconicPlaceCard check", () => {
    const fakeFile = 'function unrelated() { return <button onError={() => setImgFailed(photoUrl(place))} />; }\n'
      + '<div className="wf-place-card-media">\n  <img src={photoUrl(place)} alt="" />\n</div>';
    const mi = fakeFile.indexOf('<div className="wf-place-card-media">');
    const block = fakeFile.slice(mi, mi + 900);
    return !/onError=\{\(\) => setImgFailed\(photoUrl\(place\)\)\}/.test(block);
  }],
  ["a pre-fix ThingsToDoList tour <img> with no onError is detectable", () => {
    const fake = '{r.image_url\n  ? <img src={r.image_url} alt="" loading="lazy" style={{ objectFit: "cover" }} />\n  : <div className="wf-place-card-monogram" aria-hidden="true">WF</div>}';
    return !/onError=\{\(\) => setImgFailed\(r\.image_url\)\}/.test(fake);
  }],
  ["a route that redirects an owned-miss to a branded SVG instead of 404ing would flip assertion 0", () => {
    const fakeRoute = 'return NextResponse.redirect(new URL("/wf-photo-fallback.svg", req.url));';
    return !(/result\.type === "empty"/.test(fakeRoute) && /error: "no photo"/.test(fakeRoute));
  }],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-card-photo-error-fallback: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-card-photo-error-fallback: OK — ${pass} assertions; RailCard, IconicPlaceCard and ThingsToDoList's tour card all fall to the monogram when a resolved photo src FAILS to load, not only when one was never assigned`);
