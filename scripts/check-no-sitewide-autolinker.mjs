#!/usr/bin/env node
// scripts/check-no-sitewide-autolinker.mjs — regression guard for the
// 2026-09-22 click-hijack fix.
//
// THE BUG: app/layout.js loaded Stay22 LinkSwap (scripts.stay22.com/
// letmeallez.js) and Travelpayouts Drive (tp-em.com) SITE-WIDE, on every
// route, on first interaction. LinkSwap bundles "nova", a pop-under ad
// product that listens for a click ANYWHERE on the page (not just on links)
// and calls window.open() on one of its partners (Expedia among them) — so a
// guide page with zero hotel links still popped a stay22.com tab on an
// ordinary background-div click. Reproduced 2026-09-22 on
// /guides/pintos-farm-miami-2026, /guides and /.
//
// THE FIX: Stay22 LinkSwap now loads ONLY where a page has an actual raw OTA
// link for it to rewrite (app/best-beaches/[metro]/page.js), via the scoped
// component app/components/Stay22LinkSwap.js, with disablepop:true set even
// there. Travelpayouts Drive was removed outright — it existed only for
// site-ownership verification (already passed; app/layout.js's own comment
// said so) and every live Travelpayouts dollar is earned through
// lib/travelpayouts.js's tpDeepLink(), a server-buildable tp.media/r link
// that never needed the browser script.
//
// HONESTY REWRITE (2026-09-22, CI run 35784044031): the first version of
// this file was pure regex-over-source — no execution, and its one absence
// check (`!re.test(layoutCode)`) had no same-file positive control by
// check-guard-honesty.mjs's rules (a "POSITIVE CONTROL" comment doesn't
// count: the analyzer scans comment-and-string-stripped source, and its
// per-subject rule needs the SAME identifier tested non-negated elsewhere in
// the file, not a differently-named fixture variable). Fixed for real, not
// with a STRUCTURAL-ONLY tag or a KNOWN_WEAK entry:
//   1. Section 0 COMPILES app/components/Stay22LinkSwap.js with the same
//      typescript + vm + renderToStaticMarkup harness
//      scripts/check-guide-editorial.mjs uses, and asserts on the RENDERED
//      HTML string — a returned value, not source text — that the loader
//      sets disablepop:true and emits exactly one script tag.
//   2. Section 1 runs the five signature regexes through ONE reused `probe`
//      variable, in order: a synthetic copy of the OLD app/layout.js loader
//      shape (must match everything — RED PROOF the probe catches the bug),
//      Stay22LinkSwap.js's own raw source (must match its 3 real Stay22
//      signatures and none of the 2 Travelpayouts ones — proves the probe
//      isn't blind to a real, intended occurrence), and only then the real
//      app/layout.js (must match nothing — the actual regression guard).
//      Reusing one variable name as the subject of both the non-negated
//      proofs and the final negated check is what gives that check a real
//      same-file, same-subject positive control.
//   3. Section 2 (unchanged) confirms the component is imported only from an
//      explicit, reviewed allowlist.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error("check-no-sitewide-autolinker: FAIL — " + m); process.exit(1); };
let pass = 0;
const ok = (c, m) => { if (!c) fail(m); pass++; };
const require = createRequire(import.meta.url);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── 0. Compile the real component and RENDER it — assert on the OUTPUT ─────
const SWAP_PATH = join(ROOT, "app/components/Stay22LinkSwap.js");
ok(existsSync(SWAP_PATH), "app/components/Stay22LinkSwap.js still exists — this is where Stay22 LinkSwap now lives");
const swapRaw = readFileSync(SWAP_PATH, "utf8");
const swapCompiled = ts.transpileModule(swapRaw, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const swapModule = { exports: {} };
vm.runInNewContext(swapCompiled, {
  module: swapModule,
  exports: swapModule.exports,
  require: (name) => {
    if (name === "next/script") {
      // next/script's real implementation defers to a browser-only loader
      // and can't render headlessly. Stub it as a passthrough <script> tag
      // carrying the exact props Stay22LinkSwap.js passes — id, strategy,
      // dangerouslySetInnerHTML — so renderToStaticMarkup produces real,
      // inspectable markup for the actual inline loader string, instead of
      // this guard trusting the JSX source text on faith.
      return { __esModule: true, default: (props) => React.createElement("script", { id: props.id, "data-strategy": props.strategy, dangerouslySetInnerHTML: props.dangerouslySetInnerHTML }) };
    }
    return require(name);
  },
}, { filename: SWAP_PATH });
const Stay22LinkSwap = swapModule.exports.default;
ok(typeof Stay22LinkSwap === "function", "app/components/Stay22LinkSwap.js compiles and exports a component function (executed, not just read as text)");
const html = renderToStaticMarkup(React.createElement(Stay22LinkSwap));
ok(html.includes('id="stay22-linkswap"'), "RENDERED OUTPUT: the loader keeps its stay22-linkswap script id");
ok(html.includes("scripts.stay22.com/letmeallez.js"), "RENDERED OUTPUT: still loads the real LinkSwap bundle — not a stub that would silently dark the revenue this component exists to protect");
ok(html.includes("disablepop:true"), "RENDERED OUTPUT: the loader this component actually emits sets disablepop:true — the config flag that turns off nova (the click-anywhere pop-under). Asserting on rendered HTML, not source text, proves this literal survives JSX interpolation into the emitted <script> body");
ok((html.match(/<script\b/g) || []).length === 1, "RENDERED OUTPUT: Stay22LinkSwap renders exactly one script tag — no second, unscoped loader hiding in the same component");

// ── 1. The same signature probe must flag known-bad shapes before it is ────
//      trusted to clear the real app/layout.js.
const AUTOLINKER_SIGNATURES = [
  { name: "Stay22 LinkSwap script host", re: /scripts\.stay22\.com/ },
  { name: "Stay22 LinkSwap bundle filename", re: /letmeallez\.js/ },
  { name: "Stay22 params global assignment", re: /window\.Stay22\s*=/ },
  { name: "Travelpayouts Drive script host", re: /tp-em\.com/ },
  { name: "Travelpayouts Drive bundle path", re: /NTUwMTYw\.js/ },
];

// (a) RED PROOF: a synthetic copy of the OLD app/layout.js loader shape —
// the exact two <Script> blocks this fix removed — must trip every signature.
const OLD_LAYOUT_FIXTURE = `<Script id="stay22-linkswap" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: "window.Stay22=window.Stay22||{};window.Stay22.params={lmaID:'x'};var s=document.createElement('script');s.src='https://scripts.stay22.com/letmeallez.js';document.head.appendChild(s);" }} /><Script id="travelpayouts-drive" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: "var s=document.createElement('script');s.src='https://tp-em.com/NTUwMTYw.js?t=550160';document.head.appendChild(s);" }} />`;
let probe = OLD_LAYOUT_FIXTURE;
for (const { name, re } of AUTOLINKER_SIGNATURES) {
  ok(re.test(probe), `RED PROOF: the "${name}" probe matches a synthetic copy of the OLD app/layout.js loader shape — proves this detector actually catches the 2026-09-22 bug shape, not an always-clean check`);
}

// (b) The same probe, pointed at Stay22LinkSwap.js's OWN source, must flag
// exactly its 3 real Stay22 signatures — proving the detector isn't blind to
// a real, intended occurrence — and none of the 2 Travelpayouts ones, since
// that product was removed outright rather than relocated.
probe = swapRaw;
const SWAP_EXPECTED = new Set(["Stay22 LinkSwap script host", "Stay22 LinkSwap bundle filename", "Stay22 params global assignment"]);
for (const { name, re } of AUTOLINKER_SIGNATURES) {
  if (SWAP_EXPECTED.has(name)) {
    ok(re.test(probe), `the "${name}" probe correctly flags Stay22LinkSwap.js's own source — a real, intended occurrence — before it is trusted to report app/layout.js clean`);
  } else {
    ok(!re.test(probe), `Stay22LinkSwap.js must not reference ${name} — Travelpayouts Drive was removed outright, not relocated into the scoped component`);
  }
}
const matchedInSwap = AUTOLINKER_SIGNATURES.filter(({ re }) => re.test(swapRaw)).map((s) => s.name).sort();
assert.deepEqual(matchedInSwap, [...SWAP_EXPECTED].sort()); pass++;

// (c) ONLY NOW is the same `probe` variable trusted on the real app/layout.js.
const LAYOUT_PATH = join(ROOT, "app/layout.js");
const layoutRaw = readFileSync(LAYOUT_PATH, "utf8");
probe = stripComments(layoutRaw);
for (const { name, re } of AUTOLINKER_SIGNATURES) {
  ok(!re.test(probe), `app/layout.js must not reference ${name} — a site-wide third-party auto-linker was reintroduced into the global layout (this is the exact 2026-09-22 click-hijack bug). Route-scope it instead: render app/components/Stay22LinkSwap.js only from the specific page(s) that have a raw OTA link for it to rewrite.`);
}

// ── 2. Stay22LinkSwap is imported only from an explicit allowlist ──────────
const ALLOWED_IMPORTERS = new Set([
  "app/best-beaches/[metro]/page.js",
]);

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx)$/.test(n)) out.push(p);
  }
  return out;
}

