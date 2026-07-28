// scripts/test-taste.mjs — locks the Phase-1 taste model: it learns per-user
// from EXPLICIT signals, decays honestly, stays bounded, and — the brand rule —
// NEVER touches the Wayfind Score. Ranking is unchanged in Phase 1.
import { readFileSync } from "fs";
import { signalWeights, decayedWeight, blendTaste, applyLocalTaste, localToVector, affinityFor, isLearnableValue, tasteLabel, TAG_LABEL, TASTE_TAU_MS, SIGNAL_WEIGHT } from "../lib/taste.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// --- signalWeights: explicit only, honest dimensions ---
const food = { category: "food", priceNum: 2, google_types: ["mexican_restaurant", "restaurant", "point of interest"] };
const likeSig = signalWeights("like", food);
ok(likeSig.some((x) => x.dimension === "category" && x.value === "food" && x.delta === 2), "like on a food place -> +category:food");
ok(likeSig.some((x) => x.dimension === "price" && x.value === "2"), "price dimension captured when known");
ok(likeSig.some((x) => x.dimension === "tag" && x.value === "mexican restaurant"), "type tags captured");
ok(!likeSig.some((x) => x.value === "point of interest" || x.value === "restaurant"), "generic service tokens are never learned from");
ok(signalWeights("dislike", food).find((x) => x.dimension === "category").delta === -3, "dislike is a strong negative");
ok(signalWeights("share", food).find((x) => x.dimension === "category").delta === 3, "share is the strongest signal");
ok(signalWeights("scroll", food).length === 0 && signalWeights("dwell", food).length === 0, "PASSIVE signals are NOT ingested in Phase 1 (consent gates them)");
ok(signalWeights("like", null).length === 0, "no place -> no signal");
// v6.55: isLearnableValue("tag", …) is now a strict TAG_LABEL allowlist —
// these must be real, curated tokens (not synthetic fakes) or they'd all be
// filtered out and this assertion would test nothing.
{ const tagDeltas = signalWeights("like", { category: "food", google_types: ["bar", "pub", "brewery"] }).filter((x) => x.dimension === "tag"); ok(Math.abs(tagDeltas.reduce((s, x) => s + x.delta, 0) - 2 * 0.6) < 1e-9, "tag weight is split, never multiplied, across a place's tags"); }

// --- v6.55: the tag dimension is a strict TAG_LABEL allowlist, not a
// blocklist — this is the root-cause fix for the "weird" overlapping chips
// (a single place carrying american_restaurant + californian_restaurant +
// brunch_restaurant + breakfast_restaurant + food_store, each rendering as
// its own ugly near-duplicate chip). ---
ok(isLearnableValue("tag", "american_restaurant") === true, "a curated tag token is learnable");
ok(isLearnableValue("tag", "food_store") === false, "food_store has no taste signal and is dropped, not displayed");
ok(isLearnableValue("tag", "meal_takeaway") === false, "meal_takeaway is dropped, not displayed");
ok(isLearnableValue("tag", "point of interest") === false, "generic Google noise is still excluded under the allowlist model");
ok(isLearnableValue("tag", "some_unmapped_type") === false, "an uncurated token has no label yet, so it is not learned — 'if it doesn't look good, don't display it'");
// Near-duplicate Google types collapse onto the SAME clean label — this is
// what lets the chip-merge loop in home.js combine them into one chip.
ok(tasteLabel("tag", "american_restaurant") === "American" && tasteLabel("tag", "californian_restaurant") === "American", "american_restaurant and californian_restaurant merge onto one clean label");
ok(tasteLabel("tag", "breakfast_restaurant") === "Breakfast & brunch" && tasteLabel("tag", "brunch_restaurant") === "Breakfast & brunch", "breakfast_restaurant and brunch_restaurant merge onto one clean label");
ok(tasteLabel("tag", "food_store") === "", "an unmapped tag has no label — the display-time signal for 'don't show it'");
// Category and price dimensions are UNCHANGED by this — only tag got stricter.
ok(isLearnableValue("category", "food") === true && isLearnableValue("category", "some_new_category") === true, "category learnability is untouched by the tag allowlist change");
ok(tasteLabel("price", "2").indexOf("$") >= 0 && !TAG_LABEL["2"], "price labelling still goes through PRICE_LABEL, not TAG_LABEL");
ok(tasteLabel("category", "coffee_shop") === "Coffee Shop", "category labelling still uses the old generic title-case conversion, unaffected by TAG_LABEL");

// --- decay ---
const DAY = 86400000;
ok(decayedWeight(10, 0, 0) === 10, "no age -> full weight");
ok(decayedWeight(10, 0, TASTE_TAU_MS) < 3.7 && decayedWeight(10, 0, TASTE_TAU_MS) > 3.6, "one tau (~60d) decays to ~1/e");
ok(decayedWeight(10, 0, 10 * DAY) > decayedWeight(10, 0, 40 * DAY), "older signals weigh less — taste drifts, never freezes");
ok(TASTE_TAU_MS === 60 * 24 * 60 * 60 * 1000, "the 60-day decay constant is fixed");

