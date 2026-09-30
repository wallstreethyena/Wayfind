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

// What a guide's body looks like since #1510: numbered <section class="wf-guide-pick">
// blocks, each with one GuideFigure photo. Shared by the assertions below so the
// guide contract lives in one place.
async function guidePickStats(page) {
  return await page.evaluate(() => {
    const picks = Array.from(document.querySelectorAll("section.wf-guide-pick"));
    return {
      picks: picks.length,
      withPhoto: picks.filter((s) => s.querySelector("figure img")).length,
      placeLinks: picks.filter((s) => s.querySelector('a[href^="/p/"]')).length,
      // The contract the redesign KEPT: a guide never ships a place card's
      // action controls (Like / Not-for-me / Save) inside a pick.
      cardControls: document.querySelectorAll("section.wf-guide-pick button.wf-place-card-like").length,
    };
  });
}

test("a guide shows editorial photos per pick, not place cards (#1510 contract)", async ({ page }) => {
  await page.goto("/guides/things-to-do-sarasota", { waitUntil: "domcontentloaded" });
  await expect(page.locator("section.wf-guide-pick").first()).toBeVisible({ timeout: 20_000 });
  const stats = await guidePickStats(page);
  expect(stats.picks, "guide rendered no numbered picks").toBeGreaterThanOrEqual(5);
  // Nearly every pick has a photo; a couple of picks may be photo-less
  // (typographic block, GVS-5), but the guide must not go text-only.
  expect(stats.withPhoto, "most picks must carry their editorial photo").toBeGreaterThanOrEqual(Math.ceil(stats.picks / 2));
  expect(stats.placeLinks, "picks must keep their real place links").toBeGreaterThan(0);
  expect(stats.cardControls, "a guide pick regrew embedded place-card controls — the owner replaced them with photos on 2026-09-24").toBe(0);
});

test("no place-card action is a navigation", async ({ page }) => {
  // The v8.28/v8.29 bug: IconicPlaceCard falls back to
  // <a href="/p/<id>?action=like"> when no handler is wired, so tapping Like
  // NAVIGATED. After hydration that anchor must not exist on any surface.
  for (const url of ["/", `/p/${PLACE_ID}`, "/guides/things-to-do-sarasota"]) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500); // let hydration swap <a> for <button>
    const actionAnchors = await page.locator('a[href*="?action="]').count();
    expect(actionAnchors, `${url} still ships a ?action= anchor behind a control`).toBe(0);
    // Zero anchors is meaningless if the surface never rendered anything to
    // check (an empty page trivially has zero action anchors). #1405 made every
    // legacy guide pick card-less on 2026-09-22 and this check kept passing on
    // an empty page until #1452 restored the cards. So each surface proves its
    // own positive control, and the control is the surface's CURRENT contract:
    //
    //   guides  — since #1510 (owner directive 2026-09-24, docs/design/
    //             guide-visual-standard.md) a guide shows one editorial photo
    //             per numbered pick INSTEAD OF an embedded place card. The
    //             control is therefore "the picks and their photos rendered",
    //             not "a Like button exists" (guides ship no Like buttons now).
    //   home    — its cards are client-rendered, so Like buttons exist only
    //             once they work; the control is that at least one is there.
    if (url.startsWith("/guides/")) {
      const picks = await guidePickStats(page);
      expect(picks.picks, `${url} rendered no numbered picks — the ?action= check above proved nothing`).toBeGreaterThan(0);
      expect(picks.withPhoto, `${url} rendered picks but none carries its editorial photo (GVS: one GuideFigure per pick)`).toBeGreaterThan(0);
    } else if (url === "/") {
      // The home rail paints after the fixed hydration sleep above on a cold
      // load, so wait for it rather than sampling once.
      await expect(page.locator("button.wf-place-card-like").first(),
        `${url} rendered no place cards at all — the ?action= check above proved nothing`)
        .toBeVisible({ timeout: 20_000 });
    }
  }
});

