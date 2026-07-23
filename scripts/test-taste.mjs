// scripts/test-taste.mjs — locks the Phase-1 taste model: it learns per-user
// from EXPLICIT signals, decays honestly, stays bounded, and — the brand rule —
// NEVER touches the Wayfind Score. Ranking is unchanged in Phase 1.
import { readFileSync } from "fs";
import { signalWeights, decayedWeight, blendTaste, applyLocalTaste, localToVector, affinityFor, TASTE_TAU_MS, SIGNAL_WEIGHT } from "../lib/taste.js";

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
{ const tagDeltas = signalWeights("like", { category: "food", google_types: ["a_bar", "b_grill", "c_pub"] }).filter((x) => x.dimension === "tag"); ok(Math.abs(tagDeltas.reduce((s, x) => s + x.delta, 0) - 2 * 0.6) < 1e-9, "tag weight is split, never multiplied, across a place's tags"); }

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
ok(home.includes("function exportTaste") && home.includes("wayfind-my-taste.json"), "export-my-data ships");
ok(home.includes("function forgetTasteItem"), "per-item forget ships");
ok(home.includes("Your taste") && home.includes("never sold"), "the transparency panel exists and states the promise");
// The Score honesty lock STILL holds after activation.
ok(!/toDisplayScore\([^)]*affinit|wayfindScore\([^)]*affinit/.test(home), "affinity STILL never feeds the Wayfind Score — re-rank uses the internal _ps only");
ok(home.includes("displayed wfScore never changes"), "the ranking comment still asserts the visible Score is untouched");

console.log(`test-taste: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
