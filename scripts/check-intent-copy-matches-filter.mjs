#!/usr/bin/env node
/**
 * check-intent-copy-matches-filter — a subhead that names a filter is a CLAIM
 * ABOUT THE CODE. This asserts the code backs it.
 *
 * Owner rule: "Copy that states a filter is a claim about the code. Verify it
 * against the implementing predicate before writing it. A subhead that
 * describes a filter we do not apply is a fabrication with a marketing voice."
 *
 * This shipped broken and is why the guard exists. /budget promised "$ and $$
 * only" and "Google's two lowest price bands" while rankRows filtered on rating
 * and reviews ONLY — toRow dropped priceLevel entirely, so no price filter
 * could exist. The page returned the same 22.3k-review restaurants as
 * /seasonal: two pages, different stated exclusions, identical lists. Identical
 * lists under different promises is what makes the whole product look fake.
 *
 * The check is deliberately narrow: it only fires on claims that map to a
 * predicate rankRows actually supports. It is not a prose linter.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.resolve("lib/intentPages.js"), "utf8");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// rankRows must support every predicate a claim can rely on.
ok(/floor\.maxPrice/.test(src), "rankRows enforces floor.maxPrice — a price claim has something to bind to");
ok(/priceLevel/.test(src), "toRow carries priceLevel — without it no page could filter on price");
ok(/floor\.maxReviews/.test(src), "rankRows enforces floor.maxReviews — the gem ceiling has something to bind to");

// Parse each INTENT_PAGES entry: its `sub` copy vs its `floor`.
const entryRx = /\n {2}"?([a-z-]+)"?:\s*\{([\s\S]*?)\n {2}\},/g;
let m;
const entries = [];
while ((m = entryRx.exec(src))) entries.push({ key: m[1], body: m[2] });
ok(entries.length >= 5, `found the INTENT_PAGES entries to check (got ${entries.length})`);

for (const { key, body } of entries) {
  // Capture to END OF LINE. The first version used a non-greedy [\s\S]*? up to
  // ",\n" and captured the EMPTY STRING for every entry, which made every claim
  // check below silently vacuous — the guard reported OK because it was
  // inspecting nothing. Caught by red-proving an hours claim and watching it
  // pass. Subs are single-line by convention, asserted below.
  const sub = (body.match(/sub:\s*\([^)]*\)\s*=>\s*([^\n]*)/) || [])[1] || "";
  const floor = (body.match(/floor:\s*\{([^}]*)\}/) || [])[1] || "";
  // Guard the guard: an empty capture is how this check went vacuous the first
  // time. If a sub cannot be read, that is a FAILURE, not a pass.
  ok(sub.trim().length > 10, `${key}: its sub copy was readable (an unreadable one makes every claim check below vacuous)`);
  const claim = sub.toLowerCase();

  // PRICE — "$ and $$", "price band", "free and low-cost", "cheap"
  const claimsPrice = /\$ and \$\$|price band|lowest price|free and low-cost|under \$/.test(claim);
  if (claimsPrice) {
    ok(/maxPrice:\s*\d/.test(floor),
      `${key}: subhead makes a PRICE claim, so its floor must set maxPrice — otherwise the page cannot keep it`);
  }

  // REVIEW CEILING vs MINIMUM. These read almost identically in English and
  // mean opposite things:
  //   "We left off anything under 120 reviews"  -> a MINIMUM (floor.reviews)
  //   "Under 3,000 reviews, still rated 4.6+"   -> a CEILING (floor.maxReviews)
  // The first version treated both as a ceiling and flagged three healthy
  // pages. Only count it as a ceiling when it is NOT the "left off anything
  // under N" exclusion phrasing.
  // Minimum phrasings seen in the copy so far: "we left off anything under N
  // reviews" and "nothing under N reviews". Both are floor.reviews.
  const claimsMinimum = /(left off anything|nothing) under [\d,]+ reviews/.test(claim);
  const claimsCeiling = !claimsMinimum && /under [\d,]+ reviews|without landmark volume/.test(claim);
  if (claimsCeiling) {
    ok(/maxReviews:\s*\d/.test(floor),
      `${key}: subhead claims a review CEILING, so its floor must set maxReviews (a floor.reviews minimum is the opposite claim)`);
  }

  // HOURS — the template has no open-now filter at all.
  const claimsHours = /open (right )?now|closing within|live hours|still open/.test(claim);
  ok(!claimsHours,
    `${key}: subhead claims an HOURS filter. IntentPageClient does not filter on hours — remove the claim or implement the filter`);

  // A numeric review minimum in the copy must match floor.reviews exactly.
  const stated = (claim.match(/under ([\d,]+) reviews/) || [])[1];
  if (stated && /reviews:\s*(\d+)/.test(floor)) {
    const actual = Number((floor.match(/reviews:\s*(\d+)/) || [])[1]);
    const claimed = Number(stated.replace(/,/g, ""));
    // "left off anything under N" == floor.reviews N; "under N reviews" as a
    // CEILING is maxReviews and handled above.
    if (/left off anything under/.test(claim)) {
      ok(actual === claimed,
        `${key}: copy says "under ${stated} reviews" but floor.reviews is ${actual} — the number in the promise must be the number in the code`);
    }
  }
}

if (fail.length) {
  console.error("check-intent-copy-matches-filter: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-intent-copy-matches-filter: OK — ${pass} assertions across ${entries.length} intent pages (every stated filter has an implementing predicate)`);
