// scripts/test-sync-inflight-merge.mjs — locks "a toggle made WHILE the sign-in
// sync is in flight is never dropped".
//
// The bug: app/home.js's sign-in sync snapshots local favorites / likes /
// disliked / shared, awaits the network (fetch, delete, upsert), then REPLACED
// local with the reconcile result computed from that stale snapshot. A save,
// like, dislike or share toggled during the awaits vanished locally (and a
// removal came back). Fix: lib/syncReconcile.mergeSinceSnapshot merges the
// reconcile result against the CURRENT local set at apply time.
//
// Three layers, strongest first:
//   1. EXECUTE mergeSinceSnapshot across the four cases.
//   2. EXECUTE the real reconcileColl + favorites setLists updater extracted
//      from home.js, with a mock network that toggles DURING the awaits.
//   3. Scoped structural count (comments stripped): exactly two call sites,
//      one in each apply step — with a positive control on the stripper.
import { readFileSync } from "fs";
import { reconcileIds, mergeSinceSnapshot } from "../lib/syncReconcile.js";

let pass = 0;
const fail = (m) => { console.error("test-sync-inflight-merge: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eqOrdered = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) fail(`${m}: got ${A} want ${B}`); pass++; };

// ── 1. helper behaviour ────────────────────────────────────────────────────
// add-during-flight kept
eqOrdered(mergeSinceSnapshot(["A", "B"], ["A", "B", "R"], ["A", "B", "N"]), ["A", "B", "R", "N"], "id added during flight is kept");
// remove-during-flight dropped (even though keep still has it)
eqOrdered(mergeSinceSnapshot(["A", "B"], ["A", "B"], ["A"]), ["A"], "id removed during flight is dropped from keep");
// remote-only kept (pulled from another device, never local)
eqOrdered(mergeSinceSnapshot(["A"], ["A", "R"], ["A"]), ["A", "R"], "remote-only id in keep is kept");
// no-change identity: current === snapshot -> result === keep
eqOrdered(mergeSinceSnapshot(["A", "B"], ["B", "A", "R"], ["A", "B"]), ["B", "A", "R"], "no in-flight change -> result is exactly keep");
// reconciler's deletions are NOT resurrected: X deleted on another device is in
// snapshot and current (unchanged locally) but not in keep -> stays gone.
eqOrdered(mergeSinceSnapshot(["W", "X"], ["W"], ["W", "X"]), ["W"], "no resurrection of an id the reconcile dropped");
// re-added during flight after being in deleteRemote: kept
eqOrdered(mergeSinceSnapshot(["W"], ["W"], ["W", "X"]), ["W", "X"], "id re-added during flight survives");
// null safety + de-dup
eqOrdered(mergeSinceSnapshot(null, null, null), [], "null-safe");
eqOrdered(mergeSinceSnapshot([], ["A"], ["A"]), ["A"], "no duplicate when an in-flight add is also in keep");

// ── source helpers ─────────────────────────────────────────────────────────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// Blank comments (keep strings intact — the extracted code must still run).
function stripComments(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) { out += c; if (c === "\\") { out += d || ""; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
}
// String-aware brace match from the first "{" at/after `from`.
function blockEnd(src, from) {
  let i = src.indexOf("{", from), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

// positive control: the stripper removes a commented call and keeps a real one
ok((stripComments('// mergeSinceSnapshot(a)\n/* mergeSinceSnapshot(b) */ x = "//"; mergeSinceSnapshot(c)').match(/mergeSinceSnapshot\(/g) || []).length === 1,
  "control: stripComments drops commented calls, keeps a real one, survives '//' in a string");

const code = stripComments(home);

// ── 2. execute the real apply steps ────────────────────────────────────────
// 2a. reconcileColl
const rcStart = code.indexOf("const reconcileColl = async");
ok(rcStart > 0, "home.js defines reconcileColl");
const rcEnd = blockEnd(code, code.indexOf("=>", rcStart));
ok(rcEnd > rcStart, "reconcileColl body extracted");
const rcSrc = code.slice(rcStart, rcEnd);

function makeLS(init) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
async function runColl({ local, base, remoteIds, during }) {
  const LS = makeLS({ wf_liked_items: local, wf_liked_base: base });
  const calls = [];
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // Query builder: every awaited network op gives the "user" a chance to toggle.
  const q = (op) => { const b = { eq: () => b, in: (_c, ids) => { calls.push([op, ids]); return b; }, then: (res, rej) => tick().then(() => { if (during) during(LS); }).then(() => ({ data: null })).then(res, rej) }; return b; };
  const supabase = { from: () => ({ delete: () => q("delete"), upsert: (rows) => { calls.push(["upsert", rows.map((r) => r.place_id)]); return q("upsert"); } }) };
  let items = null, bools = null;
  const mk = new Function("cancelled", "supabase", "user", "localStorage", "setLocal", "reconcileIds", "reconcileIdsSafe", "mergeSinceSnapshot",
    rcSrc + "\nreturn reconcileColl;");
  const setLocal = (k, v) => LS.setItem(k, v);
  const reconcileColl = mk(false, supabase, { id: "u1" }, LS, setLocal, reconcileIds, reconcileIds, mergeSinceSnapshot);
  await reconcileColl({ table: "likes", listName: null, storeKey: "wf_liked_items", baseKey: "wf_liked_base", boolKey: "wf_liked",
    setItems: (v) => { items = v; }, setBool: (v) => { bools = v; }, rows: remoteIds.map((id) => ({ place_id: id, place: { id } })), rowPlace: (r) => r.place });
  return { items, bools, store: JSON.parse(LS.getItem("wf_liked_items")), base: JSON.parse(LS.getItem("wf_liked_base")), calls };
}
const ent = (id) => ({ place: { id }, ts: 1 });
{
  // local has A (synced) + P (new, will be pushed); remote has A + R. During the
  // flight the user likes N and unlikes A.
  const r = await runColl({ local: { A: ent("A"), P: ent("P") }, base: ["A"], remoteIds: ["A", "R"],
    during: (LS) => { const s = JSON.parse(LS.getItem("wf_liked_items")); s.N = ent("N"); delete s.A; LS.setItem("wf_liked_items", JSON.stringify(s)); } });
  const ids = Object.keys(r.items).sort();
  ok(ids.includes("N"), "reconcileColl: like made during flight survives in state (" + ids + ")");
  ok(!ids.includes("A"), "reconcileColl: unlike made during flight stays gone (" + ids + ")");
  ok(ids.includes("R") && ids.includes("P"), "reconcileColl: remote-only + pushed ids kept (" + ids + ")");
  ok(Object.keys(r.store).sort().join() === ids.join(), "reconcileColl: persisted store matches state");
  ok(r.bools && r.bools.N === true && !r.bools.A, "reconcileColl: bool map follows the merged set");
  ok(!r.calls.some(([op, ids]) => op === "upsert" && ids.includes("N")), "reconcileColl: no extra push of the in-flight add (its toggle owns that write)");
}
{
  // no-change: nothing toggled during flight -> exactly the reconcile keep
  const r = await runColl({ local: { A: ent("A"), X: ent("X") }, base: ["A", "X"], remoteIds: ["A", "R"], during: null });
  ok(Object.keys(r.items).sort().join() === "A,R", "reconcileColl: no in-flight toggle -> keep exactly (X deleted elsewhere not resurrected)");
}

// 2b. favorites setLists updater
const favStart = code.indexOf("reconcileIds(favBase,");
ok(favStart > 0, "favorites reconcile located");
const favRegion = code.slice(favStart, rcStart);
const slStart = favRegion.indexOf("setLists((prev) =>");
ok(slStart > 0, "favorites apply uses a functional setLists");
const slEnd = blockEnd(favRegion, favRegion.indexOf("=>", slStart));
const updaterSrc = favRegion.slice(favRegion.indexOf("(prev) =>", slStart), slEnd);
{
  const P = (id, tag) => ({ id, tag });
  const favPlaces = [P("A", "local"), P("B", "local")];             // snapshot
  const rec = { keep: ["A", "B", "R"] };
  const pool = { A: P("A", "pool"), B: P("B", "pool"), R: P("R", "remote") };
  const updater = new Function("favPlaces", "rec", "pool", "mergeSinceSnapshot", "return (" + updaterSrc + ");")(favPlaces, rec, pool, mergeSinceSnapshot);
  // during flight: user saved N and removed B
  const prev = { other: 1, favorites: { id: "favorites", places: [P("A", "cur"), P("N", "cur")] } };
  const next = updater(prev);
  const got = next.favorites.places.map((p) => p.id + ":" + p.tag).join();
  ok(got === "A:cur,R:remote,N:cur", "favorites: in-flight save kept, in-flight removal dropped, remote kept, current objects preferred (got " + got + ")");
  ok(next.other === 1, "favorites: other lists preserved");
  const same = updater({ favorites: { places: favPlaces } }).favorites.places.map((p) => p.id).join();
  ok(same === "A,B,R", "favorites: no in-flight change -> keep exactly (got " + same + ")");
}

// ── 3. scoped structural count ─────────────────────────────────────────────
const calls = (code.match(/\bmergeSinceSnapshot\(/g) || []).length;
ok(calls === 2, "home.js calls mergeSinceSnapshot exactly twice (got " + calls + ")");
ok(/\bmergeSinceSnapshot\(/.test(updaterSrc), "one call is inside the favorites setLists updater");
ok(/\bmergeSinceSnapshot\(/.test(rcSrc), "one call is inside reconcileColl");
// the re-read must come AFTER the last await in reconcileColl
ok(rcSrc.lastIndexOf("await ") < rcSrc.search(/\bmergeSinceSnapshot\(/), "reconcileColl merges after its last await");
ok(/import \{[^}]*\bmergeSinceSnapshot\b[^}]*\} from "\.\.\/lib\/syncReconcile"/.test(code), "home.js imports mergeSinceSnapshot");

console.log(`test-sync-inflight-merge: OK — ${pass} assertions (helper x8, reconcileColl + favorites updater EXECUTED with toggles during flight, 2 scoped call sites)`);
