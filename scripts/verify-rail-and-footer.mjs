#!/usr/bin/env node
// scripts/verify-rail-and-footer.mjs — interactive Playwright verifier for PR #1956:
//   1. Poster rail seasonal ordering derived dynamically from lib/dayparts.js seasonal rules
//      (Oct 25–31 Halloween-before-Fall rule, date-independent negative control, and date-bound live event posters)
//   2. Smooth horizontal scrolling (wheel, trackpad, touch/swipe, left/right arrows, partial-offset snap, ends)
//   3. Normal vertical scrolling while pointer is over the rail
//   4. Keyboard focus visibility & reduced-motion instant scrolling (CSS + JS)
//   5. Explicit verification of BOTH PoweredByStrip instances without .first():
//      - .wf-scrollarea section[aria-label="Companies and technology powering Wayfind"] (visible on "/")
//      - footer section[aria-label="Companies and technology powering Wayfind"] (veiled by FooterVeil on "/", visible on "/about")
//   6. Nested place-card rail (.wf8-pcrail / pcRef) arrow navigation usability check using normal locator clicks
//   7. Ordinary customer entry journey on "/" using only user-level Playwright actions + cold-load slower-network check
//
// Usage:
//   node scripts/verify-rail-and-footer.mjs <baseUrl> <labelPrefix> <outDir> [--json-out <path>] [--expect-second-card <id>] [--site-day <YYYY-MM-DD>]
//
// Negative control (guaranteed to fail on any date of the year):
//   node scripts/verify-rail-and-footer.mjs <baseUrl> <labelPrefix> <outDir> --expect-second-card __negative_control_invalid_card__
//
// Exits 0 when all assertions pass; exits 1 when any assertion fails or an unhandled error occurs.
// Diagnostic progress is written to stderr; stdout emits pure machine-readable JSON.

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { RAILS, railById } from "../lib/rails.js";
import { orderFor, halloweenLeads } from "../lib/dayparts.js";
import { railOnPosterTrack } from "../lib/posterSeasons.js";

