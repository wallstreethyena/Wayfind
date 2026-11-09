// One closer for a place detail. The sheet already has its own rails.
// This chooses the single link that ends the sheet, and nothing else.
//
// Order:
//   1. A guide whose picks name this exact place id.
//   2. One similar spot that is not already on the sheet.
//   3. One guide whose region is this place's own city.
//   4. The guides index, which is a real page.
// A missing guide list is an operator error and stays visibly an error.
// A loaded list with no match is a product state and uses step 4.

export const DETAIL_NEXT_STEP_SHOWN = "detail_next_step_shown";
export const DETAIL_NEXT_STEP_OPEN = "detail_next_step_open";

export const NEXT_STEP_COPY = Object.freeze({
  related: "From the Wayfind guide",
  similar: "A similar spot",
  similarReason: "Same kind of stop nearby",
  guides: "See the guides",
  guidesTitle: "Wayfind guides",
  missing: "Next step paused. detailGuides is missing.",
  missingLink: "Open the guides",
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function placeCityToken(value) {
  const head = text(value).replace(/\./g, "").toLowerCase().split(",")[0].trim();
  return head.length >= 3 ? head : "";
}

function guideHref(slug) {
  return "/guides/" + encodeURIComponent(slug);
}

function usableGuide(guide) {
  return !!(guide && text(guide.slug) && text(guide.title));
}

function listsPlace(guide, placeId) {
  return (Array.isArray(guide.placeIds) ? guide.placeIds : []).some((id) => String(id) === placeId);
}

function guideStep(guide, match) {
  const slug = text(guide.slug);
  const region = text(guide.region);
  return {
    kind: "guide",
    match,
    target: slug,
    href: guideHref(slug),
    title: text(guide.title),
    teaser: text(guide.teaser),
    mins: Number.isFinite(guide.mins) ? guide.mins : null,
    region,
    kicker: match === "region_guide" && region ? "Guide for " + region : NEXT_STEP_COPY.related,
  };
}

function indexStep() {
  return {
    kind: "guides",
    match: "guides_index",
    target: "guides",
    href: "/guides",
    title: NEXT_STEP_COPY.guidesTitle,
    teaser: "",
    mins: null,
    region: "",
    kicker: NEXT_STEP_COPY.guides,
  };
}

export function missingGuidesStep() {
  return {
    kind: "error",
    code: "detailGuides",
    match: "guides_unconfigured",
    target: "detailGuides",
    href: "/guides",
    title: NEXT_STEP_COPY.missingLink,
    teaser: "",
    mins: null,
    region: "",
    kicker: NEXT_STEP_COPY.missing,
  };
}

function cityTokens(cityNames) {
  const tokens = [];
  const seen = new Set();
  for (const name of Array.isArray(cityNames) ? cityNames : []) {
    const token = placeCityToken(name);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

/**
 * @returns {object|null} one step, or null while the similar pool is still loading
 */
export function chooseDetailNextStep({ place, guides, similar = [], excludeIds = [], similarReady = true, cityNames = [] } = {}) {
  if (!place || !place.id || place._event) return null;
  if (!Array.isArray(guides)) return missingGuidesStep();

  const placeId = String(place.id);
  const list = guides.filter(usableGuide);
  const related = list.find((guide) => listsPlace(guide, placeId));
  if (related) return guideStep(related, "place_in_guide");

  if (!similarReady) return null;

  const skip = new Set([placeId, ...(Array.isArray(excludeIds) ? excludeIds : [])].filter((id) => id != null && id !== "").map(String));
  const seen = new Set();
  for (const candidate of Array.isArray(similar) ? similar : []) {
    if (!candidate || !candidate.id || !text(candidate.name)) continue;
    const id = String(candidate.id);
    if (skip.has(id) || seen.has(id)) continue;
    seen.add(id);
    return {
      kind: "place",
      match: "similar",
      target: id,
      href: null,
      title: text(candidate.name),
      teaser: "",
      mins: null,
      region: "",
      kicker: NEXT_STEP_COPY.similar,
      reason: NEXT_STEP_COPY.similarReason,
      place: candidate,
    };
  }

  const tokens = cityTokens(cityNames);
  if (tokens.length) {
    const regional = list.find((guide) => {
      const region = placeCityToken(guide.region);
      return region && tokens.includes(region);
    });
    if (regional) return guideStep(regional, "region_guide");
  }

  return indexStep();
}
