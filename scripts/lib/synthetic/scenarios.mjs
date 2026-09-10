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
import {
  EXPECTED_VISIBLE_POSTER_IDS,
  posterMenuDiff,
  railWindowFromCapturedPayload,
  rowsForRailWindow,
  mergeCapturedRailWindows,
  composedRows,
  reconcileRenderedCards,
  exactRenderedIdSet,
} from "./menuPosterIntegrity.mjs";
import { appleMapsTokenContract } from "../../../lib/appleMapsToken.js";
import { splitBreakfastRails } from "../../../lib/breakfastRails.js";
import { composeWorthEatingRails } from "../../../lib/worthEatingRails.js";

/**
 * HOW LONG THE HOMEPAGE MAY TAKE TO SHOW ITS FIRST REAL PLACE CARD.
 *
 * Not a guess. Measured against production on 2026-09-06: the poster grid
 * (.wf8-tile) paints at ~1s and the .wf-place-card rails at 2.4-2.9s, because
 * the cards wait on /api/rails. A cold rail cache cell answers in 4-6s. The
 * client's own give-up points sit above that: DaypartRail budgets 10s and
 * /api/rails carries maxDuration 12.
 *
 * 8s therefore sits above every healthy value we have measured and below the
 * point where the app itself stops waiting — so a failure here means the page
 * genuinely did not deliver a card, never that the monitor looked too early.
 */
export const HOMEPAGE_CARD_BUDGET_MS = 8000;

