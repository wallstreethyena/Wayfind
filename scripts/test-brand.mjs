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
// July 2026 decomposition, wave 1: the homepage's server-rendered CSS moved to
// app/components/css.js. It is still the same single inline <style> tag on the
// same page, so "the homepage" is now these two files read together. The RULE is
// unchanged — the official wordmark appears exactly ONCE on the homepage, in the
// header — and is deliberately NOT widened to the whole shell: RankedExperiencePage
// and the Intro sheet legitimately wear their own copy, and this assertion exists
// to stop a SECOND homepage lockup, not to police every surface.
const homeCss = readFileSync(new URL("../app/components/css.js", import.meta.url), "utf8");
const homePage = home + "\n" + homeCss;
// The homepage header wears the isolated official wordmark and never shrinks.
const legacyImageHeader = home.includes('src="/brand/wayfind-wordmark-transparent-v2.png"') && /height: 64[^}]*width: "auto"[^}]*flexShrink: 0/.test(home);
const splitOfficialHeader = home.includes('className="wf-wordmark-text"') && home.includes('className="wf-wordmark-pin"') && /\.wf-wordmark\{[^}]*flex-shrink:0/.test(homeCss);
ok(legacyImageHeader || splitOfficialHeader, "the header lost the transparent official logo or its shrink protection");
ok((homePage.match(/brand\/wayfind-wordmark-transparent-v2/g) || []).length === 1, "the official wordmark may appear exactly ONCE on the homepage (app/home.js + app/components/css.js) — the header");

// v6.47, same decomposition logic as wave 1 above: RankedExperiencePage no
// longer owns its hero markup — the <header>, and with it the wordmark, moved to
// app/components/CollectionHero.js so the in-app experience screen wears the
// identical chrome. "The ranked shell" is now those two files read together. The
// RULE is unchanged (that surface still shows the official transparent wordmark
// and never the banned period-after-d form); only the file it lives in moved.
const RANKED_SHELL = ["../app/components/RankedExperiencePage.js", "../app/components/CollectionHero.js"];
// v6.72, the same decomposition again, one surface later: the beaches page no
// longer owns its editorial hero markup — the <header>, and with it the
// wordmark, moved to app/components/EditorialLandingHero.js so a second
// editorial landing (the cuisine chooser) wears identical chrome instead of a
// copy. "The beaches page" is now those two files read together. The RULE is
// unchanged; only the file the wordmark lives in moved. This guard catching the
// move is the guard working — it is a brand decision, so it gets updated
// deliberately, not relaxed.
const BEACH_SHELL = ["../app/best-beaches/[metro]/page.js", "../app/components/EditorialLandingHero.js"];
for (const [files, label] of [[RANKED_SHELL, "ranked shell"], [BEACH_SHELL, "beaches page"]]) {
  const s = files.map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
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
// 2026-08-02 — the pattern no longer pins the loop variable to `t`. It counted
// `rating: t.rating` specifically, so deleting the dead BookableExpRail (which
// happened to use `t`) dropped the count below 2 even though BOTH surviving
// rails render the chip — one of them over `card`. The invariant is "every
// Viator tile renderer uses the house chip", and the variable it iterates is
// not part of that. Still COUNTED rather than `includes`d, because one rail
// having the chip says nothing about the other.
const houseChips = (home.match(/PlaceScoreChip p=\{\{ rating: [A-Za-z_$][\w$]*\.rating, reviews: [A-Za-z_$][\w$]*\.reviews \}\}/g) || []).length;
ok(houseChips >= 2, `Viator tiles lost the house PlaceScoreChip (found ${houseChips} tile renderers using it, expected at least 2)`);
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
