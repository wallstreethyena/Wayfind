#!/usr/bin/env node
/**
 * check-guide-cta-single-capture — one guide CTA click records ONE
 * commerce_cta_clicked in PostHog, never two.
 *
 * THE BUG (shipped, found in production data 2026-09-22). GuideConversion's
 * CTA onClick called BOTH track("commerce_cta_clicked", {...}) (lib/track ->
 * window.posthog.capture directly, no whitelist) AND, when cta.monetized,
 * emitCommerce("commerce_cta_clicked", {...}) (lib/commerce -> also
 * window.posthog.capture, schema-checked). Same event name, same click, two
 * PostHog rows. Proven in the project's own 90-day event history: five
 * click_ids recorded TWO commerce_cta_clicked events each; four of those five
 * are exact pairs — one row with surface=(null) (the track() leg, which
 * carries slug/cta_kind/exact/monetized/place and none of the commerce
 * schema's fields) and one row with surface="guide" + content_id=<the guide
 * slug> (the emitCommerce() leg) — same click_id, timestamps a millisecond
 * apart, on swim-with-manatees-crystal-river (x2) and things-to-do-sarasota
 * (x1). The fix: the click's PRODUCT event is renamed to guide_cta_clicked
 * (fires every click, via track — mirrors HubConversion's onCta), and
 * commerce_cta_clicked now comes from emitCommerce ALONE, monetized CTAs
 * only. See app/guides/[slug]/GuideConversion.js's header comment.
 *
 * THIS GUARD CALLS THE REAL COMPONENT — not a regex over its source. Per
 * CLAUDE.md ("assert on the CALL, not the string" / "the mutation itself
 * must be proven"): it transpiles and RENDERS the real GuideConversion via
 * scripts/lib/jsxLoad.mjs (the same technique test-event-section-nav.mjs and
 * check-hub-conversion.mjs use), captures the primary CTA anchor's real
 * onClick closure by intercepting React.createElement during that render,
 * installs a spy at window.posthog.capture, INVOKES the onClick exactly as a
 * browser click would, and counts what the spy actually recorded. A regex
 * asserting "commerce_cta_clicked appears in the file" cannot tell one call
 * site from two — this can, because it runs both and counts.
 *
 * RED-PROVE: the exact same guard logic is run a second time against a
 * PRE-FIX variant built IN MEMORY from the current file: the product event
 * track("guide_cta_clicked", …) is turned back into the pre-fix
 * track("commerce_cta_clicked", …), which is exactly the bug. It must record
 * commerce_cta_clicked TWICE — proving the check is not decoration.
 *
 * Why not `git show origin/main:…`: Vercel builds from a shallow clone with no
 * origin/main (the guard crashed there on the first push), and once this fix
 * is merged origin/main no longer holds the pre-fix source, so a git-based
 * red-prove would fail forever after merge. The in-memory mutation needs no
 * git and stays valid for as long as the file keeps its current shape; if the
 * shape changes, the mutation's own "applied exactly once" check goes red.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ---------------------------------------------------------------------------
// Harness: intercept React.createElement to pull the real onClick closure off
// the anchor GuideConversion renders (data-commerce-owner="GuideConversion"),
// then simulate a browser window with a spy at posthog.capture and invoke it.
// Mutating React.createElement works because a CJS package's default import
// IS the same module.exports object everywhere it is imported in this
// process — jsxLoad.mjs's emitted copy of GuideConversion does
// `import React from "react"` (for its own JSX-compiled calls) and so does
// this file; both point at the one object we patch below. Restored in a
// finally so no other guard in the same process tree is affected.
// ---------------------------------------------------------------------------
const originalCreateElement = React.createElement;
let captureOwner = null;
let capturedOnClick = null;
React.createElement = function patchedCreateElement(type, props, ...children) {
  if (captureOwner && props && props["data-commerce-owner"] === captureOwner && typeof props.onClick === "function") {
    capturedOnClick = props.onClick;
  }
  return originalCreateElement.apply(React, [type, props, ...children]);
};

/** Render `Component` with `props`, return the onClick fn captured off the
 * anchor carrying data-commerce-owner="GuideConversion" (or null if none). */
function renderAndCaptureOnClick(Component, props) {
  capturedOnClick = null;
  captureOwner = "GuideConversion";
  try {
    renderToStaticMarkup(createElement(Component, props));
  } finally {
    captureOwner = null;
  }
  return capturedOnClick;
}

/** Install a fake browser `window` with a posthog.capture spy, run `fn`
 * synchronously (real onClick calls are synchronous), restore, return the
 * list of {name, payload} the spy recorded. */
