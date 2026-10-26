// scripts/test-like-global-sync.mjs — GLOBAL LIKE RULE, server half.
// docs/proposals/global-like-rule.md. The bug (live, 2026-10-25): the
// standalone card store never loaded server likes, so a place the database
// said was liked rendered not-liked on event pages. syncReactionsWithServer
// is CALLED here against a fake Supabase: remote-only ids arrive, local-only
// ids push up, base-tracked removals delete remotely, an empty local store
// wipes nothing, and a failed write surfaces as {error} for rollback.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
register("./lib/nodeResolveHook.mjs", import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("test-like-global-sync: FAIL — " + m); } };

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.window = new EventTarget();
globalThis.window.localStorage = globalThis.localStorage;

const { syncReactionsWithServer, persistLike, persistDislike, recordCommerceClick } = await import(pathToFileURL(path.join(ROOT, "lib/likeSignal.js")).href);
const { reconcileIdsSafe } = await import(pathToFileURL(path.join(ROOT, "lib/syncReconcile.js")).href);

// Fake supabase: in-memory tables, chainable builder.
function fakeSupabase(tables, failWrites = false) {
  const calls = [];
  const builder = (table) => {
    let op = null, filters = {}, payload = null, conflict = null;
    const run = () => {
      if (op === "select") {
        let rows = tables[table].filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v || (Array.isArray(v) && v.includes(r[k]))));
        return Promise.resolve({ data: rows.map((r) => ({ place_id: r.place_id, place: r.place })), error: null });
      }
      if (failWrites) return Promise.resolve({ data: null, error: { message: "boom" } });
      if (op === "delete") { tables[table] = tables[table].filter((r) => !Object.entries(filters).every(([k, v]) => r[k] === v || (Array.isArray(v) && v.includes(r[k])))); return Promise.resolve({ data: null, error: null }); }
      if (op === "upsert") {
        for (const row of payload) {
          const keys = conflict.split(",");
          const ix = tables[table].findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (ix >= 0) tables[table][ix] = { ...tables[table][ix], ...row }; else tables[table].push({ ...row });
        }
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    const b = {
      select: () => { op = "select"; return b; },
      eq: (k, v) => { filters[k] = v; return b; },
      in: (k, v) => { filters[k] = v; return b; },
      delete: () => { op = "delete"; return b; },
      upsert: (rows, opts) => { op = "upsert"; payload = rows; conflict = opts.onConflict; calls.push({ table, rows }); return b; },
      then: (res, rej) => run().then(res, rej),
    };
    return b;
  };
  return { from: builder, calls };
}
const U = { id: "user-1" };
const P = (id) => ({ id, name: "Place " + id });

// 1. Remote-only like arrives locally (the Selby cross-device bug).
{
  store.clear();
  const tables = { likes: [{ user_id: U.id, place_id: "A", place: P("A") }], saved_places: [] };
  const sb = fakeSupabase(tables);
  const merged = await syncReactionsWithServer({ supabase: sb, user: U, reconcileIdsSafe });
  ok(merged && merged.liked.A === true, "remote-only like A is in the merged liked map");
  ok(JSON.parse(store.get("wf_liked")).A === true, "wf_liked persisted with A");
  ok(JSON.parse(store.get("wf_liked_base")).includes("A"), "base snapshot records A");
}
// 2. Local-only like pushes up; dislike clears like (mutual exclusion input).
{
  store.clear();
  store.set("wf_liked_items", JSON.stringify({ B: { place: P("B"), ts: 1 } }));
  store.set("wf_liked", JSON.stringify({ B: true }));
  const tables = { likes: [], saved_places: [] };
  const sb = fakeSupabase(tables);
  const merged = await syncReactionsWithServer({ supabase: sb, user: U, reconcileIdsSafe });
  ok(tables.likes.some((r) => r.place_id === "B"), "local-only like B pushed to the likes table");
  ok(merged.liked.B === true, "B stays liked after sync");
}
// 3. Removed on this device (in base, not local) deletes remotely.
{
  store.clear();
  store.set("wf_liked_base", JSON.stringify(["C"]));
  // Non-empty local (another like stands) — an empty store never deletes,
  // by reconcileIdsSafe design (it cannot tell "removed all" from "wiped").
  store.set("wf_liked_items", JSON.stringify({ Z: { place: P("Z"), ts: 1 } }));
  const tables = { likes: [{ user_id: U.id, place_id: "C", place: P("C") }], saved_places: [] };
  const sb = fakeSupabase(tables);
  const merged = await syncReactionsWithServer({ supabase: sb, user: U, reconcileIdsSafe });
  ok(!tables.likes.some((r) => r.place_id === "C"), "base-tracked removal C deleted remotely");
  ok(!merged.liked.C, "C not liked after sync");
}
// 4. Empty/corrupt local store wipes nothing (remote survives).
{
  store.clear();
  const tables = { likes: [{ user_id: U.id, place_id: "D", place: P("D") }], saved_places: [{ user_id: U.id, place_id: "E", place: P("E"), list_name: "Disliked" }] };
  const sb = fakeSupabase(tables);
  const merged = await syncReactionsWithServer({ supabase: sb, user: U, reconcileIdsSafe });
  ok(tables.likes.length === 1 && merged.liked.D === true, "empty local store keeps remote like D");
  ok(merged.disliked.E === true, "remote dislike E arrives");
}
// 5. Failed writes surface {error} from persist* (rollback contract).
{
  const tables = { likes: [], saved_places: [] };
  const sb = fakeSupabase(tables, true);
  const r1 = persistLike({ supabase: sb, user: U, place: P("F"), wasLiked: false, liked: {}, disliked: {}, likedItems: {}, dislikedItems: {} });
  const w1 = await r1.write;
  ok(w1 && w1.error, "failed like write resolves {error}");
  const r2 = persistDislike({ supabase: sb, user: U, place: P("G"), wasDisliked: false, liked: {}, disliked: {}, likedItems: {}, dislikedItems: {} });
  const w2 = await r2.write;
  ok(w2 && w2.error, "failed dislike write resolves {error} (not swallowed)");
}
// 6. Like/dislike exclusivity at the persist layer.
{
  const tables = { likes: [], saved_places: [] };
  const sb = fakeSupabase(tables);
  const r = persistDislike({ supabase: sb, user: U, place: P("H"), wasDisliked: false, liked: { H: true }, disliked: {}, likedItems: { H: { place: P("H"), ts: 1 } }, dislikedItems: {} });
  await r.write;
  ok(!r.liked.H && r.disliked.H === true, "dislike clears like in the maps");
  ok(!tables.likes.some((x) => x.place_id === "H"), "dislike deletes any likes row");
}
// 7. Commerce mirror: one events row, same name as PostHog, no PII fields.
{
  const inserted = [];
  const sb = { from: () => ({ insert: (row) => { inserted.push(row); return Promise.resolve({}); } }) };
  recordCommerceClick({ place_id: "ChIJX", provider: "viator", merchant: "Viator", offer_id: "108117P1", surface: "detail_primary", content_id: "ChIJX" }, { supabase: sb, user: null });
  ok(inserted.length === 1 && inserted[0].action === "commerce_cta_clicked", "commerce click mirrors one commerce_cta_clicked events row");
  ok(inserted[0].place_id === "ChIJX" && inserted[0].meta.provider === "viator" && inserted[0].place_name === null, "mirror carries place/provider/surface only, no personal data");
}
console.log(`test-like-global-sync: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log("test-like-global-sync: OK — server likes load everywhere, pushes/deletes reconcile, failures surface for rollback");
