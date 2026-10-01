// 2026-10-01 — the owner's Like moves the card, not just the number.
//
// THE DEFECT (owner, live): after the owner liked Ryan's Coffee House it read
// 9.4 with the Curator's pick mark at #6, still BELOW Scooter's 9.2 at #5.
//
// This drives the REAL Like button on the production build. The session is a
// fake signed-in user against the e2e placeholder Supabase host (every request
// to it is answered here, nothing leaves the machine); the server verdicts the
// app asks for are mocked:
//   /api/signals/curator-picks — the public pick set (empty at first)
//   /api/signals/likes          — the owner verdict: sessionOwner, and after the
//                                 like write lands, owner[ryans] on the fresh read
// Then it asserts, on the ranked Experience list: score, position AND the rank
// number move together on Like, and reverse on Unlike.
const { test, expect } = require("@playwright/test");

const PIN = { lat: 27.5859, lng: -82.4254, loc: "Parrish, FL", manual: true };
const SB_KEY = "sb-e2eplaceholder-auth-token";

function place(id, name, rating, reviews) {
  return {
    id, displayName: { text: name }, location: { latitude: 27.59, longitude: -82.43 },
    rating, userRatingCount: reviews, types: ["bar", "night_club", "point_of_interest"],
    primaryType: "bar", businessStatus: "OPERATIONAL", formattedAddress: "Parrish, FL",
  };
}
// wayfindScore: 4.8/400 → 9.1, 4.6/800 → 9.0, 4.7/400 → 8.9. Neutral names:
// none matches a creator-video entry, so the shown score is the base score.
const PLACES = [
  place("scooters", "Alpha Live Hall", 4.8, 400),
  place("ryans", "Bravo Music Room", 4.6, 800),
  place("control", "Charlie Lounge", 4.7, 400),
];

async function cardOrder(page) {
  return page.$$eval("[data-wf-position-key^='place-']", (els) => els.map((el) => {
    const id = el.getAttribute("data-wf-position-key").slice(6);
    const rank = (el.querySelector(".wf-place-card-rank") || {}).textContent || "";
    // The badge prints the number then "/10"; a whole number may print as "9".
    const score = ((el.querySelector(".wf-place-card-score") || {}).textContent || "").match(/(\d+(?:\.\d)?)\s*\/\s*10/);
    return { id, rank: rank.trim(), score: score ? Number(score[1]).toFixed(1) : null };
  }).filter((c) => ["scooters", "ryans", "control"].includes(c.id)));
}

test("owner Like re-ranks the card: score, position and rank number move together; Unlike reverses", async ({ page }) => {
  let picked = false;   // server truth for ryans
  const likeWrites = [];
  await page.addInitScript(({ pin, key }) => {
    try {
      localStorage.setItem("wf_center", JSON.stringify({ ...pin, ts: Date.now() }));
      const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
      localStorage.setItem(key, JSON.stringify({
        access_token: "e2e-owner-access-token-not-real-0123456789", refresh_token: "e2e-refresh", token_type: "bearer",
        expires_in: 86400, expires_at: exp,
        user: { id: "e2e-owner-user", aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {} },
      }));
    } catch (e) {}
  }, { pin: PIN, key: SB_KEY });

  // The placeholder Supabase host: auth + PostgREST answered locally.
  await page.route("https://e2eplaceholder.supabase.co/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.pathname.startsWith("/auth/v1/user")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "e2e-owner-user", aud: "authenticated", email: "owner@example.test" }) });
    if (u.pathname === "/rest/v1/likes" && req.method() !== "GET") {
      likeWrites.push(req.method());
      picked = req.method() !== "DELETE";
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/places/search**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ places: PLACES, cached: false, source: "inventory" }) }));
  await page.route("**/api/signals/curator-picks**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ids: [], sessionOwner: true }) }));
  await page.route("**/api/signals/likes**", (route) => {
    const u = new URL(route.request().url());
    const fresh = u.searchParams.get("fresh") === "1";
    // A NON-fresh read is the cached copy: it still says "not picked" — the
    // stale read the store must not let undo a confirmed like.
    const owner = fresh && picked ? { ryans: true } : {};
    const counts = fresh && picked ? { ryans: 50 } : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ counts, owner, sessionOwner: true }) });
  });

  await page.goto("/?exp=livemusic");
  await expect(page.locator("[data-wf-position-key='place-ryans']").first()).toBeVisible({ timeout: 25_000 });

  const before = await cardOrder(page);
  const idx = (list, id) => list.findIndex((c) => c.id === id);
  expect(idx(before, "scooters")).toBeLessThan(idx(before, "ryans"));
  expect(before.find((c) => c.id === "ryans").score).toBe("9.0");
  expect(before.find((c) => c.id === "scooters").score).toBe("9.1");

  // LIKE through the real control.
  await page.locator("[data-wf-position-key='place-ryans'] .wf-place-card-like").first().click();
  await expect.poll(() => likeWrites.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(async () => {
    const o = await cardOrder(page);
    const r = o.find((c) => c.id === "ryans");
    return r && r.score === "9.2" && idx(o, "ryans") < idx(o, "scooters");
  }, { timeout: 15_000 }).toBe(true);
  const after = await cardOrder(page);
  const rRyans = after.find((c) => c.id === "ryans").rank;
  const rScooters = after.find((c) => c.id === "scooters").rank;
  expect(Number(rRyans)).toBeLessThan(Number(rScooters));
  expect(Number(rScooters)).toBe(Number(rRyans) + 1);
  await expect(page.locator("[data-wf-position-key='place-ryans']").first()).toHaveClass(/is-curator-pick/);

  // A stale (cached) signal read after the like must not undo it: wait past
  // the reconcile and re-check.
  await page.waitForTimeout(1500);
  const settled = await cardOrder(page);
  expect(settled.find((c) => c.id === "ryans").score).toBe("9.2");
  expect(idx(settled, "ryans")).toBeLessThan(idx(settled, "scooters"));

  // UNLIKE reverses exactly.
  await page.locator("[data-wf-position-key='place-ryans'] .wf-place-card-like").first().click();
  await expect.poll(async () => {
    const o = await cardOrder(page);
    const r = o.find((c) => c.id === "ryans");
    return r && r.score === "9.0" && idx(o, "scooters") < idx(o, "ryans");
  }, { timeout: 15_000 }).toBe(true);
  await expect(page.locator("[data-wf-position-key='place-ryans']").first()).not.toHaveClass(/is-curator-pick/);
});
