// lib/browseExperienceLanes.js — PURE merge for the Things-to-do / Family
// bookable rail. The live Viator city pull (`browseTours` / initialExperiences)
// and the cached `/api/experiences` table are TWO lanes of the same inventory,
// not a finished-vs-pending handshake.
//
// THE BUG THIS STOPS. UnifiedBrowseCommerceRail used to treat ANY array —
// including `[]` — as "the experience lane is complete" and skip the table
// read. When `/api/viator/tours` returned `{items:[]}` the parent set
// browseTours to [], the rail short-circuited, and legitimate imaged
// link_ok family/theme rows sitting in wf_experiences never rendered.
// An empty live response means "this lane has nothing", not "stop looking".
//
// Parent-owned live: Family (and any caller that passes `initialExperiences`)
// already ran `/api/viator/tours`. The rail must not fire a second paid
// search just because that array was empty. Callers that omit the prop
// (attractions sub-chips) keep the existing table-then-liveSearch fallback.

export const VIATOR_EMPTY_IS_NOT_DONE = true;

export function parentOwnsLiveLane(initialExperiences) {
  return initialExperiences !== undefined;
}

export function liveExperienceSeed(initialExperiences) {
  return Array.isArray(initialExperiences) && initialExperiences.length > 0
    ? initialExperiences
    : [];
}

function rowCode(row) {
  return String((row && (row.code || row.product_code)) || "").trim();
}

function rowTitle(row) {
  return String((row && row.title) || "").trim().toLowerCase();
}

/**
 * Merge live Viator tours with cached wf_experiences rows.
 * Live wins on a duplicate product code or title so a just-fetched product
 * is not doubled by its own cache row. Empty live is a no-op, not a wipe.
 */
export function mergeBrowseExperienceLanes(liveTours, cachedExperiences) {
  const live = Array.isArray(liveTours) ? liveTours : [];
  const cached = Array.isArray(cachedExperiences) ? cachedExperiences : [];
  const out = [];
  const seenCode = new Set();
  const seenTitle = new Set();
  const push = (row) => {
    if (!row) return;
    const code = rowCode(row);
    const title = rowTitle(row);
    if (code && seenCode.has(code)) return;
    if (title && seenTitle.has(title)) return;
    if (code) seenCode.add(code);
    if (title) seenTitle.add(title);
    out.push(row);
  };
  for (const row of live) push(row);
  for (const row of cached) push(row);
  return out;
}

/**
 * The experience-lane decision the rail must use.
 * Food / noExperiences / includeExperiences=false → [].
 * Otherwise: merge live seed + cached. An empty live array never wins.
 */
export function resolveBrowseExperienceRows({
  includeExperiences = true,
  noExperiences = false,
  initialExperiences,
  cachedRows,
} = {}) {
  if (!includeExperiences || noExperiences) return [];
  return mergeBrowseExperienceLanes(
    liveExperienceSeed(initialExperiences),
    Array.isArray(cachedRows) ? cachedRows : [],
  );
}

/** Same gate the rail's card builder uses: real artwork + a product identity. */
export function experienceLaneWouldRender(row) {
  return !!(row && row.image && (row.code || row.product_code));
}

/**
 * Live freetext fallback is only honest when THIS rail owns the live call.
 * If the parent already tried `/api/viator/tours` (even if it returned []),
 * a second paid search would double-spend and is forbidden.
 */
export function shouldLiveSearchFallback({
  includeExperiences = true,
  noExperiences = false,
  initialExperiences,
  cachedCount = 0,
} = {}) {
  if (!includeExperiences || noExperiences) return false;
  if (parentOwnsLiveLane(initialExperiences)) return false;
  return !(Number(cachedCount) > 0);
}
