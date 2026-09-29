// scripts/test-card-store-coherence.mjs — ONE TAB, TWO WRITERS, NO LOST SAVES.
//
// THE BUG (verified audit, 2026-09-29): the home page's sponsored place card
// saved / liked through lib/cardActions, a module-scope store that read
// wayfind_lists / wf_liked* ONCE at subscribe and re-read only on `focus` or
// `storage` — and `storage` never fires in the tab that wrote. So:
//
//   forward: home saves B after the store mounted; the card then saves C and
//            persistSave rewrites wayfind_lists from the stale snapshot — B is
//            gone locally, and the next signed-in load's sync reconcile deletes
//            it from Supabase too.
//   reverse: the card's save never reaches home's React state, so home's next
//            wholesale persist (the `lists` effect / toggleLike's map writes)
//            erases it.
//
// The fix, and what each section below CALLS (not greps):
//   1. lib/cardActions re-reads storage immediately before every write.
//   2. every card-store write announces a DELTA (STORE_CHANGE_EVENT); home
//      folds it into state with functional updaters (applyFavoritesChange /
//      applyReactionChange), so it composes with home's own queued updates.
//   3. SponsoredPlaceCard prefers a wired caller's handlers + state, and home
//      wires its own quickSaveFavorite / toggleLike / toggleDislike / share.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

register("./lib/nodeResolveHook.mjs", import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("test-card-store-coherence: FAIL — " + m); } };

// ── a fake browser: a real EventTarget as window, a Map as localStorage ──────
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const win = new EventTarget();
win.localStorage = localStorage;
win.location = { origin: "https://www.gowayfind.com", pathname: "/", search: "", href: "https://www.gowayfind.com/" };
win.navigator = { userAgent: "node-guard", webdriver: true };
win.__WF_ANALYTICS_SUPPRESSED = true;
globalThis.window = win;
globalThis.localStorage = localStorage;
if (!globalThis.navigator) { try { globalThis.navigator = win.navigator; } catch (e) {} }

const lib = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const likeSignal = await import(lib("lib/likeSignal.js"));
const cardActions = await import(lib("lib/cardActions.js"));
const { STORE_CHANGE_EVENT, applyFavoritesChange, applyReactionChange } = likeSignal;

const favIds = () => {
  const l = JSON.parse(localStorage.getItem("wayfind_lists") || "{}");
  return ((l.favorites && l.favorites.places) || []).map((p) => p.id);
};
const mapOf = (k) => JSON.parse(localStorage.getItem(k) || "{}");
const P = (id) => ({ id, name: "Place " + id });

const events = [];
win.addEventListener(STORE_CHANGE_EVENT, (ev) => events.push(ev.detail));

// ── 1. FORWARD: a card-store write never erases another writer's save ────────
{
  cardActions.toggleSave(P("A"));
  ok(favIds().includes("A"), "PROBE: toggleSave(A) through cardActions wrote A to wayfind_lists — without this every later assertion is vacuous");
  // Home saves B directly into the shared key (its lists effect), after the store mounted.
  const l = JSON.parse(localStorage.getItem("wayfind_lists"));
  l.favorites.places.push(P("B"));
  localStorage.setItem("wayfind_lists", JSON.stringify(l));
  cardActions.toggleSave(P("C"));
  const ids = favIds();
  ok(ids.includes("B"), "a save made elsewhere (B) survives the card store's next write — got " + JSON.stringify(ids));
  ok(ids.includes("A") && ids.includes("C"), "the card store's own saves (A, C) are both kept — got " + JSON.stringify(ids));
  // Toggling B from the card must UNSAVE it: wasSaved has to come from the fresh read.
  cardActions.toggleSave(P("B"));
  ok(!favIds().includes("B"), "toggling B through the card store unsaves it — its 'was saved' comes from storage now, not the mount-time snapshot");
  // A custom list home owns must also survive a card-store write.
  const l2 = JSON.parse(localStorage.getItem("wayfind_lists"));
  l2.trip_x = { id: "trip_x", name: "Trip", emoji: "🗺️", places: [P("T")] };
  localStorage.setItem("wayfind_lists", JSON.stringify(l2));
  cardActions.toggleSave(P("D"));
  const l3 = JSON.parse(localStorage.getItem("wayfind_lists"));
  ok(!!(l3.trip_x && l3.trip_x.places.length === 1), "a non-Favorites list written elsewhere survives a card-store save");
}

