// scripts/lib/synthetic/menuPosterIntegrity.mjs — pure contracts for the
// homepage poster menu synthetic.  Keep this free of browser/network code so
// the hermetic monitor guard can red-prove its decisions.

// RAILS currently declares 19 records.  FOUR never reach the homepage menu:
// `events` is retired into Night Out (`retiredInto`), `lunchcity` / `drive`
// were deliberately un-promoted by #1196 (`posterHidden: true`), and `chef`
// was hidden by the owner on 2026-09-10 (`posterHidden: true` — the record,
// the id, and Ron Duprat's seven picks all stay; only the tile comes off the
// track).  These are the 15 tiles a reader must be able to choose.  This explicit
// product contract catches both a disappeared tile and a quietly-added tile
// that has no monitored owner.
//
// WAS 18 UNTIL 2026-09-09, AND THAT COST A DAY.  #1196 was a Cindy
// creator-page PR.  Inside it, "Lunch in My City" and "Worth the Drive"
// "should no longer be promoted": both gained `posterHidden: true`,
// DaypartRail learned to honour the flag, and test-creator-pages gained
// assertions REQUIRING them to stay hidden.  This list was not touched.  So
// two guards asserted opposite things about the same two tiles, and the
// synthetic monitor failed on every scheduled run from 2026-09-08 18:25Z —
// masking a real continuation failure sitting in the same scenario.
//
// The list stays EXPLICIT on purpose: derived from RAILS it would happily
// expect 15 the day someone hides a tile by accident, which is the failure it
// exists to catch.  What is new is that check-synthetic-monitor-hermetic.mjs
// now asserts this list equals DaypartRail's own visibility predicate over
// RAILS, so the product decision and the monitored contract cannot disagree
// silently again — changing one without the other fails the build.
export const EXPECTED_VISIBLE_POSTER_IDS = Object.freeze([
  "season", "today", "trending", "eat", "beach", "family",
  "locals", "cindy", "tonight", "datenight", "break",
  "breakfast", "birthday", "blog", "augtober",
]);

const asId = (value) => value == null ? "" : String(value);
const asName = (value) => String(value == null ? "" : value).trim();

/**
 * Identify the ranked answer a /api/rails request belongs to. Pagination
 * fields deliberately do not participate: page zero and its continuations
 * share one answer only when location, city and daypart all agree.
 */
export function railRequestScope(urlLike) {
  try {
    const url = new URL(String(urlLike), "https://www.gowayfind.com");
    if (url.pathname !== "/api/rails" || url.searchParams.get("v") !== "2") return null;
    const rawLat = url.searchParams.get("lat");
    const rawLng = url.searchParams.get("lng");
    const lat = rawLat == null || rawLat === "" ? NaN : Number(rawLat);
    const lng = rawLng == null || rawLng === "" ? NaN : Number(rawLng);
    const band = String(url.searchParams.get("band") || "");
    const city = String(url.searchParams.get("city") || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !band) return null;
    return { lat, lng, band, city };
  } catch {
    return null;
  }
}

/** True when two page requests belong to the same ranked answer. */
export function sameRailRequestScope(leftUrl, rightUrl) {
  const left = railRequestScope(leftUrl);
  const right = railRequestScope(rightUrl);
  return !!left && !!right
    && left.lat === right.lat
    && left.lng === right.lng
    && left.band === right.band
    && left.city === right.city;
}

/**
 * Match the monitor's permission-granted location after the client's 0.01°
 * request snap. This excludes the earlier first-paint seed response.
 */
export function railRequestTargetsLocation(urlLike, location, city) {
  const scope = railRequestScope(urlLike);
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!scope || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return scope.lat === Math.round(lat * 100) / 100
    && scope.lng === Math.round(lng * 100) / 100
    && scope.city === String(city || "");
}

