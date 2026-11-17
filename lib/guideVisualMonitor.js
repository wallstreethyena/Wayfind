// lib/guideVisualMonitor.js — the pure half of scripts/guide-visual-monitor.mjs:
// parse a live guide / blog page into recommendations and sort each one into
// the owner's three states (2026-10-14):
//   A  photo exists and renders      B  photo exists, Wayfind fails to show it
//   C  no verified photo available (sourcing backlog, never an alarm)
// A-context (2026-10-15, #1811): a reviewed topic photo captioned
// "Illustrative …" stands in for a place with no licensed photo of its own.
// It renders and is credited, so it is not an alarm, but it is counted apart
// from A so the exact-place share stays visible.
// No I/O here; scripts/test-guide-visual-monitor.mjs executes it on fixed HTML.
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1].replace(/&amp;/g, "&") : null; };
const ILLUSTRATIVE = />\s*Illustrative\b[^<]*photo\.?\s*</;
export function parseGuidePicks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<section id="pick-(\d+)"[^>]*>([\s\S]*?)<\/section>/g)) {
    const body = m[2];
    const name = (body.match(/<h2[^>]*>(?:<a[^>]*>)?([^<]+)/) || [])[1] || "?";
    const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((t) => attr(t[0], "src")).filter((s) => s && !s.startsWith("data:"));
    out.push({ n: Number(m[1]), name: name.trim(), imgs, credited: /Photo:/.test(body), live: /data-guide-live-photo="pending"/.test(body), illustrative: ILLUSTRATIVE.test(body), neutral: /data-guide-figure="pick-neutral"/.test(body) && /data-photo-fallback="unavailable"/.test(body) });
  }
  return out;
}
/** A guide with its own route (e.g. /guides/pintos-farm-miami-2026) has no
 * pick sections; it is checked as ONE recommendation: its photos load and are
 * credited. Returns null when the page does use pick sections. */
export function parseDedicatedGuide(html) {
  if (/<section id="pick-\d+"/.test(String(html))) return null;
  const imgs = [...String(html).matchAll(/<img\b[^>]*>/g)].map((t) => attr(t[0], "src"))
    .filter((s) => s && !s.startsWith("data:") && !/wordmark|logo|\.svg(?:$|\?)/i.test(s));
  return { n: 0, name: "(dedicated guide page)", imgs: imgs.slice(0, 12), credited: /Photo:/.test(String(html)), live: false, illustrative: false };
}
export function parseBlogItems(html) {
  const out = [];
  for (const m of String(html).matchAll(/<section class="list-item"[^>]*>([\s\S]*?)<\/section>/g)) {
    const body = m[1];
    const name = ((body.match(/<h2[^>]*>[\s\S]*?<\/span>([^<]+)/) || [])[1] || "?").trim();
    const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((t) => attr(t[0], "src")).filter(Boolean);
    out.push({ name, imgs, credited: /Photo:/.test(body), live: /data-live-photo="pending"/.test(body) });
  }
  return out;
}
/** One recommendation -> "A" | "A-context" | "A-live" | "B" | "C" with a reason. */
export function classify({ imgs, credited, live, illustrative, expectPhoto, expectNeutral, neutral, documented, hasGoogleRef, imgOk }) {
  // An owner-approved neutral tile is sourcing work, not a vanished photo.
  // Require both the code decision and the actual shared tile in live HTML.
  // A photographed pick replaced by a tile still reaches the failure below.
  if (expectNeutral) {
    if (imgs.length || live) return ["B", "neutral-only pick unexpectedly renders an unapproved photo"];
    return neutral ? ["C", "approved neutral fallback; exact-place photo still needed"] : ["B", "approved neutral fallback is missing from the page"];
  }
  if (imgs.length) {
    if (!imgOk) return ["B", "image does not load"];
    if (!credited) return ["B", "image shown without its credit"];
    return illustrative ? ["A-context", "labelled topic photo, not the place itself"] : ["A", "renders"];
  }
  if (live) return hasGoogleRef === false ? ["C", "Google has no photo of this place"] : ["A-live", "live credited photo (client)"];
  if (expectPhoto) return ["B", "code has a photo for this pick but the page shows none"];
  return documented ? ["C", "documented exception"] : ["C", "no verified photo source"];
}


/**
 * Does the code promise a photo for this pick, so that a page showing none is
 * an engineering failure (B)? "held" is the strict context ladder's deliberate
 * null (image intent rule, #2307: no picture beats a wrong or repeated one);
 * the pick goes to the Picture Scrapper backlog, which is class C. Treating it
 * as B made ~150 picks page the owner from 2026-11-10 while the pages were
 * doing exactly what the owner asked.
 */
export function picksExpectPhoto(cls, expectNeutral) {
  return !expectNeutral && cls !== "missing" && cls !== "held";
}

/**
 * A contextFor() for ONE guide that remembers which context photos earlier
 * picks consumed, exactly like app/guides/[slug]/page.js threads one usedSrc
 * through the picks in order. A fresh Set per pick predicts a photo the page
 * (correctly) refuses because it would repeat one already shown above.
 */
export function makeGuideContextFor(photoFor, { seed = [] } = {}) {
  const usedSrc = new Set(seed);
  return (slug, pick, guide) => photoFor(slug, pick, guide, { usedSrc });
}

/**
 * The media the page reserves BEFORE it walks the context ladder, as the
 * usedSrc seed: app/guides/[slug]/page.js rememberMedia()s every curated pick
 * image (inline pick.image, then the reviewed manifest photo) and the guide
 * hero, by src and by credit link. Without this seed the monitor predicted a
 * context photo the page correctly refuses as a repeat of the hero
 * (2026-11-16: Rays guide pick 2, "The Rays are home at the Trop again in
 * 2026", paged as B while the hero already shows that Tropicana Field
 * photograph). Editorial place figures resolved from the database are not
 * reproducible offline and are not seeded.
 */
export function pageReservedMedia(slug, guide, { hero = null, pickPhoto = () => null } = {}) {
  const out = [];
  const remember = (im) => {
    if (!im) return;
    if (typeof im === "string") { out.push(im); return; }
    if (im.src) out.push(im.src);
    const ref = im.creditHref || im.source;
    if (ref && ref !== "https://pintofarm.com") out.push(ref);
  };
  for (const pick of (guide && guide.picks) || []) {
    const inline = slug === "orlando-halloween-food-2026" ? null : (pick && pick.image) || null;
    remember(inline && typeof inline === "object" ? inline : inline ? { src: inline, creditHref: pick.imageCreditHref || null } : pickPhoto(slug, pick && pick.name));
  }
  remember(hero);
  return out;
}