{
  cardActions.toggleLike(P("LA"));
  ok(!!mapOf("wf_liked").LA, "PROBE: toggleLike(LA) through cardActions wrote wf_liked");
  // Home likes LB directly (all four maps, as its toggleLike does).
  const liked = mapOf("wf_liked"); liked.LB = true; localStorage.setItem("wf_liked", JSON.stringify(liked));
  const items = mapOf("wf_liked_items"); items.LB = { place: P("LB"), ts: 1 }; localStorage.setItem("wf_liked_items", JSON.stringify(items));
  cardActions.toggleLike(P("LC"));
  ok(!!mapOf("wf_liked").LB, "a like made elsewhere (LB) survives the card store's next like");
  ok(!!mapOf("wf_liked_items").LB, "…and its wf_liked_items entry (the Liked list home renders) survives too");
  ok(!!mapOf("wf_liked").LA && !!mapOf("wf_liked").LC, "the card store's own likes are kept");

  const dis = mapOf("wf_disliked"); dis.DB = true; localStorage.setItem("wf_disliked", JSON.stringify(dis));
  const disItems = mapOf("wf_disliked_items"); disItems.DB = { place: P("DB"), ts: 1 }; localStorage.setItem("wf_disliked_items", JSON.stringify(disItems));
  cardActions.toggleDislike(P("DC"));
  ok(!!mapOf("wf_disliked").DB && !!mapOf("wf_disliked_items").DB, "a dislike made elsewhere (DB) survives the card store's next dislike");
  ok(!!mapOf("wf_disliked").DC, "the card store's own dislike lands");
  // A like made elsewhere, then a card-store like of something else, keeps the dislike map intact too.
  cardActions.toggleLike(P("LD"));
  ok(!!mapOf("wf_disliked").DB, "a card-store like does not erase an unrelated dislike made elsewhere");
}

// ── 2. THE ANNOUNCEMENT: every card-store write tells this tab, as a delta ───
{
  const kinds = events.map((d) => d.kind + ":" + d.id + ":" + (d.on ? 1 : 0));
  ok(kinds.includes("save:C:1"), "toggleSave announces { kind: save, id, on: true } on this tab — got " + JSON.stringify(kinds.slice(0, 6)));
  ok(kinds.includes("save:B:0"), "an unsave announces on: false");
  ok(kinds.includes("like:LC:1") && kinds.includes("dislike:DC:1"), "likes and dislikes announce too");
  const likeEv = events.find((d) => d.kind === "like" && d.id === "LC");
  ok(!!(likeEv && likeEv.item && likeEv.item.place && likeEv.item.place.id === "LC"), "a like announcement carries the exact wf_liked_items entry it wrote");
}

