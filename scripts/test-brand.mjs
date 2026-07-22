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
// THE LOGO (owner, 2026-07-22): the header wears the OFFICIAL asset — not a
// text lookalike — because the header bg IS the logo's baked #040810. This is
// the ONE sanctioned in-app raster placement; it must never shrink or wrap.
// 46.75px = 42.5 +10% (owner, 2026-07-22 evening: "10% bigger").
ok(home.includes('src="/brand/wayfind-logo-header.png"') && /height: 46\.75, width: "auto"[^}]*flexShrink: 0/.test(home), "the header lost the OFFICIAL logo at its 46.75px default (or its shrink protection)");
ok((home.match(/brand\/wayfind-logo/g) || []).length === 1, "the raster logo may appear exactly ONCE in home.js — the header");

for (const [f, label] of [["../app/components/RankedExperiencePage.js", "ranked shell"], ["../app/best-beaches/[metro]/page.js", "beaches page"]]) {
  const s = readFileSync(new URL(f, import.meta.url), "utf8");
  ok(!/wayfind<span[^>]*>\.<\/span>/.test(s), label + " uses the banned period-after-d wordmark");
  ok(s.includes("ı<span aria-hidden"), label + " lost the tittle-dot wordmark");
}

// Raster logo only in OG routes (their dark #040810 band = the baked bg).
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : []; });
const root = new URL("..", import.meta.url).pathname;
for (const p of walk(join(root, "app"))) {
  if (p.includes("/api/og/") || p.endsWith("app/home.js")) continue; // sanctioned: OG dark bands + the header
  const s = readFileSync(p, "utf8");
  ok(!s.includes("brand/wayfind-logo"), p.replace(root, "") + " places the raster logo outside a sanctioned #040810 surface — banned (baked background mismatch)");
}

// Viator tiles carry the ONE house chip (PlaceScoreChip), not raw Google stars.
ok((home.match(/PlaceScoreChip p=\{\{ rating: t\.rating, reviews: t\.reviews \}\}/g) || []).length >= 2, "Viator tiles lost the house PlaceScoreChip");
ok(!/`★ \$\{t\.rating\}`|>★ \{t\.rating\}/.test(home), "raw Google-star lead is back on Viator tiles");

// Things to Do rows wear the EXACT standard card shell (owner, 2026-07-22):
// photo-left 96px, medal rank ring, WayfindScoreBadge in the title row.
{
  const ttd = readFileSync(new URL("../app/components/ThingsToDoList.js", import.meta.url), "utf8");
  ok(ttd.includes("WayfindScoreBadge score={ds}"), "TTD rows lost the standard WayfindScoreBadge");
  ok(ttd.includes("width: 96, alignSelf: \"stretch\", minHeight: 96"), "TTD rows lost the standard 96px photo-left column");
  ok(ttd.includes("medalColor(rank)"), "TTD rows lost the standard medal rank ring");
  ok(!ttd.includes('aspectRatio: "16 / 9"'), "the oversized 16:9 photo-top shell is back on Things to Do");
}
ok(!/top: "-0\.14em"/.test(readFileSync(new URL("../app/components/RankedExperiencePage.js", import.meta.url), "utf8")) && !/top: "-0\.14em"/.test(readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8")), "the hero tittle dot floated too high (-0.14em) — it must sit ON the i (owner fix)");

console.log(`test-brand: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
