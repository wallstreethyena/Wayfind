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

test("signed-out: '+ New list' opens the sign-in prompt, not the create-list sheet", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("YOUR LISTS").first()).toBeVisible({ timeout: 15_000 });

  const before = await page.evaluate(() => localStorage.getItem("wayfind_lists"));

  await page.getByText("+ New list", { exact: true }).click();

  // The auth dialog opens...
  const authDialog = page.getByRole("dialog", { name: /Sign in or create/i });
  await expect(authDialog).toBeVisible({ timeout: 10_000 });
  // ...and the create-list sheet (a "List name" input) never appears.
  await expect(page.getByPlaceholder("List name")).toHaveCount(0);

  // No new list was persisted.
  const after = await page.evaluate(() => localStorage.getItem("wayfind_lists"));
  expect(after).toBe(before);
});

test("signed-out: no favorite-related localStorage key is ever written from the Saved screen", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("YOUR LISTS").first()).toBeVisible({ timeout: 15_000 });

  const keys = ["wayfind_lists", "wayfind_trips", "wf_liked", "wf_disliked", "wf_liked_items", "wf_disliked_items", "wf_shared_items", "wf_hook_likes", "wf_coupons"];
  const before = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, localStorage.getItem(k)])), keys);

  // Tap every reachable write-adjacent control on this screen while signed out.
  await page.getByText("+ New list", { exact: true }).click();
  await page.keyboard.press("Escape"); // close whatever opened (the auth dialog)

  const after = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, localStorage.getItem(k)])), keys);
  expect(after).toEqual(before);
});

test("signed-out: favorite-related localStorage state does not appear after a full page refresh", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("YOUR LISTS").first()).toBeVisible({ timeout: 15_000 });
  await page.getByText("+ New list", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Sign in or create/i })).toBeVisible({ timeout: 10_000 });

  // Not page.reload(): the ?go=favorites param is consumed and stripped via
  // history.replaceState on first load (same pattern deeplinks.spec.js
  // documents), so reloading the now-bare "/" would land on the default
  // screen instead of Saved. Re-navigate with the deep link instead — the
  // point of this test is a fresh load, which this still is.
  await page.goto("/?go=favorites");
  await expect(page.getByText("YOUR LISTS").first()).toBeVisible({ timeout: 15_000 });

  const lists = await page.evaluate(() => localStorage.getItem("wayfind_lists"));
  // Either never written, or (if some other flow wrote the untouched default
  // shape) contains no list beyond the built-in empty "Favorites" — never a
  // list this test's aborted create attempt could have produced.
  if (lists) {
    const parsed = JSON.parse(lists);
    expect(Object.keys(parsed).filter((k) => k !== "favorites")).toEqual([]);
    expect(parsed.favorites.places).toEqual([]);
  }
});

test("signed-out: the auth dialog opened by a favorite control behaves like every other modal (Escape closes, no stray state)", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("YOUR LISTS").first()).toBeVisible({ timeout: 15_000 });
  await page.getByText("+ New list", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Sign in or create/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
