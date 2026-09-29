// scripts/check-like-store-writes.mjs — like/dislike storage + sign-in sync invariants.
//  1. no raw localStorage.setItem("wf_liked…"/"wf_disliked…") in home.js (quota-safe setLocal only)
//  2. both reconcile call sites use reconcileIdsSafe (empty local must never delete server rows)
//  3. dislikes reconcileColl call syncs the thumbs-down state (setBool: setDisliked)
import { readFileSync } from "node:fs";
import { reconcileIdsSafe } from "../lib/syncReconcile.js";

const fail = (m) => { console.error("check-like-store-writes: FAIL — " + m); process.exit(1); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/[^\n]*/g, "$1");

const home = strip(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));

const rawWrites = (src) => (src.match(/localStorage\.setItem\(\s*["'`]wf_(?:dis)?liked/g) || []).length;
const safeCalls = (src) => (src.match(/=\s*reconcileIdsSafe\(/g) || []).length;
const plainCalls = (src) => (src.match(/\breconcileIds\(/g) || []).length;

// positive controls: the probes must find a known positive, else they prove nothing
if (rawWrites('try { localStorage.setItem("wf_liked", "1"); } catch {}') !== 1) fail("control: raw-write probe is blind");
if (rawWrites('try { localStorage.setItem("wf_disliked_items", "1"); } catch {}') !== 1) fail("control: raw-write probe misses wf_disliked_items");
if (safeCalls("const rec = reconcileIdsSafe(a, b, c);") !== 1) fail("control: call probe is blind");
if (rawWrites('setLocal("wf_liked", "1")') !== 0) fail("control: probe fires on setLocal");

// executed (not just read): the wrapper home.js imports must not delete on an empty local store
{
  const r = reconcileIdsSafe(["A", "B"], [], ["A", "B"]);
  if (r.deleteRemote.length || r.pushUp.length || r.keep.join() !== "A,B") fail("reconcileIdsSafe deletes/pushes on empty local + non-empty base: " + JSON.stringify(r));
}

const rw = rawWrites(home);
if (rw !== 0) fail(`home.js has ${rw} raw localStorage.setItem("wf_liked…"/"wf_disliked…") call(s); use setLocal`);
const sc = safeCalls(home);
if (sc !== 2) fail(`expected exactly 2 reconcileIdsSafe( call sites (favorites + reconcileColl), found ${sc}`);
const pc = plainCalls(home);
if (pc !== 0) fail(`home.js still calls unsafe reconcileIds( ${pc} time(s)`);
if (!/import\s*\{[^}]*\breconcileIdsSafe\b[^}]*\}\s*from\s*["'][^"']*syncReconcile/.test(home)) fail("reconcileIdsSafe is not imported from syncReconcile");
if (!/import\s*\{[^}]*\bsetLocal\b[^}]*\}\s*from\s*["'][^"']*localStore/.test(home)) fail("setLocal is not imported from localStore");
if (!/reconcileColl\(\{[^\n]*listName:\s*"Disliked"[^\n]*setBool:\s*setDisliked\b[^\n]*boolKey:\s*"wf_disliked"/.test(home)) fail("dislikes reconcileColl call must pass setBool: setDisliked + boolKey wf_disliked");
if (!/reconcileColl\(\{[^\n]*table:\s*"likes"[^\n]*setBool:\s*setLiked\b[^\n]*boolKey:\s*"wf_liked"/.test(home)) fail("likes reconcileColl call must pass setBool: setLiked + boolKey wf_liked");
if (!/if\s*\(boolKey\)\s*\{\s*try\s*\{\s*setLocal\(boolKey,/.test(home)) fail("reconcileColl must persist the bool map via setLocal(boolKey, …)");

console.log("check-like-store-writes: OK — home.js: 0 raw wf_liked/wf_disliked setItem, 2 reconcileIdsSafe call sites, 0 reconcileIds, dislikes wired to setDisliked (probes positive-controlled)");
