// 2026-09-16 — /?exp=cur-today must open "Best things to do today" WITH picks.
//
// THE DEFECT (owner screenshot 2026-09-15; verified live after #1333): the
// deep link opened "0 curated picks / Not enough data for this filter right
// now" with ZERO /api/places/search requests. The ?exp= effect runs once on
// mount and called the openCurated of the FIRST render, whose `center` is
// null forever. searchNearbyPlaces(q, null) resolves [] without a request.
//
// This test seeds a fresh manual pin (so the app has a center within
// milliseconds, exactly like the owner's browser), mocks the search proxy to
// answer with three owned attractions, and asserts the sheet opens with those
// picks. On origin/main: the sheet opens with "0 curated picks" and the mock
// is never called. Here: "3 curated picks" and the mock is called with
// cat=attractions (the #1327 library fallback wire).
const { test, expect } = require("@playwright/test");

const PIN = { lat: 27.5859, lng: -82.4254, loc: "Parrish, FL", manual: true };

function place(id, name, lat, lng) {
  return {
    id, displayName: { text: name }, location: { latitude: lat, longitude: lng },
    rating: 4.7, userRatingCount: 812, types: ["tourist_attraction", "point_of_interest"],
    primaryType: "tourist_attraction", businessStatus: "OPERATIONAL", formattedAddress: "Parrish, FL",
  };
}

test("/?exp=cur-today opens Best things to do today with picks (not a blank sheet)", async ({ page }) => {
  await page.addInitScript((pin) => {
    try { localStorage.setItem("wf_center", JSON.stringify({ ...pin, ts: Date.now() })); } catch (e) {}
  }, PIN);

  const searchCalls = [];
  await page.route("**/api/places/search**", async (route) => {
    const u = new URL(route.request().url());
    searchCalls.push(Object.fromEntries(u.searchParams));
    const places = [
      place("p1", "Premier Escape Adventures", 27.59, -82.43),
      place("p2", "Parrish Community Park", 27.58, -82.42),
      place("p3", "Gamble Creek Farms", 27.60, -82.40),
    ];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places, cached: false, source: "inventory" }) });
  });

  await page.goto("/?exp=cur-today");
  await expect(page.getByText("Best things to do today").first()).toBeVisible({ timeout: 20_000 });

  // The sheet must carry the picks, never the honest-empty state.
  await expect(page.getByText(/[1-9]\d* curated picks/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Not enough data for this filter right now")).toHaveCount(0);
  await expect(page.getByText("Premier Escape Adventures").first()).toBeVisible({ timeout: 10_000 });

  // And it asked the proxy with the library category (#1327) — which is only
  // possible when openCurated ran with a real center.
  // Other homepage surfaces share the same proxy; look only at the tile's
  // own slot queries (lib/exploreMenu / home.js CURATED.today).
  const SLOT_Q = new Set(["top attractions tours and things to do", "theme parks", "shows theater live entertainment", "top rated attractions and local favorites"]);
  // When the already-loaded feed pool holds 3+ activities the tile answers
  // from the pool and fires NO slot searches (v5.89) — that is correct. When
  // it does fire them, every one must carry the library category and the
  // real pin, never a null center.
  const tileCalls = searchCalls.filter((c) => SLOT_Q.has(String(c.q || "").toLowerCase()));
  expect(tileCalls.every((c) => c.cat === "attractions")).toBe(true);
  expect(tileCalls.every((c) => Math.abs(Number(c.lat) - PIN.lat) < 0.02)).toBe(true);
  // Something on this page asked the proxy from the seeded pin (the app has a
  // real center); on origin/main the sheet above never opens at all.
  expect(searchCalls.some((c) => Math.abs(Number(c.lat) - PIN.lat) < 0.02)).toBe(true);
});
