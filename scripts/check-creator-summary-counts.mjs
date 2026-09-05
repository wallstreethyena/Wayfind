#!/usr/bin/env node
/**
 * check-creator-summary-counts — a rendered summary may not claim a total the
 * curation file disagrees with.
 *
 * v8.95. @cindy.selects's summary said "ten of her eleven finds are coffee
 * shops" and was serving on production the day she reached TWELVE. Nothing was
 * broken — the sentence was true when it was written, and a number written into
 * prose has no way to know the list under it grew. That is the failure this
 * guard exists for: not a bug, a fact with a silent expiry date, on the one line
 * of a creator page a reader actually reads.
 *
 * WHAT IT CHECKS. lib/creatorArchetypes.js `summary` is RENDERED
 * (lib/creatorPages.js, sheets/SocialFind.js); `evidence` is an internal dated
 * research note nothing shows. So only `summary` is held to the live data, and
 * `evidence` is deliberately left free to carry exact numbers.
 *
 * A count claim is a number — digits or the words one..twenty — standing within
 * three words of a count noun (finds / spots / places / posts / videos). Each
 * one is compared against what allCreators() reports for that handle RIGHT NOW:
 *
 *   · a number in "N of her M finds" — M must equal the real total exactly, and
 *     N must be no larger than it. That construction is the one that broke.
 *   · any other count claim must equal the total (spots) or the distinct place
 *     count, because those are the only two totals a summary can honestly mean.
 *
 * The fix when this fires is almost always to make the sentence count-free
 * rather than to update the number, because updating the number just resets the
 * same timer. That advice is printed with the failure.
 *
 * FALSE-POSITIVE SURFACE, stated so it can be falsified: every ASSIGNMENTS entry
 * is scanned, and a numeral that is NOT within three words of a count noun is
 * ignored — "tacos in a 1905 bank" and "a 36-inch pizza" are prose, and both
 * exist in this file today, so the negative control is real rather than
 * hypothetical.
 */
import { ASSIGNMENTS } from "../lib/creatorArchetypes.js";
import { allCreators } from "../lib/creatorVideos.js";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

const WORD = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const NUM = Object.keys(WORD).join("|");
const NOUN = "finds|spots|places|posts|videos";
const toN = (t) => (/^\d+$/.test(t) ? Number(t) : WORD[String(t).toLowerCase()]);

// "N of her/his/their M <noun>" — the shape that shipped the stale claim.
const OF_RE = new RegExp(`\\b(\\d+|${NUM})\\s+of\\s+(?:her|his|their)\\s+(\\d+|${NUM})\\s+(?:${NOUN})\\b`, "gi");
// Any number standing within three words of a count noun.
const NEAR_RE = new RegExp(`\\b(\\d+|${NUM})\\b(?=(?:\\s+\\S+){0,3}\\s+(?:${NOUN})\\b)`, "gi");

const { creators } = allCreators();
const byHandle = new Map(creators.map((c) => [c.handle.toLowerCase(), c]));
ok(byHandle.size > 0, "positive control: allCreators() returned creators — an empty map makes every check below vacuous");

const handles = Object.keys(ASSIGNMENTS);
ok(handles.length > 0, "positive control: ASSIGNMENTS is non-empty");

let claims = 0, scanned = 0;
for (const handle of handles) {
  const a = ASSIGNMENTS[handle];
  const summary = (a && a.summary) || "";
  if (!summary) continue;
  scanned++;
  const row = byHandle.get(String(handle).toLowerCase());
  const spots = row ? row.spots.length : null;
  const distinct = row ? new Set(row.spots.map((s) => s.key)).size : null;

  const of = [...summary.matchAll(OF_RE)];
  for (const m of of) {
    claims++;
    const part = toN(m[1]), total = toN(m[2]);
    ok(row != null, `@${handle}: summary claims "${m[0]}" but the handle has no curated spots at all`);
    if (row == null) continue;
    ok(total === spots,
      `@${handle}: summary says "${m[0]}" but the curation file holds ${spots} spots. Rewrite the line WITHOUT a total — updating the number only resets the same timer.`);
    ok(part <= total, `@${handle}: summary says "${m[0]}" — the part is larger than the whole`);
  }

  for (const m of [...summary.matchAll(NEAR_RE)]) {
    // Already covered, and more precisely, by the "N of her M" rule above.
    if (of.some((o) => o[0].includes(m[0]))) continue;
    claims++;
    const v = toN(m[1]);
    ok(row != null, `@${handle}: summary claims "${m[0]} …" but the handle has no curated spots at all`);
    if (row == null) continue;
    ok(v === spots || v === distinct,
      `@${handle}: summary claims ${v} where the curation file holds ${spots} spots (${distinct} distinct places). Prefer a count-free sentence — a total written into prose expires silently.`);
  }
}

if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`check-creator-summary-counts: FAIL — ${bad.length}/${n} assertions`);
  process.exit(1);
}
console.log(`check-creator-summary-counts: OK — ${n} assertions (${scanned} rendered summaries scanned against live allCreators() data, ${claims} count claim(s) found and verified; numerals not adjacent to a count noun — "a 1905 bank", "a 36-inch pizza" — are ignored by design, and evidence is exempt because nothing renders it)`);
