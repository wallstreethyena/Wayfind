// scripts/test-atlas-verify.mjs — locks lib/atlasVerify, the Atlas honesty gate.
// Every fixture below is a REAL model output captured on 2026-07-28 while running
// 8 Orlando places through the sourced pipeline. The fabrications are what the
// models actually wrote; the false positives are what an earlier, naive version
// of this check wrongly rejected (it took that batch from 5 accepted to 0).
import { verifyAtlasEditorial, properNouns, pageText, BANNED } from "../lib/atlasVerify.js";

let pass = 0;
const fail = (m) => { console.error("test-atlas-verify: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const has = (probs, check, needle) =>
  probs.some((p) => p.check === check && String(p.value).includes(needle));

const CORPUS = [
  "Harry P. Leu Gardens is located at 1920 North Forest Avenue, Orlando, Florida 32803.",
  "Summer hours 9 a.m. - 6 p.m. Open Thursday evenings until 8 p.m.",
  "Fifty acres of camellias. The crowd builds on weekends. Families welcome at the garden.",
  "LEGACY IN BLOOM runs now through May 31, 2026. Last entry is one hour before closing.",
].join(" ");
const URLS = ["https://www.leugardens.org/", "https://maps.google.com/?cid=1"];

// ── the fabrications the gate exists to stop ────────────────────────────────
// Leu Gardens "since 1952" — actually 1936/1961, and no year at all is on the page.
ok(has(verifyAtlasEditorial(
  { why_here: "A botanical oasis in Orlando since 1952.", facts: [] }, CORPUS, URLS),
  "unsourced-number", "1952"), "catches the invented founding year (1952)");

// Orlando Science Center "1949" (actually 1955) and Gatorland "1954" (actually 1949).
for (const yr of ["1949", "1954"]) {
  ok(has(verifyAtlasEditorial({ why_here: `Founded in ${yr}.`, facts: [] }, CORPUS, URLS),
    "unsourced-number", yr), `catches the invented founding year (${yr})`);
}

// An invented restaurant, and an invented artist attribution.
ok(has(verifyAtlasEditorial({ local_tip: "Stop by Pearl's Good Eats nearby.", facts: [] }, CORPUS, URLS),
  "unsourced-entity", "Pearl"), "catches an invented venue name");
ok(has(verifyAtlasEditorial({ hook: "A work by O'Keeffe hangs here.", facts: [] }, CORPUS, URLS),
  "unsourced-entity", "Keeffe"), "catches an invented attribution");

// A cited URL that was never fetched (the model reached for Wikipedia unprompted).
ok(has(verifyAtlasEditorial(
  { hook: "x", facts: [{ claim: "y", source: "https://en.wikipedia.org/wiki/Foo" }] }, CORPUS, URLS),
  "invented-source", "wikipedia"), "catches a citation that was never fetched");

// Hype vocabulary (docs/editorial-standard.md §Voice).
ok(has(verifyAtlasEditorial({ why_here: "A truly stunning garden.", facts: [] }, CORPUS, URLS),
  "banned-word", "stunning"), "catches a banned word");
ok(BANNED.includes("hidden gem") && BANNED.includes("nestled"), "banned list carries the standard's terms");

// Scraped hygiene copy must never become the story.
ok(has(verifyAtlasEditorial(
  { why_here: "Offering additional hand sanitizer stations throughout the park.", facts: [] }, CORPUS, URLS),
  "boilerplate", "sanitiz"), "catches COVID/hygiene boilerplate presented as editorial");

// ── the false positives an earlier version produced (regression guard) ──────
// Sentence-initial ordinary words, and plurals against a singular corpus.
for (const [field, text] of [
  ["best_time", "Families with kids love it."],
  ["know_before", "Crowds build on Thursdays."],
  ["hook", "Features fifty acres of camellias."],
  ["local_tip", "Catch the garden before it closes."],
]) {
  const probs = verifyAtlasEditorial({ [field]: text, facts: [] }, CORPUS, URLS)
    .filter((p) => p.check === "unsourced-entity");
  ok(probs.length === 0, `no false positive on ${JSON.stringify(text)} (got ${JSON.stringify(probs)})`);
}

// A fully-sourced card passes clean — the gate must not reject good work.
ok(verifyAtlasEditorial({
  hook: "Fifty acres of camellias three miles from downtown.",
  why_here: "The garden stays open to 8 p.m. on Thursday.",
  know_before: "Last entry is one hour before closing.",
  best_time: "Come on a Thursday evening.",
  local_tip: "LEGACY IN BLOOM runs through May 31, 2026.",
  facts: [{ claim: "Open Thursday evenings", source: "https://www.leugardens.org/" }],
}, CORPUS, URLS).length === 0, "a fully-sourced card passes clean");

// ── helper behaviour ───────────────────────────────────────────────────────
ok(!properNouns("Families love it.").includes("Families"), "properNouns skips the sentence-initial word");
ok(properNouns("A work by Schmalz hangs here.").includes("Schmalz"), "properNouns keeps a mid-sentence name");
ok(pageText("<script>x</script><p>Hello &amp; welcome.</p>") === "Hello & welcome.", "pageText strips tags + entities");
ok(!pageText("<p>Read our privacy policy. Open daily at 9am.</p>").includes("privacy"), "pageText drops boilerplate sentences");
ok(pageText("<p>Read our privacy policy. Open daily at 9am.</p>").includes("9am"), "pageText keeps real content");

// Absent fields are honest, not errors (omit-rather-than-invent must win).
ok(verifyAtlasEditorial({ hook: "Fifty acres of camellias.", facts: [] }, CORPUS, URLS).length === 0,
  "omitted optional fields are not flagged");

console.log(`test-atlas-verify: OK — ${pass} assertions (real fabrications caught, real false positives not)`);
