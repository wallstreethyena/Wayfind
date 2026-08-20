// scripts/test-atlas-card-hooks.mjs — Atlas editorial on the rail take.
//
// THE DEFECT: DaypartRail / IconicPlaceCard resolve the take through
// useEditorialHooks → /api/known-for → wf_editorial only. Siesta Beach and
// Lido Beach already had publish-ready Atlas cards in data/atlas (hook,
// whyGo, sourced sections). Those cards reached the detail sheet via
// /api/editorial and never the rail. Coquina showed a hook because a fleet
// row (or a cached blurb) existed for that id; the empty cards were a
// missing READ of research we hold, not a reason to skip Atlas or invent
// a blurb in the render path.
//
// Asserted here, offline:
//   1. A published Atlas hook (Siesta, Lido, Coquina) becomes a known-for line.
//   2. An unpublished / unverified fleet row does not.
//   3. No render-path invented blurb — IconicPlaceCard / DaypartRail / known-for
//      generate nothing; empty is empty.
//   4. Atlas-590 place_ids with no researched card are listed (residuals),
//      not filled with prose. atlas-build CATS includes `beach` so the
//      existing ingest/fleet path can pick them up.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { knownForLine, editorialUsable, knownForMap } from "../lib/knownFor.js";
import { atlasLinesFor, atlasCardFor, indexAtlasCards, missingAtlasEditorial, parseAtlas590, resolveAtlasId } from "../lib/atlasCards.js";
import { toHookLine } from "../lib/editorialHook.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };

const cards = JSON.parse(read("data/atlas/editorial-cards.json"));
const atlas590 = parseAtlas590(read("data/atlas/atlas-590.tsv"));
const index = indexAtlasCards(cards);

const SIESTA = "ChIJjfu2YPBBw4gRo41o9hwHfmg";
const LIDO = "ChIJaW-sUB9rw4gRrQvxVM94nOY";
const COQUINA = "ChIJzzGPjSkRw4gRfecn6X09ufk";
const COQUINA_ALIAS = "ChIJPbX5AxsTw4gROkfgzEmV-5M";
const BROHARD = "ChIJg-xDYNxbw4gRqhiY424rrNI";
const PALMA_SOLA = "ChIJBbWy1CkRw4gR2nakL2nnFjU";
const SERVICE_CLUB = "ChIJqXOk48Jbw4gRr3On4Tgi36U";
const HOLMES_PIN = "ChIJaWeoBbURw4gRDYfwKuwOVW0";
const MANATEE_PUBLIC = "ChIJh6_HnNcRw4gR2SpbLik_gEk";
const POINT_OF_ROCKS = "ChIJD3tKOCNCw4gR_-Jbam9Vc24";

// ── 1. published Atlas hooks render ────────────────────────────────────────
const lines = atlasLinesFor(cards, [SIESTA, LIDO, COQUINA, COQUINA_ALIAS]);
ok(!!lines[SIESTA], "Siesta Beach Atlas card produced no known-for line");
ok(!!lines[LIDO], "Lido Beach Atlas card produced no known-for line");
ok(!!lines[COQUINA], "Coquina Beach Atlas card produced no known-for line");
ok(!!lines[COQUINA_ALIAS], "Coquina's same-place alias did not resolve to the card — the rail may send either id");
ok(/quartz/i.test(lines[SIESTA]), `Siesta line is not the researched hook (got "${lines[SIESTA]}")`);
ok(/St\. Armands|Lido Key|pavilion/i.test(lines[LIDO]), `Lido line is not the researched hook (got "${lines[LIDO]}")`);
ok(/Australian pine|Anna Maria|lifeguard/i.test(lines[COQUINA]), `Coquina line is not the researched hook (got "${lines[COQUINA]}")`);
ok(lines[COQUINA_ALIAS] === lines[COQUINA], "alias and canonical Coquina ids produced different lines");

// The compressor the rail actually calls must keep a real sentence, not "".
ok(toHookLine(lines[SIESTA], "Siesta Beach").length >= 20, "Siesta take compresses to nothing");
ok(toHookLine(lines[LIDO], "Lido Beach").length >= 20, "Lido take compresses to nothing");

const siestaCard = atlasCardFor(index, SIESTA);
ok(siestaCard && siestaCard.knownFor, "Siesta is missing from editorial-cards.json — that is the research this test is pinned to");

// ── 2. unpublished / unverified does NOT render ────────────────────────────
const unpublished = { place_id: SIESTA, hook: "A punchy hook that never cleared the gate.", why_here: "x".repeat(160), verified: false, issues: ["thin-hook"] };
ok(editorialUsable(unpublished) === false, "verified:false is treated as usable");
ok(knownForLine(unpublished) === null, "verified:false produced a take");
ok(!Object.keys(knownForMap([unpublished])).includes(SIESTA), "knownForMap leaked an unpublished row");

const failed = { place_id: LIDO, hook: "Serving the city since 1912.", verified: false, issues: ["FAILED VERIFICATION"] };
ok(knownForLine(failed) === null, "FAILED VERIFICATION produced a take");

const pending = { place_id: COQUINA, hook: "Independent verification of this listing's specifics was not completed in this research pass.", issues: null };
ok(knownForLine(pending) === null, "a pending-research placeholder produced a take");

// ── 3. no render-path invented blurb ───────────────────────────────────────
const iconic = code("app/components/IconicPlaceCard.js");
ok(!/rankReason|templateBlurb|Our #1 pick/.test(iconic),
  "IconicPlaceCard invents a take when editorial is absent");
