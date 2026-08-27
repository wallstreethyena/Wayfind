#!/usr/bin/env node
// scripts/check-state-affordance.mjs — A SKIN MAY NOT SILENCE A CONTROL.
//
// 2026-08-27. The owner pressed like on a fall-skinned card. It registered:
// the taste profile updated, the toast said "Added to your taste". The button
// did not change by one pixel, because the fall skin carried
//
//     .wf-fall .wf-place-card button { background/border/color !important }
//
// and at (0,2,1) that outranks .wf-place-card-like.is-active at (0,2,0) — same
// !important, and it came first in source order. Every control on a fall card
// was painted the same cream whether it was carrying state or not. His words:
// "if a user is clicking on it and doesn't see the button respond, it's gonna
// look like it's broken." A control that lies about its own state costs trust,
// and trust is the product.
//
// scripts/test-reaction-affordance.mjs measures the rendered result in a real
// browser, which is the honest test — but it needs Chromium, so it cannot run
// on Vercel's build image. THIS guard is the cheap source-level law that runs
// everywhere, on every build, and it states the rule rather than the instance:
//
//   1. Nothing may paint a bare control element (button / a) that can reach the
//      action row at a specificity >= the state rules' own, unless it exempts
//      them with :not(.is-active). The bar is read from the stylesheet, not
//      hardcoded, and both sides carry !important — so selector weight is the
//      whole argument. Season two of this bug is one blanket selector away.
//   2. Every stateful control's .is-active rule must set background, border
//      AND colour. One property is one override away from silence.
//   3. Every .is-active background must be OPAQUE. A tint is at the mercy of
//      whatever is painted behind it — which is exactly what a skin is.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);

// Every exported CSS string, resolved — so the guard reads what actually
// ships, not a hand-maintained list of selectors that drifts from it.
const css = Object.entries(mod)
  .filter(([k, v]) => typeof v === "string" && /\{/.test(v) && /^WF_/.test(k))
  .map(([, v]) => v).join("\n");

let pass = 0;
const fails = [];
const ok = (c, m) => { c ? pass++ : fails.push(m); return !!c; };

ok(css.length > 20000, `positive control: loaded the shipped CSS (${css.length} chars) — an empty read would make every rule below vacuous`);

// Innermost {} blocks only: `[^{}]` cannot cross a brace, so an @media prelude
// never matches as a selector and its inner rules do.
const RULES = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), decls: m[2] }));
ok(RULES.length > 300, `positive control: parsed ${RULES.length} CSS rules`);

const PAINTS = /(^|;)\s*(background|background-color|border|border-color|color)\s*:/;
// The last simple selector is a bare element — it carries no class of its own,
// so it sweeps up every control in its scope, including the ones holding state.
const BARE_CONTROL_TAIL = /(^|[\s>+~])(button|a)$/;
// The stateful controls live in the action row. A rule scoped into a DIFFERENT
// lane of the card cannot reach them, and demanding :not(.is-active) there
// would be cargo cult — worse, it would train the next person to sprinkle it.
const OTHER_LANE = /\.wf-place-card-(highlights|media|facts|content|heading|title|score)/;
const REACHES_CONTROLS = /\.wf-(place-card|rail-card|fall|fall-card|sheet-card-actions|place-card-actions)/;

// CSS specificity, the only thing that actually decides this. Both the skin
// rule and the state rule carry !important, so !important cancels out and the
// selector weight is the whole argument. (.is-active inside :not() counts, per
// spec — which is why an exempted rule may be "more specific" and still safe:
// it no longer MATCHES the active control at all.)
function weight(sel) {
  const s = sel.replace(/::[a-z-]+/g, " ");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\()[a-z-]+(\([^)]*\))?/g) || []).length;
  const els = (s.match(/(^|[\s>+~])[a-z][\w-]*/g) || []).length;
  return ids * 100 + cls * 10 + els;
}

// The bar is not a magic number: it is the weight of the state rules themselves,
// read from the stylesheet. Anything that paints a control at or above this and
// is not exempted can repaint a pressed control back to its resting look.
const STATE_SELECTORS = RULES.flatMap((r) => r.sel.split(",").map((x) => x.trim()))
  .filter((p) => /^\.wf-[\w-]+\.is-active$/.test(p));
ok(STATE_SELECTORS.length >= 4, `positive control: found the state rules to measure against (${STATE_SELECTORS.length})`);
const STATE_WEIGHT = Math.min(...STATE_SELECTORS.map(weight));

// ---- 1. nothing may outrank a control's own state rule ----------------------
let swept = 0;
for (const r of RULES) {
  if (!PAINTS.test(r.decls)) continue;
  for (const part of r.sel.split(",").map((x) => x.trim())) {
    if (!part || !BARE_CONTROL_TAIL.test(part)) continue;
    if (!REACHES_CONTROLS.test(part) || OTHER_LANE.test(part)) continue;
    if (/\.is-active/.test(part)) continue; // exempted, or is itself the state rule
    const w = weight(part);
    if (w < STATE_WEIGHT) { swept++; continue; }  // the state rule already outranks it
    ok(false,
      `"${part}" paints a bare control element at specificity ${w}, which is >= the ${STATE_WEIGHT} of the ` +
      `state rules (${STATE_SELECTORS[0]} and friends). Both carry !important, so this rule WINS and repaints a ` +
      `pressed control back to its resting look — the 2026-08-27 bug, exactly: the like registered and the button ` +
      `did not move. Add :not(.is-active) to this selector. If the rule also carries LAYOUT (padding, min-height, ` +
      `display), split it: layout for every control, paint for :not(.is-active) only — never strip layout from the ` +
      `pressed state.`);
    swept++;
  }
}
ok(swept > 0, "positive control: the sweep above examined at least one painted control rule");

// ---- 2 + 3. the state itself has to be loud and opaque ----------------------
const STATEFUL = ["wf-place-card-save", "wf-place-card-like", "wf-place-card-dislike", "wf-place-card-trip"];
for (const cls of STATEFUL) {
  const rule = RULES.find((r) => r.sel.split(",").some((p) => p.trim() === `.${cls}.is-active`));
  if (!ok(!!rule, `.${cls}.is-active has no rule at all — the control cannot show that it is on`)) continue;
  const d = rule.decls;
  const missing = ["background", "border-color", "color"].filter((k) => !new RegExp(`(^|;)\\s*${k}\\s*:`).test(d));
  ok(missing.length === 0,
    `.${cls}.is-active must set background, border-color AND color (missing: ${missing.join(", ")}). ` +
    `A state carried by one property is one skin override away from silence.`);
  const bg = (/(^|;)\s*background\s*:\s*([^;!]+)/.exec(d) || [])[2] || "";
  const rgba = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(bg);
  const a = rgba ? parseFloat(rgba[1]) : 1;
  ok(a >= 0.85,
    `.${cls}.is-active paints its ON background at alpha ${a}. A tint reads as "on" only against the one ` +
    `background it was designed against; the fall skin proved that. Use an opaque fill.`);
}

if (fails.length) {
  console.error("check-state-affordance: FAIL\n");
  for (const f of fails) console.error("  • " + f);
  console.error("\nRendered proof of the same contract lives in scripts/test-reaction-affordance.mjs (needs a browser).");
  process.exit(1);
}
console.log(`check-state-affordance: OK — ${pass} assertions (${swept} painted control rule(s) examined against a state weight of ${STATE_WEIGHT}; ${STATEFUL.length} stateful controls each say "on" with an opaque fill on three properties)`);
