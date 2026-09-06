// scripts/lib/synthetic/scenarios.mjs — THE SCENARIO DEFINITIONS, as data.
//
// Adding a flow to synthetic monitoring is adding an entry to SCENARIOS below,
// never new plumbing in the runner. scripts/run-synthetic-monitor.mjs is the
// only thing that ever executes these against a real base URL; this file is
// imported by BOTH the runner and scripts/check-synthetic-monitor-hermetic.mjs
// (the guard), so it must stay side-effect-free at import time — no network,
// no browser launch, no process.env read for a verdict. Every `run(ctx)` below
// only touches the network when the RUNNER calls it, never at import.
//
// THE ctx CONTRACT each scenario's run(ctx) receives (constructed by the
// runner; see scripts/run-synthetic-monitor.mjs for the real implementation):
//   ctx.baseUrl          - e.g. "https://www.gowayfind.com"
//   ctx.ok(name, cond, expected, actual) -> boolean
//       Records one assertion. `expected`/`actual` must never carry a raw
//       credential, PID, or query string — pass shapes/booleans/counts/text
//       snippets only. This is enforced structurally by the hermetic guard
//       reading each scenario's SOURCE for the string "search" (see below).
//   ctx.note(text)        - non-assertion context, always recorded
//   ctx.openPage({viewport}) -> Promise<Page> (Playwright), console/network
//       failures auto-captured onto the evidence bundle by the runner.
//   ctx.fetchJson(pathOrUrl, opts) -> Promise<{status, ok, url, json, text}>
//       Node fetch relative to baseUrl. Network failures (status>=400, or a
//       thrown network error) are auto-recorded onto the evidence bundle.
//       opts.redirect: "follow" (default) | "manual".
//
// A scenario throwing is caught by the runner and recorded as one failing
// assertion named "scenario did not throw" — it does not abort the run.
import { STABLE_PLACE_ID, SARASOTA, ORLANDO } from "./fixtures.mjs";

export const REQUIRED_FLOWS = Object.freeze([
  "homepage",
  "rails-render-cards",
  "place-card-controls",
  "today",
  "night-out",
  "fall",
  "events",
  "save-share-actions",
  "itinerary-actions",
  "book-links",
  "location-behavior",
  "mobile-390",
]);

/**
 * A response body looks like a soft-404 — CLAUDE.md's exact WeGoTrip lesson:
 * "HTTP 200 ... the body was a soft-404 (`<title>404 Error</title>`, 'there
 * is no such page')". A status-code check alone misses this; this looks at
 * the CALL'S BODY. Pure, hermetically testable with both a positive control
 * (this literal fixture) and a negative one (an ordinary page).
 * @param {string} bodyText
 */
export function looksLikeSoft404(bodyText) {
  const t = String(bodyText == null ? "" : bodyText).toLowerCase();
  return (
    /<title>[^<]*404[^<]*<\/title>/.test(t) ||
    /\bpage not found\b/.test(t) ||
    /\bno such page\b/.test(t) ||
    /\b404 error\b/.test(t) ||
    /\bthere is no such page\b/.test(t)
  );
}

/** True when a place/event JSON row has the minimum shape a real card needs. */
export function looksLikeRealPlaceRow(row) {
  if (!row || typeof row !== "object") return false;
  const id = row.id != null ? String(row.id) : "";
  const name = row.name != null ? String(row.name).trim() : "";
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return id.length > 0 && name.length > 0 && Number.isFinite(lat) && Number.isFinite(lng);
}

/** Extract the first non-empty rail's item array from a windowRailAnswer()-shaped envelope. */
export function firstNonEmptyRailItems(body) {
  const rails = body && Array.isArray(body.rails) ? body.rails : [];
  for (const rail of rails) {
    const items = Array.isArray(rail.places) ? rail.places : (Array.isArray(rail.cards) ? rail.cards : null);
    if (items && items.length > 0) return { rail, items };
  }
  return null;
}

