// scripts/check-shell-decomposition.mjs — the decomposition of app/home.js is
// only safe because of an invariant that nothing was checking: extracted shell
// files must stay REGISTERED in scripts/lib/shellSrc.mjs, and the predicates the
// guardrails are pinned to must stay in app/home.js.
//
// Both halves fail SILENTLY if broken, which is why they deserve a guardrail:
//   • Drop a file from shellFiles() and every content guardrail that greps the
//     shell for a curated name, a CSS class, or a piece of copy stops seeing it.
//     Nothing errors. The checks keep printing OK while asserting nothing.
//   • Move a predicate (faveTier / featuredBoost / curatedFor / inCuratedRegion)
//     out of home.js and check-geo-gated-boosts.mjs — which reads app/home.js
//     DIRECTLY, on purpose — goes blind the same way, and Florida name-keyed
//     badges can leak nationwide again without a single red build.
//
// The rule this encodes, for the next wave: move DATA out freely, register it in
// shellSrc, and leave behind anything a guardrail names.
import { readFileSync } from "fs";
import { shellFiles, shellSrc } from "./lib/shellSrc.mjs";

let pass = 0;
const fail = (m) => { console.error("check-shell-decomposition: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");

const home = read("app/home.js");
const files = shellFiles();
const src = shellSrc();

// 1) The shell root is still the shell root.
ok(files[0] === "app/home.js", "app/home.js is still the first shell file");

// 2) Every wave's extraction is registered. Wave 1 = css.js, wave 2 = curatedData.js.
for (const f of ["app/components/css.js", "app/components/curatedData.js"]) {
  ok(files.includes(f), `${f} is registered in shellSrc — unregistered, every guardrail that greps the shell for its contents silently stops asserting`);
  ok(home.includes(f.replace("app/components/", "./components/").replace(/\.js$/, "")), `${f} is still IMPORTED by home.js — an extracted file nothing imports is dead weight in the grep set`);
}
// v6.47 — CollectionHero.js is the same case with a different importer: it was
// extracted out of a SCREEN (app/components/screens/Experience.js), not out of
// home.js, so home.js never imports it. The registration requirement is
// identical; only the "who imports it" assertion moves.
{
  const f = "app/components/CollectionHero.js";
  ok(files.includes(f), `${f} is registered in shellSrc — unregistered, the hero markup that left screens/Experience.js drops out of every content guardrail's grep set`);
  ok(read("app/components/screens/Experience.js").includes("../EditorialLandingHero"), "screens/Experience.js uses the shared editorial hero for category-chip sheets");
  ok(read("app/components/RankedExperiencePage.js").includes("./EditorialLandingHero"), "RankedExperiencePage uses the same editorial hero, so destination and in-app sheets cannot drift apart");
}

// 3) curatedData.js is DATA ONLY. The moment a predicate lands in it, someone has
// moved decision-making out of the file the geo guardrail is pinned to.
const data = read("app/components/curatedData.js");
ok(!/^\s*(export\s+)?function\s/m.test(data), "curatedData.js declares no functions — it is data, and the predicates that read it stay in home.js");
ok(!/=>/.test(data.replace(/^\s*\/\/.*$/gm, "")), "curatedData.js contains no arrow functions either (comments excepted)");
ok(!/<[A-Za-z]/.test(data.replace(/^\s*\/\/.*$/gm, "")), "curatedData.js renders nothing — no JSX in a data module");

// 4) The predicates the geo guardrail is pinned to did NOT travel with the data.
for (const sym of ["function inCuratedRegion(", "function faveTier(", "function featuredBoost(", "const curatedFor =", "function wayfindNotes(", "function curatedNote("]) {
  ok(home.includes(sym), `${sym.trim()} is still in app/home.js — check-geo-gated-boosts.mjs reads that file directly and would go blind if this moved`);
}

// 5) The data itself is still reachable through the shell grep, which is the whole
// point of registering the file. One representative row from each moved constant.
for (const [needle, what] of [["Selva Grill", "BEST_OF_NAMES"], ["Se7en Bites", "LOCAL_FAVE_EXTRA"], ["wf-parcsoleil-1", "WAYFIND_PHOTOS"], ["boggy creek airboat", "WAYFIND_NOTES"], ["\"gatorland\": 12", "WAYFIND_FEATURED"], ["hiltonorlando: {", "CURATED_NOTES"]]) {
  ok(src.includes(needle), `${what} is still visible to shell-wide greps (looked for ${JSON.stringify(needle)})`);
}

// 6) Curated keys must be wfNorm-normalized or the lookup silently never fires —
// the exact bug the WAYFIND_FEATURED comment records ("hilton orlando" never hit).
{
  const block = data.slice(data.indexOf("export const WAYFIND_FEATURED = {"));
  const body = block.slice(0, block.indexOf("\n};"));
  const keys = [...body.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
  ok(keys.length >= 20, "WAYFIND_FEATURED still parses as a key map");
  const bad = keys.filter((k) => k !== k.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, ""));
  ok(bad.length === 0, `every WAYFIND_FEATURED key is wfNorm-normalized — these would never match: ${bad.join(", ")}`);
}

console.log(`check-shell-decomposition: OK — ${pass} assertions (extracted shell files stay registered; the guarded predicates stay in home.js)`);