// --- local accumulate: per-device, bounded, decayed ---
let local = applyLocalTaste(null, signalWeights("like", food), 0);
local = applyLocalTaste(local, signalWeights("like", food), 0);
ok(local["category|food"].w === 4, "repeated likes accumulate");
{ const faded = applyLocalTaste(local, signalWeights("dislike", food), 10 * DAY); ok(faded["category|food"].w < 4, "a later dislike pulls the vector back down (decayed base + negative delta)"); }
{ let big = {}; for (let i = 0; i < 400; i++) big["tag|t" + i] = { w: 1 + i / 100, t: 0 }; ok(Object.keys(applyLocalTaste(big, [], 0)).length <= 200, "the local vector is capped — a taste vector is small by nature"); }

// --- blend + affinity (the Phase-2 hook, pure now) ---
const vec = localToVector(local, 0);
ok(vec.category && vec.category.food > 0, "local blob -> the same vector shape as the server rows");
const aff = affinityFor({ category: "food" }, vec);
ok(aff > 1 && aff <= 1.25, "a liked category lifts affinity, BOUNDED at 1.25 — nudges order, never fabricates");
const dvec = localToVector(applyLocalTaste(null, signalWeights("dislike", food), 0), 0);
ok(affinityFor({ category: "food" }, dvec) < 1 && affinityFor({ category: "food" }, dvec) >= 0.82, "a disliked category lowers affinity, floored at 0.82 — never buries a great place");
ok(affinityFor({ category: "beach" }, vec) === 1, "an unseen dimension is neutral (1.0) — no guessing");
ok(affinityFor({ category: "food" }, null) === 1 && affinityFor(null, vec) === 1, "no taste / no place -> neutral");

// --- THE BRAND LOCKS (home.js) ---
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes("function recordTaste(action, p)"), "the taste recorder is wired");
ok(home.includes('supabase.rpc("wf_taste_bump"'), "signed-in signals persist to the per-user server vector");
ok(/action !== "open" && supabase && user/.test(home), "server persistence is gated on signed-in; 'open' stays device-local");
ok(home.includes('localStorage.setItem("wf_taste_local"'), "anonymous users get a first-party local vector (respects deletion)");
ok(home.includes('recordSignal(p, "save")') && home.includes('recordSignal(p, "share")'), "save + share now feed the model, alongside like/dislike/open");
// The Score must stay global — taste/affinity must NOT flow into the displayed score.
ok(!/toDisplayScore\([^)]*affinit|wayfindScore\([^)]*affinit|affinityFor[\s\S]{0,60}(toDisplayScore|wayfindScore)/.test(home), "affinity must NEVER feed the Wayfind Score — the number stays global and honest");
ok(!home.includes("affinityFor("), "Phase 1 does not yet apply affinity anywhere — LEARN ONLY, zero ranking change");
// Ranking seam still dormant.
const tb = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");
ok(/p_boost_ids: boostIds/.test(tb), "the p_boost_ids seam is untouched — Phase 2 wires it, not Phase 1");

// --- schema locks (per-user isolation is the whole point) ---
const sql = readFileSync(new URL("../db/wf_taste.sql", import.meta.url), "utf8");
ok(sql.includes("auth.uid() = user_id"), "RLS binds every row to the caller — per-user only, never pooled");
ok(sql.includes("5184000") , "the SQL decay constant matches TASTE_TAU_MS (60 days)");
ok(sql.includes("wf_taste_wipe"), "delete-my-taste ships now — legal by design");
ok(sql.includes("security invoker"), "writes run as the caller so RLS can enforce ownership");

// --- PHASE 2/3 LOCKS (home.js): consented, durable, labeled, controllable ---
ok(/const personalized = personalize === "on" && hasTaste/.test(home), "the feed re-ranks ONLY with explicit consent — off = same for everyone");
ok(/personalized \? applyAffinity\(list, affinities\) : list/.test(home), "no consent -> pure moment/Score order, unranked by taste");
ok(home.includes('Picked for you — tuned to what you like'), "when on, the personalization is LABELED (never silent)");
ok(home.includes("Personalize my feed") && home.includes("No thanks"), "the consent ask is a real choice, not a dark pattern");
ok(/_vec\.category\) for .* affinities\.catW\[k\] = \(affinities\.catW\[k\] \|\| 0\) \+ v \* 0\.4/.test(home), "the DURABLE per-user vector folds into ranking — taste persists across sessions");
ok(home.includes('localStorage.setItem("wf_personalize"') , "consent choice is remembered");
ok(home.includes('supabase.from("wf_taste").select') , "signed-in users' durable vector loads from their OWN rows");
// Phase 3 control
ok(home.includes("function resetTaste") && home.includes('supabase.rpc("wf_taste_wipe")'), "Reset wipes the server vector");
ok(home.includes("function forgetTasteItem"), "per-item forget ships");
// v6.55 (owner): the panel no longer promises data is "never sold" — the
// company reserves the right to sell data in the future, and that promise is
// removed from casual UI copy on purpose (see app/privacy/page.js for the
// actual legal disclosure). The panel still transparently states what it does.
ok(home.includes("Your taste") && home.includes("Everything Wayfind has learned from what you like, save, and share"), "the transparency panel exists and states what it shows");
ok(!home.includes("never sold") && !home.includes("never sold, never shared"), "the taste panel and consent card no longer make a never-sold promise");

