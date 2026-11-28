const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

let Pick;
test.beforeAll(async () => {
  const root = path.resolve(__dirname, "../..");
  const { loadComponent } = await import(pathToFileURL(path.join(root, "scripts/lib/jsxLoad.mjs")).href);
  ({ default: Pick } = await loadComponent(path.join(root, "app/components/KeyWestOpeningPick.js"), root));
});

const actual = { city: "Key West", name: "A local activity", id: "place-first" };
const live = { citySlug: "key-west", places: { today: [{ ...actual, city: "Miami", id: "wrong" }, actual] } };
function render(change = {}) {
  return renderToStaticMarkup(createElement(Pick, { resolved: true, locName: "Key West, FL", live, ...change }));
}

for (const width of [320, 390, 1440]) {
  test(`the named local action fits the opening viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(`<main style="padding-top:250px">${render()}<section aria-label="Seasonal posters"></section></main>`);
    const link = page.getByRole("link", { name: "Key West pick · A local activity" });
    await expect(link).toBeInViewport({ ratio: 1 });
    await expect(link).toHaveAttribute("href", "/p/place-first");
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });
}

test("unresolved, stale, empty and out-of-market data add no action", () => {
  for (const props of [
    { resolved: false }, { locName: "Miami, FL" }, { live: null },
    { live: { ...live, citySlug: "miami" } }, { live: { ...live, places: { today: [] } } },
    { live: { ...live, places: { today: [{ ...actual, city: "Marathon" }] } } },
  ]) expect(render(props)).toBe("");
});
