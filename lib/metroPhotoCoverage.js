// lib/metroPhotoCoverage.js — pure. What "this metro has photos" actually means.
//
// THE DEFECT (2026-11-18): scripts/check-inventory-integrity.mjs reported
// "10 metros have ZERO photos ... Every card there is imageless" by counting
// wf_inventory rows with a non-null photo_ref. That column is a PLACEHOLDER for
// every Google-id row (24,508 of 24,633 OPERATIONAL rows hold
// places/<id>/photos/wfplacediscovery; the other 125 are null, all wfadd_ rows
// with no Google id). So the count measured "this row has a Google place id", not
// "a photo can be served": 99.5% of rows passed while only ~25% had a photo any
// no-spend lane could answer with (Broward 18.7%, Tampa 35.1%).
// lib/placePhotoServable.js documents the same fact for the card path: the
// placeholder ref answers 404 unless one of the free lanes holds a photo.
//
// The two errors cancelled the wrong way round. The 10 "zero-photo metros" were
// nine one-row owner-intake research venues (nampa-id, london-uk, ...) plus one
// stray slug (fort-lauderdale holds one wfadd_ row; Fort Lauderdale's real
// inventory key is broward, 1,376 rows), while the real gap — whole large metros
// with a placeholder on every row and a photo behind about one in five — printed
// nothing.
//
// A row is SERVABLE when any lane a card reads without spending can answer for it:
//   - wf_google_photo_store row, state "ready", with a storage_path
//   - wf_place_photo row, status "active", licence + attribution + a file
//   - an owned photo on the row itself (photo_url / signals.photos / photo_gallery)
// photo_ref is deliberately NOT a lane. A paid Google fetch on a credited surface
// can still fill a miss at view time, but that is spend, not coverage.

/** A metro that is not a market: only owner-intake (wfadd_) venues, a handful at most. */
export const INTAKE_ONLY_MAX_ROWS = 5;
/** A metro this large with zero servable photos is a real gap, not a stray key. */
export const MARKET_MIN_ROWS = 20;

export function hasOwnedPhoto(row) {
  const s = (row && row.signals) || {};
  return !!(
    (row && (row.photo_url || row.photoUrl)) ||
    s.photo_url || s.photoUrl ||
    (Array.isArray(s.photos) && s.photos.length) ||
    (Array.isArray(s.photo_gallery) && s.photo_gallery.length)
  );
}

/** Ids a card can get a photo for without spend, from the two stored lanes' rows. */
export function servablePlaceIds(storeRows = [], freeRows = []) {
  const ids = new Set();
  for (const r of storeRows) if (r && r.state === "ready" && r.storage_path) ids.add(r.place_id);
  for (const r of freeRows) {
    if (!r || r.status !== "active") continue;
    if (!r.license || !r.attribution_text || !r.attribution_url) continue; // CC photos need visible credit
    if (!r.image_url && !r.storage_path) continue;
    ids.add(r.place_id);
  }
  return ids;
}

/** Per-metro tallies: total rows, placeholder-ref rows (NOT photos), servable rows, intake-only flag. */
export function metroPhotoCoverage(rows, servableIds) {
  const by = new Map();
  for (const r of rows) {
    const m = by.get(r.metro) || { metro: r.metro, total: 0, placeholderRef: 0, servable: 0, intakeOnly: true };
    m.total++;
    if (r.photo_ref) m.placeholderRef++;
    if (servableIds.has(r.place_id) || hasOwnedPhoto(r)) m.servable++;
    if (!String(r.place_id || "").startsWith("wfadd_")) m.intakeOnly = false;
    by.set(r.metro, m);
  }
  return [...by.values()];
}

/**
 * Metros with ZERO servable photos, split so the report says what each one is.
 *   market   total >= MARKET_MIN_ROWS: a real place Wayfind serves, imageless.
 *   intake   only wfadd_ owner-intake rows, <= INTAKE_ONLY_MAX_ROWS: a research venue's own key.
 *   stray    everything else small (a Google-id row in a one-off key): a mislabelled or unbacked metro.
 */
export function zeroPhotoMetros(coverage) {
  const out = { market: [], intake: [], stray: [] };
  for (const m of coverage) {
    if (m.servable !== 0) continue;
    if (m.total >= MARKET_MIN_ROWS) out.market.push(m);
    else if (m.intakeOnly && m.total <= INTAKE_ONLY_MAX_ROWS) out.intake.push(m);
    else out.stray.push(m);
  }
  return out;
}

export function overallCoverage(coverage) {
  let total = 0, placeholderRef = 0, servable = 0;
  for (const m of coverage) { total += m.total; placeholderRef += m.placeholderRef; servable += m.servable; }
  return { total, placeholderRef, servable };
}

/** Large metros with the lowest servable share, worst first. */
export function lowestCoverage(coverage, { minRows = 100, limit = 5 } = {}) {
  return coverage
    .filter((m) => m.total >= minRows)
    .map((m) => ({ ...m, pct: (100 * m.servable) / m.total }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, limit);
}