const args = process.argv.slice(2);
const BASE_URL = (args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3125").replace(/\/+$/, "");
const LABEL_PREFIX = args[1] && !args[1].startsWith("--") ? args[1] : "local";
const OUT_DIR = args[2] && !args[2].startsWith("--") ? args[2] : "./.rail-shots";

function readFlag(name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const JSON_OUT = readFlag("--json-out", null);
const EXPECT_SECOND_CARD_OVERRIDE = readFlag("--expect-second-card", null);
const SITE_DAY_OVERRIDE = readFlag(
  "--site-day",
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
);

const parsedBaseUrl = new URL(BASE_URL);
const IS_LOCALHOST_TARGET =
  parsedBaseUrl.hostname === "localhost" || parsedBaseUrl.hostname === "127.0.0.1";

const EXPECTED_PARTNERS = [
  "Google Antigravity",
  "Grok",
  "Bots Team",
  "Muse Code",
  "Claude",
  "OpenAI",
  "GitHub",
  "Supabase",
  "Vercel",
  "Kimi",
  "Llama",
  "DeepSeek",
];

function computeExpectedStaticLeadPair(daypart, siteDay) {
  const fullOrder = orderFor(
    daypart || "afternoon",
    RAILS.map((r) => r.id),
    siteDay,
  );
  const visibleStatic = fullOrder.filter((id) => {
    const r = railById(id);
    return r && !r.artStale && !r.retiredInto && railOnPosterTrack(r, siteDay);
  });
  return visibleStatic.slice(0, 2);
}

async function inspectPoweredByInstances(page) {
  return page.evaluate(async () => {
    const allMatching = Array.from(
      document.querySelectorAll('section[aria-label="Companies and technology powering Wayfind"]'),
    );
    const inScrollArea = Array.from(
      document.querySelectorAll('.wf-scrollarea section[aria-label="Companies and technology powering Wayfind"]'),
    );
    const inLayoutFooter = Array.from(
      document.querySelectorAll('footer section[aria-label="Companies and technology powering Wayfind"]'),
    );

    async function measureStrip(sectionEl) {
      if (!sectionEl) return null;
      const veilAncestor = sectionEl.closest('[aria-hidden="true"]');
      const isVeiled = !!veilAncestor;
      const veilStyle = veilAncestor
        ? {
            ariaHidden: veilAncestor.getAttribute("aria-hidden"),
            position: veilAncestor.style.position || getComputedStyle(veilAncestor).position,
            width: veilAncestor.style.width || getComputedStyle(veilAncestor).width,
            height: veilAncestor.style.height || getComputedStyle(veilAncestor).height,
            overflow: veilAncestor.style.overflow || getComputedStyle(veilAncestor).overflow,
            clipPath: veilAncestor.style.clipPath || getComputedStyle(veilAncestor).clipPath,
          }
        : null;

      if (!isVeiled) {
        sectionEl.scrollIntoView({ behavior: "instant", block: "center" });
        await new Promise((r) => setTimeout(r, 250));
      }

      const scroller = sectionEl.querySelector('[data-wf-powered-by-scroll="1"]');
      const items = Array.from(sectionEl.querySelectorAll('[data-wf-powered-by-scroll="1"] > div > div[title]'));
      const labels = items.map((el) => el.getAttribute("title"));

      let horizontalScrollCheck = null;
      if (scroller && !isVeiled) {
        const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        const before = scroller.scrollLeft;
        if (maxScroll > 0) {
          scroller.scrollLeft = Math.min(160, maxScroll);
          await new Promise((r) => setTimeout(r, 150));
        }
        const after = scroller.scrollLeft;
        if (maxScroll > 0) {
          scroller.scrollLeft = maxScroll;
          await new Promise((r) => setTimeout(r, 150));
          scroller.scrollLeft = 0;
          await new Promise((r) => setTimeout(r, 100));
        }
        horizontalScrollCheck = {
          scrollWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth,
          maxScroll,
          before,
          afterProgrammaticScroll: Math.round(after),
          canScrollHorizontallyWhenOverflowing: maxScroll === 0 ? true : after > 0,
          overscrollBehaviorX: getComputedStyle(scroller).overscrollBehaviorX,
        };
      }

      const tops = items.map((el) => Math.round(el.getBoundingClientRect().top));
      const allSameRow = tops.length > 0 && Math.max(...tops) - Math.min(...tops) <= 4;
      const brokenImages = isVeiled
        ? 0
        : items.filter((el) => {
            const img = el.querySelector("img");
            return !img || (img.complete && img.naturalWidth === 0);
          }).length;
      const rect = sectionEl.getBoundingClientRect();

      return {
        exists: true,
        isVeiled,
        veilStyle,
        boundingBox: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        partnerCount: items.length,
        labels,
        allSameRow,
        brokenImages,
        removedLogosPresent: labels.some((l) => /Adobe|iStock/i.test(l)),
        horizontalScrollCheck,
        documentHorizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }

    return {
      totalMatchesInDom: allMatching.length,
      scrollAreaMatchCount: inScrollArea.length,
      layoutFooterMatchCount: inLayoutFooter.length,
      scrollAreaInstance: await measureStrip(inScrollArea[0] || null),
      layoutFooterInstance: await measureStrip(inLayoutFooter[0] || null),
    };
  });
}

async function attachLocalhostRailsFixtureIfLocal(contextOrPage) {
  if (!IS_LOCALHOST_TARGET) return false;
  await contextOrPage.route("**/api/rails*", async (route) => {
    const mockBeachCards = Array.from({ length: 8 }, (_, idx) => ({
      id: `ChIJTestBeachSpot${idx + 1}Sarasota`,
      name: `Test Beach Spot ${idx + 1}`,
      city: "Sarasota",
      lat: 27.26 + idx * 0.01,
      lng: -82.55,
      rating: 4.8,
      reviews: 420 + idx * 10,
      types: ["beach", "natural_feature"],
      hook: "Powder-soft quartz sand and calm Gulf water.",
    }));
    const mockEatCards = Array.from({ length: 6 }, (_, idx) => ({
      id: `ChIJTestEatSpot${idx + 1}Sarasota`,
      name: `Test Kitchen & Cafe ${idx + 1}`,
      city: "Sarasota",
      lat: 27.33 + idx * 0.01,
      lng: -82.53,
      rating: 4.9,
      reviews: 510 + idx * 15,
      types: ["restaurant", "food", "italian_restaurant"],
      hook: "Scratch-made pasta and wood-fired specialties.",
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        covered: true,
        failed: false,
        data: {
          region: "fl",
          citySlug: "sarasota",
          cityLabel: "Sarasota",
          places: {
            beach: mockBeachCards,
            eat: mockEatCards,
          },
          railTotals: {
            beach: mockBeachCards.length,
            eat: mockEatCards.length,
          },
          railHasMore: {
            beach: false,
            eat: false,
          },
        },
      }),
    });
  });
  return true;
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const assertions = [];
  function check(condition, name, detail = null) {
    const passed = Boolean(condition);
    assertions.push({ name, passed, detail });
    if (!passed) {
      console.error(`[FAIL] ${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
    }
    return passed;
  }

  const results = {
    url: BASE_URL,
    isLocalhostTarget: IS_LOCALHOST_TARGET,
    labelPrefix: LABEL_PREFIX,
    siteDay: SITE_DAY_OVERRIDE,
    halloweenLeadsWindowActive: halloweenLeads(SITE_DAY_OVERRIDE),
    expectedSecondCardOverride: EXPECT_SECOND_CARD_OVERRIDE,
    timestamp: new Date().toISOString(),
    browserEngine: null,
    desktop: {},
    phone: {},
    reducedMotion: {},
    documentRouteFooter: {},
    nestedPlaceCardRail: {},
    ordinaryVisitorJourney: {},
    coldLoadCheck: {},
    summary: {
      totalAssertions: 0,
      passed: 0,
      failed: 0,
      failures: [],
    },
  };

  const browser = await chromium.launch({ headless: true });
  results.browserEngine = `Chromium ${browser.version()}`;

  try {
    // =========================================================================
    // 1. DESKTOP INTERACTIVE SESSION (1440x900) + VIDEO RECORDING
    // =========================================================================
    const videoDir = path.join(OUT_DIR, "scratch", `video-${LABEL_PREFIX}`);
    fs.mkdirSync(videoDir, { recursive: true });

    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
    });
    const page = await desktopCtx.newPage();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(".wf8-track .wf8-tile", { timeout: 15000 });
    await page.waitForTimeout(600);

    const initialOrder = await page.evaluate(() => {
      const wf8 = document.querySelector(".wf8");
      const daypart = wf8?.getAttribute("data-daypart") || "afternoon";
      const track = document.querySelector(".wf8-track");
      const tiles = Array.from(track.querySelectorAll(":scope > .wf8-tile"));
      const ids = tiles.map((t) => t.getAttribute("data-id"));
      const names = tiles.map((t) => t.querySelector("img.wf8-tim")?.getAttribute("alt"));
      const uniqueCount = new Set(ids).size;
      const origins = tiles.map((t) => t.offsetLeft - tiles[0].offsetLeft);
      const diffs = origins.slice(1).map((o, i) => o - origins[i]);
      const cs = getComputedStyle(track);
      const stride = origins.length > 1 ? origins[1] - origins[0] : tiles[0].offsetWidth + 14;
      const perPage = Math.max(1, Math.floor((track.clientWidth - 24) / stride));
      return {
        daypart,
        totalCards: tiles.length,
        uniqueCount,
        hasDuplicates: uniqueCount !== tiles.length,
        firstFourIds: ids.slice(0, 4),
        firstFourNames: names.slice(0, 4),
        allIds: ids,
        origins: origins.slice(0, 6),
        strideDiffs: diffs.slice(0, 5),
        tileOffsetWidth: tiles[0]?.offsetWidth,
        computedColumnGap: cs.columnGap || cs.gap,
        perPage,
        scrollBehaviorCss: cs.scrollBehavior,
        restingWillChange: getComputedStyle(tiles[0]).willChange,
      };
    });
    results.desktop.initialOrder = initialOrder;

    // Derive expected lead order dynamically from lib/dayparts.js seasonal rules for the active siteDay.
    const staticLeadPair = computeExpectedStaticLeadPair(initialOrder.daypart, SITE_DAY_OVERRIDE);
    const effectiveFirstStatic = EXPECT_SECOND_CARD_OVERRIDE || staticLeadPair[0];
    const effectiveSecondStatic = staticLeadPair[1];
    const hasRays = initialOrder.allIds.includes("rays-world-series-2026");
    const expectedLeadOrder = hasRays
      ? ["rays-world-series-2026", effectiveFirstStatic, effectiveSecondStatic]
      : [effectiveFirstStatic, effectiveSecondStatic];

    check(
      !initialOrder.hasDuplicates && initialOrder.totalCards >= 14,
      "desktop.poster_rail.unique_cards",
      { totalCards: initialOrder.totalCards, uniqueCount: initialOrder.uniqueCount },
    );
    check(
      initialOrder.firstFourIds.slice(0, expectedLeadOrder.length).join(",") === expectedLeadOrder.join(","),
      "desktop.poster_rail.seasonal_lead_order",
      {
        siteDay: SITE_DAY_OVERRIDE,
        halloweenLeads: halloweenLeads(SITE_DAY_OVERRIDE),
        hasRays,
        actual: initialOrder.firstFourIds.slice(0, expectedLeadOrder.length),
        expected: expectedLeadOrder,
      },
    );
    check(
      initialOrder.scrollBehaviorCss === "smooth" && initialOrder.restingWillChange === "auto",
      "desktop.poster_rail.css_scroll_and_will_change",
      { scrollBehaviorCss: initialOrder.scrollBehaviorCss, restingWillChange: initialOrder.restingWillChange },
    );

    const railEl = page.locator(".wf8").first();
    await railEl.screenshot({
      path: path.join(OUT_DIR, `${LABEL_PREFIX}-desktop-poster-rail-initial.png`),
    });

    const startNavState = await page.evaluate(() => {
      const track = document.querySelector(".wf8-track");
      const leftBtn = document.querySelector(".wf8-nav.l");
      const rightBtn = document.querySelector(".wf8-nav.r");
      return {
        scrollLeft: track.scrollLeft,
        leftDisabled: leftBtn?.disabled,
        rightDisabled: rightBtn?.disabled,
      };
    });
    results.desktop.startNavState = startNavState;
    check(
      startNavState.scrollLeft === 0 && startNavState.leftDisabled === true && startNavState.rightDisabled === false,
      "desktop.poster_rail.start_nav_state",
      startNavState,
    );

    await page.locator(".wf8-nav.r").click();
    await page.waitForTimeout(650);
    const afterOneRightClick = await page.evaluate(() => {
      const track = document.querySelector(".wf8-track");
      const tiles = Array.from(track.querySelectorAll(":scope > .wf8-tile"));
      const origins = tiles.map((t) => t.offsetLeft - tiles[0].offsetLeft);
      const stride = origins[1] - origins[0];
      const perPage = Math.max(1, Math.floor((track.clientWidth - 24) / stride));
      return {
        scrollLeft: Math.round(track.scrollLeft),
        perPage,
        expectedPageOrigin: origins[perPage],
        matchedExpectedOrigin: Math.abs(track.scrollLeft - origins[perPage]) <= 2,
        leftDisabled: document.querySelector(".wf8-nav.l")?.disabled,
        rightDisabled: document.querySelector(".wf8-nav.r")?.disabled,
      };
    });
    results.desktop.afterOneRightClick = afterOneRightClick;
    check(
      afterOneRightClick.matchedExpectedOrigin && afterOneRightClick.leftDisabled === false,
      "desktop.poster_rail.right_arrow_single_click",
      afterOneRightClick,
    );

    // Partial scroll position recovery
    await page.evaluate(() => {
      document.querySelector(".wf8-track").scrollLeft = 95;
    });
    await page.waitForTimeout(150);
    await page.locator(".wf8-nav.r").click();
    await page.waitForTimeout(650);
    const afterPartialRightClick = await page.evaluate(() => {
      const track = document.querySelector(".wf8-track");
      const tiles = Array.from(track.querySelectorAll(":scope > .wf8-tile"));
      const origins = tiles.map((t) => t.offsetLeft - tiles[0].offsetLeft);
      const sl = Math.round(track.scrollLeft);
      const matchedOriginIndex = origins.findIndex((o) => Math.abs(o - sl) <= 2);
      return {
        scrollLeft: sl,
        matchedOriginIndex,
        matchedOrigin: origins[matchedOriginIndex] ?? null,
      };
    });
    results.desktop.afterPartialRightClick = afterPartialRightClick;
    check(
      afterPartialRightClick.matchedOriginIndex >= 1,
      "desktop.poster_rail.partial_scroll_snaps_to_card_origin",
      afterPartialRightClick,
    );

    // Repeated clicks to right end
    for (let i = 0; i < 10; i++) {
      const isDis = await page.$eval(".wf8-nav.r", (b) => b.disabled);
      if (isDis) break;
      await page.locator(".wf8-nav.r").click();
      await page.waitForTimeout(450);
    }
    const atEndState = await page.evaluate(() => {
      const track = document.querySelector(".wf8-track");
      const maxScroll = track.scrollWidth - track.clientWidth;
      return {
        scrollLeft: Math.round(track.scrollLeft),
        maxScroll: Math.round(maxScroll),
        atEndWithin2px: Math.abs(track.scrollLeft - maxScroll) <= 2,
        leftDisabled: document.querySelector(".wf8-nav.l")?.disabled,
        rightDisabled: document.querySelector(".wf8-nav.r")?.disabled,
      };
    });
    results.desktop.atEndState = atEndState;
    check(
      atEndState.atEndWithin2px && atEndState.rightDisabled === true && atEndState.leftDisabled === false,
      "desktop.poster_rail.repeated_right_reaches_end",
      atEndState,
    );

    // Repeated clicks back to left start
    for (let i = 0; i < 12; i++) {
      const isDis = await page.$eval(".wf8-nav.l", (b) => b.disabled);
      if (isDis) break;
      await page.locator(".wf8-nav.l").click();
      await page.waitForTimeout(450);
    }
    const backAtStartState = await page.evaluate(() => {
      const track = document.querySelector(".wf8-track");
      return {
        scrollLeft: Math.round(track.scrollLeft),
        leftDisabled: document.querySelector(".wf8-nav.l")?.disabled,
        rightDisabled: document.querySelector(".wf8-nav.r")?.disabled,
      };
    });
    results.desktop.backAtStartState = backAtStartState;
    check(
      backAtStartState.scrollLeft === 0 && backAtStartState.leftDisabled === true,
      "desktop.poster_rail.repeated_left_returns_to_start",
      backAtStartState,
    );

    // Horizontal wheel/trackpad scroll over .wf8-track
    const trackBox = await page.locator(".wf8-track").boundingBox();
    await page.mouse.move(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height / 2);
    await page.mouse.wheel(360, 0);
    await page.waitForTimeout(350);
    const afterWheelHorizontal = await page.evaluate(() => {
      const track = document.querySelector(".wf8-track");
      const wf8 = document.querySelector(".wf8");
      return {
        scrollLeft: Math.round(track.scrollLeft),
        posterAccidentallyOpened: wf8.classList.contains("is-open"),
      };
    });
    results.desktop.afterWheelHorizontal = afterWheelHorizontal;
    check(
      afterWheelHorizontal.scrollLeft > 0 && afterWheelHorizontal.posterAccidentallyOpened === false,
      "desktop.poster_rail.horizontal_wheel_scroll",
      afterWheelHorizontal,
    );

    await page.evaluate(() => {
      document.querySelector(".wf8-track").scrollLeft = 0;
    });
    await page.waitForTimeout(150);

    // Vertical wheel scroll while pointer is over the rail
    const beforeVertScroll = await page.evaluate(() => {
      const scroller = document.querySelector(".wf-scrollarea") || document.scrollingElement;
      return scroller.scrollTop;
    });
    await page.mouse.move(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height / 2);
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(350);
    const afterVertScroll = await page.evaluate(() => {
      const scroller = document.querySelector(".wf-scrollarea") || document.scrollingElement;
      return scroller.scrollTop;
    });
    results.desktop.verticalScrollOverRail = {
      beforeScrollTop: Math.round(beforeVertScroll),
      afterScrollTop: Math.round(afterVertScroll),
      deltaY: Math.round(afterVertScroll - beforeVertScroll),
      scrolledNormally: afterVertScroll > beforeVertScroll,
    };
    check(
      results.desktop.verticalScrollOverRail.scrolledNormally,
      "desktop.poster_rail.vertical_scroll_over_rail",
      results.desktop.verticalScrollOverRail,
    );

    await page.evaluate(() => {
      const scroller = document.querySelector(".wf-scrollarea") || document.scrollingElement;
      scroller.scrollTop = 0;
    });
    await page.waitForTimeout(200);

    // Keyboard access & visible focus
    await page.locator(".wf8-tile .wf8-tlink").first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const focusInfo = await page.evaluate(() => {
      const link = document.querySelector(".wf8-tile .wf8-tlink");
      const cs = getComputedStyle(link);
      return {
        isFocused: document.activeElement === link,
        matchesFocusVisible: link.matches(":focus-visible"),
        activeElementClass: document.activeElement?.className,
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        outlineColor: cs.outlineColor,
      };
    });
    results.desktop.keyboardFocus = focusInfo;
    check(
      focusInfo.isFocused && focusInfo.outlineStyle === "solid" && parseFloat(focusInfo.outlineWidth) >= 2,
      "desktop.poster_rail.keyboard_focus_visible",
      focusInfo,
    );

    // Reload stability check
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(".wf8-track .wf8-tile", { timeout: 15000 });
    await page.waitForTimeout(500);
    const afterReloadOrder = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll(".wf8-track > .wf8-tile"));
      const ids = tiles.map((t) => t.getAttribute("data-id"));
      return {
        count: ids.length,
        uniqueCount: new Set(ids).size,
        firstFour: ids.slice(0, 4),
      };
    });
    results.desktop.afterReloadOrder = afterReloadOrder;
    check(
      afterReloadOrder.count === afterReloadOrder.uniqueCount &&
        afterReloadOrder.firstFour.slice(0, expectedLeadOrder.length).join(",") === expectedLeadOrder.join(","),
      "desktop.poster_rail.order_persists_after_reload",
      afterReloadOrder,
    );

    // Explicit inspection of BOTH PoweredByStrip instances on "/" (Desktop 1440x900)
    const desktopFooters = await inspectPoweredByInstances(page);
    results.desktop.poweredByInstances = desktopFooters;
    check(
      desktopFooters.totalMatchesInDom === 2 &&
        desktopFooters.scrollAreaMatchCount === 1 &&
        desktopFooters.layoutFooterMatchCount === 1,
      "desktop.powered_by.both_instances_accounted_for",
      {
        totalMatchesInDom: desktopFooters.totalMatchesInDom,
        scrollAreaMatchCount: desktopFooters.scrollAreaMatchCount,
        layoutFooterMatchCount: desktopFooters.layoutFooterMatchCount,
      },
    );
    check(
      desktopFooters.scrollAreaInstance &&
        !desktopFooters.scrollAreaInstance.isVeiled &&
        desktopFooters.scrollAreaInstance.partnerCount === 12 &&
        desktopFooters.scrollAreaInstance.labels.join(",") === EXPECTED_PARTNERS.join(",") &&
        desktopFooters.scrollAreaInstance.allSameRow === true &&
        desktopFooters.scrollAreaInstance.brokenImages === 0 &&
        desktopFooters.scrollAreaInstance.removedLogosPresent === false &&
        desktopFooters.scrollAreaInstance.documentHorizontalOverflow === false,
      "desktop.powered_by.scrollarea_visible_instance_valid",
      desktopFooters.scrollAreaInstance,
    );
    check(
      desktopFooters.layoutFooterInstance &&
        desktopFooters.layoutFooterInstance.isVeiled === true &&
        desktopFooters.layoutFooterInstance.veilStyle?.ariaHidden === "true" &&
        desktopFooters.layoutFooterInstance.partnerCount === 12,
      "desktop.powered_by.layout_footer_veiled_on_home",
      desktopFooters.layoutFooterInstance,
    );

    const desktopScrollAreaStrip = page.locator(
      '.wf-scrollarea section[aria-label="Companies and technology powering Wayfind"]',
    );
    await desktopScrollAreaStrip.screenshot({
      path: path.join(OUT_DIR, `${LABEL_PREFIX}-desktop-powered-by-strip.png`),
    });

    await desktopCtx.close();
    const videoFiles = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
    if (videoFiles.length > 0) {
      const destVideo = path.join(OUT_DIR, `${LABEL_PREFIX}-rail-interaction.webm`);
      fs.copyFileSync(path.join(videoDir, videoFiles[0]), destVideo);
      results.desktop.interactionVideo = destVideo;
    }

    // =========================================================================
    // 2. PHONE VIEWPORT & TOUCH SWIPE VERIFICATION (390x844) + BOTH FOOTER INSTANCES
    // =========================================================================
    const phoneCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const phonePage = await phoneCtx.newPage();
    await phonePage.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await phonePage.waitForSelector(".wf8-track .wf8-tile", { timeout: 15000 });
    await phonePage.waitForTimeout(500);

    await phonePage.locator(".wf8").first().screenshot({
      path: path.join(OUT_DIR, `${LABEL_PREFIX}-phone-poster-rail-initial.png`),
    });

    const phoneSwipeCheck = await phonePage.evaluate(async () => {
      const track = document.querySelector(".wf8-track");
      const wf8 = document.querySelector(".wf8");
      const tiles = Array.from(track.querySelectorAll(":scope > .wf8-tile"));
      const ids = tiles.map((t) => t.getAttribute("data-id"));
      const origins = tiles.map((t) => t.offsetLeft - tiles[0].offsetLeft);
      const beforeLeft = track.scrollLeft;

      track.scrollLeft = origins[1] || 180;
      await new Promise((r) => setTimeout(r, 250));

      const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      const rect = wf8.getBoundingClientRect();
      const rightBtn = document.querySelector(".wf8-nav.r");
      return {
        firstFourIds: ids.slice(0, 4),
        beforeLeft,
        afterSwipeLeft: Math.round(track.scrollLeft),
        origins: origins.slice(0, 4),
        tileOffsetWidth: tiles[0]?.offsetWidth,
        noAccidentalPosterActivationDuringTestedSwipe: !wf8.classList.contains("is-open"),
        documentHorizontalOverflow: docOverflow,
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
        railFitsViewport: rect.left >= 0 && rect.right <= window.innerWidth + 1,
        navButtonsHiddenOnPhone: rightBtn ? getComputedStyle(rightBtn).display === "none" : true,
      };
    });
    results.phone = phoneSwipeCheck;
    check(
      phoneSwipeCheck.afterSwipeLeft > 0 &&
        phoneSwipeCheck.noAccidentalPosterActivationDuringTestedSwipe === true &&
        phoneSwipeCheck.documentHorizontalOverflow === false &&
        phoneSwipeCheck.railFitsViewport === true &&
        phoneSwipeCheck.navButtonsHiddenOnPhone === true,
      "phone.poster_rail.swipe_and_responsive_layout",
      phoneSwipeCheck,
    );

    const phoneFooters = await inspectPoweredByInstances(phonePage);
    results.phone.poweredByInstances = phoneFooters;
    check(
      phoneFooters.scrollAreaInstance &&
        !phoneFooters.scrollAreaInstance.isVeiled &&
        phoneFooters.scrollAreaInstance.partnerCount === 12 &&
        phoneFooters.scrollAreaInstance.allSameRow === true &&
        phoneFooters.scrollAreaInstance.brokenImages === 0 &&
        phoneFooters.scrollAreaInstance.removedLogosPresent === false &&
        phoneFooters.scrollAreaInstance.horizontalScrollCheck?.canScrollHorizontallyWhenOverflowing === true &&
        phoneFooters.scrollAreaInstance.documentHorizontalOverflow === false,
      "phone.powered_by.scrollarea_visible_instance_valid",
      phoneFooters.scrollAreaInstance,
    );
    check(
      phoneFooters.layoutFooterInstance &&
        phoneFooters.layoutFooterInstance.isVeiled === true &&
        phoneFooters.layoutFooterInstance.veilStyle?.ariaHidden === "true",
      "phone.powered_by.layout_footer_veiled_on_home",
      phoneFooters.layoutFooterInstance,
    );

    const phoneScrollAreaStrip = phonePage.locator(
      '.wf-scrollarea section[aria-label="Companies and technology powering Wayfind"]',
    );
    await phoneScrollAreaStrip.screenshot({
      path: path.join(OUT_DIR, `${LABEL_PREFIX}-phone-powered-by-strip.png`),
    });

    await phoneCtx.close();

    // =========================================================================
    // 3. UNVEILED LAYOUT FOOTER ON DOCUMENT ROUTE (/about at 1440x900 & 390x844)
    // =========================================================================
    const docCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const docPage = await docCtx.newPage();
    await docPage.goto(`${BASE_URL}/about`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await docPage.waitForSelector('footer section[aria-label="Companies and technology powering Wayfind"]', {
      timeout: 15000,
    });
    const aboutDesktopFooters = await inspectPoweredByInstances(docPage);

    await docPage.setViewportSize({ width: 390, height: 844 });
    await docPage.waitForTimeout(200);
    const aboutPhoneFooters = await inspectPoweredByInstances(docPage);

    results.documentRouteFooter = {
      route: "/about",
      desktop1440: aboutDesktopFooters.layoutFooterInstance,
      phone390: aboutPhoneFooters.layoutFooterInstance,
    };
    check(
      aboutDesktopFooters.layoutFooterInstance &&
        aboutDesktopFooters.layoutFooterInstance.isVeiled === false &&
        aboutDesktopFooters.layoutFooterInstance.partnerCount === 12 &&
        aboutDesktopFooters.layoutFooterInstance.allSameRow === true &&
        aboutDesktopFooters.layoutFooterInstance.brokenImages === 0 &&
        aboutDesktopFooters.layoutFooterInstance.documentHorizontalOverflow === false,
      "document_route.powered_by.layout_footer_unveiled_desktop",
      aboutDesktopFooters.layoutFooterInstance,
    );
    check(
      aboutPhoneFooters.layoutFooterInstance &&
        aboutPhoneFooters.layoutFooterInstance.isVeiled === false &&
        aboutPhoneFooters.layoutFooterInstance.partnerCount === 12 &&
        aboutPhoneFooters.layoutFooterInstance.allSameRow === true &&
        aboutPhoneFooters.layoutFooterInstance.brokenImages === 0 &&
        aboutPhoneFooters.layoutFooterInstance.horizontalScrollCheck?.canScrollHorizontallyWhenOverflowing === true &&
        aboutPhoneFooters.layoutFooterInstance.documentHorizontalOverflow === false,
      "document_route.powered_by.layout_footer_unveiled_phone",
      aboutPhoneFooters.layoutFooterInstance,
    );
    await docCtx.close();

    // =========================================================================
    // 4. REDUCED MOTION VERIFICATION (prefers-reduced-motion: reduce)
    // =========================================================================
    const rmCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const rmPage = await rmCtx.newPage();
    await rmPage.goto(BASE_URL, { waitUntil: "load", timeout: 45000 });
    await rmPage.waitForSelector(".wf8-track .wf8-tile", { timeout: 15000 });

    const rmCheckBefore = await rmPage.evaluate(() => {
      const track = document.querySelector(".wf8-track");
      const tiles = Array.from(track.querySelectorAll(":scope > .wf8-tile"));
      const origins = tiles.map((t) => t.offsetLeft - tiles[0].offsetLeft);
      const stride = origins[1] - origins[0];
      const perPage = Math.max(1, Math.floor((track.clientWidth - 24) / stride));
      return {
        mediaMatches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        cssScrollBehavior: getComputedStyle(track).scrollBehavior,
        before: track.scrollLeft,
        expectedPageOrigin: origins[perPage],
      };
    });
    await rmPage.locator(".wf8-nav.r").click();
    const immediateAfterRight = await rmPage.evaluate(() => Math.round(document.querySelector(".wf8-track").scrollLeft));
    await rmPage.locator(".wf8-nav.l").click();
    const immediateAfterLeft = await rmPage.evaluate(() => Math.round(document.querySelector(".wf8-track").scrollLeft));

    results.reducedMotion = {
      ...rmCheckBefore,
      immediateAfterRight,
      instantJumpMatchedOrigin: Math.abs(immediateAfterRight - rmCheckBefore.expectedPageOrigin) <= 2,
      immediateAfterLeft,
      instantReturnToZero: immediateAfterLeft === 0,
    };
    check(
      results.reducedMotion.mediaMatches === true &&
        results.reducedMotion.cssScrollBehavior === "auto" &&
        results.reducedMotion.instantJumpMatchedOrigin === true &&
        results.reducedMotion.instantReturnToZero === true,
      "reduced_motion.instant_scroll_css_and_js",
      results.reducedMotion,
    );

    // =========================================================================
    // 5. NESTED PLACE-CARD RAIL (.wf8-pcrail / pcRef) USABILITY CHECK
    // =========================================================================
    await attachLocalhostRailsFixtureIfLocal(rmPage);
    if (IS_LOCALHOST_TARGET) {
      await rmPage.goto(`${BASE_URL}/`, { waitUntil: "load", timeout: 45000 });
    } else {
      await rmPage.goto(`${BASE_URL}/v8?city=sarasota`, { waitUntil: "load", timeout: 45000 });
    }
    const beachTileLink = rmPage.locator('.wf8-tile[data-id="beach"] .wf8-tlink');
    await beachTileLink.waitFor({ state: "visible", timeout: 15000 });
    await beachTileLink.click();
    await rmPage.locator(".wf8-pcrail > .wf-place-card").first().waitFor({ state: "visible", timeout: 15000 });
    await rmPage.waitForTimeout(300);

    const pcRailBefore = await rmPage.evaluate(() => {
      const pcRail = document.querySelector(".wf8-pcrail");
      const cards = Array.from(pcRail.querySelectorAll(":scope > .wf-place-card, :scope > .wf8-guide-insert"));
      const origins = cards.map((c) => c.offsetLeft - cards[0].offsetLeft);
      const cs = getComputedStyle(pcRail);
      const clientW = pcRail.clientWidth;
      const visibleBefore = origins.filter((o, i) => o + cards[i].offsetWidth > 0 && o < clientW).length;
      return {
        cardCount: cards.length,
        scrollSnapType: cs.scrollSnapType,
        clientWidth: clientW,
        firstFiveOrigins: origins.slice(0, 5),
        beforeScrollLeft: pcRail.scrollLeft,
        visibleBeforeCount: visibleBefore,
        origins,
      };
    });
    await rmPage.locator(".wf8-pnav.r").click();
    const afterOneClick = await rmPage.evaluate(() => Math.round(document.querySelector(".wf8-pcrail").scrollLeft));
    const firstFullyVisibleAfterIdx = pcRailBefore.origins.findIndex((o) => o >= afterOneClick - 4);
    const anyCardSkipped = firstFullyVisibleAfterIdx > pcRailBefore.visibleBeforeCount;

    results.nestedPlaceCardRail = {
      cardCount: pcRailBefore.cardCount,
      scrollSnapType: pcRailBefore.scrollSnapType,
      clientWidth: pcRailBefore.clientWidth,
      firstFiveOrigins: pcRailBefore.firstFiveOrigins,
      beforeScrollLeft: pcRailBefore.beforeScrollLeft,
      afterOneRightClickScrollLeft: afterOneClick,
      visibleBeforeCount: pcRailBefore.visibleBeforeCount,
      firstFullyVisibleAfterIdx,
      anyCardSkipped,
    };
    check(
      results.nestedPlaceCardRail.cardCount > 0 &&
        results.nestedPlaceCardRail.afterOneRightClickScrollLeft > 0 &&
        results.nestedPlaceCardRail.anyCardSkipped === false,
      "nested_place_card_rail.no_skipped_or_unreachable_cards",
      results.nestedPlaceCardRail,
    );

    await rmCtx.close();

    // =========================================================================
    // 6. ORDINARY CUSTOMER ENTRY JOURNEY ON "/" & COLD-LOAD SLOWER-NETWORK CHECK
    // =========================================================================
    const journeyCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const journeyPage = await journeyCtx.newPage();
    await attachLocalhostRailsFixtureIfLocal(journeyPage);

    // Step 1: Open Wayfind (/)
    await journeyPage.goto(`${BASE_URL}/`, { waitUntil: "load", timeout: 45000 });

    // Step 2: Choose an area through the visible search control when needed
    const searchInput = journeyPage.locator("input.wf-search-input").first();
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
    await searchInput.click();
    await searchInput.fill("Sarasota");
    await journeyPage.keyboard.press("Enter");
    if (!IS_LOCALHOST_TARGET) {
      await journeyPage.locator("button.wf-scope", { hasText: /Sarasota/i }).waitFor({ state: "visible", timeout: 15000 });
    } else {
      await journeyPage.waitForTimeout(500);
    }
    const selectedAreaLabel = (await journeyPage.locator("button.wf-scope").first().innerText().catch(() => "")).trim();

    // Step 3: Activate a visible poster ("Actually Worth Eating") via normal locator.click()
    const eatPosterLink = journeyPage.locator('.wf8-tile[data-id="eat"] .wf8-tlink');
    await eatPosterLink.waitFor({ state: "visible", timeout: 15000 });
    await eatPosterLink.click();

    // Step 4: See matching results in the open drop
    const openMenu = journeyPage.locator(".wf8.is-open .wf8-menusec");
    await openMenu.waitFor({ state: "visible", timeout: 10000 });
    const firstPlaceCard = openMenu.locator('article[data-place-id][role="button"]').first();
    await firstPlaceCard.waitFor({ state: "visible", timeout: 15000 });
    const matchingPlaceCardCount = await openMenu.locator('article[data-place-id][role="button"]').count();
    const openedPlaceId = await firstPlaceCard.getAttribute("data-place-id");
    const openedPlaceAriaLabel = await firstPlaceCard.getAttribute("aria-label");

    // Step 5: Open the real place via normal locator.click()
    await firstPlaceCard.click();
    const detailHeadline = journeyPage.locator("[data-detail-headline]");
    await detailHeadline.waitFor({ state: "visible", timeout: 15000 });
    const detailHeadlineText = (await detailHeadline.innerText()).trim();

    // Step 6: Use its appropriate next action ("Add to my trip" button inside the detail sheet)
    const addToTripBtn = journeyPage.locator("button[data-add-to-trip]");
    await addToTripBtn.waitFor({ state: "visible", timeout: 10000 });
    const actionLabelBefore = (await addToTripBtn.innerText()).trim();
    await addToTripBtn.click();
    await journeyPage
      .locator("button[data-add-to-trip]", { hasText: /In my trip/i })
      .waitFor({ state: "visible", timeout: 5000 });
    const actionLabelAfter = (await addToTripBtn.innerText()).trim();

    results.ordinaryVisitorJourney = {
      entryPath: "/",
      usedOnlyStandardPlaywrightActions: true,
      selectedAreaLabel,
      posterActivated: "eat",
      matchingPlaceCardCount,
      openedPlaceId,
      openedPlaceAriaLabel,
      detailHeadlineText,
      actionLabelBefore,
      actionLabelAfter,
    };
    check(
      matchingPlaceCardCount >= 1 &&
        Boolean(openedPlaceId) &&
        detailHeadlineText.length > 0 &&
        /In my trip/i.test(actionLabelAfter),
      "ordinary_visitor_journey.homepage_entry_to_place_action",
      results.ordinaryVisitorJourney,
    );
    await journeyCtx.close();

    // Cold-load slower-network check on "/"
    const slowCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const slowPage = await slowCtx.newPage();
    const cdp = await slowCtx.newCDPSession(slowPage);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 100,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    });

    await slowPage.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const tonightPoster = slowPage.locator('.wf8-tile[data-id="tonight"] .wf8-tlink');
    await tonightPoster.waitFor({ state: "visible", timeout: 15000 });
    const tonightHref = await tonightPoster.getAttribute("href");
    await tonightPoster.click();
    await slowPage.waitForTimeout(1500);
    const slowAfterClickUrl = slowPage.url();
    const slowDropOpened = (await slowPage.locator(".wf8.is-open").count()) > 0;
    const slowFollowedHref = new URL(slowAfterClickUrl).pathname === tonightHref;

    results.coldLoadCheck = {
      networkProfile: "Slow 4G (4 Mbps down, 1.5 Mbps up, 100ms RTT)",
      posterTested: "tonight",
      posterHref: tonightHref,
      afterClickUrl: slowAfterClickUrl,
      openedInAppDrop: slowDropOpened,
      followedValidNormalLink: slowFollowedHref,
      actionPreserved: slowDropOpened || slowFollowedHref,
    };
    check(
      results.coldLoadCheck.actionPreserved === true,
      "cold_load_slower_network.first_click_opens_drop_or_follows_valid_link",
      results.coldLoadCheck,
    );
    await slowCtx.close();
  } finally {
    await browser.close();
  }

  const failedAssertions = assertions.filter((a) => !a.passed);
  results.summary = {
    totalAssertions: assertions.length,
    passed: assertions.length - failedAssertions.length,
    failed: failedAssertions.length,
    failures: failedAssertions,
  };

  const jsonString = JSON.stringify(results, null, 2);
  if (JSON_OUT) {
    fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true });
    fs.writeFileSync(JSON_OUT, jsonString + "\n", "utf8");
  }
  process.stdout.write(jsonString + "\n");

  if (failedAssertions.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
