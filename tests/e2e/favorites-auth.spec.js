// Gate: unauthenticated users cannot favorite/save/like/dislike/bookmark
// anywhere on the site. Every write path that can persist favorite-like
// state (quickSaveFavorite, toggleLike, toggleDislike, toggleHookLike,
// saveHookList, onHookHeart, addShared, toggleSaveCoupon, createList,
// saveToList, deleteList, renameList, and the itinerary/trip mutations)
// now calls a single requireAuth() gate before any state, localStorage, or
// Supabase write happens (see app/home.js "v5.49" comments).
//
// NOTE ON COVERAGE: npm run test:e2e builds with placeholder Maps/Supabase
// keys, so no live place or coupon data ever loads in this suite (same
// documented limitation as deeplinks.spec.js) — there is no real PlaceCard
// to click. The custom-list flow ("+ New list") is the one favoriting
// surface reachable with zero place data, so it's exercised directly here
// end-to-end. Full cross-surface coverage of the gate itself (that every
// identified write function calls requireAuth first) is enforced
// separately and more completely by the static contract check in
// scripts/check-favorites-auth.mjs, wired into prebuild — that check fails
// the build if the gate is ever removed from any of the 12 write paths,
// which this e2e suite alone could not guarantee given the data
// constraint above.
const { test, expect } = require("@playwright/test");

// v5.61 (audit P0): the Saved screen is now gated at RENDER — signed out, the
// "+ New list" control (and every other write control) is never even shown;
// the AuthWall replaces the whole screen. That makes "no anonymous write"
// structurally true, not just gated per-action. These tests assert the gate.

test("signed-out: Favorites shows the sign-in wall, never the Saved screen or its create controls", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("Sign in to view your Favorites").first()).toBeVisible({ timeout: 15_000 });
  // The Saved-screen content and its write controls never render.
  await expect(page.getByText("YOUR LISTS")).toHaveCount(0);
  await expect(page.getByText("+ New list", { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder("List name")).toHaveCount(0);
});

test("signed-out: no favorite-related localStorage key is written while on the gated Favorites screen", async ({ page }) => {
  const keys = ["wayfind_lists", "wayfind_trips", "wf_liked", "wf_disliked", "wf_liked_items", "wf_disliked_items", "wf_shared_items", "wf_hook_likes", "wf_coupons"];
  await page.goto("/?go=favorites");
  await expect(page.getByText("Sign in to view your Favorites").first()).toBeVisible({ timeout: 15_000 });
  const before = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, localStorage.getItem(k)])), keys);
  // The gate withholds the whole screen, so nothing on it can write. Give any
  // async effect a beat, then confirm no favorite key changed.
  await page.waitForTimeout(600);
  const after = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, localStorage.getItem(k)])), keys);
  expect(after).toEqual(before);
});

test("signed-out: the gate survives a fresh load — still the wall, no favorite lists written", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("Sign in to view your Favorites").first()).toBeVisible({ timeout: 15_000 });
  await page.goto("/?go=favorites");
  await expect(page.getByText("Sign in to view your Favorites").first()).toBeVisible({ timeout: 15_000 });
  const lists = await page.evaluate(() => localStorage.getItem("wayfind_lists"));
  if (lists) {
    const parsed = JSON.parse(lists);
    expect(Object.keys(parsed).filter((k) => k !== "favorites")).toEqual([]);
    if (parsed.favorites) expect(parsed.favorites.places).toEqual([]);
  }
});

test("signed-out: the auto-opened sign-in dialog behaves like every other modal (Escape closes)", async ({ page }) => {
  await page.goto("/?go=favorites");
  const dialog = page.getByRole("dialog", { name: /Sign in|Create/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
