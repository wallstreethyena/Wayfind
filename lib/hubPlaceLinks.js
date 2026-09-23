// lib/hubPlaceLinks.js — SEO recovery (2026-09-23), Task A.
//
// Pure helper shared by the three server-rendered hub surfaces that now link
// into the durable /places/{id} pages (lib/landing.js's LandingPage,
// app/florida/[town]/page.js, app/best-beaches/[metro]/page.js): given the
// list of places a hub is about to render and the durable-eligible id set
// (lib/placeIndex.js's listIndexedIds(), fetched by the caller), returns
// exactly the ids from THAT list that are ALSO in the eligible set —
// deduped, in list order, with a display name for each.
//
// Deliberately dumb and synchronous: no network, no Supabase, no React. This
// is the one piece of "does this place get a /places/{id} link" logic, kept
// out of JSX specifically so scripts/check-hub-place-links.mjs can import
// and execute it directly instead of regex-matching page source.
export function selectEligiblePlaceLinks(list, eligibleIds) {
  const eligible = eligibleIds instanceof Set ? eligibleIds : new Set(Array.isArray(eligibleIds) ? eligibleIds : []);
  const ids = [];
  const names = new Map();
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || !p.id || names.has(p.id) || !eligible.has(p.id)) continue;
    ids.push(p.id);
    names.set(p.id, p.name || p.id);
  }
  return { ids, names };
}