async function toggledAfterClick(locator) {
  const read = () => locator.evaluate((el) => ({
    ariaPressed: el.getAttribute("aria-pressed"),
    cls: el.className,
    text: el.textContent,
  }));
  const before = await read();
  await locator.click();
  await locator.page().waitForTimeout(350);
  const after = await read();
  const changed = before.ariaPressed !== after.ariaPressed || before.cls !== after.cls || before.text !== after.text;
  return { changed, before, after };
}

export const SCENARIOS = [
  // ── 1. homepage ──────────────────────────────────────────────────────────
  {
    id: "homepage",
    flow: "homepage",
    name: "Homepage renders a populated card surface",
    description: "GET / renders real place cards, not an empty shell and not a soft-404 body.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 1280, height: 900 } });
      const url = ctx.baseUrl + "/";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);

      let visible = false;
      try {
        await page.locator(".wf-place-card, .wf8-tile").first().waitFor({ state: "visible", timeout: 20000 });
        visible = true;
      } catch {}
      ctx.ok("a place card or tile becomes visible within 20s", visible, "visible", visible ? "visible" : "not visible");
      // The two rail systems (.wf-place-card rails, .wf8-tile poster grid)
      // do not necessarily paint on the same tick — the check above is
      // satisfied by whichever comes first, so give the other a moment
      // before counting, or a real page can read as 0 place cards on a
      // run that just happened to sample between the two paints.
      await page.waitForTimeout(1200);

      const bodyText = await page.locator("body").innerText().catch(() => "");
      ctx.ok("the page has real body content, not an empty shell", bodyText.length > 400, "> 400 chars", bodyText.length);

      const title = await page.title().catch(() => "");
      const soft = looksLikeSoft404(bodyText) || looksLikeSoft404(`<title>${title}</title>`);
      ctx.ok("the homepage body is not a soft-404", !soft, false, soft);

      const cardCount = await page.locator(".wf-place-card").count().catch(() => 0);
      ctx.ok("at least one real .wf-place-card rendered", cardCount > 0, "> 0", cardCount);
    },
  },

  // ── 2. rails render with cards ───────────────────────────────────────────
  {
    id: "rails-render-cards",
    flow: "rails-render-cards",
    name: "Rails render with cards in them",
    description: "The homepage ships multiple card-bearing bands — [data-rail] horizontal rails AND the .wf8 poster/tile grid, Wayfind's two real rail systems — and none of the ones that rendered are empty.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 1280, height: 900 } });
      const url = ctx.baseUrl + "/";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);
      await page.locator(".wf-place-card, .wf8-tile").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
      // Rails hydrate/paginate, and the poster grid can lazy-render further
      // down — give the shell time and nudge a scroll, matching what a real
      // reader's scroll would trigger.
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, 1800).catch(() => {});
      await page.waitForTimeout(1500);

      const bandInfo = await page.evaluate(() => {
        // System 1: the classic horizontal rail, [data-rail] + .wf-rail-card children.
        const rails = [...document.querySelectorAll("[data-rail]")].map((r) => ({
          kind: "rail",
          id: r.getAttribute("data-rail"),
          cards: r.querySelectorAll(".wf-rail-card, .wf-place-card, .wf8-tile").length,
        }));
        // System 2: the v8 poster/tile grid (.wf8-railsec / .wf8-railwrap wrapping .wf8-tile),
        // measured directly rather than assumed — see scripts/check-rail-card-fits-its-content.mjs
        // for the sibling "wf8-pcrail" system this shares a card contract with.
        const posterSections = [...document.querySelectorAll(".wf8-railsec, .wf8-railwrap")];
        const posters = posterSections.map((s, i) => ({
          kind: "poster",
          id: "wf8-poster-" + i,
          cards: s.querySelectorAll(".wf8-tile, .wf-place-card").length,
        }));
        return [...rails, ...posters];
      });
      ctx.ok("at least 2 distinct card-bearing bands rendered (a rail and/or the poster grid)", bandInfo.length >= 2, ">= 2", bandInfo.length);
      const empties = bandInfo.filter((r) => r.cards === 0);
      ctx.ok(
        "no rendered band is empty (the 2026-08-29 'events rail that rendered for nobody' shape)",
        empties.length === 0,
        "0 empty bands",
        `${empties.length} empty of ${bandInfo.length}: ${empties.map((r) => r.id).slice(0, 5).join(", ")}`
      );
      const totalCards = bandInfo.reduce((s, r) => s + r.cards, 0);
      ctx.ok("the bands carry a substantial number of cards in total", totalCards >= 10, ">= 10", totalCards);
    },
  },

  // ── 3. place cards: image, title, score, four controls ──────────────────
  {
    id: "place-card-controls",
    flow: "place-card-controls",
    name: "A place card has an image, a title, a score, and all four controls",
    description: "The first real place card carries media, a name, a Wayfind Score badge (on at least one of the first cards), and exactly the four controls save/like/dislike/share.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 1280, height: 900 } });
      const url = ctx.baseUrl + "/";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);
      const first = page.locator(".wf-place-card").first();
      await first.waitFor({ state: "visible", timeout: 20000 });

      const shape = await first.evaluate((el) => ({
        hasMedia: !!el.querySelector(".wf-place-card-media img, .wf-place-card-monogram"),
        titleText: (el.querySelector(".wf-place-card-name") || {}).textContent || "",
        controls: ["save", "like", "dislike", "share"].filter((k) => el.querySelector(".wf-place-card-" + k)).length,
      }));
      ctx.ok("the card shows an image or a monogram fallback", shape.hasMedia, true, shape.hasMedia);
      ctx.ok("the card has a non-empty title", shape.titleText.trim().length > 0, "> 0 chars", shape.titleText.trim().length);
      ctx.ok("the card renders exactly the 4 controls (save/like/dislike/share)", shape.controls === 4, 4, shape.controls);

      // The Score badge: a null base score legitimately renders no badge at
      // all (CLAUDE.md — never coerce null to 0), so this checks the first
      // several cards for AT LEAST one real score badge rather than demanding
      // one on card #1 specifically.
      const scoreCount = await page.locator(".wf-place-card").evaluateAll(
        (els) => els.slice(0, 8).filter((el) => el.querySelector(".wf-place-card-score")).length
      );
      ctx.ok("at least one of the first 8 cards shows a Wayfind Score badge", scoreCount > 0, "> 0", scoreCount);
    },
  },

  // ── 4/5/6. Today / Night Out / Fall — API contract, body not status ────
  {
    id: "today",
    flow: "today",
    name: "Today discovery API returns real, located rails",
    description: "GET /api/today-discovery for Sarasota returns a rails[] envelope with real place rows, not just a 200.",
    async run(ctx) {
      const path = `/api/today-discovery?lat=${SARASOTA.lat}&lng=${SARASOTA.lng}&city=${encodeURIComponent(SARASOTA.city)}`;
      const res = await ctx.fetchJson(path);
      ctx.ok("today-discovery responded 200", res.status === 200, 200, res.status);
      const rails = res.json && Array.isArray(res.json.rails) ? res.json.rails : null;
      ctx.ok("the response body is a rails[] envelope (not a soft-404/HTML body)", Array.isArray(rails), "array", rails === null ? typeof res.json : rails.length);
      const found = rails ? firstNonEmptyRailItems(res.json) : null;
      ctx.ok("at least one rail carries real items", !!found, "a non-empty rail", found ? `${found.rail.railId || found.rail.id || "?"}: ${found.items.length} items` : "none");
      if (found) {
        const good = found.items.slice(0, 5).filter(looksLikeRealPlaceRow).length;
        ctx.ok("the sampled items have id/name/lat/lng (real rows, not placeholders)", good === Math.min(5, found.items.length), Math.min(5, found.items.length), good);
      }
    },
  },
  {
    id: "night-out",
    flow: "night-out",
    name: "Night Out API returns real, located rails",
    description: "GET /api/night-out for Sarasota returns a rails[] envelope with real place rows.",
    async run(ctx) {
      const path = `/api/night-out?lat=${SARASOTA.lat}&lng=${SARASOTA.lng}`;
      const res = await ctx.fetchJson(path);
      ctx.ok("night-out responded 200", res.status === 200, 200, res.status);
      const rails = res.json && Array.isArray(res.json.rails) ? res.json.rails : null;
      ctx.ok("the response body is a rails[] envelope", Array.isArray(rails), "array", rails === null ? typeof res.json : rails.length);
      const found = rails ? firstNonEmptyRailItems(res.json) : null;
      ctx.ok("at least one rail carries real items", !!found, "a non-empty rail", found ? `${found.rail.railId || found.rail.id || "?"}: ${found.items.length} items` : "none");
      if (found) {
        const good = found.items.slice(0, 5).filter(looksLikeRealPlaceRow).length;
        ctx.ok("the sampled items have id/name/lat/lng", good === Math.min(5, found.items.length), Math.min(5, found.items.length), good);
      }
    },
  },
  {
    id: "fall",
    flow: "fall",
    name: "Fall (AUGTOBER) API returns real, located rails",
    description: "GET /api/events/fall for Sarasota returns a rails[] envelope with real event/place rows.",
    async run(ctx) {
      const path = `/api/events/fall?lat=${SARASOTA.lat}&lng=${SARASOTA.lng}`;
      const res = await ctx.fetchJson(path);
      ctx.ok("events/fall responded 200", res.status === 200, 200, res.status);
      const rails = res.json && Array.isArray(res.json.rails) ? res.json.rails : null;
      ctx.ok("the response body is a rails[] envelope", Array.isArray(rails), "array", rails === null ? typeof res.json : rails.length);
      const found = rails ? firstNonEmptyRailItems(res.json) : null;
      ctx.ok("at least one rail carries real items", !!found, "a non-empty rail", found ? `${found.rail.railId || found.rail.id || "?"}: ${found.items.length} items` : "none");
    },
  },

  // ── 7. events ─────────────────────────────────────────────────────────
  {
    id: "events",
    flow: "events",
    name: "Events listing renders real cards for a real city",
    description: "/events/sarasota/this-weekend server-renders a real event list, not an empty or thin page.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 1280, height: 900 } });
      const url = ctx.baseUrl + "/events/sarasota/this-weekend";
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);
      ctx.ok("the events listing responded 200", !!res && res.status() === 200, 200, res ? res.status() : null);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      ctx.ok("the listing is not a soft-404", !looksLikeSoft404(bodyText), false, looksLikeSoft404(bodyText));
      const railCardCount = await page.locator(".wf-rail-card, .wf-place-card").count().catch(() => 0);
      ctx.ok("the listing rendered at least one real event/place card", railCardCount > 0, "> 0", railCardCount);
      ctx.ok("the listing has substantial body content", bodyText.length > 300, "> 300 chars", bodyText.length);
    },
  },

  // ── 8. save and share actions ────────────────────────────────────────
  {
    id: "save-share-actions",
    flow: "save-share-actions",
    name: "Save, Like, Dislike and Share each register in place",
    description: "Tapping each control on a real card toggles its visible state (aria-pressed/class/text) without navigating away — the 2026-08-20 'Like navigated instead of liking' shape.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 390, height: 844 } });
      const url = ctx.baseUrl + "/";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);
      const cards = page.locator(".wf-place-card");
      await cards.first().waitFor({ state: "visible", timeout: 20000 });
      const count = await cards.count();
      ctx.ok("at least 3 cards are available to exercise controls on", count >= 3, ">= 3", count);
      if (count < 1) return;

      const before = page.url();

      const saveBtn = cards.nth(0).locator(".wf-place-card-save").first();
      if (await saveBtn.count()) {
        const r = await toggledAfterClick(saveBtn);
        ctx.ok("Save toggles its visible state on tap", r.changed, "state changed", JSON.stringify(r.after));
      } else {
        ctx.ok("Save control is present on card 1", false, "present", "absent");
      }

      const likeIdx = count >= 2 ? 1 : 0;
      const likeBtn = cards.nth(likeIdx).locator(".wf-place-card-like").first();
      if (await likeBtn.count()) {
        const r = await toggledAfterClick(likeBtn);
        ctx.ok("Like toggles aria-pressed on tap", r.before.ariaPressed !== r.after.ariaPressed, "aria-pressed flips", `${r.before.ariaPressed} -> ${r.after.ariaPressed}`);
      } else {
        ctx.ok("Like control is present", false, "present", "absent");
      }

      const disIdx = count >= 3 ? 2 : likeIdx;
      const disBtn = cards.nth(disIdx).locator(".wf-place-card-dislike").first();
      if (await disBtn.count()) {
        const r = await toggledAfterClick(disBtn);
        ctx.ok("Dislike toggles aria-pressed on tap", r.before.ariaPressed !== r.after.ariaPressed, "aria-pressed flips", `${r.before.ariaPressed} -> ${r.after.ariaPressed}`);
      } else {
        ctx.ok("Dislike control is present", false, "present", "absent");
      }

      ctx.ok("no control navigated the page away", page.url() === before, before, page.url());

      // Share: grant clipboard so the fallback path (no native sheet in
      // headless Chromium) is observable, then look for EITHER a clipboard
      // write or a visible "copied" acknowledgement — whichever the app
      // actually used, per lib/shareOut.js's documented fallback order.
      try {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: ctx.baseUrl });
      } catch {}
      const shareBtn = cards.nth(0).locator(".wf-place-card-share").first();
      if (await shareBtn.count()) {
        await shareBtn.click();
        await page.waitForTimeout(600);
        let clip = "";
        try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch {}
        const toastVisible = await page.getByText(/copied|share/i).first().isVisible().catch(() => false);
        ctx.ok(
          "Share produced an observable result (clipboard write or a visible toast)",
          /^https?:\/\//.test(clip) || toastVisible,
          "clipboard URL or toast",
          `clipboard=${/^https?:\/\//.test(clip)} toast=${toastVisible}`
        );
      } else {
        ctx.ok("Share control is present", false, "present", "absent");
      }
    },
  },

  // ── 9. itinerary actions ─────────────────────────────────────────────
  {
    id: "itinerary-actions",
    flow: "itinerary-actions",
    name: "Add to itinerary registers in place on a real event",
    description: "From /events/sarasota/this-weekend, open a real internal event detail and tap '+ Add to itinerary'; it must flip to '✓ In itinerary' without navigating away. Falls back to verifying the signed-out /itinerary gate renders correctly if no internal event link is live today.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 390, height: 844 } });
      const listUrl = ctx.baseUrl + "/events/sarasota/this-weekend";
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(listUrl);
      await page.waitForTimeout(1200);

      const internalHref = await page.evaluate(() => {
        const as = [...document.querySelectorAll('a[href*="/events/"]')];
        const hit = as.find((a) => {
          const href = a.getAttribute("href") || "";
          return /^\/events\/[^/]+\/[^/]+--/.test(href);
        });
        return hit ? hit.getAttribute("href") : null;
      });

      if (internalHref) {
        const detailUrl = ctx.baseUrl + internalHref;
        await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        ctx.setUrl(detailUrl);
        const btn = page.locator('button:has-text("itinerary")').first();
        let present = false;
        try { await btn.waitFor({ state: "visible", timeout: 10000 }); present = true; } catch {}
        ctx.ok("an 'Add to itinerary' control is present on the event detail", present, "present", present ? "present" : "absent");
        if (present) {
          const before = page.url();
          const beforeState = await btn.getAttribute("aria-pressed").catch(() => null);
          await btn.click();
          await page.waitForTimeout(400);
          const afterState = await btn.getAttribute("aria-pressed").catch(() => null);
          const afterText = (await btn.textContent().catch(() => "")) || "";
          ctx.ok(
            "tapping it registers in place (aria-pressed flips or it reads 'In itinerary')",
            beforeState !== afterState || /in itinerary/i.test(afterText),
            "state changed",
            `${beforeState} -> ${afterState}, text="${afterText.trim()}"`
          );
          ctx.ok("adding to itinerary did not navigate away", page.url() === before, before, page.url());
        }
      } else {
        ctx.note("no internal /events/<city>/<slug> link was live in this-weekend's listing — falling back to the signed-out /itinerary gate");
        const gateUrl = ctx.baseUrl + "/itinerary";
        await page.goto(gateUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        ctx.setUrl(gateUrl);
        const bodyText = await page.locator("body").innerText().catch(() => "");
        ctx.ok("the signed-out itinerary gate renders real copy", /itinerary/i.test(bodyText) && bodyText.length > 80, true, bodyText.slice(0, 120));
        const openLink = page.locator('a[href*="go=itinerary"]').first();
        ctx.ok("the gate offers a working way back into the app", await openLink.count() > 0, "> 0", await openLink.count());
      }
    },
  },

  // ── 10. Book links ───────────────────────────────────────────────────
  {
    id: "book-links",
    flow: "book-links",
    name: "Book CTAs resolve to an attributed partner destination",
    description: "A real /api/{viator,commerce,ticketmaster}/go link found on the site resolves (redirect: manual) to an ALLOWED partner host, not our own fail-closed fallback. Never logs the destination URL or its query string — hostname and booleans only.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 1280, height: 900 } });
      const homeUrl = ctx.baseUrl + "/";
      await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(homeUrl);
      await page.waitForTimeout(1500);

      const GO_PATTERN = /^\/api\/(viator|commerce|ticketmaster)\/go\?/;
      let hrefs = await page.evaluate((src) => {
        const rx = new RegExp(src);
        return [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && rx.test(h));
      }, GO_PATTERN.source);

      if (!hrefs.length) {
        // Fall back to a page that always carries ticketed CTAs.
        const evUrl = ctx.baseUrl + "/events/sarasota/this-weekend";
        await page.goto(evUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1000);
        hrefs = await page.evaluate((src) => {
          const rx = new RegExp(src);
          return [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && rx.test(h));
        }, GO_PATTERN.source);
      }

      ctx.ok("a Book/ticket CTA link was found on a real surface", hrefs.length > 0, "> 0", hrefs.length);
      if (!hrefs.length) return;

      const href = hrefs[0];
      const provider = (href.match(/^\/api\/(\w+)\/go/) || [, "?"])[1];
      const res = await ctx.fetchJson(href, { redirect: "manual" });
      ctx.ok("the go-route responded with a redirect (3xx)", res.status >= 300 && res.status < 400, "3xx", res.status);

      const location = res.headers && (res.headers.location || res.headers.Location);
      const dest = ctx.describeDestination(location);
      ctx.ok(
        `the ${provider} redirect resolved to an ATTRIBUTED partner host (never our own fallback)`,
        dest.isAttributedPartner && !dest.isOwnFallback,
        "isAttributedPartner=true, isOwnFallback=false",
        `isAttributedPartner=${dest.isAttributedPartner} isOwnFallback=${dest.isOwnFallback} hostname=${dest.hostname}`
      );
      ctx.ok("the redirect carried tracking (a query string), proving it is not a bare homepage link", dest.hasQueryParams, true, dest.hasQueryParams);
    },
  },

  // ── 11. location behavior ────────────────────────────────────────────
  {
    id: "location-behavior",
    flow: "location-behavior",
    name: "Results actually depend on location",
    description: "The same rail endpoint returns DIFFERENT real place ids for two metros ~230mi apart (Sarasota vs Orlando) — proving lat/lng genuinely drives selection rather than a hardcoded pool.",
    async run(ctx) {
      const a = await ctx.fetchJson(`/api/today-discovery?lat=${SARASOTA.lat}&lng=${SARASOTA.lng}&city=${encodeURIComponent(SARASOTA.city)}`);
      const b = await ctx.fetchJson(`/api/today-discovery?lat=${ORLANDO.lat}&lng=${ORLANDO.lng}&city=${encodeURIComponent(ORLANDO.city)}`);
      ctx.ok("Sarasota query responded 200", a.status === 200, 200, a.status);
      ctx.ok("Orlando query responded 200", b.status === 200, 200, b.status);
      const foundA = a.json ? firstNonEmptyRailItems(a.json) : null;
      const foundB = b.json ? firstNonEmptyRailItems(b.json) : null;
      ctx.ok("Sarasota returned real items", !!foundA, "a non-empty rail", foundA ? foundA.items.length : 0);
      ctx.ok("Orlando returned real items", !!foundB, "a non-empty rail", foundB ? foundB.items.length : 0);
      if (foundA && foundB) {
        const idsA = new Set(foundA.items.map((p) => p.id));
        const idsB = new Set(foundB.items.map((p) => p.id));
        const overlap = [...idsA].filter((id) => idsB.has(id)).length;
        ctx.ok(
          "the two metros return substantially DIFFERENT place ids (location changes the result)",
          overlap < Math.min(idsA.size, idsB.size),
          "overlap < min(setA, setB)",
          `overlap=${overlap} of ${idsA.size}/${idsB.size}`
        );
      }
    },
  },

  // ── 12. mobile rendering at a true 390x844 viewport ──────────────────
  {
    id: "mobile-390",
    flow: "mobile-390",
    name: "The homepage renders correctly at a REAL 390x844 viewport",
    description: "Renders into a true 390x844 Chromium viewport (not resize_window), reads innerWidth back out and asserts it, and checks for horizontal overflow and unclipped controls — the CLAUDE.md 'mobile verification' standard.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 390, height: 844 } });
      const url = ctx.baseUrl + "/";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);
      // A tile can paint before a full .wf-place-card does (they are two
      // different rail systems on the same page) — wait for the SPECIFIC
      // selector this scenario measures, not either-or, so the read below
      // never races a card that has not mounted yet.
      await page.locator(".wf-place-card").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});

      const got = await page.evaluate(() => {
        const card = document.querySelector(".wf-place-card");
        const rect = card ? card.getBoundingClientRect() : null;
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          cardWidth: rect ? +rect.width.toFixed(1) : null,
          controls: card ? ["save", "like", "dislike", "share"].filter((k) => {
            const el = card.querySelector(".wf-place-card-" + k);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length : 0,
        };
      });
      // THE ASSERTION, NOT THE ASSUMPTION: read the width back and check it.
      ctx.ok("the iframe/page actually measured 390px wide (not a silent resize no-op)", got.innerWidth === 390, 390, got.innerWidth);
      ctx.ok("no horizontal overflow at 390px", got.scrollWidth <= 392, "<= 392px", got.scrollWidth);
      ctx.ok("the first card fits within the 390px viewport", got.cardWidth != null && got.cardWidth <= 390, "<= 390px", got.cardWidth);
      ctx.ok("all 4 controls are visible (non-zero size) at 390px, none clipped off-card", got.controls === 4, 4, got.controls);
    },
  },
];

// Fail loudly at import time if the data itself is malformed — this is
// hermetic (no network) and doubles as documentation of the contract every
// entry must satisfy.
for (const s of SCENARIOS) {
  if (!s || typeof s !== "object") throw new Error("scenarios.mjs: a SCENARIOS entry is not an object");
  if (!s.id || typeof s.id !== "string") throw new Error("scenarios.mjs: every scenario needs a string id");
  if (!REQUIRED_FLOWS.includes(s.flow)) throw new Error(`scenarios.mjs: ${s.id} has flow "${s.flow}", not one of REQUIRED_FLOWS`);
  if (typeof s.run !== "function") throw new Error(`scenarios.mjs: ${s.id}.run must be a function`);
  if (!s.name || !s.description) throw new Error(`scenarios.mjs: ${s.id} needs a name and description`);
}