ok(/take \? \(/.test(iconic) || /\{take \?/.test(iconic),
  "IconicPlaceCard no longer branches on the take slot");
ok(/toHookLine\(editorial, place\.name\)/.test(iconic),
  "IconicPlaceCard CALLS toHookLine on the editorial prop — host-theme copy cannot paint");
ok(/If NEITHER exists, nothing renders|no template fallback/.test(read("app/components/IconicPlaceCard.js"))
  || /validAiSummary \? \(/.test(iconic),
  "IconicPlaceCard lost the verified-or-nothing take slot");

const rail = code("app/components/DaypartRail.js");
ok(/toHookLine\(hooks\[p\.id\], p\.name\)/.test(rail),
  "DaypartRail no longer passes the resolved hook through toHookLine");
ok(!/rankReason|templateBlurb/.test(rail),
  "DaypartRail invents a blurb in the render path");

const api = code("app/api/known-for/route.js");
ok(!/openai|anthropic|aiKey|generate|completion/i.test(api),
  "known-for reaches a model");
ok(/atlasLinesFor/.test(api) && /verified=is\.true/.test(api),
  "known-for lost Atlas-first + verified fleet — both halves of the read path");

// ── 4. missing researched rows are listed, not invented ────────────────────
const missing = missingAtlasEditorial(atlas590, cards);
ok(missing.length > 0, "missing-set helper returned empty — a green test that cannot name residuals is hiding the job");
ok(!missing.some((r) => r.place_id === SIESTA || r.place_id === LIDO || r.place_id === COQUINA),
  "Siesta/Lido/Coquina are listed as missing — they have publish-ready cards");
ok(resolveAtlasId(COQUINA_ALIAS) === COQUINA, "Coquina alias map drifted from review-same-place.tsv");

// ── 5. Atlas-590 five-beach ingest (3 publish + Holmes alias; Point of Rocks held)
ok(!!atlasCardFor(index, BROHARD) && atlasCardFor(index, BROHARD).category === "beaches", "Brohard Paw Park card missing");
ok(!!atlasCardFor(index, PALMA_SOLA) && atlasCardFor(index, PALMA_SOLA).category === "beaches", "Palma Sola Causeway card missing");
ok(!!atlasCardFor(index, SERVICE_CLUB) && atlasCardFor(index, SERVICE_CLUB).category === "beaches", "Service Club Park card missing");
ok(atlasCardFor(index, MANATEE_PUBLIC) && atlasCardFor(index, MANATEE_PUBLIC).name === "Manatee Public Beach", "Manatee Public Beach canon card missing — Holmes alias target");
ok(resolveAtlasId(HOLMES_PIN) === MANATEE_PUBLIC, "Holmes Beach pin must alias to Manatee Public Beach");
ok(atlasCardFor(index, HOLMES_PIN) && atlasCardFor(index, HOLMES_PIN).placeId === MANATEE_PUBLIC, "Holmes Beach pin did not resolve to the Manatee Public Beach card");
ok(!cards.some((c) => c.placeId === HOLMES_PIN), "do not publish a second Holmes Beach card");
ok(!atlasCardFor(index, POINT_OF_ROCKS) && !cards.some((c) => c.placeId === POINT_OF_ROCKS), "Point of Rocks must stay held — no card");

// ── 6. Marina Jack twin (same 2 Marina Plaza listing) aliases; no second card
const MARINA_JACK = "ChIJx-U-VRFAw4gRUUDwK8ht44s";
const MARINA_JACK_TWIN = "ChIJx-U-VRFAw4gR7HuX82hYW8w";
ok(resolveAtlasId(MARINA_JACK_TWIN) === MARINA_JACK, "Marina Jack twin must alias to the existing dining card");
ok(atlasCardFor(index, MARINA_JACK_TWIN) && atlasCardFor(index, MARINA_JACK_TWIN).placeId === MARINA_JACK, "Marina Jack twin did not resolve to the existing card");
ok(!cards.some((c) => c.placeId === MARINA_JACK_TWIN), "do not publish a second Marina Jack card");

const beachMissing = missing.filter((r) => r.category === "beaches");
console.log("\nAtlas-590 place_ids with no publish-ready editorial card:");
console.log(`  ${missing.length} of ${atlas590.length} Atlas-590 rows`);
console.log(`  beaches: ${beachMissing.length}`);
for (const r of beachMissing) {
  console.log(`  - ${r.place_id}  ${r.name}  (${r.category})`);
}

const build = read("app/api/cron/atlas-build/route.js");
ok(/const CATS = \["food", "attractions", "beach"/.test(build),
  "atlas-build CATS still omits beach — the fleet cannot pick up the missing beach set");
ok(/i\.category = p_category/.test(read("supabase/migrations/20260729_wf_atlas_missing_operational_gate.sql"))
  || /wf_atlas_missing/.test(read("app/api/cron/atlas-build/route.js")),
  "wf_atlas_missing is gone — adding beach to CATS would be a label with no selector");

if (bad) {
  console.error(`\ntest-atlas-card-hooks: FAIL — ${bad}/${n} assertions`);
  process.exit(1);
}
console.log(`\ntest-atlas-card-hooks: OK — ${n} assertions (Atlas hook renders; unpublished does not; no invented blurb; ${beachMissing.length} beach residuals listed)`);