/** Compare the visible menu IDs with the one canonical monitored contract. */
export function posterMenuDiff(visibleIds) {
  const actual = Array.isArray(visibleIds) ? visibleIds.map(asId).filter(Boolean) : [];
  const actualSet = new Set(actual);
  const expectedSet = new Set(EXPECTED_VISIBLE_POSTER_IDS);
  return {
    expected: [...EXPECTED_VISIBLE_POSTER_IDS],
    returned: actual,
    duplicateIds: actual.filter((id, index) => actual.indexOf(id) !== index),
    missingIds: EXPECTED_VISIBLE_POSTER_IDS.filter((id) => !actualSet.has(id)),
    extraIds: actual.filter((id) => !expectedSet.has(id)),
  };
}

/**
 * Read one v=2 /api/rails rail without pretending a compact first window is a
 * complete rail.  `total` and `hasMore` are required metadata: a missing field
 * is an error state, never permission to call a 12-card response "complete".
 */
export function railWindowFromCapturedPayload(payload, railId) {
  const data = payload && payload.covered === true && payload.data && typeof payload.data === "object"
    ? payload.data
    : null;
  const raw = data && data.places && Object.prototype.hasOwnProperty.call(data.places, railId)
    ? data.places[railId]
    : null;
  const ids = Array.isArray(raw) ? raw.map(asId).filter(Boolean) : [];
  const totalRaw = data && data.railTotals ? data.railTotals[railId] : undefined;
  const hasMoreRaw = data && data.railHasMore ? data.railHasMore[railId] : undefined;
  const page = data && data.railPage && data.railPage.railId === railId ? data.railPage : null;
  const offset = page && Number.isInteger(Number(page.offset)) && Number(page.offset) >= 0 ? Number(page.offset) : 0;
  const total = Number(totalRaw);
  const metadataPresent = Number.isInteger(total) && total >= 0 && typeof hasMoreRaw === "boolean";
  const metadataConsistent = metadataPresent
    && total >= offset + ids.length
    && hasMoreRaw === (offset + ids.length < total);
  const complete = metadataConsistent && offset === 0 && ids.length === total && hasMoreRaw === false;
  const trulyEmpty = complete && total === 0;
  return {
    railId,
    ids,
    offset,
    returnedCount: ids.length,
    expectedCount: metadataPresent ? total : null,
    hasMore: typeof hasMoreRaw === "boolean" ? hasMoreRaw : null,
    metadataPresent,
    metadataConsistent,
    complete,
    trulyEmpty,
    truncated: metadataPresent && offset + ids.length < total,
    placeIndex: data && data.placeIndex && typeof data.placeIndex === "object" ? data.placeIndex : {},
  };
}

/** Rehydrate the one captured v=2 window. Missing indexed rows are a contract failure. */
export function rowsForRailWindow(window) {
  const index = window && window.placeIndex && typeof window.placeIndex === "object" ? window.placeIndex : {};
  const rows = [];
  const missingRowIds = [];
  for (const id of window?.ids || []) {
    const row = index[id];
    if (!row || typeof row !== "object") missingRowIds.push(id);
    else rows.push(row);
  }
  return { rows, missingRowIds };
}

/**
 * Merge the browser-captured initial window and its real continuation pages.
 * This operates on response bodies already observed by Playwright; it never
 * issues a request itself. A repeat, a gap, or changing total is a failure,
 * rather than a reason to report a partly loaded rail as complete.
 */
export function mergeCapturedRailWindows(payloads, railId) {
  const windows = (Array.isArray(payloads) ? payloads : []).map((payload) => railWindowFromCapturedPayload(payload, railId));
  const expectedCounts = [...new Set(windows.map((window) => window.expectedCount).filter((n) => Number.isInteger(n)))];
  const expectedCount = expectedCounts.length === 1 ? expectedCounts[0] : null;
  const ids = [];
  const duplicateIds = [];
  const seen = new Set();
  const placeIndex = {};
  let metadataPresent = windows.length > 0;
  let metadataConsistent = windows.length > 0;
  for (const window of windows) {
    metadataPresent = metadataPresent && window.metadataPresent;
    metadataConsistent = metadataConsistent && window.metadataConsistent;
    Object.assign(placeIndex, window.placeIndex);
    for (const id of window.ids) {
      if (seen.has(id)) duplicateIds.push(id);
      else { seen.add(id); ids.push(id); }
    }
  }
  const missingRowIds = ids.filter((id) => !placeIndex[id] || typeof placeIndex[id] !== "object");
  const finalWindow = windows.at(-1) || null;
  const complete = metadataPresent
    && metadataConsistent
    && expectedCount !== null
    && expectedCounts.length === 1
    && duplicateIds.length === 0
    && missingRowIds.length === 0
    && ids.length === expectedCount
    && finalWindow?.hasMore === false;
  return {
    railId,
    windows,
    ids,
    returnedCount: ids.length,
    expectedCount,
    pageCount: windows.length,
    metadataPresent,
    metadataConsistent,
    totalChanged: expectedCounts.length > 1,
    duplicateIds,
    missingRowIds,
    placeIndex,
    complete,
    trulyEmpty: complete && expectedCount === 0,
    truncated: expectedCount !== null && ids.length < expectedCount,
    hasMore: finalWindow ? finalWindow.hasMore : null,
  };
}

