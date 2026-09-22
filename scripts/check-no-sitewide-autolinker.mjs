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
// THIS GUARD PINS THREE THINGS SO THE BUG CANNOT QUIETLY COME BACK:
//   1. app/layout.js never again references a known third-party auto-linker
//      host/script, however it's spelled (src=, template literal, comment
//      pointing at a live tag — checked on CODE, comments stripped).
//   2. The scoped Stay22 component still disables nova (disablepop:true) —
//      the belt that survives even if the route-scoping (the suspenders)
//      is ever loosened.
//   3. That scoped component is imported ONLY from an explicit allowlist.
//      Site-wide-by-accident happens one "just add it to layout for now"
//      import at a time; this makes that a deliberate, reviewable edit to
//      this file instead of a silent regression.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error("check-no-sitewide-autolinker: FAIL — " + m); process.exit(1); };
let pass = 0;
const ok = (c, m) => { if (!c) fail(m); pass++; };

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── 1. app/layout.js carries no third-party auto-linker ─────────────────────
const LAYOUT_PATH = join(ROOT, "app/layout.js");
const layoutRaw = readFileSync(LAYOUT_PATH, "utf8");
const layoutCode = stripComments(layoutRaw);

// Positive control: the probe patterns must actually match the shape of a
// live auto-linker tag, so an absence check below is real evidence.
const AUTOLINKER_SIGNATURES = [
  { name: "Stay22 LinkSwap script host", re: /scripts\.stay22\.com/ },
  { name: "Stay22 LinkSwap bundle filename", re: /letmeallez\.js/ },
  { name: "Stay22 params global assignment", re: /window\.Stay22\s*=/ },
  { name: "Travelpayouts Drive script host", re: /tp-em\.com/ },
  { name: "Travelpayouts Drive bundle path", re: /NTUwMTYw\.js/ },
];
const FIXTURE = `<Script src="https://scripts.stay22.com/letmeallez.js"/><script>window.Stay22={};</script><Script src="https://tp-em.com/NTUwMTYw.js"/>`;
for (const { name, re } of AUTOLINKER_SIGNATURES) {
  ok(re.test(FIXTURE), `POSITIVE CONTROL: the "${name}" probe matches a real auto-linker tag, so its absence below is a real finding`);
}
for (const { name, re } of AUTOLINKER_SIGNATURES) {
  ok(!re.test(layoutCode), `app/layout.js must not reference ${name} — a site-wide third-party auto-linker was reintroduced into the global layout (this is the exact 2026-09-22 click-hijack bug). Route-scope it instead: render app/components/Stay22LinkSwap.js only from the specific page(s) that have a raw OTA link for it to rewrite.`);
}

// ── 2. the scoped component still disables nova ──────────────────────────────
const SWAP_PATH = join(ROOT, "app/components/Stay22LinkSwap.js");
ok(existsSync(SWAP_PATH), "app/components/Stay22LinkSwap.js still exists — this is where Stay22 LinkSwap now lives");
const swapRaw = readFileSync(SWAP_PATH, "utf8");
ok(/scripts\.stay22\.com\/letmeallez\.js/.test(swapRaw), "Stay22LinkSwap.js still loads the real LinkSwap bundle (not a stub that would silently dark the revenue this exists to protect)");
ok(/disablepop\s*:\s*true/.test(swapRaw), "Stay22LinkSwap.js must set disablepop:true — this is what turns off the click-anywhere pop-under (nova) that caused the reported hijack, independent of which routes render the component");

// ── 3. Stay22LinkSwap is imported only from an explicit allowlist ───────────
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

console.log(`check-no-sitewide-autolinker: OK — ${pass} assertions (no site-wide third-party auto-linker in app/layout.js; Stay22LinkSwap disables nova; imported only from the reviewed allowlist)`);
