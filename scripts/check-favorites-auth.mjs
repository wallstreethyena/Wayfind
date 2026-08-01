// Guardrail: explicit reactions and clipping work immediately on-device;
// account-backed list/trip writes and every cloud sync remain authenticated.
// This fails the build if a local reaction is accidentally sign-in-walled, an
// account-backed mutation loses its gate, or Supabase ownership weakens.
//
// Why static checks, not a live test: (1) the 12 core write functions all
// live in app/home.js's PageInner and close over React state (user,
// authReady, setAuthOpen) that can't be unit-tested standalone without a
// component harness this project doesn't have; (2) the e2e suite builds
// with placeholder Maps/Supabase keys, so no live place/coupon data ever
// loads and most of these buttons never render a real card to click (see
// tests/e2e/favorites-auth.spec.js for what IS covered live — the one
// data-independent surface, custom-list creation). This check is the
// exhaustive, always-on complement: it inspects the real source, not a copy.
import { readFileSync } from "node:fs";
import { shellSrc } from "./lib/shellSrc.mjs";

const fail = (m) => { console.error("check-favorites-auth: FAIL — " + m); process.exit(1); };

const shell = shellSrc(); // home.js + kit + every extracted screen/sheet

// 1. requireAuth() itself exists, checks user + authReady, and opens the
//    sign-in modal — the single source of truth every write path must call.
if (!/function requireAuth\(/.test(shell)) fail("requireAuth() gate is missing from app/home.js");
{
  const start = shell.indexOf("function requireAuth(");
  const body = shell.slice(start, start + 400);
  if (!/if \(user\) return true;/.test(body)) fail("requireAuth() no longer checks `user` first");
  if (!/authReady/.test(body)) fail("requireAuth() no longer waits on authReady — a returning signed-in user could be wrongly prompted to sign in before their session resolves");
  if (!/setAuthOpen\(true\)/.test(body)) fail("requireAuth() no longer opens the sign-in modal (setAuthOpen(true))");
}

// 2a. These actions are deliberately local-first. They must never regress to
//     an auth wall, and each must preserve its first-party device write.
const LOCAL_FIRST = [
  ["quickSaveFavorite(p)", "function quickSaveFavorite(p) {", "function saveHookList", /localStorage\.setItem\("wayfind_lists"|setLists\(/],
  ["toggleLike(e, p)", "function toggleLike(e, p) {", "function toggleDislike", /localStorage\.setItem\("wf_liked"/],
  ["toggleDislike(e, p)", "function toggleDislike(e, p) {", "function toggleHookLike", /localStorage\.setItem\("wf_disliked"/],
  ["addShared(p)", "function addShared(p) {", "async function refreshOwnerPick", /localStorage\.setItem\("wf_shared_items"/],
  ["toggleSaveCoupon(c)", "function toggleSaveCoupon(c) {", "function copyCouponCode", /localStorage\.setItem\("wf_coupons"/],
];
for (const [label, sig, endSig, deviceWrite] of LOCAL_FIRST) {
  const at = shell.indexOf(sig), end = shell.indexOf(endSig, at + sig.length);
  if (at < 0 || end < 0) fail(`${label} not found in the home shell — check-favorites-auth's own fixtures are stale`);
  const body = shell.slice(at, end);
  if (body.includes("requireAuth(")) fail(`${label} is sign-in walled — explicit local actions must work before account creation`);
  if (!deviceWrite.test(body)) fail(`${label} lost its first-party device persistence`);
}

// 2b. Account-backed list/hook writes still call requireAuth() before state.
const CORE_GATES = [
  ["toggleHookLike(hookId)", "function toggleHookLike(hookId) {"],
  ["saveHookList(hook, places)", "function saveHookList(hook, places) {"],
  ["onHookHeart(hookId)", "function onHookHeart(hookId) {"],
  ["createList()", "function createList() {"],
  ["saveToList(listId)", "function saveToList(listId) {"],
  ["deleteList(id)", "function deleteList(id) {"],
  ["renameList()", "function renameList() {"],
];
for (const [label, sig] of CORE_GATES) {
  const at = shell.indexOf(sig);
  if (at < 0) fail(`${label} not found in the home shell — check-favorites-auth's own fixtures are stale`);
  // Look at the function body up to its first real statement, tolerating
  // toggleLike/toggleDislike's leading e.stopPropagation() line.
  const body = shell.slice(at + sig.length, at + sig.length + 200);
  if (!/^\s*(e\.stopPropagation\(\);\s*)?if \(!requireAuth\(/.test(body)) {
    fail(`${label} does not call requireAuth() as its first statement — a signed-out write could slip through`);
  }
}

// Local-first helpers may call cloud helpers, but those helpers must keep the
// authenticated boundary. Direct writes in like/save paths are also enclosed
// by the same `supabase && user` condition in home.js.
for (const sig of ["function svFolderUpsert", "function svFolderDelete"]) {
  const at = shell.indexOf(sig);
  const body = shell.slice(at, at + 360);
  if (at < 0 || !/supabase && user/.test(body)) fail(`${sig} no longer requires an authenticated user before cloud sync`);
}
for (const sig of ["function toggleLike", "function quickSaveFavorite"]) {
  const at = shell.indexOf(sig);
  const body = shell.slice(at, at + 2600);
  if (!/if \(supabase && user\)/.test(body)) fail(`${sig} no longer fences its direct Supabase writes behind an authenticated user`);
}

// 3. The itinerary/trip mutation buttons and the "+ New list" trigger — both
//    extracted components, both reached only via ctx.requireAuth.
const itinerary = readFileSync(new URL("../app/components/screens/Itinerary.js", import.meta.url), "utf8");
if (!/requireAuth\s*}\s*=\s*ctx/.test(itinerary) && !itinerary.includes("requireAuth } = ctx")) fail("Itinerary.js no longer destructures requireAuth from ctx");
const REQUIRE_AUTH_CALLS_IN_ITINERARY = (itinerary.match(/requireAuth\(/g) || []).length;
if (REQUIRE_AUTH_CALLS_IN_ITINERARY < 6) fail(`Itinerary.js has only ${REQUIRE_AUTH_CALLS_IN_ITINERARY} requireAuth() calls — expected at least 6 (setNote, movePlaceToTrip, moveItem x2, toggleVisited, addNote, move, removePlaceFromTrip)`);

const saved = readFileSync(new URL("../app/components/screens/Saved.js", import.meta.url), "utf8");
if (!saved.includes("requireAuth")) fail("Saved.js no longer gates the '+ New list' trigger with requireAuth");

// 4. Server-side layer: there is no Next.js API route for these writes (they
//    go straight from the client to Supabase), so RLS is the real server
//    boundary. Both schema files in the repo must require the caller's own
//    auth.uid() for every write to saved_places/likes — an unauthenticated
//    request has auth.uid() = null, which can never equal a real user_id.
for (const file of ["supabase/schema.sql", "supabase-schema.sql"]) {
  let sql;
  try { sql = readFileSync(new URL("../" + file, import.meta.url), "utf8"); } catch { continue; }
  for (const table of ["saved_places", "likes"]) {
    const idx = sql.indexOf("table " + table);
    if (idx < 0) continue; // table not declared in this file
    const chunk = sql.slice(idx, idx + 1600);
    if (!/auth\.uid\(\)\s*=\s*user_id/.test(chunk)) {
      fail(`${file}: no "auth.uid() = user_id" policy found near the ${table} table — writes may not be owner-gated server-side`);
    }
  }
  // 4b. S1 (2026-07-17 audit): the presence check above is not enough — a
  //     permissive "for select using (true)" READ policy alongside the owner
  //     write policy re-opens the exact leak the owner closed live (anon could
  //     read every user's rows). Forbid it on every user-identity table so the
  //     committed bootstrap can never reintroduce it. shared_lists / offers keep
  //     their intentional public read (share-by-code) and are NOT listed here.
  for (const table of ["saved_places", "likes", "profiles", "follows"]) {
    const re = new RegExp("on\\s+(?:public\\.)?" + table + "\\s+for\\s+select\\s+using\\s*\\(\\s*true\\s*\\)", "i");
    if (re.test(sql)) {
      fail(`${file}: "${table}" has a public-read policy (for select using (true)) — this re-opens the S1 leak; reads must be owner-scoped (auth.uid() = user_id) or dropped`);
    }
  }
}

console.log("check-favorites-auth: OK — 5 explicit actions persist on-device before sign-in; 7 account mutations, all cloud sync, itinerary/list triggers, and RLS remain owner-authenticated");
