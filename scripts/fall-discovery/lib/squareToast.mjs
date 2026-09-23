// scripts/fall-discovery/lib/squareToast.mjs — a Square/Toast SLUG PROBE.
//
// Cafés, bakeries and small restaurants commonly run their online ordering
// on order.toasttab.com/online/<slug> or <slug>.square.site with a slug
// derived straight from the business name. Guessing that slug is cheap and
// free, but a guess is not an identity: two different businesses can share
// a slug shape, and a wrong hit would silently attribute one place's fall
// menu to another. So a probed URL is only ever ACCEPTED when the fetched
// page's text contains the place's own exact name — the same standard the
// task brief sets ("Square/Toast slug probes accepted only when the page
// text contains the exact place name"). Anything else is discarded, not
// force-matched to the nearest guess.
import { htmlToText, politeFetch } from "./fetch.mjs";

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function squareToastSlugCandidates(placeName) {
  const slug = slugify(placeName);
  if (!slug) return [];
  const tight = slug.replace(/-/g, "");
  const slugs = [...new Set([slug, tight])];
  const urls = [];
  for (const s of slugs) {
    urls.push({ url: `https://order.toasttab.com/online/${s}`, type: "official_menu_platform" });
    urls.push({ url: `https://${s}.square.site`, type: "official_menu_platform" });
  }
  return urls;
}

function normalizedNameHit(pageText, placeName) {
  const name = String(placeName || "").trim().toLowerCase();
  if (name.length < 3) return false;
  return String(pageText || "").toLowerCase().includes(name);
}

// Tries each guessed slug in turn; returns the FIRST page whose text
// contains the exact place name, or null. Caller controls how many places
// get probed (the run script caps this — a guess per candidate is still a
// network fetch, and politeness/time budget both apply).
export async function probeSquareToast(placeName) {
  for (const candidate of squareToastSlugCandidates(placeName)) {
    const res = await politeFetch(candidate.url);
    if (!res.ok) continue;
    const text = htmlToText(res.text);
    if (normalizedNameHit(text, placeName)) {
      return { url: candidate.url, type: candidate.type, text, fetchedAt: new Date().toISOString() };
    }
  }
  return null;
}
