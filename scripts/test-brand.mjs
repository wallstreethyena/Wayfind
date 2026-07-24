// scripts/test-brand.mjs — THE BRAND RULES (owner, 2026-07-22):
// 1. The wordmark NEVER wraps or shrinks (the live "wayfnd / ı" break).
// 2. The tittle IS the orange dot — the period-after-d form is banned.
// 3. The transparent official wordmark is the one logo used across surfaces.
// 4. Viator cards wear the ONE Wayfind Score like every place card.
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// The homepage header wears the isolated official wordmark and never shrinks.
const legacyImageHeader = home.includes('src="/brand/wayfind-wordmark-transparent-v2.png"') && /height: 64[^}]*width: "auto"[^}]*flexShrink: 0/.test(home);
const splitOfficialHeader = home.includes('className="wf-wordmark-text"') && home.includes('className="wf-wordmark-pin"') && /\.wf-wordmark\{[^}]*flex-shrink:0/.test(home);
ok(legacyImageHeader || splitOfficialHeader, "the header lost the transparent official logo or its shrink protection");
ok((home.match(/brand\/wayfind-wordmark-transparent-v2/g) || []).length === 1, "the official wordmark may appear exactly ONCE in home.js — the header");

for (const [f, label] of [["../app/components/RankedExperiencePage.js", "ranked shell"], ["../app/best-beaches/[metro]/page.js", "beaches page"]]) {
  const s = readFileSync(new URL(f, import.meta.url), "utf8");
  ok(!/wayfind<span[^>]*>\.<\/span>/.test(s), label + " uses the banned period-after-d wordmark");
  ok(s.includes("/brand/wayfind-wordmark-transparent-v2.png"), label + " lost the transparent official wordmark");
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

console.log(`test-brand: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
