// shell-route-contract — WHAT THE USER SEES, not what the source says.
//
// WHY THIS FILE EXISTS (2026-08-20). On the day this was written the owner hit
// three severe bugs in a row. The guard suite was 382/382 GREEN through all of
// them, because 343 of 420 guards read source code as TEXT and only 2 render the
// app in a browser before a deploy. A regex cannot see:
//
//   1. a Like control that navigates instead of liking,
//   2. a route that renders the app shell with its entire card surface missing,
//   3. an in-app "Home" tab that cannot get back to a populated homepage.
//
// Those are not code-shape facts. They are render facts, and they need a render.
//
// This spec is the runtime contract for every route that serves the app shell.
// It runs against the production BUILD locally (npm run test:e2e) and against
// the deployed site when E2E_BASE_URL is set — so the same assertions gate a
// deploy AND act as the production canary.
const { test, expect } = require("@playwright/test");

// A stable, real place: Siesta Beach, 27,786 reviews, the most-reviewed row in
// the inventory. Used as the /p/<id> deep-link fixture.
const PLACE_ID = "ChIJh8tXh-FBw4gR9kFzfZN_g60";

// Every route that renders app/home.js. lib/homeShellData.js is what feeds them;
// scripts/check-shell-routes.mjs proves the prop is PASSED, this proves the band
// actually PAINTS. Both halves are needed: the prop was present and the band
// still rendered nothing would be a different bug with the same symptom.
const SHELL_ROUTES = [
  { name: "homepage", url: "/" },
  { name: "place deep link", url: `/p/${PLACE_ID}` },
  { name: "place deep link with action", url: `/p/${PLACE_ID}?action=like` },
];

for (const route of SHELL_ROUTES) {
  test(`${route.name} renders a populated card surface`, async ({ page }) => {
    await page.goto(route.url, { waitUntil: "domcontentloaded" });
    // The rail band is server-data-gated (railMenu ? <DaypartRail/> : null), so
    // if the route forgot the prop this is zero and the page is a promo card and
    // a footer — exactly the screenshot the owner sent.
    const tiles = page.locator(".wf8-tile");
    await expect(tiles.first()).toBeVisible({ timeout: 20_000 });
    expect(await tiles.count()).toBeGreaterThan(0);

    // A shell with chrome and no content still "loads". Assert there is a real
    // page under it, not just a header and a promo.
    const text = await page.locator("body").innerText();
    expect(text.length).toBeGreaterThan(400);
  });
}

test("no place-card action is a navigation", async ({ page }) => {
  // The v8.28/v8.29 bug: IconicPlaceCard falls back to
  // <a href="/p/<id>?action=like"> when no handler is wired, so tapping Like
  // NAVIGATED. After hydration that anchor must not exist on any surface.
  for (const url of ["/", `/p/${PLACE_ID}`, "/guides/things-to-do-sarasota"]) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500); // let hydration swap <a> for <button>
    const actionAnchors = await page.locator('a[href*="?action="]').count();
    expect(actionAnchors, `${url} still ships a ?action= anchor behind a control`).toBe(0);
  }
});

test("Like registers in place and does not leave the page", async ({ page }) => {
  await page.goto("/guides/things-to-do-sarasota", { waitUntil: "domcontentloaded" });
  const like = page.locator("button.wf-place-card-like").first();
  await expect(like).toBeVisible({ timeout: 20_000 });

  const before = page.url();
  const pressedBefore = await like.getAttribute("aria-pressed");
  await like.click();
  await page.waitForTimeout(600);

  expect(page.url(), "clicking Like navigated — it must toggle in place").toBe(before);
  const pressedAfter = await like.getAttribute("aria-pressed");
  expect(pressedAfter, "aria-pressed did not flip — the like did not register").not.toBe(pressedBefore);
});
