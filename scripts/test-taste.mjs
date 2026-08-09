// scripts/test-taste.mjs — locks the Phase-1 taste model: it learns per-user
// from EXPLICIT signals, decays honestly, stays bounded, and — the brand rule —
// NEVER touches the Wayfind Score. Ranking is unchanged in Phase 1.
import { readFileSync } from "fs";
import { signalWeights, decayedWeight, blendTaste, applyLocalTaste, localToVector, affinityFor, isLearnableValue, tasteLabel, tasteChips, TAG_LABEL, TASTE_TAU_MS, SIGNAL_WEIGHT, TASTE_EDITOR_OPTIONS, manualTasteSignals, summarizeTasteVector, hasLearnedTaste, tasteNorm } from "../lib/taste.js";

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

// --- human-editable profile: readable groups + explicit correction ---
ok(TASTE_EDITOR_OPTIONS.length >= 10 && new Set(TASTE_EDITOR_OPTIONS.map((x) => x.id)).size === TASTE_EDITOR_OPTIONS.length, "taste editor offers a useful, unique controlled vocabulary");
{ const moreCoffee = manualTasteSignals("coffee", "more"); const lessCoffee = manualTasteSignals("coffee", "less"); ok(moreCoffee.length === 2 && moreCoffee.every((x) => x.delta > 0) && lessCoffee.every((x) => x.delta < 0), "manual preference supports explicit more/less direction"); }
ok(manualTasteSignals("not-a-real-option", "more").length === 0, "manual preference fails closed for unknown options");
{
  const summary = summarizeTasteVector({ tag: { "coffee shop": 2, cafe: 1, "brunch restaurant": 3, "raw service token": -2 }, category: { beach: 4 } });
  ok(summary.more.some((x) => x.id === "coffee" && x.label === "Coffee & cafés"), "technical coffee tags collapse into one human-readable preference");
  ok(summary.more.some((x) => x.id === "brunch") && summary.more.some((x) => x.id === "beaches"), "known tags/categories become readable profile groups");
  // v6.55 superseded the original form of this assertion, which used an
  // unmatched TAG. The tag dimension became a strict allowlist, so an unmatched
  // tag is now filtered on READ and never reaches a human at all — a stronger
  // guarantee than parking it in `details` for review. The details path itself
  // still matters for the dimensions that are NOT allowlisted, so it is
  // asserted there instead of being dropped.
  ok(!summary.details.some((d) => d.dimension === "tag"), "an unmatched tag never reaches the panel — v6.55's allowlist filters it on read, so there is nothing left to review");
  { const uncurated = summarizeTasteVector({ category: { "wildcard venue": -2 } });
    ok(uncurated.details.length === 1 && uncurated.details[0].label === "Wildcard Venue" && uncurated.details[0].weight < 0, "…and an unmatched value in a non-allowlisted dimension is still inspectable and removable under details"); }
}

