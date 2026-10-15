// lib/dbCursor.js — "did the paging cursor advance?" in the DATABASE's terms.
//
// wf_inventory (and every Postgres text key) is ordered by the database in
// en_US.UTF-8 collation, where "ChIJZ_…" sorts AFTER "ChIJjbpE…". JavaScript
// `<` / `<=` / localeCompare compare differently (UTF-16 code units: uppercase
// before lowercase), so `row.key <= cursor` rejects a perfectly correct next
// page. Measured 2026-10-15: 7449 of 20989 adjacent OPERATIONAL place_ids are
// out of order under code-unit comparison. NEVER order DB keys with JS operators.
// Progress is proven without any ordering: a row is accepted only if its key is
// a non-empty string this read has never seen (so the cursor row itself coming
// back, a repeated id, or a stuck cursor all fail).
export function createCursorGuard() {
  const seen = new Set();
  return {
    // true when `key` is new progress; false when it is not a usable key or was already seen.
    admit(key) {
      if (typeof key !== "string" || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}