export const REQUIRED_FLOWS = Object.freeze([
  "homepage",
  "rails-render-cards",
  "place-card-controls",
  "today",
  "night-out",
  "fall",
  "events",
  "event-apple-maps",
  "save-share-actions",
  "itinerary-actions",
  "book-links",
  "location-behavior",
  "mobile-390",
  "menu-poster-integrity",
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

// The Breakfast and Actually Worth Eating posters are special: each receives
// the shared compact /api/rails response, then composes it into several
// visible rails.  This observer keeps the browser response as the source of
// truth — it makes no second data request and therefore cannot compare a card
// to a different cache generation.
async function verifyComposedPoster({ ctx, page, payload, posterId, dataRailId, railPrefix, compose, componentSelectors }) {
  const initialWindow = railWindowFromCapturedPayload(payload, dataRailId);
  ctx.ok(`${posterId}: paging metadata is present on the captured /api/rails response`, initialWindow.metadataPresent, "total + hasMore", {
    total: initialWindow.expectedCount, hasMore: initialWindow.hasMore,
  });
  ctx.ok(`${posterId}: initial paging metadata is internally consistent`, initialWindow.metadataConsistent, "consistent", {
    returned: initialWindow.returnedCount, total: initialWindow.expectedCount, hasMore: initialWindow.hasMore,
  });

  const tile = page.locator(`.wf8-tile[data-id="${posterId}"] .wf8-tlink`).first();
  ctx.ok(`${posterId}: its poster remains an interactive tile`, await tile.count() === 1, "one tile link/button", await tile.count());
  if (await tile.count()) await tile.click();

  // The lazy composer has either mounted its named sections, produced a real
  // card rail, or reached an explicit error.  Waiting on one of those states
  // prevents a fast, empty pre-hydration snapshot from becoming a false green.
  const terminal = await page.waitForFunction(({ prefix, selectors }) => {
    const root = document.querySelector(".wf8-menusec");
    if (!root) return false;
    const text = root.innerText || "";
    const hasCards = root.querySelectorAll(`[data-rail^="${prefix}"] .wf-place-card`).length > 0;
    const hasComponent = selectors.some((selector) => !!root.querySelector(selector));
    const error = /couldn['’]t reach|try again|still ranking|more places didn['’]t load/i.test(text);
    return hasCards || hasComponent || error;
  }, { prefix: railPrefix, selectors: componentSelectors }, { timeout: 18000 }).then(() => true, () => false);
  ctx.ok(`${posterId}: its post-click card surface settled (cards, a complete empty, or a visible failure)`, terminal, "settled within 18s", terminal ? "settled" : "not settled");

  // Use the ACTUAL continuation affordance a reader sees.  The continuation
  // response is captured from that click in this same browser/context; no
  // direct fetch is made and no provider call is added.  A healthy >12 rail
  // must therefore reach its full metadata total rather than fail merely for
  // being deliberately compact on first paint.
  const capturedPayloads = [payload];
  let nextWindow = initialWindow;
  let continuationSteps = 0;
  while (nextWindow.hasMore === true && continuationSteps < 20) {
    const more = page.getByRole("button", { name: "Show more ranked places" }).first();
    const hasMoreButton = await more.count() === 1;
    ctx.ok(`${posterId}: a real continuation control is available while paging metadata says more`, hasMoreButton, "Show more ranked places button", hasMoreButton ? "present" : "absent");
    if (!hasMoreButton) break;
    const expectedOffset = nextWindow.returnedCount;
    const continuationResponse = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return url.pathname === "/api/rails"
          && url.searchParams.get("v") === "2"
          && url.searchParams.get("rail") === dataRailId
          && Number(url.searchParams.get("offset")) === expectedOffset;
      } catch { return false; }
    }, { timeout: 18000 }).catch(() => null);
    // Arm this BEFORE the click. A normal button immediately after
    // response.json() can still be the pre-merge button; observing the loading
    // transition stops the next loop from clicking it twice against stale UI.
    const loadingSeen = page.waitForFunction(() => {
      const root = document.querySelector(".wf8-menusec");
      const text = root?.innerText || "";
      const button = [...(root?.querySelectorAll("button") || [])]
        .find((candidate) => /show more ranked places|loading more places/i.test(candidate.textContent || ""));
      return /couldn['’]t reach|try again|more places didn['’]t load/i.test(text)
        || !!button && (button.disabled || /loading more places/i.test(button.textContent || ""));
    }, undefined, { timeout: 5000 }).then(() => true, () => false);
    await more.click();
    const response = await continuationResponse;
    ctx.ok(`${posterId}: clicking continuation produced its matching browser network response`, !!response, `rail=${dataRailId}, offset=${expectedOffset}`, response ? response.status() : "not captured");
    if (!response) break;
    const nextPayload = await response.json().catch(() => null);
    ctx.ok(`${posterId}: continuation response is a healthy covered rail payload`, response.status() === 200 && !!nextPayload && nextPayload.covered === true && !!nextPayload.data && nextPayload.failed !== true, "200 covered data payload", {
      status: response.status(), covered: nextPayload?.covered, failed: nextPayload?.failed,
    });
    if (!nextPayload || response.status() !== 200 || nextPayload.covered !== true || !nextPayload.data || nextPayload.failed === true) break;
    capturedPayloads.push(nextPayload);
    // The route's offset is the number of rows already delivered.  Reading it
    // back from the merged capture catches a response that repeats page one.
    const merged = mergeCapturedRailWindows(capturedPayloads, dataRailId);
    nextWindow = { ...railWindowFromCapturedPayload(nextPayload, dataRailId), returnedCount: merged.returnedCount };
    const didShowLoading = await loadingSeen;
    ctx.note(`menu-poster-integrity ${posterId}: continuation ${continuationSteps + 1} loading lifecycle observed=${didShowLoading}`);
    // Response bodies are not rendered cards.  After every captured page wait
    // for the merged source's current exact card set before another click can
    // be considered safe.  This is usually the decisive state change (and is
    // necessarily so for the card-13 regression); if a page adds only rows a
    // composer correctly rejects, the button-state wait below remains the
    // observable continuation contract.
    const partialExpectedIds = composedRows(compose(rowsForRailWindow(merged).rows)).map((row) => String(row?.id || "")).filter(Boolean);
    const mergedRenderApplied = await page.waitForFunction(({ prefix, expectedIds }) => {
      const root = document.querySelector(".wf8-menusec");
      const text = root?.innerText || "";
      if (/couldn['’]t reach|try again|more places didn['’]t load/i.test(text)) return true;
      const ids = [...(root?.querySelectorAll(`[data-rail^="${prefix}"] .wf-place-card`) || [])]
        .map((card) => card.getAttribute("data-place-id") || "")
        .filter(Boolean);
      return ids.length === expectedIds.length && new Set(ids).size === ids.length && ids.every((id) => expectedIds.includes(id));
    }, { prefix: railPrefix, expectedIds: partialExpectedIds }, { timeout: 12000 }).then(() => true, () => false);
    ctx.ok(`${posterId}: the captured continuation was applied to the current merged DOM card set`, mergedRenderApplied, "merged data-place-id set or visible failure", mergedRenderApplied);
    if (nextWindow.hasMore === true) {
      const nextControlSettled = await page.waitForFunction(() => {
        const root = document.querySelector(".wf8-menusec");
        const text = root?.innerText || "";
        if (/couldn['’]t reach|try again|more places didn['’]t load/i.test(text)) return true;
        const button = [...(root?.querySelectorAll("button") || [])]
          .find((candidate) => /show more ranked places|loading more places/i.test(candidate.textContent || ""));
        return !!button && !button.disabled && !/loading more places/i.test(button.textContent || "");
      }, undefined, { timeout: 12000 }).then(() => true, () => false);
      ctx.ok(`${posterId}: continuation control settled back to an enabled next-page state`, nextControlSettled, "enabled Show more ranked places or visible failure", nextControlSettled);
    }
    continuationSteps++;
  }
  ctx.ok(`${posterId}: paging reached a terminal response before the monitor safety cap`, nextWindow.hasMore !== true, "hasMore=false", {
    hasMore: nextWindow.hasMore, continuationSteps,
  });
  const mergedWindow = mergeCapturedRailWindows(capturedPayloads, dataRailId);
  ctx.ok(`${posterId}: all captured paging metadata agrees on one total`, !mergedWindow.totalChanged, "one stable total", mergedWindow.totalChanged ? "changed total" : mergedWindow.expectedCount);
  ctx.ok(`${posterId}: browser-captured pages are complete, never truncated`, mergedWindow.complete, "all ids through total, final hasMore=false", {
    returned: mergedWindow.returnedCount, total: mergedWindow.expectedCount, hasMore: mergedWindow.hasMore,
    pages: mergedWindow.pageCount, duplicateIds: mergedWindow.duplicateIds, missingRowIds: mergedWindow.missingRowIds,
  });
  const source = rowsForRailWindow(mergedWindow);
  ctx.ok(`${posterId}: every returned place id resolves in the merged same-browser placeIndex`, source.missingRowIds.length === 0, "0 missing indexed rows", source.missingRowIds);
  const expectedRows = composedRows(compose(source.rows));
  const expectedIds = expectedRows.map((row) => String(row?.id || "")).filter(Boolean);
  // Do not inspect a just-received response and call it rendered.  The React
  // merge happens asynchronously after response.json(); wait until the final
  // exact DOM identity set is present, or until a reader-visible error says why
  // it could not happen. This is the card-13 proof for a >12 rail.
  const finalRenderSettled = await page.waitForFunction(({ prefix, expectedIds }) => {
    const root = document.querySelector(".wf8-menusec");
    const text = root?.innerText || "";
    if (/couldn['’]t reach|try again|more places didn['’]t load/i.test(text)) return true;
    const ids = [...(root?.querySelectorAll(`[data-rail^="${prefix}"] .wf-place-card`) || [])]
      .map((card) => card.getAttribute("data-place-id") || "")
      .filter(Boolean);
    return ids.length === expectedIds.length
      && new Set(ids).size === ids.length
      && ids.every((id) => expectedIds.includes(id));
  }, { prefix: railPrefix, expectedIds }, { timeout: 15000 }).then(() => true, () => false);
  ctx.ok(`${posterId}: final DOM card ids settled to the fully merged source (including card 13 when present)`, finalRenderSettled, "exact final data-place-id set or visible failure", finalRenderSettled);

  const surface = await page.evaluate(({ prefix }) => {
    const root = document.querySelector(".wf8-menusec");
    if (!root) return { cards: [], busy: false, error: true, text: "missing menu" };
    const cards = [...root.querySelectorAll(`[data-rail^="${prefix}"] .wf-place-card`)];
    const renderedCards = cards.map((card) => ({
      id: card.getAttribute("data-place-id") || "",
      name: (card.querySelector(".wf-place-card-name")?.textContent || "").trim(),
    }));
    const text = root.innerText || "";
    return {
      cards: renderedCards,
      busy: !!root.querySelector('[aria-busy="true"]'),
      error: /couldn['’]t reach|try again|more places didn['’]t load/i.test(text),
      text: text.slice(0, 220),
    };
  }, { prefix: railPrefix });
  ctx.ok(`${posterId}: no loading state remains after the source settled`, !surface.busy, false, surface.busy);
  ctx.ok(`${posterId}: no ranking/load error is presented as cards`, !surface.error, false, surface.error ? surface.text : "none");

  const reconciliation = reconcileRenderedCards(expectedRows, surface.cards);
  ctx.ok(`${posterId}: every rendered card exposes an exact data-place-id`, reconciliation.missingDomIds.length === 0, "0 cards without data-place-id", reconciliation.missingDomIds);
  ctx.ok(`${posterId}: every rendered card maps to a captured place id`, reconciliation.unknownNames.length === 0, "0 unknown fallback card names", reconciliation.unknownNames);
  ctx.ok(`${posterId}: rendered cards exactly match the captured response's composed ids`, reconciliation.missingIds.length === 0 && reconciliation.extraIds.length === 0 && reconciliation.duplicateRenderedIds.length === 0, "no missing, extra, or duplicate ids", {
    missingIds: reconciliation.missingIds,
    extraIds: reconciliation.extraIds,
    duplicateIds: reconciliation.duplicateRenderedIds,
  });
  ctx.ok(`${posterId}: an empty card surface is accepted only for a truly complete empty source`, expectedRows.length > 0 || mergedWindow.trulyEmpty, "cards, or total=0 + hasMore=false", {
    expectedCards: expectedRows.length,
    total: mergedWindow.expectedCount,
    hasMore: mergedWindow.hasMore,
  });

  // Notes are persisted into failure evidence.  They are deliberately ids and
  // counts only: enough to diagnose a missing/extra card without a raw URL,
  // place payload, query string, or any provider credential.
  ctx.note(`menu-poster-integrity ${posterId}: expected(total)=${mergedWindow.expectedCount ?? "missing"}; returned(merged)=${mergedWindow.returnedCount}; composedExpected=${expectedRows.length}; rendered=${reconciliation.renderedCount}; pages=${mergedWindow.pageCount}; missingIds=${JSON.stringify(reconciliation.missingIds)}; extraIds=${JSON.stringify(reconciliation.extraIds)}`);
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
      const startedAt = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);

      let visible = false;
      try {
        await page.locator(".wf-place-card, .wf8-tile").first().waitFor({ state: "visible", timeout: 20000 });
        visible = true;
      } catch {}
      ctx.ok("a place card or tile becomes visible within 20s", visible, "visible", visible ? "visible" : "not visible");

      // ── WAIT FOR THE CARD, DO NOT SLEEP AND HOPE (2026-09-06) ───────────
      // A fixed sleep used to stand here, followed by the card count, and it
      // made this check a coin flip on a page that was working.
      //
      // MEASURED against production, 2026-09-06. The poster grid (.wf8-tile)
      // paints at ~0.9s. The .wf-place-card rails paint at 0.84-1.4s when the
      // reader's rail cache cell is WARM, and at ~2.7s when it is cold, since
      // the cards wait on /api/rails and a cold cell costs that route 4-6s to
      // rebuild. The visibility wait above is satisfied by whichever surface
      // comes FIRST — the tile — so the count happened at roughly tile + 1.2s,
      // which is 2.4-2.9s: exactly where a cold-cell load puts the cards. On a
      // cold cell the stopwatch and the page finished together.
      //
      // Three loads in the same minute, counted at that old checkpoint:
      // 30 cards at 2411ms, 0 cards at 2497ms (they appeared 256ms later),
      // 30 cards at 2861ms. The 17:15Z scheduled run reported "0 place cards"
      // and a re-run of the identical commit passed with nothing changed.
      //
      // A monitor that fails half the time on a healthy page is worse than no
      // monitor, because it teaches the reader to ignore it. So we wait on the
      // card surface itself against a stated budget and record how long it
      // took. A failure now means one true thing: the homepage did not put a
      // card in front of a reader inside HOMEPAGE_CARD_BUDGET_MS.
      let cardsAt = null;
      try {
        const left = Math.max(500, HOMEPAGE_CARD_BUDGET_MS - (Date.now() - startedAt));
        await page.locator(".wf-place-card").first().waitFor({ state: "visible", timeout: left });
        cardsAt = Date.now() - startedAt;
      } catch {}
      ctx.note(
        cardsAt === null
          ? `first .wf-place-card: not visible within ${HOMEPAGE_CARD_BUDGET_MS}ms`
          : `first .wf-place-card visible at ${cardsAt}ms`,
      );

      const bodyText = await page.locator("body").innerText().catch(() => "");
      ctx.ok("the page has real body content, not an empty shell", bodyText.length > 400, "> 400 chars", bodyText.length);

      const title = await page.title().catch(() => "");
      const soft = looksLikeSoft404(bodyText) || looksLikeSoft404(`<title>${title}</title>`);
      ctx.ok("the homepage body is not a soft-404", !soft, false, soft);

      const cardCount = await page.locator(".wf-place-card").count().catch(() => 0);
      ctx.ok(
        `at least one real .wf-place-card rendered within ${Math.round(HOMEPAGE_CARD_BUDGET_MS / 1000)}s`,
        cardCount > 0,
        `> 0 within ${HOMEPAGE_CARD_BUDGET_MS}ms`,
        cardCount > 0
          ? `${cardCount} card(s), first visible at ${cardsAt}ms`
          : `0 cards after ${Date.now() - startedAt}ms`,
      );
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

  // ── 2b. poster menu + composed-card integrity ──────────────────────────
  {
    id: "menu-poster-integrity",
    flow: "menu-poster-integrity",
    name: "All 18 homepage posters and their meal-card answers are intact",
    description: "The live menu exposes exactly its 18 approved poster ids, and Breakfast plus Actually Worth Eating render the exact cards from the same captured /api/rails response with truthful paging metadata.",
    async run(ctx) {
      const page = await ctx.openPage({ viewport: { width: 1280, height: 900 } });
      // Register before navigation: a production cache hit can answer before
      // a post-goto listener is attached, and a monitor that misses its own
      // evidence source must fail rather than infer a result from the DOM.
      const railsResponse = page.waitForResponse((response) => {
        try {
          const url = new URL(response.url());
          return url.pathname === "/api/rails" && url.searchParams.get("v") === "2";
        } catch { return false; }
      }, { timeout: 20000 }).catch(() => null);

      const url = ctx.baseUrl + "/";
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(url);
      await page.locator(".wf8-tile").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});

      const visibleIds = await page.evaluate(() => [...document.querySelectorAll(".wf8-tile")]
        .filter((tile) => {
          const style = getComputedStyle(tile);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((tile) => tile.getAttribute("data-id")));
      const posters = posterMenuDiff(visibleIds);
      ctx.ok("the homepage renders exactly the 18 approved visible poster ids", posters.missingIds.length === 0 && posters.extraIds.length === 0 && posters.duplicateIds.length === 0 && posters.returned.length === EXPECTED_VISIBLE_POSTER_IDS.length, EXPECTED_VISIBLE_POSTER_IDS, {
        returned: posters.returned,
        missingIds: posters.missingIds,
        extraIds: posters.extraIds,
        duplicateIds: posters.duplicateIds,
      });
      const tileShapes = await page.locator(".wf8-tile").evaluateAll((tiles) => tiles.map((tile) => ({
        id: tile.getAttribute("data-id"),
        links: tile.querySelectorAll(".wf8-tlink").length,
        images: tile.querySelectorAll("img.wf8-tim").length,
      })));
      ctx.ok("every visible poster is an interactive tile with its own poster image", tileShapes.length === EXPECTED_VISIBLE_POSTER_IDS.length && tileShapes.every((tile) => tile.links === 1 && tile.images === 1), "18 interactive tiles each with one image", tileShapes);
      ctx.note(`menu-poster-integrity menu: expected=${EXPECTED_VISIBLE_POSTER_IDS.length}; returned=${posters.returned.length}; rendered=${visibleIds.length}; missingIds=${JSON.stringify(posters.missingIds)}; extraIds=${JSON.stringify(posters.extraIds)}`);

      const response = await railsResponse;
      ctx.ok("the browser captured the homepage's own compact /api/rails response", !!response, "captured v=2 response", response ? response.status() : "not captured");
      if (!response) return;
      const payload = await response.json().catch(() => null);
      ctx.ok("the captured /api/rails response succeeded", response.status() === 200 && !!payload && payload.covered === true && !!payload.data && payload.failed !== true, "200 covered data payload", {
        status: response.status(), covered: payload?.covered, failed: payload?.failed,
      });
      if (!payload || response.status() !== 200 || payload.covered !== true || !payload.data || payload.failed === true) return;

      await verifyComposedPoster({
        ctx, page, payload,
        posterId: "breakfast", dataRailId: "breakfast", railPrefix: "breakfast-",
        compose: splitBreakfastRails,
        componentSelectors: ['section[aria-label="Best Breakfast"]', 'section[aria-label="Best Cafés"]'],
      });
      await verifyComposedPoster({
        ctx, page, payload,
        posterId: "eat", dataRailId: "eat", railPrefix: "worth-eating-",
        compose: composeWorthEatingRails,
        componentSelectors: ['section[aria-label="American & Contemporary"]', 'section[aria-label="Mexican & Latin American"]', 'section[aria-label="Italian & Pizza"]'],
      });
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

  // ── 7b. the event map is Apple, and it has a clock ───────────────────
  {
    id: "event-apple-maps",
    flow: "event-apple-maps",
    name: "Apple Maps renders on a real event page and its token is not dying",
    description: "/api/health/apple-maps must report a configured, unexpired, NON-EXPIRING, domain-restricted MapKit token, AND a real /florida-events page with venue coordinates must paint an actual Apple MapKit map (.mk-map-view) — not the 'map preview is unavailable' fallback. 2026-09-08: #1144 shipped on a 7-day portal token nothing could see expiring; the permanent token replaced it the same day and this scenario is what keeps it permanent.",
    async run(ctx) {
      // 1. the token's own clock, from the server that ships it
      const health = await ctx.fetchJson("/api/health/apple-maps");
      const h = health.json || {};
      ctx.ok("the Apple Maps health endpoint answered", health.status === 200 || health.status === 503, "200|503", health.status);
      // 2026-09-10. Every token invariant comes from ONE place —
      // lib/appleMapsToken.js appleMapsTokenContract() — so the guard suite
      // red-proves the same code this monitor runs, instead of a hand-copied
      // second opinion that can drift. Production has held the PERMANENT
      // token since 2026-09-08 (no `exp`, origin www.gowayfind.com), so
      // "permanent" and "domain-locked" are asserted steady state now:
      // swapping a testing token back in is red within the half hour, not
      // green until its last fortnight.
      for (const c of appleMapsTokenContract(h)) ctx.ok(c.label, c.pass, c.expected, c.actual);
      ctx.note(`token: format=${h.format} nonExpiring=${h.nonExpiring} temporary=${h.temporary} originRestricted=${h.originRestricted} origins=${JSON.stringify(h.origins || [])} expiresAt=${h.expiresAt || "none"} daysLeft=${h.daysLeft}`);

      // 2. a real reader's map: a curated Florida event with coordinates
      const page = await ctx.openPage({ viewport: { width: 1280, height: 900 } });
      const listUrl = ctx.baseUrl + "/florida-events";
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      ctx.setUrl(listUrl);
      const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/florida-events/"]')].map((a) => a.getAttribute("href")).filter((h) => /^\/florida-events\/[^/?#]+$/.test(h)))]);
      ctx.ok("the Florida events listing links to real event pages", hrefs.length > 0, "> 0", hrefs.length);

      // Not every event stores coordinates (an address-only row renders the
      // Where card with no map, by design). Walk the listing until one page
      // mounts the map host, then judge THAT page.
      let mapped = null;
      for (const href of hrefs.slice(0, 8)) {
        const url = ctx.baseUrl + href;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const hosts = await page.locator('[aria-label="Venue map loads as you scroll"], .wfev').count().catch(() => 0);
        if (hosts > 0) { mapped = url; break; }
      }
      ctx.ok("at least one of the first eight event pages carries a venue map (coordinates on record)", !!mapped, "a mapped event", mapped || "none in the first 8");
      if (!mapped) return;
      ctx.setUrl(mapped);

      // The map is lazy: scroll its host into view, then wait for MapKit's
      // own root element, which only exists once Apple accepted the token.
      await page.locator('[aria-label="Venue map loads as you scroll"], .wfev').first().scrollIntoViewIfNeeded().catch(() => {});
      let painted = false;
      try { await page.locator(".wfev .mk-map-view").first().waitFor({ state: "attached", timeout: 25000 }); painted = true; } catch {}
      ctx.ok("Apple MapKit painted a real map inside the event's map frame (.mk-map-view attached)", painted, true, painted);
      const fallbackVisible = await page.locator(".wfev-fb").count().catch(() => 0);
      ctx.ok("the reader is not looking at the 'map preview is unavailable' fallback", fallbackVisible === 0, 0, fallbackVisible);
      const appleLink = await page.locator('a[href^="https://maps.apple.com/?daddr="]').count().catch(() => 0);
      ctx.ok("the page's outbound navigation link opens Apple Maps directions", appleLink > 0, "> 0", appleLink);
      const googleLink = await page.locator('a[href*="google.com/maps"]').count().catch(() => 0);
      ctx.ok("no Google Maps link remains on the event page", googleLink === 0, 0, googleLink);
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
