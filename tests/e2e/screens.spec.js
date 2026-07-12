// Gate: the extracted screens (July 2026 decomposition, G1). Saved, Shared,
// Itinerary, Coupons, Surprise, and Events now ship in their own chunks
// behind next/dynamic({ ssr:false }) — these tests prove in-app navigation
// still lands on every extracted surface (the chunk loads AND renders) and
// that the extracted markup stays axe-clean. deeplinks.spec.js covers the
// same screens via URL handoffs; this spec drives them the way a user does,
// inside one running page, so a broken dynamic import can never ship.
//
// NOTE: npm run test:e2e builds with placeholder Maps/Supabase keys, so no
// place data loads. Every assertion here is on data-independent chrome
// (screen headers, empty states) — same convention as deeplinks.spec.js.
const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

// Boot on a deep link: it suppresses the intro, so no overlay races the test.
// v5.61 (audit P0): Favorites is now auth-gated (AuthWall signed out), so boot
// via the public Events screen and wait for its data-independent header.
async function boot(page, go = "events") {
  await page.goto(`/?go=${go}`);
  await expect(page.getByText("Events near you").first()).toBeVisible({ timeout: 15_000 });
  // A same-page marker: if any click causes a full navigation, this vanishes.
  await page.evaluate(() => { window.__wfSamePage = true; });
}

const NAV_SCREENS = [
  ["Events", "Concerts, sports, and shows worth building a night around"],
  ["Coupons", "Real deals at great local places"],
  // v5.61 (audit P0): Itinerary + Favorites are auth-gated; signed out they
  // render the AuthWall in-app (still same-page, no reload).
  ["Itinerary", "Sign in to view your Itinerary"],
  ["Favorites", "Sign in to view your Favorites"],
];

test("in-app bottom nav renders every extracted screen without a reload", async ({ page }) => {
  await boot(page);
  for (const [label, marker] of NAV_SCREENS) {
    await page.locator(`a[aria-label="${label}"]`).click();
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
  }
  expect(await page.evaluate(() => window.__wfSamePage)).toBe(true);
});

test("search input exposes combobox semantics (audit P4)", async ({ page }) => {
  await boot(page);
  const search = page.locator('input[aria-label="Search a place or city"]');
  await expect(search).toHaveAttribute("role", "combobox");
  await expect(search).toHaveAttribute("aria-autocomplete", "list");
  await expect(search).toHaveAttribute("aria-controls", "wf-suggestions");
  // Collapsed with no suggestions; the listbox isn't in the DOM yet.
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#wf-suggestions")).toHaveCount(0);
});

test("empty search opens the Surprise screen (dice route, no data needed)", async ({ page }) => {
  await boot(page);
  const search = page.locator('input[aria-label="Search a place or city"]');
  await search.click();
  await search.press("Enter"); // submitSearch("") → openSurprise()
  await expect(page.getByText(/Your (Morning|Afternoon|Evening) Pick/).first()).toBeVisible({ timeout: 15_000 });
  // No pick can load with placeholder keys — the honest empty state must show.
  await expect(page.getByText("Nothing to suggest right now").first()).toBeVisible({ timeout: 15_000 });
});

for (const [label, marker] of [["Favorites", "Sign in to view your Favorites"], ["Events", "Concerts, sports, and shows worth building a night around"]]) {
  test(`axe: extracted ${label} screen has no critical or serious violations`, async ({ page }) => {
    await boot(page);
    await page.locator(`a[aria-label="${label}"]`).click();
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => ["critical", "serious"].includes(v.impact));
    const report = bad
      .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n` + v.nodes.slice(0, 5).map((n) => `   ${n.target.join(" ")}`).join("\n"))
      .join("\n");
    expect(bad, `axe violations on ${label} screen:\n${report}`).toEqual([]);
  });
}
