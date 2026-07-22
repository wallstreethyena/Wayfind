// scripts/test-brand.mjs — THE BRAND RULES (owner, 2026-07-22):
// 1. The wordmark NEVER wraps or shrinks (the live "wayfnd / ı" break).
// 2. The tittle IS the orange dot — the period-after-d form is banned.
// 3. The raster logo (baked #040810 background) never sits on a surface
//    that isn't its own background — OG dark bands only.
// 4. Viator cards wear the ONE Wayfind Score like every place card.
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const wm = home.match(/aria-label="wayfind"[^>]*>/) || home.match(/whiteSpace: "nowrap", flexShrink: 0 \}\} aria-label="wayfind"/);
ok(home.includes('whiteSpace: "nowrap", flexShrink: 0 }} aria-label="wayfind"'), "the header wordmark can wrap/shrink again — that is the broken 'wayfnd' the owner saw");

for (const [f, label] of [["../app/components/RankedExperiencePage.js", "ranked shell"], ["../app/best-beaches/[metro]/page.js", "beaches page"]]) {
  const s = readFileSync(new URL(f, import.meta.url), "utf8");
  ok(!/wayfind<span[^>]*>\.<\/span>/.test(s), label + " uses the banned period-after-d wordmark");
  ok(s.includes("ı<span aria-hidden"), label + " lost the tittle-dot wordmark");
}

// Raster logo only in OG routes (their dark #040810 band = the baked bg).
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : []; });
const root = new URL("..", import.meta.url).pathname;
for (const p of walk(join(root, "app"))) {
  if (p.includes("/api/og/")) continue;
  const s = readFileSync(p, "utf8");
  ok(!s.includes("brand/wayfind-logo"), p.replace(root, "") + " places the raster logo outside an OG dark band — banned (baked background mismatch)");
}

// Viator tiles carry the ONE Score, not raw Google stars.
ok((home.match(/toDisplayScore\(wayfindScore\(t\.rating, t\.reviews\)\)/g) || []).length >= 2, "Viator tiles lost the Wayfind Score treatment");
ok(!/`★ \$\{t\.rating\}`|>★ \{t\.rating\}/.test(home), "raw Google-star lead is back on Viator tiles");

console.log(`test-brand: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
