// Gate: at most ONE interruptive surface per session, and every modal has
// real dialog semantics (July 2026 audit, Phase 5). Before this, a first
// visit could stack onboarding (z-90) over the giveaway (z-88) plus the
// install nudge, and no overlay had role="dialog", Escape, or focus
// management.
const { test, expect } = require("@playwright/test");

test("first visit: intro appears, and no second interruptive overlay stacks on or after it", async ({
  page,
}) => {
  await page.goto("/");
  // Intro fires at ~3.2s.
  const intro = page.getByRole("dialog", {
    name: /Welcome to Wayfind/i,
  });
  await expect(intro).toBeVisible({ timeout: 10_000 });
  // The giveaway timer fires at 30s (with retries at +20s). Wait past it and
  // assert the giveaway never appears — the intro claimed this session's one
  // interruption. (This is the audit's stacking scenario, replayed.)
  await page.waitForTimeout(33_000);
  await expect(page.getByRole("dialog", { name: /giveaway/i })).toHaveCount(0);
  // Exactly one dialog: the intro.
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("deep-link visit (?go=map): no intro greeting on top of the promised screen", async ({
  page,
}) => {
  await page.goto("/?go=map");
  await page.waitForTimeout(5_000); // past the 3.2s intro timer
  await expect(
    page.getByRole("dialog", { name: /Welcome to Wayfind/i })
  ).toHaveCount(0);
});

test("intro dialog: Escape closes it and focus returns", async ({ page }) => {
  await page.goto("/?intro=1");
  const intro = page.getByRole("dialog", { name: /Welcome to Wayfind/i });
  await expect(intro).toBeVisible({ timeout: 10_000 });
  // Dialog semantics: aria-modal and initial focus inside the dialog.
  await expect(intro).toHaveAttribute("aria-modal", "true");
  const focusInside = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return dlg && dlg.contains(document.activeElement);
  });
  expect(focusInside).toBe(true);
  await page.keyboard.press("Escape");
  await expect(intro).toHaveCount(0);
  // Focus restored somewhere sane (body or a real control, not lost to null).
  const focusOk = await page.evaluate(
    () => document.activeElement && document.activeElement.tagName !== "IFRAME"
  );
  expect(focusOk).toBe(true);
});

test("intro dialog: Tab is trapped inside the dialog", async ({ page }) => {
  await page.goto("/?intro=1");
  const intro = page.getByRole("dialog", { name: /Welcome to Wayfind/i });
  await expect(intro).toBeVisible({ timeout: 10_000 });
  // Tab a full lap: focus must stay inside the dialog every step.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg && dlg.contains(document.activeElement);
    });
    expect(inside, `Tab ${i + 1} escaped the dialog`).toBe(true);
  }
});

test("auth modal: opens with dialog semantics, Escape closes", async ({
  page,
}) => {
  await page.goto("/?go=favorites"); // deep link suppresses intro
  // v5.61 (audit P0): /?go=favorites signed-out auto-opens the auth dialog
  // (the personal screen is gated). The dialog's accessible name now comes
  // from its title (aria-labelledby), i.e. "Sign in to Wayfind".
  const auth = page.getByRole("dialog", { name: /Sign in|Create/i });
  await expect(auth).toBeVisible({ timeout: 15_000 });
  await expect(auth).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(auth).toHaveCount(0);
});