// --- v6.45 (owner, with screenshots: "Wtf is this how can we fix it?") ------
// Three separate defects sat behind one panel, and every one of them was a
// WIRING gap: lib/taste.js already shipped the fix and home.js never imported
// it. These assertions pin the wiring, not the implementation.
ok(/import \{[^}]*\btasteLabel\b[^}]*\bisLearnableValue\b[^}]*\} from "\.\.\/lib\/taste"/.test(home), "home.js imports BOTH read-path helpers — the panel must not re-implement labelling or filtering");
// 1. FILTER ON READ. A write-path-only fix leaves junk already sitting in
//    localStorage wf_taste_local and Supabase wf_taste rendering forever — that
//    is exactly the chip that just read "2".
ok(/if \(!isLearnableValue\(dim, val\)\) continue;/.test(home), "the panel filters the STORED vector on read, so junk learned before the fix retires the moment this ships");
// 2. LABEL, don't dump. The panel showed raw taxonomy rows: food, coffee shop,
//    food store, and a bare price bucket index.
// v6.55: chips are now grouped BY LABEL (dim + "|" + label), not by raw
// value — TAG_LABEL deliberately maps several raw Google tokens onto the
// same clean label (e.g. american_restaurant + californian_restaurant ->
// "American"), and this is what merges them into one chip with combined
// weight and every contributing raw value kept in `vals`.
ok(/const g = groups\.get\(key\);/.test(home) && /g\.vals\.push\(val\)/.test(home), "each merged chip accumulates weight and collects every contributing raw value");
ok(!/\{c\.w >= 0 \? "" : "not "\}\{c\.val\}/.test(home), "the panel no longer renders the RAW stored value as the chip body");
// 3. ...but act on the RAW value(s). Forgetting by the label would silently
//    delete nothing at all, and the user would think it worked.
ok(/forgetTasteItem\(c\.dim, c\.vals\)/.test(home), "forget addresses the RAW stored key(s) — deleting by label would no-op and lie");
ok(/aria-label=\{"Forget " \+ c\.label\}/.test(home), "…while the accessible name is the human label, not the database token");
// The premium styling shipped in WF_TASTE_CSS but nothing consumed it, and the
// inline remove control was an 18px dot (WCAG 2.5.8 requires 24).
const css = readFileSync(new URL("../app/components/css.js", import.meta.url), "utf8");
for (const cls of ["wf-taste-sheet", "wf-taste-body", "wf-taste-mark", "wf-taste-cloud", "wf-taste-chip", "wf-taste-x", "wf-taste-btn"]) {
  ok(css.includes("." + cls) && home.includes(cls), `${cls} is both defined in css.js and USED by the panel — no dead CSS, no orphan class`);
}
ok(!/width: 18, height: 18, borderRadius: "50%"/.test(home), "the 18px remove dot is gone — .wf-taste-x is 24px, the WCAG 2.5.8 minimum");

// --- v6.50 (owner, with screenshot: "the export data that is weird / just say
// Reset") — the raw-JSON download read as an unexplained, alarming control in
// a two-button row and nobody had asked for it. Erasure — letting someone
// wipe their own taste vector — still ships via resetTaste(); a portability
// download is a separate feature and, if it comes back, should be a
// deliberate re-add, not a silent regression of this removal.
ok(!home.includes("function exportTaste"), "the raw-JSON export was removed per owner request — it is not just hidden, the code is gone");
ok(!home.includes("wayfind-my-taste.json") && !home.includes("Export my data"), "no trace of the export control remains in the panel");
ok(!/wf-taste-btn is-primary/.test(home), "the now-unused is-primary button variant is gone from the markup, not just unreferenced");
ok(!/\.wf-taste-btn\.is-primary\{/.test(css), "…and its CSS rule is gone too — no dead styling left behind");
ok(/className="wf-taste-btn is-danger">Reset</.test(home), "the sole remaining control is a plain \"Reset\", not \"Reset & forget all\" — one honest verb, not two");
// THE HEADER. The consent card rendered inside .wf-topbar, where it inherited
// the topbar's shadow and its orange :after hairline and ate half the phone
// viewport. It is a statement about the FEED and now lives in the feed.
{
  const topbarAt = home.indexOf('className="wf-topbar"');
  const bodyAt = home.indexOf("{/* Body */}");
  const bannerAt = home.indexOf("Want a feed that learns what you like?");
  ok(topbarAt > 0 && bodyAt > topbarAt && bannerAt > bodyAt, "the personalization consent card lives in the scrolling BODY, never inside .wf-topbar");
}

// The Score honesty lock STILL holds after activation.
ok(!/toDisplayScore\([^)]*affinit|wayfindScore\([^)]*affinit/.test(home), "affinity STILL never feeds the Wayfind Score — re-rank uses the internal _ps only");
ok(home.includes("displayed wfScore never changes"), "the ranking comment still asserts the visible Score is untouched");

console.log(`test-taste: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
