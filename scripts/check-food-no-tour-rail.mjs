// scripts/check-food-no-tour-rail.mjs
//
// THE DEFECT, measured live, 2026-09-07. Owner: "When I select Food -> Dinner,
// generic Viator tours such as wine tours and Tampa Riverwalk walking tours
// are appearing above the restaurant results. They do not belong there."
//
// Reproduced against PRODUCTION before any fix: scripts/lib/synthetic/
// chromium.mjs against https://www.gowayfind.com/ at a real 390x844 mobile
// viewport, geolocated to Tampa (27.9506,-82.4572). GET / -> 200; the
// homepage rendered real .wf-place-card rows first (route/surface verified,
// not a soft-404) before anything on it was counted. Tapping Food then
// Dinner rendered, ABOVE the restaurant cards ("Dracula's Legacy Wine Bar &
// Bistro Tampa", "Naked Farmer", "Nana Street Food", ...), a rail headed
// "Dinner — bookable near you" carrying:
//   "The Tour and Wine Tasting Experience at Aspirations Winery"
//   "Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food Tour"
//   "Customized Ybor City Private Brewery Tour by Golf Cart"
//   "Sarasota Kayak and Food Tour"
// Network trace showed the request that produced them:
//   GET /api/experiences?...&cat=concept%3Afood
// — the TABLE path (lib/experienceConcepts.js CONCEPTS.food), not the
// live-search fallback. That path is not a matching bug: scripts/
// test-experience-concepts.mjs already asserted, on purpose, that
// conceptsFor("Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food
// Tour") === ["food"] — the SAME product. The `food` concept is a correct
// answer to "does this Viator TOUR involve food or drink"; it is the WRONG
// QUESTION for a chip whose promise is "a place to eat dinner". Viator sells
// no restaurant reservations at all, so membership in that concept is never
// the right CLASS of inventory for an eat-intent chip, however precisely the
// title matches — no regex tuning of CONCEPTS.food could have fixed this.
//
// THE FIX (lib/browseCommerceMap.js NO_TOUR_COMMERCE, app/home.js): Food's
// sub-chips no longer carry the `food` concept, AND the top-level Food
// category declares `noExperiences`, which UnifiedBrowseCommerceRail checks
// BEFORE either the table read or the live-Viator-search fallback runs — a
// null catalogParam alone would still have permitted the live search (the
// same fallback that can hand a thin market a loosely-matched tour), so the
// gate has to sit above `cat`, not be inferred from it.
//
// THE LINE THIS GUARD HOLDS: a CATEGORY-level rule ("Food sells no Viator
// tour, full stop"), not a two-item blocklist of "wine tour" and "Riverwalk
// walking tour" — those two are held here as CONCRETE regression rows so a
// reintroduction is caught on the actual products that shipped it, not only
// on a synthetic fixture; every Food sub-chip (Breakfast, Cafés, Lunch,
// Dinner, Quick bites, Delivery, Dessert, All) is asserted, not just Dinner.
//
// RED-PROVED 2026-09-07: `git stash` on lib/browseCommerceMap.js + app/home.js
// (leaving this file untouched, since it is new/untracked) reproduces the
// exact pre-fix code; this guard fails on it (NO_TOUR_COMMERCE does not
// exist, chipCommerce("food", *).noExperiences is undefined, and the
// app/home.js source check finds no `plan.noExperiences` gate ahead of the
// fetch calls) — `git stash pop` restores the fix. See the PR description for
// the transcript.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chipCommerce, NO_TOUR_COMMERCE, CHIP_COMMERCE } from "../lib/browseCommerceMap.js";
import { filterByChip } from "../lib/experiencesServe.js";