// ── 3. REVERSE: home folds the delta into state and its persist keeps it ─────
{
  // Home's state knows A; it has a queued (uncommitted) save of H. The card store then saves Z.
  store.clear();
  events.length = 0;
  let homeLists = { favorites: { id: "favorites", name: "Favorites", emoji: "❤️", places: [P("A")] } };
  localStorage.setItem("wayfind_lists", JSON.stringify(homeLists));
  const queued = [(prev) => ({ ...prev, favorites: { ...prev.favorites, places: [...prev.favorites.places, P("H")] } })];
  cardActions.toggleSave(P("Z"));
  const d = events.find((e) => e.kind === "save" && e.id === "Z");
  ok(!!d, "PROBE: the card store announced Z");
  // NEGATIVE CONTROL — the pre-fix world: home never hears of Z and persists its own state.
  let stale = homeLists; for (const u of queued) stale = u(stale);
  const staleIds = stale.favorites.places.map((p) => p.id);
  ok(!staleIds.includes("Z"), "CONTROL: without the delta, home's wholesale persist would drop Z — this is the loss the fix prevents (proves the probe can see it)");
  // The fix: the listener enqueues a functional update after home's own.
  queued.push((prev) => applyFavoritesChange(prev, d));
  for (const u of queued) homeLists = u(homeLists);
  localStorage.setItem("wayfind_lists", JSON.stringify(homeLists)); // home's lists effect
  const ids = favIds();
  ok(ids.includes("Z") && ids.includes("H") && ids.includes("A"), "home's next persist keeps the card's save AND its own queued save — got " + JSON.stringify(ids));
  ok(applyFavoritesChange(homeLists, d) === homeLists, "re-applying a delta that already holds is a no-op (same object, no re-render)");
  const off = applyFavoritesChange(homeLists, { kind: "save", id: "Z", on: false });
  ok(!off.favorites.places.some((p) => p.id === "Z") && off.favorites.places.some((p) => p.id === "H"), "an unsave delta removes only its own id");

  // Likes: home's four maps.
  let homeLiked = { HL: true }, homeDis = { X: true }, homeLikedItems = { HL: { place: P("HL"), ts: 1 } }, homeDisItems = { X: { place: P("X"), ts: 1 } };
  cardActions.toggleLike(P("X"));
  const ld = events.find((e) => e.kind === "like" && e.id === "X");
  ok(!!ld, "PROBE: the card store announced the like of X");
  homeLiked = applyReactionChange("liked", homeLiked, ld);
  homeDis = applyReactionChange("disliked", homeDis, ld);
  homeLikedItems = applyReactionChange("likedItems", homeLikedItems, ld);
  homeDisItems = applyReactionChange("dislikedItems", homeDisItems, ld);
  ok(homeLiked.X === true && homeLiked.HL === true, "home's liked map gains X and keeps its own HL");
  ok(!!homeLikedItems.X && !!homeLikedItems.HL, "home's liked-items map gains X and keeps HL");
  ok(!homeDis.X && !homeDisItems.X, "liking X clears it from home's dislike maps (same rule as persistLike)");
  const dd = { kind: "dislike", id: "HL", on: true, place: P("HL") };
  ok(!applyReactionChange("liked", homeLiked, dd).HL && applyReactionChange("disliked", homeDis, dd).HL === true, "a dislike delta clears the like and sets the dislike");
  ok(applyReactionChange("disliked", homeDis, { kind: "like", id: "Q", on: false }) === homeDis, "an un-like never touches the dislike map");
}

// ── 4. SponsoredPlaceCard prefers the WIRED caller (called, not grepped) ─────
{
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const mod = await loadComponent(path.join(ROOT, "app/components/SponsoredPlaceCard.js"), ROOT);
  const sponsoredActions = mod.sponsoredActions;
  ok(typeof sponsoredActions === "function", "SponsoredPlaceCard exports sponsoredActions (the handler resolution under test)");
  if (typeof sponsoredActions === "function") {
    const place = { id: "SP1", name: "Sponsor" };
    const calls = [];
    const wired = {
      saved: true, liked: false, disliked: true,
      onSave: (p) => calls.push("save:" + p.id),
      onLike: (e, p) => calls.push("like:" + p.id + ":" + (e && e.tag)),
      onDislike: (e, p) => calls.push("dislike:" + p.id),
      onShare: (p) => calls.push("share:" + p.id),
    };
    const fb = { hydrated: true, saved: {}, liked: { SP1: true }, disliked: {} };
    store.clear();
    const r = sponsoredActions({ hasStoreKey: true, actionPlace: place, wired, fb, content: {} });
    r.doSave(); r.doLike({ tag: "ev" }); r.doDislike({}); r.doShare();
    ok(calls.join(",") === "save:SP1,like:SP1:ev,dislike:SP1,share:SP1", "wired handlers receive the tap and the place — got " + calls.join(","));
    ok(favIds().length === 0 && Object.keys(mapOf("wf_liked")).length === 0, "a wired card never writes through the fallback store");
    ok(r.saved === true && r.liked === false && r.disliked === true, "a wired card paints the CALLER's state, not the fallback snapshot");
    // POSITIVE CONTROL: unwired, the same resolution falls back to the store and it writes.
    const u = sponsoredActions({ hasStoreKey: true, actionPlace: place, wired: {}, fb, content: {} });
    ok(typeof u.doSave === "function" && u.liked === true, "CONTROL: unwired, the fallback store's handler and state are used");
    u.doSave();
    ok(favIds().includes("SP1"), "CONTROL: the unwired fallback save really writes wayfind_lists (proves the 'never writes' assertion can fail)");
  }
}