const importers = [];
for (const f of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, f).split("\\").join("/");
  if (rel === "app/components/Stay22LinkSwap.js") continue; // the file itself
  const src = stripComments(readFileSync(f, "utf8"));
  if (/Stay22LinkSwap/.test(src)) importers.push(rel);
}

ok(importers.length > 0, "positive control: at least one route imports Stay22LinkSwap — otherwise the revenue this guard protects has already gone dark and the allowlist check below is vacuous");

for (const rel of importers) {
  ok(ALLOWED_IMPORTERS.has(rel),
    `${rel} imports Stay22LinkSwap but is not on the allowlist in this guard. Either this is the 2026-09-22 bug creeping back in (a route that has no raw OTA link for LinkSwap to rewrite doesn't need it — see the click-hijack fix) or this route genuinely has one: confirm it the way app/best-beaches/[metro]/page.js does (a raw, unwrapped partner href) and add it to ALLOWED_IMPORTERS here, deliberately, in the same PR.`);
}
for (const rel of ALLOWED_IMPORTERS) {
  ok(importers.includes(rel), `${rel} is allowlisted to import Stay22LinkSwap but no longer does — shrink ALLOWED_IMPORTERS to match, or the allowlist is stale and hides a real regression the next time something IS added without review`);
}

console.log(`check-no-sitewide-autolinker: OK — ${pass} assertions (Stay22LinkSwap compiled + rendered with disablepop:true; the signature probe red-proves on the old layout shape and on Stay22LinkSwap's own source before clearing the real app/layout.js; imported only from the reviewed allowlist)`);
