// scripts/test-lightbox-paging.mjs — v6.43 THE UNPAGEABLE PHOTO guardrail.
//
// THE LESSON (July 2026, owner-reported): "when you click on the picture and
// the picture gets bigger, you cannot scroll through the sides — you cannot
// flip pictures. The only way to change is to go back into the small picture
// and then slide and then pick a bigger one."
//
// Root cause: the full-screen viewer's state was a single URL (`lightbox`),
// set from whichever gallery slide was tapped. It had no notion of a LIST, so
// there was nothing to page through — the sheet gallery below it was the only
// thing that could move. The viewer now derives the same list the gallery
// renders (detail.photos) and moves within it by swipe, arrow key, or the
// on-screen arrows, keeping the small gallery in sync on close.
//
// Two traps this file exists to keep shut:
//   1. The viewer silently degrading back to a single-photo dead end.
//   2. The swipe decision reading `lbDrag` (React state) instead of the
//      gesture ref. touchmove and touchend can land in the same task on a fast
//      flick, so the state has not committed yet and the swipe does nothing —
//      the exact symptom the owner reported, reintroduced by a different route.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detailGalleryPhotos, liveCreditFor } from "../lib/livePhoto.js";

const root = new URL("../", import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

let pass = 0;
const fail = (m) => { console.error("test-lightbox-paging: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(p("app/home.js"), "utf8");
const detail = readFileSync(p("app/components/sheets/Detail.js"), "utf8");

// ─── 1. the viewer knows about a LIST, not one URL ───────────────────────────
// 2026-10-08: the list is detailGalleryPhotos(detail) (owned photos + the one live credited photo,
// lib/livePhoto.js) — the SAME function the sheet gallery maps over. detail.photos alone no longer
// holds the live photo (Google photo names/URLs are never stored on the detail).
ok(/const lightboxPhotos = detailGalleryPhotos\(detail\);/.test(home),
  "the viewer must derive its photo list from detailGalleryPhotos(detail) — the same list the sheet gallery renders.");
ok(/const lightboxIndex = lightbox \? lightboxPhotos\.indexOf\(lightbox\) : -1;/.test(home),
  "the viewer must track WHERE in that list it is; without an index there is nothing to page.");
ok(/function goLightbox\(dir\)[\s\S]{0,320}?\(lightboxIndex \+ dir \+ n\) % n/.test(home),
  "goLightbox must step by ±1 and WRAP — a dead-end arrow on a full-screen viewer reads as broken.");

// ─── 2. every affordance the owner reached for ───────────────────────────────
ok(/aria-label="Next photo"/.test(home) && /aria-label="Previous photo"/.test(home),
  "the viewer must render labelled ‹ / › paging buttons.");
ok(/goLightbox\(1\)/.test(home) && /goLightbox\(-1\)/.test(home),
  "both paging directions must be wired.");
ok(/e\.key === "ArrowRight"[\s\S]{0,160}?goLightbox\(1\)/.test(home),
  "ArrowRight/ArrowLeft must page — desktop users have no swipe.");
ok(/onTouchStart=\{lightboxTouchStart\}/.test(home) && /onTouchEnd=\{lightboxTouchEnd\}/.test(home),
  "the viewer must accept a swipe: touch paging is the gesture the owner tried first.");

// ─── 3. the swipe decision must come from the ref, not from React state ──────
const end = home.match(/function lightboxTouchEnd\(\)[\s\S]{0,700}?\n  \}/);
ok(!!end, "lightboxTouchEnd moved or changed shape — re-point this assertion before shipping.");
ok(/const dx = g \? \(g\.dx \|\| 0\) : 0;/.test(end[0]),
  "lightboxTouchEnd must read the gesture ref (g.dx), not the lbDrag state. A fast flick delivers "
  + "touchmove and touchend in one task, so lbDrag has not committed yet and the swipe is dropped.");
ok(!/const dx = lbDrag;/.test(end[0]),
  "lightboxTouchEnd must not read lbDrag — that is the VISUAL offset only (see the note above).");
ok(/g\.dx = dx;/.test(home),
  "lightboxTouchMove must record the travelled distance on the gesture ref synchronously.");

// ─── 4. a swipe's synthesised click must not close the viewer ────────────────
ok(/function closeLightbox\(\)[\s\S]{0,220}?lbSwipeAt\.current < 500/.test(home),
  "closeLightbox must ignore the click the browser synthesises right after a swipe, or every "
  + "successful page-turn immediately closes the viewer.");
ok(/lbSwipeAt\.current = Date\.now\(\)/.test(home),
  "the swipe must stamp lbSwipeAt for the guard above to have anything to compare against.");

// ─── 5. closing must not teleport the small gallery ──────────────────────────
ok(/lastLightboxIndex\.current/.test(home) && /galleryRef\.current/.test(home),
  "closing the viewer must scroll the sheet gallery to the photo the viewer was left on.");

// ─── 6. the two lists must stay the same list ────────────────────────────────
ok(/const galleryPhotos = detailGalleryPhotos\(detail\);/.test(detail) && /galleryPhotos\.map\(\(src, i\) =>/.test(detail) && /onClick=\{\(\) => setLightbox\(src\)\}/.test(detail),
  "the sheet gallery must still open the viewer on the tapped src from detailGalleryPhotos(detail) — if these two "
  + "ever read different arrays the n / total counter lies.");
{
  // Executed, not grepped: the shared list = owned (non-proxy) photos, then the live photo; never a /api/photo proxy URL.
  const d = { photos: ["https://cdn.wayfind.test/a.jpg", "/api/photo?ref=places%2Fx%2Fphotos%2Fwfplacediscovery", "https://cdn.wayfind.test/a.jpg"],
    _live: { src: "https://live.test/g.jpg", source: "google", credit: { name: "Ann" } } };
  const list = detailGalleryPhotos(d);
  ok(JSON.stringify(list) === JSON.stringify(["https://cdn.wayfind.test/a.jpg", "https://live.test/g.jpg"]),
    "detailGalleryPhotos must return owned photos (deduped, proxy URLs dropped) then the live photo; got " + JSON.stringify(list));
  ok(detailGalleryPhotos({ photos: [], photo: "/api/photo?x=1" }).length === 0 && detailGalleryPhotos(null).length === 0,
    "no owned photo and no live photo -> an empty list (no dead-end viewer of a proxy URL)");
}

// ─── 7. attribution is per-photo, not per-place ──────────────────────────────
ok(/liveCreditFor\(detail, lightbox\)/.test(home) && /<PhotoCredit credit=\{liveCredit\}/.test(home),
  "the viewer must show liveCreditFor(detail, <the photo on screen>) through PhotoCredit; a paging viewer "
  + "that keeps photo 1's credit on photo 3 misattributes the photographer.");
ok(/detail\.photoAttrs\[oi\]/.test(home) && /detail\.photos\.indexOf\(lightbox\)/.test(home),
  "the Wayfind-owned label must still be looked up per visible photo (photoAttrs[index of the photo on screen]).");
{
  const d = { photos: ["https://cdn.wayfind.test/a.jpg"], _live: { src: "https://live.test/g.jpg", source: "google", credit: { name: "Ann", uri: "https://maps.example/u/1" } } };
  const c = liveCreditFor(d, "https://live.test/g.jpg");
  ok(c && c.name === "Ann" && c.source === "google", "the live photo shows its live credit");
  ok(liveCreditFor(d, "https://cdn.wayfind.test/a.jpg") === null, "an owned photo paged to does NOT inherit the live photo's credit");
  ok(liveCreditFor({ ...d, _live: { ...d._live, source: "wayfind" } }, "https://live.test/g.jpg") === null, "a Wayfind-owned live photo carries no third-party credit");
}

console.log("test-lightbox-paging: OK — " + pass + " assertions (the full-screen photo viewer pages by arrow, key and swipe; the swipe decision is race-free)");