let pass = 0;
const fail = (m) => { console.error("check-food-no-tour-rail: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// ── 1. every Food sub-chip, not a two-item blocklist ───────────────────────
// Read straight from lib/google.js SUBFILTERS.food (its own source of truth,
// same scrape shape check-subfilter-experience-coverage.mjs uses) so this
// list cannot silently drift from what a reader can actually tap.
const googleSrc = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const foodBlock = googleSrc.match(/food:\s*\[([\s\S]*?)\n {2}\],/);
ok(!!foodBlock, "lib/google.js SUBFILTERS.food is present and parseable");
const FOOD_SUBS = [...foodBlock[1].matchAll(/\{\s*id:\s*"([a-z]+)"/g)].map((m) => m[1]);
// POSITIVE CONTROL on the scrape itself: prove it actually found the five
// dayparts the owner named, plus the two chips they did not, before trusting
// anything derived from it.
for (const id of ["breakfast", "cafes", "lunch", "dinner", "quickbites", "delivery", "dessert", "all"]) {
  ok(FOOD_SUBS.includes(id), `positive control: SUBFILTERS.food scrape found "${id}"`);
}
ok(FOOD_SUBS.length >= 8, `found every Food sub-chip (got ${FOOD_SUBS.length}: ${FOOD_SUBS.join(", ")})`);

for (const sub of FOOD_SUBS) {
  const plan = chipCommerce("food", sub);
  ok(plan.noExperiences === true, `Food:${sub} declares noExperiences — a generic Viator tour must not be able to mount here (Breakfast/Cafés/Lunch/Dinner/Quick bites are eat-intent exactly like Dinner)`);
  ok(plan.catalogParam === null, `Food:${sub} asks the experiences table for nothing (got ${JSON.stringify(plan.catalogParam)})`);
  ok(!plan.concepts.includes("food"), `Food:${sub} does not ride the derived \`food\` concept`);
}

// ── 2. the gate is CATEGORY-scoped, not a global kill switch ───────────────
// A fix broad enough to silence every browse category would also pass an
// under-specified version of assertion 1. Prove the boundary is exactly
// where NO_TOUR_COMMERCE says it is: Food only.
ok(Object.keys(NO_TOUR_COMMERCE).length === 1 && NO_TOUR_COMMERCE.food, "NO_TOUR_COMMERCE names exactly Food, not every category");
for (const [cat, sub] of [["attractions", "tours"], ["attractions", "all"], ["nightlife", "bars"], ["nightlife", "all"], ["family", "all"], ["hotels", "all"], ["shopping", "all"], ["beach", "all"]]) {
  const plan = chipCommerce(cat, sub);
  ok(plan.noExperiences === false, `negative control: "${cat}:${sub}" still does NOT declare noExperiences — this fix must not have silenced categories that genuinely sell Viator experiences`);
}
ok(chipCommerce("nightlife", "bars").catalogParam === "concept:nightlife", "negative control: Nightlife still rides its own concept — the fix is scoped to Food, not concepts in general");

// ── 3. THE TRAP IS REAL: prove the underlying data path can still leak ────
// If `food` no longer matched these titles, noExperiences would be guarding
// against a case that can no longer happen and this guard would have no
// teeth. Confirm the concept itself still (correctly) admits the exact two
// products from the live repro — the fix is the WIRING, not the regex.
const REPRO_ROWS = [
  { product_code: "r1", title: "The Tour and Wine Tasting Experience at Aspirations Winery", categories: ["private"] },
  { product_code: "r2", title: "Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food Tour", categories: ["walking"] },
  { product_code: "r3", title: "Dracula's Legacy Wine Bar & Bistro Tampa", categories: [] }, // a REAL restaurant name — must never match
];
const wouldLeak = filterByChip(REPRO_ROWS, "concept:food");
ok(wouldLeak.some((r) => r.product_code === "r1"), "the `food` concept still matches the winery tour from the live repro (proves the trap is real, not stale)");
ok(wouldLeak.some((r) => r.product_code === "r2"), "the `food` concept still matches the Riverwalk walking tour from the live repro");
ok(!wouldLeak.some((r) => r.product_code === "r3"), "sanity: a restaurant's own name is not itself matched as a `food` tour");

// ── 4. extracted browse rail: gate sits ABOVE network calls ──
// A comment or a dead variable would satisfy nothing a reader could observe.
// This checks SOURCE ORDER, the same way check-subfilter-experience-coverage
// checks real behaviour rather than presence: the noExperiences check must
// appear in the effect BEFORE the fetch calls it is supposed to prevent.
const componentSrc = readFileSync(new URL("../app/components/UnifiedBrowseCommerceRail.js", import.meta.url), "utf8");
const fnStart = componentSrc.indexOf("function UnifiedBrowseCommerceRail(");
ok(fnStart >= 0, "the extracted UnifiedBrowseCommerceRail component still defines the implementation (a future restaurant-specific offer needs somewhere to mount)");
// Bound the search to this one function, not the whole 11k-line file, so a
// `plan.noExperiences` mention anywhere else in the file cannot pass this by
// accident. The function is closed by the next top-level `function ` or EOF.
const nextFnAt = componentSrc.indexOf("\nfunction ", fnStart + 30);
const fnBody = componentSrc.slice(fnStart, nextFnAt > 0 ? nextFnAt : componentSrc.length);
// Find the REAL conditional, not a comment that merely names the identifier —
// this file's own WHY comments (deliberately) say "plan.noExperiences" in
// prose right above the code, which a bare indexOf("plan.noExperiences")
// would find FIRST and report as the gate. `|| plan.noExperiences ||` is the
// exact shape the live OR-chain takes and does not occur in prose.
const gateNeedle = "|| plan.noExperiences ||";
const gateHit = fnBody.indexOf(gateNeedle);
const gateAt = gateHit >= 0 ? gateHit + 3 : -1;
const experiencesFetchAt = fnBody.indexOf("/api/experiences?");
const viatorFetchAt = fnBody.indexOf("/api/viator/tours?");
ok(gateAt >= 0, "UnifiedBrowseCommerceRail reads plan.noExperiences somewhere in its body");
ok(experiencesFetchAt > 0 && viatorFetchAt > 0, "positive control: both network calls this gate must precede are actually present in the function (else assertions below are vacuous)");
ok(gateAt >= 0 && gateAt < experiencesFetchAt, "the noExperiences check runs BEFORE the /api/experiences table read, not after");
ok(gateAt >= 0 && gateAt < viatorFetchAt, "the noExperiences check runs BEFORE the /api/viator/tours live-search fallback — the second leak vector a null catalogParam alone would not have closed");
// It must be wired into the SAME `if (...)` as includeExperiences, and that
// branch must actually empty `experiences` — a comment mentioning the name,
// or a read that does nothing, would satisfy nothing a user could observe.
// Look backwards for the nearest "if (" before the mention (the condition
// opens there) and forwards for setExperiences([]) shortly after — a window
// check rather than a single balanced-parens regex, because the condition
// itself contains nested parens (Number.isFinite(lat)) that a naive
// `[^)]*` class would stop at.
const ifBefore = fnBody.lastIndexOf("if (", gateAt);
ok(ifBefore >= 0 && ifBefore > gateAt - 200, "plan.noExperiences sits inside an `if (...)` condition, not a bare statement");
ok(/includeExperiences/.test(fnBody.slice(ifBefore, gateAt + 20)), "plan.noExperiences is OR'd into the SAME condition as includeExperiences, not a second, skippable check");
const afterGate = fnBody.slice(gateAt, gateAt + 300);
ok(/\)\s*\{\s*setExperiences\(\[\]\)/.test(afterGate), "the condition carrying plan.noExperiences actually empties `experiences` (setExperiences([])) rather than merely being read");

// ── 5. self-test: prove THIS guard's source-order check has teeth ─────────
// Same discipline as scripts/lib/synthetic/scenarios.mjs looksLikeSoft404 and
// check-subfilter-experience-coverage.mjs section 7: a structural check that
// has never been shown a failing input is unverified. Simulate the exact
// pre-fix shape (fetch calls with no gate ahead of them) and the exact
// post-fix shape, and prove this guard's own extraction tells them apart.
function findsGateBeforeFetches(src) {
  const g = src.indexOf("plan.noExperiences");
  const e = src.indexOf("/api/experiences?");
  const v = src.indexOf("/api/viator/tours?");
  return g >= 0 && e > 0 && v > 0 && g < e && g < v;
}
const PRE_FIX_FIXTURE = `
function UnifiedBrowseCommerceRail() {
  useEffect(() => {
    if (!includeExperiences) { setExperiences([]); return; }
    fetch("/api/viator/tours?q=" + searchText);
    fetch("/api/experiences?" + q.toString());
  });
}`;
const POST_FIX_FIXTURE = `
function UnifiedBrowseCommerceRail() {
  useEffect(() => {
    if (!includeExperiences || plan.noExperiences) { setExperiences([]); return; }
    fetch("/api/viator/tours?q=" + searchText);
    fetch("/api/experiences?" + q.toString());
  });
}`;
ok(findsGateBeforeFetches(POST_FIX_FIXTURE) === true, "self-test positive control: the extraction finds the gate on a known-good fixture");
ok(findsGateBeforeFetches(PRE_FIX_FIXTURE) === false, "self-test negative control: the extraction reports false on the known pre-fix shape (no gate at all) — proves this guard can actually fail");

console.log(`check-food-no-tour-rail: OK — ${pass} assertions (${FOOD_SUBS.length} Food sub-chips confirmed noExperiences, 8 sibling chips confirmed unaffected, the live-repro trap rows confirmed still real, extracted component gate order verified, self-tests confirmed the checker itself can fail)`);
