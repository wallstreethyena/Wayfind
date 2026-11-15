#!/usr/bin/env node
// Live side of scripts/test-christmas-twins.mjs (2026-11-12 duplicate sweep).
// Builds the Christmas browse exactly as /api/christmas/browse does, from the
// live wf_events table, and fails if any SUSPECTED twin is neither linked in
// CHRISTMAS_DB_RESEARCH_IDS nor listed in REVIEWED_DISTINCT. New rows from the
// weekly discovery run are the usual source, which is why this runs in the
// 30 minute canary (called from scripts/check-inventory-integrity.mjs) and not
// in the offline prebuild. It reports; it never merges anything.
//
// Credentials: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (canary), or the
// public NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY. Without
// either it SKIPs with exit 0, like check-inventory-integrity.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("check-christmas-twins-live: SKIP — no Supabase credentials in env");
  process.exit(0);
}
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;

const { fetchCuratedEvents } = await import("../lib/curatedEvents.js");
const { christmasBrowseCached, parseChristmasBrowseQuery } = await import("../lib/christmasBrowse.js");
const { siteTodayStr } = await import("../lib/siteTime.js");
const { findChristmasTwinCandidates } = await import("../lib/christmasTwins.js");

const today = siteTodayStr();
const cards = [];
let total = null;
for (let p = 1; p <= 100; p += 1) {
  const { page } = await christmasBrowseCached(parseChristmasBrowseQuery(new URLSearchParams("page=" + p)), today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(20000) }));
  total = page.total;
  cards.push(...(page.cards || []));
  if (!page.hasMore) break;
}
// Fail closed: a short read must not pass as "no twins".
if (!cards.length || cards.length !== total) {
  console.error(`check-christmas-twins-live: FAIL — read ${cards.length} of ${total} Christmas cards`);
  process.exit(1);
}
const ids = cards.map((c) => c.id);
const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
const twins = findChristmasTwinCandidates(cards.filter((c) => c.kind === "event"));
if (repeated.length || twins.length) {
  if (repeated.length) console.error("check-christmas-twins-live: FAIL — card id repeated: " + [...new Set(repeated)].join(", "));
  for (const t of twins) console.error(`check-christmas-twins-live: FAIL — suspected twin ${t.key} (similarity ${t.similarity}${t.samePage ? ", same official page" : ""}). Same event: add the wf_events id to CHRISTMAS_DB_RESEARCH_IDS (lib/christmasResearch.js). Different events: add the pair to REVIEWED_DISTINCT (lib/christmasTwins.js).`);
  process.exit(1);
}
console.log(`check-christmas-twins-live: OK — ${cards.length} live Christmas cards, no repeated id, no unreviewed twin`);