// ── 5. home.js wires its OWN handlers and listens for the delta (scoped) ─────
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
  // Delimit the <SponsoredPlaceCard ... /> element by brace depth, not by the first "/>".
  const elementAt = (src, i) => {
    let depth = 0;
    for (let j = i + 1; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && c === "/" && src[j + 1] === ">") return src.slice(i, j + 2);
      else if (depth === 0 && c === ">") return src.slice(i, j + 1);
    }
    return null;
  };
  const at = home.indexOf("<SponsoredPlaceCard");
  ok(at >= 0, "PROBE: home.js renders <SponsoredPlaceCard>");
  const el = at >= 0 ? elementAt(home, at) : null;
  ok(!!el && el.length > 40, "the <SponsoredPlaceCard> element could be delimited");
  const n = (home.match(/<SponsoredPlaceCard\b/g) || []).length;
  ok(n === 1, "exactly one <SponsoredPlaceCard> render site (a second one would need this wiring too) — found " + n);
  if (el) {
    ok(/\bonSave=\{[^]*?quickSaveFavorite\(/.test(el), "home passes onSave → quickSaveFavorite (its own Favorites writer)");
    ok(/\bonLike=\{[^]*?\btoggleLike\(/.test(el), "home passes onLike → toggleLike");
    ok(/\bonDislike=\{[^]*?\btoggleDislike\(/.test(el), "home passes onDislike → toggleDislike");
    ok(/\bonShare=\{[^]*?\bshareLink\(/.test(el), "home passes onShare → shareLink");
    ok(/\bsaved=\{[^}]*isSaved\(/.test(el), "home passes saved from isSaved()");
    ok(/\bliked=\{[^}]*\bliked\[/.test(el) && /\bdisliked=\{[^}]*\bdisliked\[/.test(el), "home passes liked / disliked from its own maps");
    // Negative control on the scoped slice: a prop that is NOT passed must read absent.
    ok(!/\bonItinerary=/.test(el), "CONTROL: the scoped slice does not over-match props that are not on the element");
  }
  ok(/window\.addEventListener\(\s*STORE_CHANGE_EVENT\s*,/.test(home), "home listens for STORE_CHANGE_EVENT on window");
  ok(/setLists\(\s*\(prev\)\s*=>\s*applyFavoritesChange\(\s*prev\s*,/.test(home), "home folds a save delta through a FUNCTIONAL setLists updater");
  for (const [setter, which] of [["setLiked", "liked"], ["setDisliked", "disliked"], ["setLikedItems", "likedItems"], ["setDislikedItems", "dislikedItems"]]) {
    ok(new RegExp(setter + "\\(\\s*\\(prev\\)\\s*=>\\s*applyReactionChange\\(\\s*\"" + which + "\"\\s*,\\s*prev\\s*,").test(home), `home folds a like/dislike delta into ${which} through a functional updater`);
  }
  ok(/import\s*\{[^}]*\bSTORE_CHANGE_EVENT\b[^}]*\}\s*from\s*["']\.\.\/lib\/likeSignal["']/.test(home), "home imports STORE_CHANGE_EVENT from lib/likeSignal (the name the card store dispatches)");
}

console.log(`test-card-store-coherence: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log("test-card-store-coherence: OK — card-store writes re-read first, announce a delta, home folds it in; sponsored card uses home's own hands");
process.exit(0);