function withSpyWindow(fn) {
  const captures = [];
  const prevWindow = globalThis.window;
  globalThis.window = {
    posthog: { capture: (name, payload) => { captures.push({ name, payload }); } },
    navigator: { userAgent: "check-guide-cta-single-capture/1.0", webdriver: false },
    localStorage: null,
    __WF_ANALYTICS_SUPPRESSED: false,
  };
  try {
    fn();
  } finally {
    globalThis.window = prevWindow;
  }
  return captures;
}

const countOf = (captures, name) => captures.filter((c) => c.name === name).length;

// ---------------------------------------------------------------------------
// Fixtures. `kind: "hotel"` sidesteps the tour-specific isSearchAsBookHref /
// !exact repaint-to-"none" branch (kind==="tour" && !cta.exact) entirely, so
// the fixture reaches the real anchor unmodified either way — this guard is
// about event COUNTING, not the resolver's tour/exact rules (owned by
// check-guide-cta-honesty.mjs).
// ---------------------------------------------------------------------------
const MONETIZED_CTA = Object.freeze({
  kind: "hotel", href: "/api/hotels/go?offer=west-shore-inn", label: "Check rates",
  sponsored: true, monetized: true, exact: true, place: "West Shore Inn", deal: null,
  provider: "stay22", offerId: "west-shore-inn",
});
const NON_MONETIZED_CTA = Object.freeze({
  kind: "directions", href: "https://maps.apple.com/?daddr=27.9506,-82.4572", label: "Get directions",
  sponsored: false, monetized: false, exact: false, place: null, deal: null,
});
const BASE_PROPS = { slug: "crystal-river-manatees", region: "Crystal River", next: null, social: null, socialStatus: "unavailable" };

/** Run the guard's own logic (render, capture onClick, click, count) against
 * one already-loaded GuideConversion module. Returns the counts plus a
 * printable line, so both the fixed run and the red-prove run can share it. */
function exerciseOneClick(GuideConversion, cta, label) {
  const onClick = renderAndCaptureOnClick(GuideConversion, { ...BASE_PROPS, cta });
  if (typeof onClick !== "function") return { label, ok: false, reason: "no onClick captured off data-commerce-owner=\"GuideConversion\"", captures: [] };
  const captures = withSpyWindow(() => onClick());
  const line = `  ${label}: commerce_cta_clicked=${countOf(captures, "commerce_cta_clicked")} guide_cta_clicked=${countOf(captures, "guide_cta_clicked")} total=${captures.length} names=[${captures.map((c) => c.name).join(", ")}]`;
  console.log(line);
  return { label, ok: true, captures };
}

