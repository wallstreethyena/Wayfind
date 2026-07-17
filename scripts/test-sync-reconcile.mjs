// scripts/test-sync-reconcile.mjs — locks the F1 cross-device sync reconciler.
// The repro that MUST hold: device A removes X (deletes from cloud); device B,
// which still has X locally, must NOT resurrect it on its next sync.
import { reconcileIds } from "../lib/syncReconcile.js";

let pass = 0;
const fail = (m) => { console.error("test-sync-reconcile: FAIL — " + m); process.exit(1); };
const eq = (a, b, m) => { const A = JSON.stringify([...a].sort()), B = JSON.stringify([...b].sort()); if (A !== B) fail(`${m}: got ${A} want ${B}`); pass++; };

// 1) THE REPRO — B still has X, base had X, cloud no longer has X (A deleted it).
{
  const r = reconcileIds(["W", "X"], ["W", "X"], ["W"]);
  eq(r.keep, ["W"], "B drops X (deleted on another device) — no resurrection");
  eq(r.pushUp, [], "B pushes nothing (X is not a new local addition)");
  eq(r.deleteRemote, [], "B deletes nothing from cloud (it didn't delete X)");
}
// 2) A's side — A deleted X locally; propagate to cloud.
{
  const r = reconcileIds(["W", "X"], ["W"], ["W", "X"]);
  eq(r.deleteRemote, ["X"], "A propagates its deletion to the cloud");
  eq(r.keep, ["W"], "A keeps only W");
}
// 3) Offline addition survives — B added Y locally while cloud lost X.
{
  const r = reconcileIds(["W", "X"], ["W", "X", "Y"], ["W"]);
  eq(r.pushUp, ["Y"], "genuinely new local addition Y is uploaded");
  eq(r.keep, ["W", "Y"], "Y kept, X dropped — no data loss AND no resurrection");
}
// 4) First-ever sync (empty base) — migrate all local up, union with cloud.
{
  const r = reconcileIds([], ["W", "X"], ["Z"]);
  eq(r.pushUp, ["W", "X"], "first sync migrates all local up");
  eq(r.deleteRemote, [], "first sync infers no deletions");
  eq(r.keep, ["Z", "W", "X"], "first sync unions cloud + local");
}
// 5) Re-add after delete — user deleted X then saved it again; it must stick.
{
  const r = reconcileIds(["W"], ["W", "X"], ["W"]);
  eq(r.pushUp, ["X"], "re-added X is treated as a new addition and uploaded");
  eq(r.keep, ["W", "X"], "re-added X is kept");
}
// 6) Added elsewhere — cloud gained Z (added on another device), pull it in.
{
  const r = reconcileIds(["W"], ["W"], ["W", "Z"]);
  eq(r.keep, ["W", "Z"], "Z added on another device is pulled in");
  eq(r.pushUp, [], "nothing to push");
}
// 7) Null / empty safety.
{
  const r = reconcileIds(null, null, null);
  eq(r.keep, [], "null-safe keep"); eq(r.pushUp, [], "null-safe pushUp"); eq(r.deleteRemote, [], "null-safe deleteRemote");
}
// 8) No duplicates in keep even if an id is in both remote and pushUp.
{
  const r = reconcileIds([], ["X"], ["X"]);
  eq(r.keep, ["X"], "keep de-duplicates an id present in both remote and local-new");
}

// 9) WIRING — home.js favorites sync actually uses the reconciler + persists a base.
import { readFileSync } from "fs";
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const w = (c, m) => { if (!c) fail(m); pass++; };
w(/import \{ reconcileIds \} from "\.\.\/lib\/syncReconcile"/.test(home), "home.js imports reconcileIds");
w(/reconcileIds\(favBase,/.test(home), "favorites sync reconciles against a base snapshot");
w(/localStorage\.setItem\("wf_fav_base"/.test(home), "favorites sync persists the base snapshot (wf_fav_base)");
w(/saved_places"\)\.delete\(\)[\s\S]{0,120}rec\.deleteRemote/.test(home), "favorites sync propagates local deletions to the cloud");
// The old unconditional favorites push-up (upsert ALL local before pulling) is gone.
w(!/const favPlaces = \(lists\.favorites && lists\.favorites\.places\) \|\| \[\];\s*\n\s*if \(favPlaces\.length\) \{\s*\n\s*await supabase\.from\("saved_places"\)\.upsert\(/.test(home),
  "the old unconditional favorites push-up (resurrection source) is removed");

console.log(`test-sync-reconcile: OK — ${pass} assertions (A-deletes -> B never resurrects; offline adds survive; first-sync migrates; home.js wired)`);
