// Gate: axe accessibility scan (July 2026 audit, Phase 6). Fails on any
// CRITICAL or SERIOUS violation — the audit's acceptance is criticals = 0,
// but everything serious found in July 2026 (contrast, keyboard access,
// link distinction) was fixed too, so hold that line.
const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

const PAGES = ["/", "/privacy", "/guides/things-to-do-sarasota"];

for (const path of PAGES) {
  test(`axe: ${path} has no critical or serious violations`, async ({
    page,
  }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape").catch(() => {}); // clear intro if it opened
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact)
    );
    const report = bad
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.help}\n` +
          v.nodes.slice(0, 5).map((n) => `   ${n.target.join(" ")}`).join("\n")
      )
      .join("\n");
    expect(bad, `axe violations on ${path}:\n${report}`).toEqual([]);
  });
}

test("keyboard journey: skip link → search → landmarks all reachable", async ({
  page,
}) => {
  await page.goto("/?go=favorites"); // deep link keeps the intro away
  // First Tab lands on the skip link.
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => document.activeElement.textContent);
  expect(skip).toContain("Skip to main content");
  await page.keyboard.press("Enter");
  // Landmarks exist: one main, one contentinfo (footer), an H1.
  await expect(page.locator("main#wf-main")).toHaveCount(1);
  await expect(page.locator("footer")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  // The search input is reachable and has an accessible name. v5.64 (audit
  // P4): it's now a combobox role (autocomplete), not a plain textbox.
  const search = page.getByRole("combobox", { name: "Search a place or city" });
  await expect(search).toBeVisible();
});
