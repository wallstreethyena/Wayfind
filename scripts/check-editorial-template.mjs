#!/usr/bin/env node
/**
 * check-editorial-template — the editorial-landing look has ONE implementation.
 *
 * WHY
 * /best-beaches/[metro] is the look the owner points at as the standard, and it
 * was bespoke: markup plus ~5.5KB of CSS inline in that one route. A cuisine
 * chooser is coming that must look identical, and the cheap way to build it is
 * to copy the beach page — which yields two copies that drift.
 *
 * This repo has already paid for exactly that, twice in one day: three art maps
 * each holding their own copy of one path (#449), and one fallback photo
 * duplicated across two page families (#454). Both were found by a human
 * noticing, not by a check. This is the check.
 *
 * WHAT IT ASSERTS
 *   - the template component exists, and its CSS is prefix-PARAMETERISED, so a
 *     second surface gets its own class namespace rather than colliding
 *   - the reference page consumes it and holds no inline copy of the layout
 *   - the CSS rule text is defined in exactly ONE file, repo-wide
 *   - the default prefix still matches the reference page's original one, which
 *     is what let the extraction be proven byte-identical
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const TEMPLATE = "app/components/EditorialLandingHero.js";
const REFERENCE = "app/best-beaches/[metro]/page.js";
const REF_PREFIX = "wf-beach-premium";

const read = (p) => { try { return readFileSync(path.resolve(p), "utf8"); } catch { return null; } };

const tpl = read(TEMPLATE);
ok(!!tpl, `${TEMPLATE} exists — the shared implementation of the editorial-landing look`);
if (tpl) {
  // Prefix must be a parameter, not a literal, or two instances on one page
  // fight over the same class names.
  ok(/export function editorialHeroCss\(prefix\s*=/.test(tpl),
    "editorialHeroCss takes a prefix parameter — a hardcoded prefix means a second surface cannot coexist");
  ok(/\$\{P\}-wrap/.test(tpl) && /\$\{P\}-picks/.test(tpl),
    "the CSS interpolates the prefix rather than hardcoding it");
  // BOTH defaults, counted. `includes` passed with one of the two changed,
  // because the other still matched — presence is not the property we need.
  const defaults = (tpl.match(new RegExp(`prefix = "${REF_PREFIX}"`, "g")) || []).length;
  ok(defaults >= 2,
    `both editorialHeroCss and the component still default to "${REF_PREFIX}" (found ${defaults} of 2) — the reference page depends on it to render byte-identically`);
  // Every prop the spec calls for must be accepted, or a caller silently loses a slot.
  // Match the DESTRUCTURING, not the identifier. Deleting `quickTitle = null,`
  // left `{quickTitle}` in the JSX, so a \bpropName\b test still passed while
  // the prop had actually been removed from the signature.
  const sig = (tpl.match(/export default function EditorialLandingHero\(\{([\s\S]*?)\}\)/) || [])[1] || "";
  ok(sig.length > 100, "read the template's prop list (an unreadable one makes every prop check vacuous)");
  for (const prop of ["heroImg", "imageKicker", "imageTitle", "toplineLeft", "toplineRight", "headline", "dekLead", "dekBody", "quickTitle", "quickPicks", "actionSlot", "trustLines", "backControl"]) {
    ok(new RegExp("(^|,)\\s*" + prop + "\\s*=").test(sig), `the template DESTRUCTURES a "${prop}" prop`);
  }
  // Nothing subject-specific may leak into a template meant for any topic.
  for (const word of ["beach", "Beach", "cuisine", "Cuisine", "restaurant"]) {
    const inCode = tpl.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    // The reference prefix legitimately contains "beach"; ignore that one string.
    const stripped = inCode.split(`"${REF_PREFIX}"`).join("").split(REF_PREFIX).join("");
    ok(!stripped.includes(word),
      `the template's code contains no "${word}" — content belongs in props, not in the layout`);
  }
}

const ref = read(REFERENCE);
ok(!!ref, `${REFERENCE} exists`);
if (ref) {
  // The ELEMENT, not the identifier: a page can mention the name without
  // rendering it, which is how this check first passed on a broken page.
  ok(/<EditorialLandingHero[\s/>]/.test(ref), "the reference page RENDERS <EditorialLandingHero>, not merely imports the name");
  ok(/editorialHeroCss\(\)/.test(ref), "the reference page takes its CSS from the template, with the default prefix");
  // No inline copy of the layout left behind.
  ok(!/\.wf-beach-premium-wrap\{/.test(ref), "the reference page no longer inlines the CSS rules");
  ok(!/className="wf-beach-premium-(hero|panel|media)"/.test(ref), "the reference page no longer inlines the hero markup");
}

// ── The whole point: the rule text exists in exactly one file. ──────────────
// A copy-paste of the layout into a new surface is the failure mode; it shows up
// as these selectors appearing in a second file.
const SKIP = new Set(["node_modules", ".next", ".git", "coverage"]);
const files = [];
(function walk(d) {
  let entries = [];
  try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|css)$/.test(e.name)) files.push(p);
  }
})(path.resolve("."));
ok(files.length > 50, `walked the repo (got ${files.length} files) — an empty walk would make the copy check vacuous`);

const SIGNATURE = "-image-title{max-width:430px";  // a distinctive rule from the layout
const SELF = "scripts/check-editorial-template.mjs"; // this file names the rule; that is not a copy of it
const holders = files.map((f) => path.relative(path.resolve("."), f))
  .filter((rel) => rel !== SELF)
  .filter((rel) => { const s = read(rel); return s && s.includes(SIGNATURE); });
ok(holders.length === 1 && holders[0] === TEMPLATE,
  `the layout CSS is defined in exactly one file. Found in: ${holders.join(", ") || "(none — the signature rule changed, so this check is no longer looking at anything)"}`);

if (fail.length) {
  console.error("check-editorial-template: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-editorial-template: OK — ${pass} assertions (one implementation, prefix parameterised, reference page consumes it)`);
