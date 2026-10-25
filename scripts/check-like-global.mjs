// scripts/check-like-global.mjs — GLOBAL LIKE RULE enforcement.
// docs/proposals/global-like-rule.md. Fails the build when:
//  1. any file renders a place like/dislike thumb outside the proven shared
//     renderers (a new card variant copying the buttons is the historical
//     way this broke);
//  2. the standalone card store stops loading server likes, or its writes
//     stop surfacing errors for rollback;
//  3. the persist layer stops returning a real write promise for dislike.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { failures++; console.error("check-like-global: FAIL — " + m); };
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// 1. Proven shared renderers of place thumbs. Each entry must still route
// through the shared store/handlers named in `via`.
const RENDERERS = {
  "app/components/IconicPlaceCard.js": /cardActions|onLike/,
  "app/components/RailCard.js": /cardActions|onLike/,
  "app/components/ThingsToDoList.js": /cardActions|onLike/,
  "app/components/sheets/Detail.js": /toggleLike/,           // home shell handlers via ctx
  "app/components/sheets/Menu.js": /lunchActions\.toggleLike/, // lunch game via home actions
  "app/home.js": /function toggleLike/,                       // the shell's own PlaceCard
};
// Event thumbs (Like this event) rate the EVENT, not a place — different
// store (wf_event_signals), explicitly out of the place-like rule's scope.
const EXEMPT = new Set(["app/events/[city]/[slug]/EventActions.js"]);

const THUMB = /aria-label=[^\n]*(Like |Remove like|Not for me|Dislike )/;
function walk(dir, out = []) {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = dir + "/" + name;
    if (rel === "app/api") continue;
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (name.endsWith(".js")) out.push(rel);
  }
  return out;
}
const files = walk("app");
let thumbFiles = 0;
for (const f of files) {
  const src = strip(read(f));
  if (!THUMB.test(src)) continue;
  thumbFiles++;
  if (EXEMPT.has(f)) continue;
  const via = RENDERERS[f];
  if (!via) fail(f + " renders a place like/dislike thumb but is not a proven shared renderer — route it through IconicPlaceCard/RailCard or the shared store (lib/cardActions.js), then register it here");
  else if (!via.test(src)) fail(f + " is registered as a shared renderer but no longer routes through " + via);
}
if (thumbFiles < 5) fail("thumb probe found only " + thumbFiles + " files — the probe is blind (positive control: IconicPlaceCard must be found)");

// 2. The standalone store loads server likes and rolls back failed writes.
const cardActions = strip(read("lib/cardActions.js"));
if (!/syncReactionsWithServer\(/.test(cardActions)) fail("lib/cardActions.js no longer syncs server likes into the standalone card store");
if (!/syncServerLikes\(\)/.test(cardActions)) fail("lib/cardActions.js never triggers the server-like sync on sign-in");
if (!/guardWrite\(/.test(cardActions)) fail("lib/cardActions.js has no write-failure rollback (GLOBAL LIKE RULE 2c)");
if (!/showLikeFeedback\(/.test(cardActions)) fail("lib/cardActions.js has no friendly failure message (GLOBAL LIKE RULE 2c)");
if (!/track\("like", \{[^}]*on:/.test(cardActions) || !/track\("dislike", \{[^}]*on:/.test(cardActions)) fail("toggle-off no longer fires the existing like/dislike PostHog events with on:");
const likeSignal = strip(read("lib/likeSignal.js"));
if (!/export async function syncReactionsWithServer/.test(likeSignal)) fail("lib/likeSignal.js lost syncReactionsWithServer");
if (!/reconcileIdsSafe\(/.test(likeSignal)) fail("syncReactionsWithServer must reconcile via reconcileIdsSafe (empty local never wipes the server)");
// 3. Dislike writes are real promises, not fire-and-forget.
const dislikeBody = (likeSignal.match(/export function persistDislike[\s\S]*?\n\}/) || [""])[0];
if (/\.then\(\(\) => \{\}, \(\) => \{\}\)/.test(dislikeBody)) fail("persistDislike is back to fire-and-forget on a write");
if (!/write = Promise\.all/.test(dislikeBody)) fail("persistDislike no longer settles `write` from both halves");
const home = strip(read("app/home.js"));
if (!/watchLikeWrite\(/.test(home)) fail("app/home.js toggleLike/toggleDislike lost their write-failure rollback");

// Executed control: the reconcile the sync relies on must keep remote rows
// when local is empty, and must surface a local-only id as a push-up.
const { reconcileIdsSafe } = await import(pathToFileURL(path.join(ROOT, "lib/syncReconcile.js")).href);
const ctrl1 = reconcileIdsSafe(["A"], [], ["A"]);
if (ctrl1.deleteRemote.length || ctrl1.keep.join() !== "A") fail("executed control: reconcileIdsSafe wiped a remote row on empty local");
const ctrl2 = reconcileIdsSafe([], ["B"], []);
if (ctrl2.pushUp.join() !== "B") fail("executed control: reconcileIdsSafe lost a local-only push-up");

if (failures) { console.error(`check-like-global: FAIL — ${failures} problem(s)`); process.exit(1); }
console.log(`check-like-global: OK — ${thumbFiles} thumb-rendering files, all proven shared renderers; server sync + rollback wired in card store, persist layer and home shell`);
