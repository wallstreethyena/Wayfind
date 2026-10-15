#!/usr/bin/env node
/**
 * check-guide-visual-completeness — VISUAL COVERAGE, not image safety.
 *
 * Owner rule (2026-10-14, extended 2026-10-15 by #1811): a reader must be able
 * to SEE every recommendation. Passing the image-SAFETY guards
 * (check-guide-pick-photos, test-guide-context-photos: is this photo legal,
 * credited, honestly labelled?) says nothing about whether each pick has a
 * photo at all. This guard is the coverage half, and it runs the same
 * resolution order app/guides/[slug]/page.js renders with.
 *
 * ROOT CAUSE IT CLOSES. Until #1697 (2026-10-08) most gap records read "the
 * pick resolves to the venue's own cached Wayfind photo". #1697 removed that
 * cached Google lane for compliance, the notes stayed, and 142 live picks
 * (Coquina Beach among them) quietly rendered text only while every guard
 * stayed green. A gap record is a PROMISE about what renders; it must be true.
 *
 * A pick is classified in page order:
 *   curated   inline pick.image, or its own reviewed manifest entry
 *   reuse     a reviewed entry for the SAME place id in another guide
 *             (lib/guidePickPhotos guidePhotoForPlace)
 *   context   no exact-place photo; a reviewed, labelled, credited topic photo
 *             (lib/guideContextPhotos guideContextPhoto) illustrates it
 *   MISSING   guideContextPhoto finds nothing -> the page would fail -> FAIL
 *
 * ASSERTS:
 *   1. no pick is MISSING (a new guide can never publish text-only picks)
 *   2. every gap record has an allowed reason and a real note (>= 40 chars)
 *   3. no gap note promises a fallback that no longer exists (STALE_PROMISE),
 *      and every gap record matches what renders: it names a real pick, that
 *      pick has no photo of its own, and a reused same-place photo is said so
 *   4. every guide has a reviewed hero photo
 *   5. a context photo is never presented as the place: its caption must say
 *      "Illustrative" and its alt "not a photograph of"
 *   6. red-proofs: each rule above is shown to fail on a synthetic violation.
 *
 * Hermetic: no network, no env. Prints the coverage census every run, so the
 * exact-place share (curated + reuse) stays visible as context photos rise.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES } from "../lib/guides.js";
import { GUIDE_PICK_PHOTOS } from "../lib/guidePickPhotoManifest.js";
import { buildPlacePhotoIndex } from "../lib/guidePickPhotos.js";
import { guideContextPhoto } from "../lib/guideContextPhotos.js";
import { guideHero } from "../lib/guideHero.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const GAP_REASONS = new Set(["google-only", "no-verified-source", "public-art", "people-privacy", "not-a-place"]);
export const STALE_PROMISE = /resolves to the venue's own cached Wayfind photo|resolves its photo via a live Google|cached Google photo will (?:render|show)|stays text only/i;
const PLACE_ID_RX = /^[A-Za-z0-9_-]{20,}$/;

/** Pure classifier. ctx = { manifest, placeIndex, contextFor, guide }. */
export function classifyPick(slug, pick, { manifest, placeIndex, contextFor, guide }) {
  // Mirrors app/guides/[slug]/GuideEditorial.js guidePickImage: that guide's
  // inline images are deliberately ignored by the page (#1201).
  if (pick && pick.image && slug !== "orlando-halloween-food-2026") return { cls: "curated" };
  if (manifest?.[slug]?.picks?.[pick.name]) return { cls: "curated" };
  const pid = typeof pick.placeId === "string" && PLACE_ID_RX.test(pick.placeId) ? pick.placeId : null;
  if (pid && placeIndex.has(pid)) return { cls: "reuse" };
  try {
    const img = contextFor(slug, pick, guide);
    if (img && img.src) return { cls: "context", img };
  } catch (e) { return { cls: "missing", why: e.message }; }
  return { cls: "missing", why: "no context photo returned" };
}

/** Pure checker over a list of guides. Returns { failures, census, perGuide }. */
export function checkGuides(guides, { manifest, placeIndex, contextFor, gapsFor, heroFor }) {
  const failures = [];
  const census = { guides: 0, picks: 0, curated: 0, reuse: 0, context: 0, missing: 0, gap: 0 };
  const perGuide = [];
  for (const g of guides) {
    census.guides++;
    const gaps = gapsFor(g.slug) || {};
    const counts = { curated: 0, reuse: 0, context: 0, missing: 0 };
    for (const pick of g.picks || []) {
      census.picks++;
      const r = classifyPick(g.slug, pick, { manifest, placeIndex, contextFor, guide: g });
      counts[r.cls]++; census[r.cls]++;
      if (r.cls === "missing") failures.push(`${g.slug}: pick "${pick.name}" would render with no photo (${r.why}). Add a licensed photo, a place id with a reviewed photo, or a reviewed context photo for its topic.`);
      if (r.cls === "context") {
        if (!/^Illustrative\b/.test(String(r.img.caption || ""))) failures.push(`${g.slug}: context photo for "${pick.name}" is not captioned "Illustrative …"; a topic photo must never pass as the place`);
        if (!/not a photograph of/.test(String(r.img.alt || ""))) failures.push(`${g.slug}: context photo alt for "${pick.name}" must say it is not a photograph of the place`);
      }
    }
    const classOf = new Map((g.picks || []).map((pick) => [pick.name, classifyPick(g.slug, pick, { manifest, placeIndex, contextFor, guide: g }).cls]));
    for (const [name, gap] of Object.entries(gaps)) {
      census.gap++;
      const cls = classOf.get(name);
      if (!cls) failures.push(`${g.slug}: gap "${name}" names no pick in the guide; remove the stale record`);
      else if (cls === "curated") failures.push(`${g.slug}: gap "${name}" is documented as a gap but the pick has its own photo; remove the record`);
      else if (cls === "reuse" && !/same place/i.test(String(gap?.note || ""))) failures.push(`${g.slug}: gap "${name}" renders the reused photo of the same place; its note must say so`);
      if (!GAP_REASONS.has(gap?.reason)) failures.push(`${g.slug}: gap "${name}" reason ${JSON.stringify(gap?.reason)} is not one of ${[...GAP_REASONS].join("/")}`);
      const note = String(gap?.note || "").trim();
      if (note.length < 40) failures.push(`${g.slug}: gap "${name}" needs a real note (what was searched, why nothing qualified), got ${note.length} chars`);
      if (STALE_PROMISE.test(note)) failures.push(`${g.slug}: gap "${name}" promises a fallback that no longer exists (#1697 removed cached Google photos from guides). Rewrite the note truthfully.`);
    }
    if (!heroFor(g.slug)) failures.push(`${g.slug}: guide has no reviewed hero photo (lib/guideHero.js)`);
    perGuide.push({ slug: g.slug, total: (g.picks || []).length, ...counts });
  }
  return { failures, census, perGuide };
}