try {
  // -------------------------------------------------------------------------
  // 1. POSITIVE CONTROL — the spy itself actually records a capture. Without
  //    this, a broken spy (never invoked, or invoked with the wrong window)
  //    would report "0 commerce_cta_clicked" for every fixture and read as a
  //    passing guard while testing nothing (CLAUDE.md's known failure mode).
  // -------------------------------------------------------------------------
  {
    const controlCaptures = withSpyWindow(() => {
      window.posthog.capture("guard_positive_control", { probe: true });
    });
    ok(controlCaptures.length === 1 && controlCaptures[0].name === "guard_positive_control",
      "PROBE BROKEN: the spy window must record a direct posthog.capture call before any component click is trusted to prove anything");
  }

  // -------------------------------------------------------------------------
  // 2. THE FIX, on the CURRENT (working-tree) GuideConversion.
  // -------------------------------------------------------------------------
  console.log("check-guide-cta-single-capture: exercising the CURRENT (fixed) GuideConversion —");
  const fixedMod = await loadComponent(path.join(REPO, "app/guides/[slug]/GuideConversion.js"), REPO);
  const FixedGuideConversion = fixedMod.default;
  ok(typeof FixedGuideConversion === "function", "the fixed GuideConversion.js has a default export");

  const monetizedFixed = exerciseOneClick(FixedGuideConversion, MONETIZED_CTA, "fixed  / monetized CTA click");
  ok(monetizedFixed.ok, "fixed: monetized click must find and invoke a real onClick — " + (monetizedFixed.reason || ""));
  if (monetizedFixed.ok) {
    ok(countOf(monetizedFixed.captures, "commerce_cta_clicked") === 1,
      `fixed: a monetized guide CTA click must record commerce_cta_clicked EXACTLY ONCE, got ${countOf(monetizedFixed.captures, "commerce_cta_clicked")} — this is the bug this guard exists to catch`);
    ok(countOf(monetizedFixed.captures, "guide_cta_clicked") === 1,
      `fixed: a monetized guide CTA click must record the product event guide_cta_clicked EXACTLY ONCE, got ${countOf(monetizedFixed.captures, "guide_cta_clicked")}`);
    // No other event name in this capture set may repeat either — the rule is
    // "no event name fires twice for one click", not just this one pair.
    const names = monetizedFixed.captures.map((c) => c.name);
    const dupedNames = names.filter((n, i) => names.indexOf(n) !== i);
    ok(dupedNames.length === 0, `fixed: no event name may repeat within a single click, got repeats: ${dupedNames.join(", ")}`);
  }

  const nonMonetizedFixed = exerciseOneClick(FixedGuideConversion, NON_MONETIZED_CTA, "fixed  / non-monetized (Directions) click");
  ok(nonMonetizedFixed.ok, "fixed: non-monetized click must find and invoke a real onClick — " + (nonMonetizedFixed.reason || ""));
  if (nonMonetizedFixed.ok) {
    ok(countOf(nonMonetizedFixed.captures, "commerce_cta_clicked") === 0,
      `fixed: a NON-monetized CTA click (Directions) must record ZERO commerce_cta_clicked — it is not a partner click, got ${countOf(nonMonetizedFixed.captures, "commerce_cta_clicked")}`);
    ok(countOf(nonMonetizedFixed.captures, "guide_cta_clicked") === 1,
      `fixed: a non-monetized CTA click must still record the product event guide_cta_clicked once, got ${countOf(nonMonetizedFixed.captures, "guide_cta_clicked")}`);
  }

  // -------------------------------------------------------------------------
  // 3. RED-PROVE — the identical logic against a PRE-FIX variant built in
  //    memory from the current file (the product event turned back into the
  //    duplicate commerce event), written to a real file on disk NEXT TO the
  //    original (same relative depth, so its `../../../lib/...` imports
  //    resolve exactly like the real file's), loaded, exercised, and then
  //    deleted whether it passes or throws.
  // -------------------------------------------------------------------------
  console.log("check-guide-cta-single-capture: red-proving against an in-memory PRE-FIX variant —");
  const currentSrc = readFileSync(path.join(REPO, "app/guides/[slug]/GuideConversion.js"), "utf8");
  const PRODUCT_CALL = 'track("guide_cta_clicked",';
  const productCalls = currentSrc.split(PRODUCT_CALL).length - 1;
  ok(productCalls === 1, `red-prove setup: the current source has exactly ONE ${PRODUCT_CALL} call to turn back into the bug (found ${productCalls})`);
  const preFixSrc = currentSrc.replace(PRODUCT_CALL, 'track("commerce_cta_clicked",');
  ok(preFixSrc !== currentSrc && /track\(\s*["']commerce_cta_clicked["']/.test(preFixSrc) && /emitCommerce\(\s*["']commerce_cta_clicked["']/.test(preFixSrc),
    "red-prove setup: the mutation applied — the variant carries BOTH the track() AND emitCommerce() commerce_cta_clicked call sites, i.e. the pre-fix bug");

  const preFixDir = path.join(REPO, "app/guides/[slug]");
  const preFixPath = path.join(preFixDir, `.redprove-preFix-GuideConversion-${process.pid}.js`);
  let preFixResult = null;
  try {
    writeFileSync(preFixPath, preFixSrc);
    const onDisk = readFileSync(preFixPath, "utf8");
    ok(onDisk === preFixSrc, "red-prove: the pre-fix mutation actually landed on disk, read back and confirmed — not assumed");

    const preFixMod = await loadComponent(preFixPath, REPO);
    const PreFixGuideConversion = preFixMod.default;
    ok(typeof PreFixGuideConversion === "function", "red-prove: the pre-fix GuideConversion.js has a default export");

    preFixResult = exerciseOneClick(PreFixGuideConversion, MONETIZED_CTA, "PRE-FIX / monetized CTA click (must be red)");
  } finally {
    try { rmSync(preFixPath, { force: true }); } catch {}
  }

  ok(!!preFixResult && preFixResult.ok, "red-prove: pre-fix monetized click must find and invoke a real onClick");
  if (preFixResult && preFixResult.ok) {
    const n = countOf(preFixResult.captures, "commerce_cta_clicked");
    ok(n === 2,
      `red-prove: the PRE-FIX source must double-fire commerce_cta_clicked (expected 2, got ${n}) — if this is not 2, the guard above is not actually exercising the bug`);
    // And the inverse of the fixed-run assertion must be FALSE here — proving
    // the fixed-run assertion is capable of failing, not just capable of
    // passing (CLAUDE.md: a check that cannot go red on real sabotage is
    // decoration).
    ok(n !== 1, "red-prove: the pre-fix count must NOT equal the fixed count of 1 — the two runs must disagree, or the fix proved nothing");
  }
} finally {
  React.createElement = originalCreateElement;
}

if (fail.length) {
  console.error("check-guide-cta-single-capture: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-guide-cta-single-capture: OK — ${pass} assertions ` +
  "(spy positive control; fixed GuideConversion records commerce_cta_clicked exactly once on a monetized click " +
  "and zero times on a non-monetized click, guide_cta_clicked exactly once either way, no event name repeats; " +
  "red-prove against an in-memory pre-fix variant reproduces the double-fire at count=2)"
);
