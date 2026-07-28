// scripts/test-atlas-editorial-row.mjs — the publish decision, exercised with
// real inputs rather than grepped for.
//
// One row, one question: may a user see this? Getting it wrong is expensive in
// both directions. Answer "no" when the answer is yes and the fleet writes
// editorial nobody ever reads — which is what happened between 2026-07-24 and
// 2026-07-28, 169 clean rows deep. Answer "yes" when the answer is no and the
// site starts confidently recommending a churrascaria as a cafe.
//
// scripts/check-editorial-publish.mjs proves the decision is DERIVED and that
// every reader still gates on it. This file proves the derivation is correct.
import { editorialRow, contentIssues, sourcedFacts } from "../lib/atlasEditorial.js";

let pass = 0;
const fail = (m) => { console.error("test-atlas-editorial-row: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const NOW = "2026-07-28T00:00:00.000Z";
const PLACE = { place_id: "ChIJtest", name: "The Test Room", category: "nightlife" };
const SRC = "https://example.com/menu";

// A reply that clears the bar: an opinionated hook, a why_here that answers the
// question in more than a fragment, and a claim with a source behind it.
const GOOD = {
  hook: "A twelve-seat listening bar hidden behind an unmarked door on Central.",
  why_here:
    "You go for the room, not the drinks list, though the drinks list is short and unusually good. " +
    "It is quiet enough to hear the records, which rules it out for a group of eight and makes it " +
    "the best first-date bar in the neighbourhood. Cash only, and they mean it.",
  know_before: "Open Wed-Sun from 6pm; the door is the unmarked one next to the laundromat.",
  best_time: "Wednesday around 7pm, before the record swap crowd arrives.",
  local_tip: "Ask what is on the B-side.",
  facts: [{ claim: "Open Wednesday to Sunday from 6pm", source: SRC }],
};

// ── the publishable case ────────────────────────────────────────────────────
{
  const r = editorialRow(PLACE, GOOD, NOW, null);
  ok(r.verified === true, "a sourced row with a real why_here publishes");
  eq(r.issues, null, "a publishable row stores issues=null, not an empty array — `issues is null` has to stay a one-case SQL predicate");
  eq(r.facts.length, 1, "its sourced fact survives onto the row");
  eq(r.standard_version, "atlas-590-v1", "the standard version is stamped");
  eq(r.written_at, NOW, "written_at is the caller's timestamp, not a fresh one per row");
  eq(r.place_id, PLACE.place_id, "the row is keyed by place_id");
}

// An empty issues array from the caller must behave exactly like null. This is
// the bug that made the first production reading of this table wrong: `issues`
// is text[], and `issues is not null` is TRUE for `{}`.
{
  const r = editorialRow(PLACE, GOOD, NOW, []);
  ok(r.verified === true, "issues=[] means the caller found nothing wrong, so the row still publishes");
  eq(r.issues, null, "issues=[] is normalised to null on the way in");
}

// ── the content bar ─────────────────────────────────────────────────────────
{
  // Exactly the card the owner reported: it exists, it says nothing about why.
  const thin = { ...GOOD, why_here: "It is nice." };
  const r = editorialRow(PLACE, thin, NOW, null);
  ok(r.verified === false, "a row whose why_here is a fragment does NOT publish");
  ok(r.issues.includes("insufficient-why-here"), "and it says so");
  ok(r.why_here === "It is nice.", "the thin copy is still STORED — otherwise wf_atlas_missing hands the same place back every run, forever");
}
{
  const r = editorialRow(PLACE, { ...GOOD, why_here: "x".repeat(119) }, NOW, null);
  ok(r.verified === false, "119 characters of why_here is under the bar");
}
{
  const r = editorialRow(PLACE, { ...GOOD, why_here: "x".repeat(120) }, NOW, null);
  ok(r.verified === true, "120 characters clears it — the same threshold supabase/editorial-publish-backfill.sql uses, so backfilled and freshly-written rows mean the same thing");
}
{
  const r = editorialRow(PLACE, { ...GOOD, facts: [] }, NOW, null);
  ok(r.verified === false && r.issues.includes("no-sourced-facts"), "an unsourced opinion does not publish");
}
{
  // A source that is not a URL is not a source.
  const r = editorialRow(PLACE, { ...GOOD, facts: [{ claim: "Open at 6", source: "the website" }] }, NOW, null);
  eq(r.facts, [], "a claim with a non-URL source is dropped");
  ok(r.verified === false && r.issues.includes("no-sourced-facts"), "and dropping it takes the row below the bar rather than publishing an unbacked claim");
}
{
  const r = editorialRow(PLACE, { ...GOOD, hook: "Nice bar." }, NOW, null);
  ok(r.verified === false && r.issues.includes("thin-hook"), "a nine-character hook does not publish — upstream only tests that a hook is truthy");
}
{
  const r = editorialRow(PLACE, { hook: "x", why_here: "", facts: [] }, NOW, null);
  eq(r.issues, ["thin-hook", "insufficient-why-here", "no-sourced-facts"], "every reason is recorded, not just the first — the issue list is the evidence someone reviews later");
}

// ── the caller's own bail-outs ──────────────────────────────────────────────
{
  const r = editorialRow(PLACE, null, NOW, ["PENDING SOURCE"]);
  ok(r.verified === false, "a place with no source data does not publish");
  eq(r.issues, ["PENDING SOURCE"], "and keeps the caller's reason verbatim");
  eq(r.facts, [], "with no facts invented to fill the gap");
  eq(r.hook, null, "and no hook");
}
{
  const r = editorialRow(PLACE, null, NOW, ["RIDE-LEVEL — merge into parent park"]);
  ok(r.verified === false, "a ride inside a park is stored, never published as a place");
  eq(r.issues.length, 1, "the content bar adds nothing when there is no content to judge — three redundant flags would bury the real reason");
}
{
  // Caller reason AND content failure together: both must survive.
  const r = editorialRow(PLACE, { ...GOOD, facts: [] }, NOW, ["category-mismatch"]);
  eq(r.issues, ["category-mismatch", "no-sourced-facts"], "a caller reason and a content failure are both recorded");
  ok(r.verified === false, "and either one alone is enough to withhold the row");
}

// ── the helpers, directly ───────────────────────────────────────────────────
eq(sourcedFacts(null), [], "sourcedFacts tolerates a null parse");
eq(sourcedFacts({ facts: "nope" }), [], "sourcedFacts tolerates a non-array facts field");
eq(sourcedFacts({ facts: Array.from({ length: 9 }, () => ({ claim: "c", source: SRC })) }).length, 6, "facts are capped at 6 — the card renders a handful, and the row is not a dumping ground");
eq(contentIssues(null, []), [], "contentIssues stays silent when there is no parse to judge — the caller has already recorded why");

console.log(`test-atlas-editorial-row: OK — ${pass} assertions (derived publish flag, content bar, caller bail-outs)`);
