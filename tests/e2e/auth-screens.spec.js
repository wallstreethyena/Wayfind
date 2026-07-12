// v5.50 audit remediation, Phase 1/9 — the P0 screen-level auth gate.
// A signed-out visitor must NOT reach the personal screens (Favorites,
// Itinerary): the screen content never renders, an AuthWall prompts sign-in,
// and the sign-in dialog opens. (The e2e build has no Supabase, so `user` is
// always null — exactly the signed-out case this asserts. The write-action
// gate is covered separately by favorites-auth.spec.js.)
const { test, expect } = require("@playwright/test");

test("signed-out: Favorites shows the sign-in wall, not the Saved screen", async ({ page }) => {
  await page.goto("/?go=favorites");
  // The AuthWall copy renders...
  await expect(page.getByText("Sign in to view your Favorites")).toBeVisible({ timeout: 15_000 });
  // ...and the actual Saved-screen content does NOT (no "YOUR LISTS" header).
  await expect(page.getByText("YOUR LISTS")).toHaveCount(0);
  // ...and the sign-in dialog auto-opens.
  await expect(page.getByRole("dialog", { name: /Sign in|create/i })).toBeVisible({ timeout: 10_000 });
});

test("signed-out: Itinerary shows the sign-in wall, not the Itinerary screen", async ({ page }) => {
  await page.goto("/?go=itinerary");
  await expect(page.getByText("Sign in to view your Itinerary")).toBeVisible({ timeout: 15_000 });
});

test("no local-persistence copy promises device storage on the bridge pages", async ({ page }) => {
  for (const path of ["/favorites", "/itinerary"]) {
    const html = await (await page.request.get(path)).text();
    expect(html).not.toMatch(/live on this device|persist locally|only on this phone/i);
    expect(html).toMatch(/sync across all your devices|sync them across/i);
  }
});

test("sign-in dialog is accessible: labelled inputs, semantic controls, visible close", async ({ page }) => {
  await page.goto("/?go=favorites");
  const dialog = page.getByRole("dialog", { name: /Sign in|create/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  // Labelled email + password inputs with correct autocomplete.
  const email = page.locator("#wf-auth-email");
  await expect(email).toHaveAttribute("autocomplete", "email");
  await expect(page.locator('label[for="wf-auth-email"]')).toBeVisible();
  await expect(page.locator("#wf-auth-password")).toHaveAttribute("type", "password");
  await expect(page.locator('label[for="wf-auth-password"]')).toBeVisible();
  // "Create one" is a real button, not a span.
  await expect(page.getByRole("button", { name: "Create one" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
  // Visible close button, >=44px.
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();
  const box = await close.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});