// --- THE BRAND LOCKS (home.js) ---
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes("function recordTaste(action, p)"), "the taste recorder is wired");
ok(home.includes('supabase.rpc("wf_taste_bump"'), "signed-in signals persist to the per-user server vector");
ok(/action !== "open" && supabase && user/.test(home), "server persistence is gated on signed-in; 'open' stays device-local");
ok(/if \(user \|\| action !== "open"\)/.test(home), "explicit reactions learn on-device before sign-in; passive opens remain anonymous-neutral");
ok(/if \(action !== "open" && personalize == null\) setConsent\("on"\)/.test(home), "a first explicit reaction opts the on-device feed into personalization without overriding a prior off choice");
ok(home.includes('recordSignal(p, "save")') && home.includes('recordSignal(p, "share")'), "save + share now feed the model, alongside like/dislike/open");
{
  const body = (start, end) => home.slice(home.indexOf(start), home.indexOf(end));
  ok(!body("function toggleLike", "function toggleDislike").includes("requireAuth"), "like works immediately on-device before sign-in");
  ok(!body("function toggleDislike", "function toggleHookLike").includes("requireAuth"), "dislike works immediately on-device before sign-in");
  ok(!body("function addShared", "async function refreshOwnerPick").includes("requireAuth"), "share is remembered immediately on-device before sign-in");
  ok(!body("function quickSaveFavorite", "function saveHookList").includes("requireAuth"), "save works immediately on-device before sign-in");
}
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
ok(/const personalized = personalize === "on" && hasTaste/.test(home), "the feed re-ranks on-device after explicit consent; sign-in is only the cloud-sync boundary");
ok(/personalized \? applyAffinity\(list, affinities\) : list/.test(home), "no consent -> pure moment/Score order, unranked by taste");
// v6.56 (owner: "remove the item on image 2 ... put the personalization under
// the favorites ... not in their face at the main page"). The consent ask and
// the "picked for you" status strip left the home feed. The RULES they enforced
// did not leave with them — a feed that silently reorders itself is the thing
// this file exists to prevent — so both assertions now point at the surface
// that owns them: the Personalization row at the bottom of Favorites.
const saved = readFileSync(new URL("../app/components/screens/Saved.js", import.meta.url), "utf8");
ok(!home.includes("Picked for you") && !home.includes("Personalize my feed") && !home.includes("Want a feed that learns what you like?"), "the home feed carries NO personalization surface — the feed is the feed");
// The three checks above are COPY checks, and copy gets reworded. The two below
// are structural, and they exist because of how #392 nearly came back: its
// home-feed expander survived a 3-way merge silently, because the delta that
// removed personalization from the feed only knew how to delete the older
// markup it had shipped itself. Git preserved the newer block as an unrelated
// addition — correct merge behaviour, wrong product. A class name and a render
// condition are what a resurrected editor cannot rename its way around.
ok(!home.includes("wf-taste-inline"), "…and no inline home-feed taste editor, by class name — copy can be reworded, the mount point cannot");
// home.js is allowed to READ the setting exactly once — to decide whether to
// re-rank — and nowhere else. Every home-feed personalization surface this file
// has had to delete started life as a second `personalize === "on"`, one that
// gated markup instead of ordering. Counting is the check: one is the feature,
// two is the strip coming back.
{
  const reads = home.match(/personalize === "(on|off)"/g) || [];
  ok(reads.length === 1 && /const personalized = personalize === "on" && hasTaste;/.test(home),
    "…and home.js reads `personalize` exactly once, to gate the re-ranking itself — never to render a surface");
}
ok(/const on = personalize === "on";/.test(saved) && /On · \$\{learned\} thing/.test(saved) && /Off · same feed for everyone/.test(saved), "when on, personalization is labeled in Favorites for signed-in and on-device visitors alike");
ok(!/\{user && \(\s*<>\s*<div[^>]*>Personalization/.test(saved), "the on-device personalization controls are not hidden behind sign-in");
ok(!/screen === "saved"[^\n]*AuthWall/.test(home), "Favorites remains reachable so a signed-out visitor can inspect, disable or erase local taste");
// v6.56: the on/off subtitle IS the disclosure, so it must not be truncatable.
// A row that reads "Off · your feed is ranked the s…" has told the reader
// nothing. Locked to wrapping rather than ellipsis.
ok(!/textOverflow: "ellipsis" \}\}>\{sub\}/.test(saved), "…and that label can never be cut off with an ellipsis on a narrow screen");
ok(/never changes a place's Wayfind Score/.test(saved), "…and says, where a person can actually read it, that taste never touches the Score");
ok(/Turn on personalization/.test(saved) && /setConsent\("on"\)/.test(saved), "the consent ask is a real choice — opt-IN, and off is the default until tapped");
ok(/className="wf-taste-btn is-quiet">Turn off</.test(home) && /setConsent\("off"\); setTasteOpen\(false\)/.test(home), "'turn it off' is a real control that STOPS re-ranking without erasing — separate from Reset, which wipes");
ok(/_vec\.category\) for .* affinities\.catW\[k\] = \(affinities\.catW\[k\] \|\| 0\) \+ v \* 0\.4/.test(home), "the DURABLE per-user vector folds into ranking — taste persists across sessions");
// v7.08 — setLocal() (lib/localStore.js) replaced the bare setItem here.
// Same requirement, finally met: the production store was measured five
// characters under its 5MB quota, so the bare write was throwing
// QuotaExceededError into a silent catch while this guard stayed green,
// because the CALL was present and only the WRITE was failing. The
// assertion is about persistence, not about which function performs it.
ok(home.includes('setLocal("wf_personalize"') || home.includes('localStorage.setItem("wf_personalize"'), "consent choice is remembered");
ok(home.includes('supabase.from("wf_taste").select') , "signed-in users' durable vector loads from their OWN rows");
// Phase 3 control
ok(home.includes("function resetTaste") && home.includes('supabase.rpc("wf_taste_wipe")'), "Reset wipes the server vector");
ok(home.includes("function forgetTasteItem"), "per-item forget ships");
{
  // #392 shipped a controlled preference vocabulary and a summariser in
  // lib/taste.js, and a home-feed editor that consumed them. v6.56 removed
  // that editor (owner: "not in their face at the main page"), but the MODEL
  // stays — it is pure, it is the app's canonical taste taxonomy, and the
  // Favorites surface is the obvious place for an editor to come back. It is
  // asserted behaviourally here so it cannot rot while it has no view.
  const T = await import("../lib/taste.js");
  const junk = T.summarizeTasteVector({ tag: { "2": 5, "24 7": 4, "coffee shop": 6 }, price: { "2": 3 } });
  const labels = [...junk.more, ...junk.less, ...junk.details].map((x) => x.label || x.value);
  ok(!labels.includes("2"), "a stored numeric tag never renders as a chip (the chip that just read \"2\")");
  ok(!labels.includes("24 7"), "other numeric junk is retired on read too");
  ok(labels.some((l) => /coffee/i.test(l)), "a real preference still surfaces");
  ok(labels.some((l) => /moderate|\$\$/i.test(l)), "the price bucket renders as a human label, not a raw index");
  ok(T.isLearnableValue("price", "2") === true, "price legitimately stores 1..4");
  ok(T.isLearnableValue("tag", "2") === false, "a bare number is not a taste");
  ok(/if \(!isLearnableValue\(dimension, value\)\) continue;/.test(
       readFileSync(new URL("../lib/taste.js", import.meta.url), "utf8")),
     "the read-path filter lives in summarizeTasteVector, applied to every consumer");
}
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
// v6.56: the read path is one exported function, tasteChips(), because TWO
// callers now need the identical answer — the sheet renders the chips and the
// Favorites row counts them. So these three rules are asserted against the
// FUNCTION (real behaviour, not a grep), and the views are asserted to call it
// rather than re-implement it. That is strictly stronger than the v6.45 wiring
// greps it replaces.
ok(/import \{[^}]*\btasteChips\b[^}]*\} from "\.\.\/lib\/taste"/.test(home), "home.js imports the read-path helper — the panel must not re-implement labelling, filtering or merging");
ok(/import \{ tasteChips \} from "\.\.\/\.\.\/\.\.\/lib\/taste"/.test(saved) && /tasteChips\(tasteVecState \|\| \{\}\)\.length/.test(saved), "the Favorites row counts with the SAME helper the sheet renders — a count that disagreed with its list would be a small lie");
ok(!/isLearnableValue\(dim, val\)/.test(home) && !/groups\.set\(key, \{ dim, label/.test(home) && !/groups\.set\(key, \{ dim, label/.test(saved), "…and neither view keeps a second copy of the loop, which would drift");
// 1. FILTER ON READ. A write-path-only fix leaves junk already sitting in
//    localStorage wf_taste_local and Supabase wf_taste rendering forever — that
//    is exactly the chip that just read "2".
ok(tasteChips({ tag: { food_store: 5, american_restaurant: 1 } }).every((c) => c.label !== "" && c.vals.indexOf("food_store") < 0), "the read path filters the STORED vector, so junk learned before a labelling fix retires the moment the fix ships");
// 2. LABEL, don't dump. The panel showed raw taxonomy rows: food, coffee shop,
//    food store, and a bare price bucket index.
// v6.55: chips are grouped BY LABEL (dim + "|" + label), not by raw value —
// TAG_LABEL deliberately maps several raw Google tokens onto the same clean
// label (e.g. american_restaurant + californian_restaurant -> "American"), and
// this is what merges them into one chip with combined weight and every
// contributing raw value kept in `vals`.
{
  const merged = tasteChips({ tag: { american_restaurant: 2, californian_restaurant: 3, bar: 1 } });
  const amer = merged.find((c) => c.label === "American");
  ok(merged.length === 2, "near-duplicate Google tokens collapse into ONE chip, never two that mean the same thing");
  ok(amer && amer.w === 5, "…with the contributing weights summed");
  ok(amer && amer.vals.length === 2 && amer.vals.indexOf("californian_restaurant") >= 0, "…and every contributing RAW value carried along, so forget can address them all");
  ok(merged[0].label === "American", "chips are ordered by absolute weight — strongest taste first");
  ok(tasteChips({ tag: { bar: -4, american_restaurant: 1 } })[0].w === -4, "a strong NEGATIVE outranks a weak positive — |w|, not w");
}
ok(tasteChips(null).length === 0 && tasteChips({}).length === 0 && tasteChips({ nonsense: { x: 1 } }).length === 0, "no vector / empty vector / unknown dimension -> no chips, no throw");
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
// WHERE IT LIVES. v6.50 moved the consent card out of .wf-topbar and into the
// scrolling body; v6.56 took it off the home feed entirely (owner: "not in
// their face at the main page that is too much and it messes with the flow").
// It is now the LAST section of the Favorites root view — below the lists,
// below the activity folders, below saved experiences — because it is a
// setting about the feed, not an announcement. This ordering is the whole
// point of the change, so it is locked rather than left to drift back up.
{
  const listsAt = saved.indexOf("Your collections");
  const activityAt = saved.indexOf("From your activity");
  const personalAt = saved.indexOf(">Personalization<");
  const sysAt = saved.indexOf("{sysFolder && (() => {");
  ok(listsAt > 0 && activityAt > listsAt && personalAt > activityAt, "Personalization is the LAST section of Favorites, under the lists and the activity folders");
  ok(sysAt > personalAt, "…and inside the root (!activeList && !sysFolder) branch, so it never shows inside an opened list");
}
ok(/personalize, setConsent, setTasteOpen, tasteVecState/.test(home) && /personalize, setConsent, setTasteOpen, tasteVecState/.test(saved), "the consent state reaches SavedScreen through the one ctx bag — no second source of truth");
// Explicit reactions now work on-device before sign-in. The control and the
// behavior remain paired: Favorites is reachable, the setting is visible, and
// cloud sync remains the only part that requires an account.
{
  const personalAt = saved.indexOf(">Personalization<");
  ok(/\{screen === "saved" && <SavedScreen ctx=\{ctx\} \/>\}/.test(home), "Favorites is available on-device before sign-in");
  ok(personalAt > 0 && saved.indexOf("{user && (") < 0, "…and the personalization row is never hidden behind a user guard");
  ok(!/authReady, AuthWall,/.test(home.slice(home.indexOf("personalize, setConsent"), home.indexOf("personalize, setConsent") + 200)), "…and SavedScreen no longer needs the auth primitives passed through ctx");
}

// The Score honesty lock STILL holds after activation.
ok(!/toDisplayScore\([^)]*affinit|wayfindScore\([^)]*affinit/.test(home), "affinity STILL never feeds the Wayfind Score — re-rank uses the internal _ps only");
// 2026-08-07: the governing law REVERSED the old claim — the distance and
// creator terms are now IN the displayed score (that is the whole law:
// shown == sorted). The assertion flips accordingly.
ok(home.includes("THE GOVERNING LAW") && !home.includes("displayed wfScore never changes"), "the ranking comment carries the governing law, not the retired 'display never changes' claim");


// ── 2026-08-07: the DEAD-TOGGLE root cause, locked by CALLING the seam ──────
// The owner turned personalization on and correctly observed nothing moved.
// Two causes, both asserted here so neither can return:
//  (a) the gate counted only the category dimension — his real vector was
//      2 category dims + 17 tag dims, so the discriminating signal never
//      unlocked the re-rank;
//  (b) the tag dimension was learned and DISPLAYED but consumed by nothing.
ok(hasLearnedTaste({ tag: { "mexican restaurant": 3 } }, 0) === true,
  "a TAG-only vector unlocks personalization — the exact shape of the owner's real vector no longer reads as dead");
ok(hasLearnedTaste({ category: { food: 5 } }, 0) === true, "a category vector still unlocks it");
ok(hasLearnedTaste({}, 2) === true, "two explicit session reactions still unlock it");
ok(hasLearnedTaste({}, 0) === false, "nothing learned and no reactions -> the feed stays pure Score order (the gate can say no)");
ok(hasLearnedTaste({ price: { "2": 4 } }, 0) === false,
  "a PRICE-only vector does NOT unlock it — applyAffinity does not consume price, and a gate that opens for an unapplied dimension recreates the dead toggle");

// (b) the tag fold consumes what signalWeights writes — SAME normalizer both
// sides, proven by round-trip: what a like on a mexican_restaurant place
// learns is matchable against that place's own google_types via tasteNorm.
{
  const learned = signalWeights("like", { category: "food", google_types: ["mexican_restaurant"] }).filter((x) => x.dimension === "tag");
  ok(learned.length === 1, "fixture learns exactly one tag dim (guards the round-trip below from vacuity)");
  const key = learned[0].value;
  ok(tasteNorm("mexican_restaurant") === key,
    `tasteNorm(place type) equals the stored vector key ("${key}") — a reader with its own toLowerCase would match nothing and the dimension would be dead again`);
}

// The feed call site really consumes the tag dimension and gates on the
// SHARED helper (syntactic-position checks on the exact seam, comments stripped).
{
  const homeCode = home.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/affinities\.tagW = \{ \.\.\._vec\.tag \}/.test(homeCode), "the durable tag dims are handed to applyAffinity (the learned-but-never-applied gap)");
  ok(/const hasTaste = hasLearnedTaste\(_vec, activeSignals\.length\)/.test(homeCode), "the gate is the shared, tested helper — not a re-derived category-only check");
  ok(/\.map\(\(t\) => tasteNorm\(t\)\)/.test(homeCode), "applyAffinity normalizes place tags through tasteNorm, the writer's own normalizer");
  // THE LAW SEAM: personalization is the one disclosed exemption to
  // shown == sorted. The disclosure string must be gated by the SAME
  // `personalized` flag that gates applyAffinity — one flag, two effects,
  // so the reorder can never run undisclosed.
  ok(/if \(personalized\) reasons\.push\("your taste/.test(homeCode), "the feed DISCLOSES the taste re-rank in its reasons line when (and only when) it is active");
  const gateUses = (homeCode.match(/personalized \? applyAffinity/g) || []).length;
  ok(gateUses === 1, `applyAffinity runs behind the personalized flag exactly once (got ${gateUses})`);
}

console.log(`test-taste: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
