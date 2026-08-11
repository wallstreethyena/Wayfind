// lib/cuisineWrite.js — how cuisine labels get WRITTEN to wf_inventory.
//
// Why this is an UPDATE (PATCH per row) and must never go back to the
// POST + on_conflict "upsert" it replaced: Postgres checks NOT NULL on the
// INSERT tuple BEFORE conflict arbitration. A partial-column upsert against
// wf_inventory therefore 23502s on `name` even when every row already exists
// and would have merged. Proven live 2026-08-11 on prod (rolled-back probe
// against ChIJGTYZ1V632YgRVnSupWUjL0c): the cron's whole batch failed nightly
// since 08-06 — 122 identical errors — and the "failing row" was always just
// the FIRST row of the batch, not a bad row. There are no bad rows; there was
// a write path that could not work for ANY row.
//
// Per-row semantics are also the loudness fix: one failing row no longer takes
// the other 199 with it — it lands in `failures` with its reason while the
// rest complete.
//
// Pure orchestration: the caller supplies `rest(path, init)` (throws on !ok),
// so scripts/test-cuisine-write.mjs can EXECUTE this against a mock and assert
// on the calls, not on strings.

export async function writeCuisineLabels(updates, rest, { concurrency = 6 } = {}) {
  const failures = [];
  let written = 0;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, updates.length || 1) }, async () => {
      while (i < updates.length) {
        const u = updates[i++];
        const { place_id, ...cols } = u;
        if (!place_id) { failures.push({ place_id: null, error: "update without place_id" }); continue; }
        try {
          await rest(`wf_inventory?place_id=eq.${encodeURIComponent(place_id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(cols),
          });
          written++;
        } catch (e) {
          failures.push({ place_id, error: String(e && e.message).slice(0, 140) });
        }
      }
    })
  );
  return { written, failures };
}
