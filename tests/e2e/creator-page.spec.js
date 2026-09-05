// Gate: the creator chain, end to end, in a browser (v8.96).
//
// homepage tile -> /creators/cindy.selects -> the page renders -> the map
// renders when inventory resolves -> a PIN opens a legitimate Wayfind place.
//
// WHY THIS EXISTS AS A BROWSER TEST AND NOT A SOURCE GUARD. Every link in that
// chain is already asserted statically somewhere — check-creator-tile-navigates
// reads the branch order in tileClick, test-creator-pages renders the page in
// node — and none of that proves a reader can get from the homepage to a place.
// The v8.94 bug was exactly this shape: the page was live and returning 200 the
// whole time, the tile was a real <a href>, and the tap still went nowhere,
// because a preventDefault four lines away ate it.
//
// AND IT DOES NOT READ BUNDLE TEXT. During v8.94's verification the homepage's
// initial chunks were swept for "opensPage" and it was not there — which proved
// nothing, because lib/rails.js ships in a lazily-fetched chunk. The positive
// control ("Your Next Coffee Spot", which certainly exists) came back empty
// too, and that is the only reason the empty sweep was not read as a bug. The
// click is the evidence. This file never greps a chunk.
//
// 390 x 844 comes from playwright.config.js, which is mobile-first for the whole
// suite — the viewport this chain was production-verified at.
//
// TWO MODES, and the difference is stated rather than hidden:
//   · LIVE (E2E_BASE_URL=https://www.gowayfind.com) — everything below is
//     REQUIRED. This is the post-deploy check.
//   · local (npm run test:e2e) — the build has placeholder Supabase env, so
//     wf_inventory returns nothing and CreatorMapPanel correctly renders
//     nothing. The map assertions cannot run. They are skipped ONLY after a
//     positive control confirms the page itself rendered, so "the map is
//     missing" can never be mistaken for "the page is broken".
const { test, expect } = require("@playwright/test");

const LIVE = !!process.env.E2E_BASE_URL;
const HANDLE = "cindy.selects";
const PATH = `/creators/${HANDLE}`;
// A Google place id: the opaque token wf_inventory keys on. Asserted as a
// SHAPE, never as a specific id — pinning one id would make this test a
// second, drift-prone copy of the curation file.
const PLACE_ID = /^\/p\/[A-Za-z0-9_-]{10,}$/;

test("the homepage creator tile navigates to the creator page", async ({ page }) => {
  await page.goto("/");
  const tile = page.locator(`a.wf8-tlink[href="${PATH}"]`);
  // The daypart rail is lazy and its pool is fetched, so the tile can take a
  // moment to mount. It must still be a REAL anchor when it does — that is what
  // a crawler, a shared card and a middle-click all depend on.
  try {
    await tile.first().waitFor({ state: "attached", timeout: 30_000 });
  } catch (e) {
    if (LIVE) throw new Error(`the @${HANDLE} tile never mounted on the homepage — the rail did not render its creator tile`);
    test.skip(true, "local build: the daypart rail has no pool without Supabase env, so the tile does not mount");
    return;
  }
  await tile.first().scrollIntoViewIfNeeded();
  await tile.first().click();
  // A full navigation, not a drop opening in place. Asserting the URL is the
  // whole point: the bug this replaces left the reader on "/" with a shelf open.
  await page.waitForURL((u) => u.pathname === PATH, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`@${HANDLE}`, { timeout: 15_000 });
});

test("the creator page renders its own content, with or without a map", async ({ page }) => {
  await page.goto(PATH);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`@${HANDLE}`, { timeout: 20_000 });
  // The share control is the creator's side of the deal and must survive a
  // database that is down — it is not part of the map.
  await expect(page.getByRole("button", { name: /Share this page/i })).toBeVisible();
  // The independence disclosure is a legal requirement on every one of these
  // pages (lib/creatorRights.js), so it is asserted here too rather than only
  // in the node render.
  await expect(page.getByText(/not affiliated with Wayfind/i).first()).toBeVisible();

  // Every spot card offers a way into the place. These hrefs are server-rendered
  // and do not depend on the map, so they are required in BOTH modes.
  const opens = page.locator(`a[href^="/p/"]`);
  const count = await opens.count();
  expect(count, "the page offers no way into any place — every spot card should link into Wayfind").toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const href = await opens.nth(i).getAttribute("href");
    expect(href, `spot link ${i} is not a place deep link: ${href}`).toMatch(PLACE_ID);
  }
});

