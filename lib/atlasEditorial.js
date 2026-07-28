// lib/atlasEditorial.js — how one Atlas editorial row decides whether it may be
// published. Pure: no fetches, no env, no Next runtime. Lives here rather than
// inside app/api/cron/atlas-build/route.js so the decision can be TESTED with
// real inputs (scripts/test-atlas-editorial-row.mjs) instead of grepped for.
//
// The rule, in one line: `verified` is derived from the same issue list the row
// stores, so a row and the evidence against it can never disagree.
//
// It used to be `verified: false`, hardcoded, and nothing in the codebase ever
// set it true. The flag was ticked by hand once, over 2026-07-22..24, and never
// again — so every row the fleet wrote after that was invisible from birth. By
// 2026-07-28 that was 169 clean rows (average 515-character why_here, 4.3 sourced
// facts — the best writing in the table) that no user could see, which is what
// the owner was reporting when he said detail cards had nothing in them about
// why anyone should go.
//
// The gate on the READ side is not the problem and must not be touched: it is
// what keeps the flagged rows — wrong category, chain-generic copy, unresolvable
// place_ids, city pins filed as venues — off the site. A confidently wrong
// reason to go is worse than none.

// facts[] the model returned, reduced to the ones that actually cite something.
// A "fact" with no resolvable http(s) source is an assertion, and this product
// does not publish assertions.
export function sourcedFacts(parsed) {
  return parsed && Array.isArray(parsed.facts)
    ? parsed.facts
        .filter((f) => f && f.claim && typeof f.source === "string" && /^https?:\/\//.test(f.source))
        .slice(0, 6)
    : [];
}

// The content bar a row must clear to publish itself.
//
// The caller only knows why IT gave up (a ride rather than a place, no source
// data at all). Nothing checked what the model actually returned beyond "is
// there a hook" — so a reply with a punchy hook, an empty why_here and zero
// sourceable facts counted as a success. That row is exactly the card the owner
// reported: present, and silent on why anyone should go.
//
// Thresholds are duplicated, deliberately, in
// supabase/editorial-publish-backfill.sql. A row written today and a row
// repaired from the backlog have to clear the same bar, or "verified" means two
// different things depending on when the row was written.
//
// A flagged row is still STORED — that is what stops wf_atlas_missing handing
// the same place back every run — it just isn't published.
export function contentIssues(parsed, facts) {
  if (!parsed) return []; // the caller already recorded why there is no content
  const out = [];
  if (String(parsed.hook || "").trim().length < 20) out.push("thin-hook");
  if (String(parsed.why_here || "").trim().length < 120) out.push("insufficient-why-here");
  if (!facts.length) out.push("no-sourced-facts");
  return out;
}

// One wf_editorial row. `issues` is the caller's reason for giving up, or null.
export function editorialRow(place, parsed, nowIso, issues) {
  const facts = sourcedFacts(parsed);
  // One normalised flag list: the caller's reason plus whatever the content
  // itself fails on. `[]` and `null` both mean "nothing wrong"; collapsing to
  // null keeps `issues is null` a usable SQL predicate rather than a two-case
  // one.
  const found = [...(Array.isArray(issues) ? issues : []), ...contentIssues(parsed, facts)];
  const flags = found.length ? found : null;
  return {
    place_id: place.place_id,
    hook: (parsed && parsed.hook) || null,
    why_here: (parsed && parsed.why_here) || null,
    know_before: (parsed && parsed.know_before) || null,
    best_time: (parsed && parsed.best_time) || null,
    local_tip: (parsed && parsed.local_tip) || null,
    facts,
    verified: flags === null,
    issues: flags,
    standard_version: "atlas-590-v1",
    written_at: nowIso,
  };
}
