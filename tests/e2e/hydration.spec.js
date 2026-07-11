// Gate: zero hydration/console errors on the homepage (July 2026 audit,
// Phase 1). React minified errors 418/423/425 are hydration mismatches —
// any one of them means the server HTML and first client render disagreed
// and React threw away the SSR tree. This test fails on ANY console error
// or uncaught page error, so it also catches new runtime breakage.
const { test, expect } = require("@playwright/test");

// Errors caused by the local environment, not the app. Without
// NEXT_PUBLIC_* keys, Maps/PostHog/Supabase requests 403 and our own /api
// routes degrade to 501 BY DESIGN (see scripts/check-env.mjs). Keep this
// list tight — anything else from our own origin must stay fatal.
const ENV_NOISE_URLS =
  /(\.googleapis\.com|\.gstatic\.com|posthog|supabase|\/api\/)/i;
const ENV_NOISE_TEXT = [
  /net::ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_REFUSED)/,
  /Google Maps JavaScript API warning/,
];

function isEnvNoise(text, url) {
  if (ENV_NOISE_TEXT.some((re) => re.test(text))) return true;
  // Resource-load failures carry the URL in location(), not text().
  if (/Failed to load resource/.test(text) && ENV_NOISE_URLS.test(url || ""))
    return true;
  return false;
}

async function collectConsole(page, path) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const text = msg.text();
      const url = (msg.location() || {}).url || "";
      if (!isEnvNoise(text, url))
        errors.push(`[console.${msg.type()}] ${text} (${url})`);
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  await page.goto(path, { waitUntil: "networkidle" });
  // Hydration happens right after load; give React a beat to log.
  await page.waitForTimeout(2500);
  return errors;
}

const HYDRATION_SIGNATURES =
  /(Minified React error #(418|423|425)|Hydration failed|hydration|did not match)/i;

test.describe("hydration + console gate", () => {
  test("homepage renders with zero hydration errors and zero console errors", async ({
    page,
  }) => {
    const errors = await collectConsole(page, "/");
    const hydration = errors.filter((e) => HYDRATION_SIGNATURES.test(e));
    expect(hydration, `Hydration errors:\n${hydration.join("\n")}`).toEqual([]);
    expect(errors, `Console errors/warnings:\n${errors.join("\n")}`).toEqual([]);
  });

  test("homepage survives clock skew (stale ISR HTML vs client time)", async ({
    page,
  }) => {
    // In production the ISR shell can be up to an hour old, so any render
    // path computed from the current time disagrees with the client and
    // hydration fails (live React errors 418/423/425). A fresh local build
    // hides that — same hour on both sides — so we shift the browser clock
    // +6h to force the disagreement a stale cache would produce.
    await page.addInitScript(() => {
      const RealDate = Date;
      const SKEW_MS = 6 * 60 * 60 * 1000;
      // eslint-disable-next-line no-global-assign
      Date = class extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(RealDate.now() + SKEW_MS);
          else super(...args);
        }
        static now() {
          return RealDate.now() + SKEW_MS;
        }
      };
    });
    const errors = await collectConsole(page, "/");
    const hydration = errors.filter((e) => HYDRATION_SIGNATURES.test(e));
    expect(hydration, `Hydration errors:\n${hydration.join("\n")}`).toEqual([]);
  });

  test("returning visitor (populated localStorage) hydrates cleanly", async ({
    page,
  }) => {
    // This is the condition that broke the live site: localStorage-backed
    // state read during render made a returning visitor's first client
    // render differ from the server HTML. A fresh profile can't catch it.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("wf_liked", JSON.stringify({ p1: true, p2: true }));
        localStorage.setItem("wf_disliked", JSON.stringify({ p3: true }));
        localStorage.setItem(
          "wf_liked_items",
          JSON.stringify({ p1: { place: { id: "p1", name: "Test Place" }, ts: 1 } })
        );
        localStorage.setItem("wf_hook_likes", JSON.stringify(["h1", "h2"]));
        localStorage.setItem("wf_coupons", JSON.stringify({ c1: { id: "c1" } }));
        localStorage.setItem(
          "wf_place_comments",
          JSON.stringify({ p1: { type: "Tip", text: "great" } })
        );
        localStorage.setItem("wf_drive_votes", JSON.stringify({ p1: "yes" }));
        localStorage.setItem("wf_signed_up", "1");
        localStorage.setItem("wf_debug", "1");
        localStorage.setItem(
          "wf_signals",
          JSON.stringify([{ t: "like", cat: "food", ts: 1751000000000 }])
        );
      } catch (e) {}
    });
    const errors = await collectConsole(page, "/");
    const hydration = errors.filter((e) => HYDRATION_SIGNATURES.test(e));
    expect(hydration, `Hydration errors:\n${hydration.join("\n")}`).toEqual([]);
  });

  test("URL-param-dependent render (?debug=1) hydrates cleanly", async ({
    page,
  }) => {
    // window.location.search read during render differs from the server
    // (which sees no search params in the ISR'd shell) — must not change
    // first-paint markup.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("wf_debug", "1");
      } catch (e) {}
    });
    const errors = await collectConsole(page, "/?debug=1");
    const hydration = errors.filter((e) => HYDRATION_SIGNATURES.test(e));
    expect(hydration, `Hydration errors:\n${hydration.join("\n")}`).toEqual([]);
  });

  test("privacy page renders with zero console errors", async ({ page }) => {
    const errors = await collectConsole(page, "/privacy");
    expect(errors, `Console errors/warnings:\n${errors.join("\n")}`).toEqual([]);
  });
});
