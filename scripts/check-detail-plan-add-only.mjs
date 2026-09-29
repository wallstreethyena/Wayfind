#!/usr/bin/env node
/**
 * check-detail-plan-add-only — "Add to my trip" on the Detail sheet must never
 * REMOVE a save. quickSaveFavorite is a TOGGLE (app/home.js); calling it on an
 * already-saved place deleted the favorite and its server row.
 *
 * EXECUTION NOTE: the handlers are closures inside the Detail component, so they
 * cannot be invoked through renderToStaticMarkup. This guard therefore extracts
 * the real handler source (comments stripped, brace-matched), EVALUATES it with a
 * spy quickSaveFavorite and an isSaved stub, and asserts on the calls. That is
 * execution of the shipped handler text, not a full component mount.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const SRC = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const code = strip(SRC);

function extractFn(name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(code);
  if (!m) return null;
  let i = code.indexOf("{", m.index), depth = 0, j = i;
  for (; j < code.length; j++) {
    if (code[j] === "{") depth++;
    else if (code[j] === "}" && --depth === 0) break;
  }
  return code.slice(m.index, j + 1);
}

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

const handlers = ["handlePrimaryCtaClick", "addToPlan", "addToTripOnly"].map((n) => [n, extractFn(n)]);
for (const [n, src] of handlers) ok(src, `${n} must exist in Detail.js`);
const [, primarySrc] = handlers[0], [, planSrc] = handlers[1], [, onlySrc] = handlers[2];

// The real component must still compile and export (the extracted text below is
// only meaningful if it is the text of a live component).
const REPO = fileURLToPath(new URL("..", import.meta.url));
const detailMod = await loadComponent(fileURLToPath(new URL("../app/components/sheets/Detail.js", import.meta.url)), REPO);
ok(typeof detailMod.default === "function", "Detail.js compiles and default-exports the component");

// Positive control (positive control for the absence checks below): the probe regex MUST find the
// toggle call in the one place it is allowed (the add-only helper).
const TOGGLE_CALL = /\bquickSaveFavorite\s*\(/;
ok(TOGGLE_CALL.test("quickSaveFavorite(detail);"), "control: the probe matches a literal toggle call");
ok(onlySrc && TOGGLE_CALL.test(onlySrc), "control: the probe regex finds quickSaveFavorite( inside addToTripOnly (else the absence checks prove nothing)");

// Static: neither CTA handler may call the toggle directly.
ok(primarySrc && !TOGGLE_CALL.test(primarySrc), "handlePrimaryCtaClick calls quickSaveFavorite directly (toggle) — must go through add-only path");
ok(planSrc && !TOGGLE_CALL.test(planSrc), "addToPlan calls quickSaveFavorite directly (toggle) — must go through add-only path");

// Executed: build the three handlers against stubs.
function run({ saved, type }) {
  const calls = { qsf: 0, toast: [] };
  const factory = new Function("ctx", `
    const { detail, primaryCta, DETAIL_CTA_TYPES, quickSaveFavorite, isSaved, showToast, logEvent, commerceCtx, emitCommerce } = ctx;
    ${onlySrc}
    ${primarySrc}
    ${planSrc}
    return { handlePrimaryCtaClick, addToPlan };
  `);
  const T = { plan: "plan", book: "book" };
  const h = factory({
    detail: { id: "p1" }, primaryCta: { type: T[type], monetized: false }, DETAIL_CTA_TYPES: T,
    quickSaveFavorite: () => { calls.qsf++; }, isSaved: () => saved,
    showToast: (m) => calls.toast.push(m), logEvent: () => {}, commerceCtx: null, emitCommerce: () => {},
  });
  return { h, calls };
}
if (primarySrc && planSrc && onlySrc) {
  for (const which of ["handlePrimaryCtaClick", "addToPlan"]) {
    let r = run({ saved: true, type: "plan" }); r.h[which]();
    ok(r.calls.qsf === 0, `${which} on a SAVED place must NOT call quickSaveFavorite (got ${r.calls.qsf}) — it would unsave`);
    r = run({ saved: false, type: "plan" }); r.h[which]();
    ok(r.calls.qsf === 1, `${which} on an UNSAVED place must call quickSaveFavorite exactly once (got ${r.calls.qsf})`);
  }
  // Positive control: a non-plan primary CTA must never save at all.
  const r = run({ saved: false, type: "book" }); r.h.handlePrimaryCtaClick();
  ok(r.calls.qsf === 0, "control: a non-plan primary CTA must not save");
}

// The Favorites heart toggle lives elsewhere and must still be the toggle.
const home = strip(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
ok(/function\s+quickSaveFavorite\s*\([^)]*\)\s*\{[\s\S]{0,900}filter\(\(x\)\s*=>\s*x\.id\s*!==\s*p\.id\)/.test(home), "control: quickSaveFavorite must remain the toggle (Favorites heart behaviour unchanged)");

if (fail.length) { console.error("check-detail-plan-add-only: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log("check-detail-plan-add-only: OK — 2 plan handlers executed against saved/unsaved/non-plan stubs (handler text evaluated, not a full component mount); toggle control intact");
