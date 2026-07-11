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
const BRIDGES = [
  ["/events", "Concerts, sports, and shows worth building a night around"],
  ["/map", "Numbered by rank"],
  ["/coupons", "Real deals at great local places"],
  ["/favorites", "YOUR LISTS"],
  ["/itinerary", "Your trips"],
];

for (const [route, marker] of BRIDGES) {
  test(`bridge ${route} lands on its screen, not the generic homepage`, async ({
    page,
  }) => {
    await page.goto(route);
    // GoScreen redirects to /?go=<screen>, the app consumes the param.
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
    await expect(page.getByText(marker).first()).toBeVisible({
      timeout: 15_000,
    });
  });
}

test("direct /?go=favorites aliases to the Saved screen", async ({ page }) => {
  await page.goto("/?go=favorites");
  await expect(page.getByText("YOUR LISTS").first()).toBeVisible({
    timeout: 15_000,
  });
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