// ── red-proofs: every rule must be seen to FAIL on a planted violation ──────
function redProofs() {
  const pid = "ChIJ5eLMVXE9w4gR15l0tMZGkMY";
  const ctxOk = () => ({ src: "/c.webp", caption: "Illustrative beach photo.", alt: "Beach; contextual photograph, not a photograph of A" });
  const base = { manifest: {}, placeIndex: new Map(), contextFor: ctxOk, heroFor: () => ({ src: "/h.webp" }), gapsFor: () => ({}) };
  const goodNote = "Commons and Openverse searched by name and coordinates; nothing showed this exact place.";
  const one = [{ slug: "t", picks: [{ name: "A", placeId: pid }] }];
  const cases = [
    ["missing photo", one, { contextFor: () => { throw new Error("Missing reviewed editorial context photo"); } }, /would render with no photo/],
    ["unlabelled context", one, { contextFor: () => ({ src: "/c.webp", caption: "Beach.", alt: "Beach; contextual photograph, not a photograph of A" }) }, /not captioned "Illustrative/],
    ["context alt claims place", one, { contextFor: () => ({ src: "/c.webp", caption: "Illustrative beach photo.", alt: "A" }) }, /must say it is not a photograph/],
    ["bad gap reason", one, { gapsFor: () => ({ A: { reason: "lazy", note: goodNote } }) }, /is not one of/],
    ["empty gap note", one, { gapsFor: () => ({ A: { reason: "google-only", note: "none" } }) }, /needs a real note/],
    ["stale promise", one, { gapsFor: () => ({ A: { reason: "google-only", note: "No licensed photo. The pick resolves to the venue's own cached Wayfind photo by exact placeId." } }) }, /no longer exists/],
    ["no hero", one, { heroFor: () => null }, /no reviewed hero/],
    ["gap for a pick that no longer exists", one, { gapsFor: () => ({ Z: { reason: "google-only", note: goodNote } }) }, /names no pick/],
    ["reuse gap note says nothing renders", one, { placeIndex: new Map([[pid, { src: "/x.webp" }]]), gapsFor: () => ({ A: { reason: "google-only", note: goodNote } }) }, /must say so/],
    ["text-only promise", one, { gapsFor: () => ({ A: { reason: "google-only", note: "Nothing licensed; with no live photo it stays text only on the page." } }) }, /no longer exists/],
  ];
  let n = 0;
  for (const [label, guides, over, rx] of cases) {
    const { failures } = checkGuides(guides, { ...base, ...over });
    if (!failures.some((f) => rx.test(f))) throw new Error(`red-proof "${label}" did not fail: ${JSON.stringify(failures)}`);
    n++;
  }
  // green control: reuse beats context, context counts as a photo path
  const idx = new Map([[pid, { src: "/x.webp" }]]);
  const green = checkGuides([{ slug: "t", picks: [{ name: "A", placeId: pid }, { name: "B" }] }], { ...base, placeIndex: idx });
  if (green.failures.length || green.census.reuse !== 1 || green.census.context !== 1) throw new Error("green control failed: " + JSON.stringify(green));
  return n + 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const proofs = redProofs();
  const guides = Array.isArray(GUIDES) ? GUIDES : Object.entries(GUIDES).map(([slug, g]) => ({ slug, ...g }));
  const gapsFor = (slug) => {
    const f = path.join(ROOT, "data/guide-pick-photos", slug + ".json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).gaps || {} : {};
  };
  const heroFor = (slug) => { const h = guideHero(slug); return h && h.src ? h : null; };
  const placeIndex = buildPlacePhotoIndex(GUIDE_PICK_PHOTOS);
  const contextFor = (slug, pick, guide) => guideContextPhoto(slug, pick, guide, { usedSrc: new Set() });
  const { failures, census } = checkGuides(guides, { manifest: GUIDE_PICK_PHOTOS, placeIndex, contextFor, gapsFor, heroFor });
  const exact = census.curated + census.reuse;
  const line = `${census.guides} guides, ${census.picks} picks: exact-place ${exact} (curated ${census.curated}, reused ${census.reuse}), labelled context ${census.context}, missing ${census.missing}; gap records ${census.gap}`;
  if (failures.length) {
    console.error(`check-guide-visual-completeness: FAILED (${failures.length})\n  ` + failures.join("\n  ") + `\n  census: ${line}`);
    process.exit(1);
  }
  console.log(`check-guide-visual-completeness: OK — ${proofs} red-proofs; ${line}`);
}