// SURFACE NOTE (2026-09-29). These two Like tests ran on
// /guides/things-to-do-sarasota because guide cards were prerendered, which is
// where the pre-hydration tap window lived. #1510 replaced guide cards with
// editorial photos on purpose (owner directive 2026-09-24), so the guide has no
// Like button to tap and both tests went red on the canary from 2026-09-25 while
// production was healthy. They now run on the homepage, the surface that still
// carries Like buttons (client-rendered: the button exists once it can work).
// If a prerendered card surface ships again, add it here; do NOT point these
// back at a route that has no Like button.
test("Like registers in place and does not leave the page", async ({ page }) => {
  // TAP IT THE INSTANT IT APPEARS. That is not an unfair test — it is what a
  // reader does, and until 2026-08-21 it was a silent no-op. Measured on
  // production with the connection throttled to a normal 1.5 Mbps phone:
  //
  //     Like button PAINTED at 1,186 ms   React handler ATTACHED at 7,572 ms
  //
  // Guide pages are prerendered, so their cards ship inside the HTML and are
  // tappable for six seconds before any bundle can hear them. The earlier
  // version of this test slept 600 ms and then 2,500 ms to get past that
  // window, which is how a real bug stayed invisible: the test was waiting out
  // the exact interval the bug lived in.
  //
  // The contract now has two halves, and both must hold:
  //   1. the tap is ACKNOWLEDGED immediately — aria-pressed flips on the tick
  //      it happens, wired or not (lib/cardActionAttrs.js's inline bridge),
  //   2. the tap is RECORDED — wf_liked is written once the page comes alive
  //      (lib/cardActions.js's useActionBridge replays the queue).
  // A tap that paints but never records is a lie; one that records but does not
  // paint is the complaint that started all of this.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const like = page.locator("button.wf-place-card-like").first();
  await expect(like).toBeVisible({ timeout: 20_000 });

  const before = page.url();
  const pressedBefore = await like.getAttribute("aria-pressed");
  const expected = pressedBefore === "true" ? "false" : "true";
  await like.click();

  await expect(like, "the thumb did not respond to the tap — a visible control that does nothing")
    .toHaveAttribute("aria-pressed", expected, { timeout: 5_000 });
  expect(page.url(), "clicking Like navigated — it must toggle in place").toBe(before);

  await expect
    .poll(async () => await page.evaluate(() => localStorage.getItem("wf_liked")), {
      timeout: 30_000,
      message: "wf_liked was never written — the thumb moved but nothing was recorded",
    })
    .toBeTruthy();

  // And the state the reader is looking at is the state that was stored.
  await expect(like, "the thumb disagrees with what was recorded")
    .toHaveAttribute("aria-pressed", expected, { timeout: 5_000 });
});

test("a tap on a card that has not hydrated yet is never lost", async ({ browser }) => {
  test.setTimeout(150_000);
  // The regression test for the six seconds above, driven at phone speed. Its
  // own context so no earlier test's localStorage can make this pass.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150,
      downloadThroughput: (1.5 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  } catch (e) {
    test.skip(true, "CDP throttling unavailable on this browser");
  }
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const like = page.locator("button.wf-place-card-like").first();
  // The homepage's cards are client-rendered, so on a throttled phone the
  // button appears only after the bundle AND the rail data land (the old guide
  // surface shipped it in the HTML). Give that whole chain room; the tap
  // assertions below stay tight.
  await like.waitFor({ state: "visible", timeout: 75_000 });
  await like.click();
  await expect(like, "throttled: the tap was not acknowledged")
    .toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
  await expect
    .poll(async () => await page.evaluate(() => localStorage.getItem("wf_liked")), {
      timeout: 45_000,
      message: "throttled: the tap was acknowledged and then dropped on the floor",
    })
    .toBeTruthy();
  await context.close();
});
