// Gate: every deep link lands on its promised state (July 2026 audit,
// Phase 3). The bridge pages (/events, /map, …) exist for SEO and hand off
// to the app via /?go=<screen>; guide CTAs hand off via /?q=<place>. The
// audit found handoffs that consumed the param without completing the
// action — these tests assert the promised screen/search actually happens,
// not just that the homepage loaded.
//
// NOTE: npm run test:e2e builds with a placeholder Maps key so the app
// UI renders; remote Places calls 403. For search handoffs we therefore
// assert the outbound Places SearchText request carries the query — proof
// submitSearch ran with the right text — instead of asserting results.
const { test, expect } = require("@playwright/test");

// [route, marker unique to the destination screen]
// v5.61 (audit P0): Favorites + Itinerary are now personal screens gated
// behind auth — signed out (the e2e build has no session) they land on the
// AuthWall, NOT the Saved/Itinerary content. Events/Map/Coupons stay public.
const BRIDGES = [
  ["/events", "Concerts, sports, and shows worth building a night around"],
  ["/map", "Numbered by rank"],
  ["/coupons", "Real deals at great local places"],
  ["/favorites", "Sign in to view your Favorites"],
  ["/itinerary", "Sign in to view your Itinerary"],
];

for (const [route, marker] of BRIDGES) {
  test(`bridge ${route} lands on its screen, not the generic homepage`, async ({
    page,
  }) => {
    await page.goto(route);
    // GoScreen redirects to /?go=<screen>; the app consumes the param and (v5.78)
    // restores the screen's OWN path in the address bar — the view survives in the
    // URL for refresh/Back/share, instead of being stripped back to "/".
    await page.waitForURL((u) => u.pathname === route, { timeout: 15_000 });
    await expect(page.getByText(marker).first()).toBeVisible({
      timeout: 15_000,
    });
  });
}

// v5.78 (B1): the generalized reconciler must survive Back/Forward on a
// non-events tab too, not just land + share. /map is the cleanest case (renders
// without an auth wall). Mirrors the Events Back/Forward test in events.spec.js:
// same-document pushState entries are traversed via window.history.back/forward
// (page.goBack waits on a "load" that never fires for same-doc nav and flakes).
test("Back/Forward traverse the Map tab (the generalized non-events path)", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByText("Numbered by rank").first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe("/map");
  // Leave via bottom-nav Home -> the URL returns to "/".
  await page.locator('a[aria-label="Home"]').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  // Back returns to /map with the Map view showing.
  await page.evaluate(() => window.history.back());
  await expect.poll(() => new URL(page.url()).pathname).toBe("/map");
  await expect(page.getByText("Numbered by rank").first()).toBeVisible({ timeout: 15_000 });
  // Forward leaves again.
  await page.evaluate(() => window.history.forward());
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
});

test("direct /?go=favorites (signed out) shows the sign-in wall, not the Saved screen", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("Sign in to view your Favorites").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("YOUR LISTS")).toHaveCount(0);
});

function searchRequestWith(page, text) {
  return page.waitForRequest(
    (req) =>
      /places\.googleapis\.com/.test(req.url()) &&
      (req.postData() || "").toLowerCase().includes(text.toLowerCase()) ||
      (/maps\.googleapis\.com/.test(req.url()) &&
        req.url().toLowerCase().includes(encodeURIComponent(text.toLowerCase()))),
    { timeout: 20_000 }
  );
}

test("/?q=<query> actually runs the search after boot", async ({ page }) => {
  const searchFired = searchRequestWith(page, "Ringling");
  await page.goto("/?q=The%20Ringling");
  await searchFired;
  // The param must be consumed so refresh doesn't replay the search.
  await page.waitForURL((u) => !u.search.includes("q="), { timeout: 10_000 });
});

const GUIDE_CTAS = [
  ["/guides/things-to-do-sarasota", "Ringling"],
  ["/guides/st-armands-circle-restaurants", null], // pick name read from the page
];

test("guide CTA (Sarasota) hands off to a real search for the promised place", async ({
  page,
}) => {
  await page.goto("/guides/things-to-do-sarasota");
  const cta = page.getByRole("link", { name: "Open in Wayfind" }).first();
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute("href");
  const q = decodeURIComponent((href.match(/\?q=([^&]+)/) || [])[1] || "");
  expect(q.length).toBeGreaterThan(2);
  const searchFired = searchRequestWith(page, q.split(" ")[0]);
  await cta.click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
  await searchFired;
});

test("guide CTA (St. Armands) hands off to a real search for the promised place", async ({
  page,
}) => {
  await page.goto("/guides/st-armands-circle-restaurants");
  const cta = page.getByRole("link", { name: "Open in Wayfind" }).first();
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute("href");
  const q = decodeURIComponent((href.match(/\?q=([^&]+)/) || [])[1] || "");
  expect(q.length).toBeGreaterThan(2);
  const searchFired = searchRequestWith(page, q.split(" ")[0]);
  await cta.click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
  await searchFired;
});

test("/p/<id> share page resolves through to the app's place detail flow", async ({
  page,
}) => {
  // The share page must keep redirect behavior AND the app must try to
  // resolve the place by id (fetchPlaceById → Places details request).
  const detailFired = page.waitForRequest(
    (req) =>
      /googleapis\.com/.test(req.url()) &&
      /ChIJTESTPLACEID123/.test(req.url() + (req.postData() || "")),
    { timeout: 20_000 }
  );
  await page.goto("/p/ChIJTESTPLACEID123?t=Test%20Place");
  await page.waitForURL((u) => u.search.includes("place="), {
    timeout: 15_000,
  });
  await detailFired;
});