/** Flatten a composer result (`[{ places }]`) into the rendered card contract. */
export function composedRows(rails) {
  return (Array.isArray(rails) ? rails : []).flatMap((rail) => Array.isArray(rail?.places) ? rail.places : []);
}

/** Backward-compatible name-only reconciliation for a legacy card DOM. */
export function reconcileRenderedCardNames(expectedRows, renderedNames) {
  return reconcileRenderedCards(expectedRows, (Array.isArray(renderedNames) ? renderedNames : []).map((name) => ({ name })));
}

/**
 * Reconcile rendered DOM cards with captured ids. Exact `data-place-id` is
 * authoritative. Name matching is retained only as an explicit failure-safe
 * fallback for an old DOM contract; duplicate names never get guessed into an
 * id.
 */
export function reconcileRenderedCards(expectedRows, renderedCards) {
  const rows = Array.isArray(expectedRows) ? expectedRows : [];
  const byName = new Map();
  for (const row of rows) {
    const name = asName(row?.name);
    const id = asId(row?.id);
    if (!name || !id) continue;
    const existing = byName.get(name) || [];
    existing.push(id);
    byName.set(name, existing);
  }
  const ambiguousNames = [...byName.entries()].filter(([, ids]) => new Set(ids).size !== 1).map(([name]) => name);
  const expectedIds = rows.map((row) => asId(row?.id)).filter(Boolean);
  const rendered = Array.isArray(renderedCards) ? renderedCards : [];
  const renderedIds = [];
  const unknownNames = [];
  const missingDomIds = [];
  for (const card of rendered) {
    const domId = asId(card?.id);
    const name = asName(card?.name);
    if (domId) { renderedIds.push(domId); continue; }
    missingDomIds.push(name || "(unnamed card)");
    const ids = byName.get(name);
    if (!ids || ids.length !== 1) unknownNames.push(name);
    else renderedIds.push(ids[0]);
  }
  const expectedSet = new Set(expectedIds);
  const renderedSet = new Set(renderedIds);
  return {
    expectedIds,
    renderedIds,
    renderedCount: rendered.length,
    ambiguousNames,
    missingDomIds,
    unknownNames,
    missingIds: expectedIds.filter((id) => !renderedSet.has(id)),
    extraIds: renderedIds.filter((id) => !expectedSet.has(id)),
    duplicateRenderedIds: renderedIds.filter((id, index) => renderedIds.indexOf(id) !== index),
  };
}

/** Pure UI-state contract used by the browser monitor's continuation wait. */
export function continuationUiSettled({ hasMore, buttonPresent, buttonDisabled, loadingLabel, visibleFailure }) {
  if (visibleFailure) return true;
  if (!hasMore) return true;
  return !!buttonPresent && !buttonDisabled && !loadingLabel;
}

/** True only when the final card surface carries exactly the expected IDs. */
export function exactRenderedIdSet(expectedIds, renderedIds) {
  const expected = Array.isArray(expectedIds) ? expectedIds.map(asId).filter(Boolean) : [];
  const rendered = Array.isArray(renderedIds) ? renderedIds.map(asId).filter(Boolean) : [];
  return rendered.length === expected.length
    && new Set(rendered).size === rendered.length
    && rendered.every((id) => expected.includes(id));
}