test("a pin on the creator's map opens a legitimate Wayfind place", async ({ page }) => {
  await page.goto(PATH);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`@${HANDLE}`, { timeout: 20_000 });

  const grid = page.locator(".wfcm-grid");
  const hasMap = await grid.count();
  if (!hasMap) {
    // POSITIVE CONTROL FIRST. The page rendered (the h1 above), so an absent
    // map means creatorMapRows() returned nothing — the documented fail-closed
    // path — and not a page that failed to load. Without this the skip below
    // would quietly cover a real regression.
    if (LIVE) throw new Error("the creator map is absent on production, where wf_inventory does resolve — the panel should only render nothing when the join returns nothing");
    test.skip(true, "local build: wf_inventory returns nothing with placeholder env, so the panel correctly renders nothing");
    return;
  }

  // The sidebar counts what the map draws. "All places" is the row that must
  // always exist, and its number is the pin count the reader can act on.
  const all = page.locator('.wfcm-row', { hasText: "All places" }).first();
  await expect(all).toBeVisible();
  const total = Number((await all.textContent()).replace(/\D+/g, ""));
  expect(total, "the map claims zero places while still rendering its frame").toBeGreaterThan(0);

  // The map must actually DRAW. A container with no canvas is the silent blank
  // map from MapView's own header — the failure that looks like success.
  await expect(page.locator(".wfcm-map canvas").first()).toBeVisible({ timeout: 30_000 });

  // Narrow to the smallest category so the camera frames few pins, then find
  // one. maplibre draws places into a symbol LAYER, not DOM nodes, so there is
  // no selector for a pin — the tap has to be a real tap on the canvas.
  //
  // The probe is bounded and its failure is LOUD. It sweeps a small band above
  // the map centre because fitBounds centres the pins and icon-anchor is
  // "bottom" (the icon body sits above its coordinate, MapView v7.16). If no
  // point hits, this FAILS with that message — it never falls through to a pass,
  // which is the only thing that would make a pixel probe worse than no test.
  const rows = page.locator(".wfcm-row");
  const n = await rows.count();
  let smallest = null, smallestN = Infinity;
  for (let i = 0; i < n; i++) {
    const t = (await rows.nth(i).textContent()) || "";
    if (/All places/.test(t)) continue;
    const v = Number(t.replace(/\D+/g, ""));
    if (v > 0 && v < smallestN) { smallestN = v; smallest = rows.nth(i); }
  }
  if (smallest) {
    await smallest.click();
    await page.waitForTimeout(1200);
  }

  // SCROLL IT INTO VIEW FIRST. page.mouse works in VIEWPORT coordinates and so
  // does boundingBox(), so on a 390x844 phone — where the map sits below the
  // fold under the hero, the summary and the stat row — the computed centre was
  // at y~910 and every click in the probe below landed on nothing. The first
  // run of this test failed for exactly that reason and it looked identical to
  // "tapping a pin leads nowhere", which is the whole hazard of a pixel probe:
  // a miss and a real defect produce the same red. Scrolling first, then
  // re-reading the box, is what separates them.
  const mapEl = page.locator(".wfcm-map").first();
  await mapEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await mapEl.boundingBox();
  expect(box, "the map has no layout box").toBeTruthy();
  const vp = page.viewportSize();
  expect(
    box.y + box.height / 2 < vp.height && box.y + box.height / 2 > 0,
    `the map centre is outside the viewport (y=${Math.round(box.y + box.height / 2)} of ${vp.height}) — the probe below would click on nothing and read as a missing pin`,
  ).toBeTruthy();

  // THE PROBE SWEEPS THE WHOLE VISIBLE MAP, not a guessed band around the
  // centre. The first version swept dy -56..+8 in 8px steps on the assumption
  // that fitBounds puts the pin near the middle; a diagnostic run against
  // production found the single Culture pin at (178, 621) with the map centre
  // at (195, 674) — 53px high and 17px left, and the 8px grid straddled it by
  // one pixel on each axis. Two red runs, neither of them a product defect.
  //
  // So: 10px grid over the visible box, top-down because icon-anchor is
  // "bottom" and pins therefore sit ABOVE their coordinate, first hit wins. It
  // exits the moment the info bar appears, so the common case is fast and the
  // worst case is still bounded by the box.
  const top = Math.max(2, box.y);
  const bottom = Math.min(box.y + box.height, vp.height - 2);
  let opened = null;
  outer:
  for (let y = top + 8; y < bottom - 4; y += 10) {
    for (let x = box.x + 10; x < box.x + box.width - 10; x += 10) {
      await page.mouse.click(x, y);
      const bar = page.locator("a", { hasText: "Open in Wayfind" });
      if (await bar.count()) {
        opened = await bar.first().getAttribute("href");
        break outer;
      }
    }
  }

  expect(
    opened,
    "no pin on the creator map could be tapped open — the map draws but tapping a pin leads nowhere, which is the picture-of-a-map failure this chain exists to catch",
  ).toBeTruthy();
  expect(opened, `the tapped pin's destination is not a Wayfind place deep link: ${opened}`).toMatch(PLACE_ID);

  // …and the destination is a REAL place, not a 200 that renders nothing. A
  // status code is a substring; the rendered name is the call.
  await page.goto(opened);
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 25_000 });
  const body = (await page.locator("body").innerText()).trim();
  expect(body.length, `the place page behind a pin rendered no content: ${opened}`).toBeGreaterThan(200);
  expect(body, `the place page behind a pin is a not-found page: ${opened}`).not.toMatch(/page could not be found|404/i);
});
