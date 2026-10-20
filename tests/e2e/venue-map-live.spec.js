import { test, expect } from "@playwright/test";
test.use({ screenshot: "only-on-failure", trace: "retain-on-failure" });
test.skip(!process.env.E2E_BASE_URL, "Live provider canary requires a deployed origin; offline fixture coverage runs in the guard suite.");

// Runs in the existing production canary, never against a mocked Apple SDK.
// Opening the existing server-rendered park card supplies its owned identity;
// unrelated APIs and Google endpoints are blocked to avoid paid enrichment.
test("live venue map returns parking and venue-local nearby pins", async ({ page }) => {
  test.setTimeout(90000);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (/googleapis\.com$|google-analytics\.com$|posthog\.com$/.test(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/places/map") {
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Unrelated enrichment disabled in live map canary"}' });
    }
    return route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Universal Studios Florida", exact: true }).first().click();
  const map = page.getByRole("region", { name: "Map and parking near Universal Studios Florida", exact: true });
  await expect(map).toBeVisible({ timeout: 20000 });
  await map.scrollIntoViewIfNeeded();
  const all = map.getByRole("button", { name: /^All places/ });
  await expect(all).toHaveText(/All places\s*[1-9]\d*/, { timeout: 25000 });
  await map.getByRole("button", { name: "Parking", exact: true }).click();
  await expect(map.locator(".wfev-parking-select").first()).toBeVisible({ timeout: 25000 });
  expect(await map.locator(".wfev-parking-select").count()).toBeGreaterThan(0);
  await expect(map.getByText(/Parking could not be loaded|No parking found/)).toHaveCount(0);
  const drive = new URL(await map.getByRole("link", { name: /^Drive to / }).first().getAttribute("href"));
  const walk = new URL(await map.getByRole("link", { name: /^Walk from / }).first().getAttribute("href"));
  expect(drive.hostname).toBe("maps.apple.com");
  expect(walk.hostname).toBe("maps.apple.com");
  expect(drive.searchParams.get("daddr")).toBe(walk.searchParams.get("saddr"));
  expect(walk.searchParams.get("daddr")).not.toBe(walk.searchParams.get("saddr"));
  await all.click();
  await expect(map.locator(".wfev-parking")).toHaveCount(0);
});
