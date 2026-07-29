#!/usr/bin/env node
/**
 * check-intent-copy-matches-filter — a headline or subhead that names a filter
 * is a CLAIM ABOUT THE CODE. This asserts the code backs it.
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
 * WHAT rankRows CAN ACTUALLY FILTER ON — the whole list, and the reason the
 * checks below are the shape they are:
 *     floor.rating   floor.reviews   floor.maxReviews   floor.maxPrice
 * That is four predicates. Any exclusion the copy states that does not reduce
 * to one of them cannot be true, no matter how reasonable it sounds.
 *
 * 2026-07-29 — extended for the rotating copy bank, and three holes closed:
 *
 *   1. EVERY VARIANT IS CHECKED. Copy slots became arrays (eyebrows/titles/
 *      subs) so the pages rotate. The old parser read a single-line `sub:`
 *      arrow function; against an array it captured the empty string, which is
 *      how this guard went vacuous once before. It now iterates all of them,
 *      and asserts a floor on the total it found.
 *   2. NUMBERS IN NON-CANONICAL PHRASINGS WERE UNCHECKED. The exact-match test
 *      only fired on "left off anything under N reviews". /best-of said
 *      "nothing under 200 reviews" and /worth-the-drive said "300+ reviews" —
 *      both real numeric promises, neither bound to floor.reviews. Every
 *      phrasing is matched now.
 *   3. RATING NUMBERS WERE NEVER CHECKED AT ALL. "4.6+", "still rated 4.4+",
 *      "nothing under 4.3" — three pages stating a rating floor, nothing
 *      comparing it to floor.rating. Any decimal in the copy is now treated as
 *      a rating claim and must equal it.
 *
 * And the class that motivated the sweep: an exclusion stated about an
 * attribute that has NO predicate. /seasonal claimed "we left off anything with
 * no cover" and /worth-the-drive claimed "we left off anything you could reach
 * in ten minutes". There is no cover predicate and no distance predicate — the
 * distancePenalty reorders, it never excludes, and every intent page searches
 * the same 32km radius. Both were /budget's bug wearing different words.
 *
 * The check is deliberately narrow: it fires on claims that map to a predicate
 * rankRows actually supports, plus explicit exclusions about attributes it
 * provably does not. It is not a prose linter.
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

// Parse each INTENT_PAGES entry: its copy arrays vs its `floor`.
const entryRx = /\n {2}"?([a-z-]+)"?:\s*\{([\s\S]*?)\n {2}\},/g;
let m;
const entries = [];
while ((m = entryRx.exec(src))) entries.push({ key: m[1], body: m[2] });
ok(entries.length >= 5, `found the INTENT_PAGES entries to check (got ${entries.length})`);

// Pull one `slot: [ ... ],` array out of an entry body and return the text of
// each element. Elements are one per line by convention, asserted below.
function slotLines(body, slot) {
  const block = (body.match(new RegExp(slot + ":\\s*\\[([\\s\\S]*?)\\n\\s{4}\\],")) || [])[1];
  if (!block) return [];
  return block.split("\n").map((l) => l.trim()).filter((l) => /=>/.test(l));
}
// The rendered words only. Everything outside a string literal is code
// (`+ city +`, ternaries on the hour) and is not a claim.
const literals = (line) => (line.match(/"((?:[^"\\]|\\.)*)"/g) || []).map((s) => s.slice(1, -1)).join(" ");

const num = (s) => Number(String(s).replace(/,/g, ""));
let totalChecked = 0;

for (const { key, body } of entries) {
  const floor = (body.match(/floor:\s*\{([^}]*)\}/) || [])[1] || "";
  const fReviews = /reviews:\s*(\d+)/.test(floor) ? Number((floor.match(/reviews:\s*(\d+)/) || [])[1]) : null;
  const fMaxReviews = /maxReviews:\s*(\d+)/.test(floor) ? Number((floor.match(/maxReviews:\s*(\d+)/) || [])[1]) : null;
  const fRating = /rating:\s*([\d.]+)/.test(floor) ? Number((floor.match(/rating:\s*([\d.]+)/) || [])[1]) : null;

  const subs = slotLines(body, "subs");
  const titles = slotLines(body, "titles");

  // GUARD THE GUARD. An empty capture is how this check went vacuous the first
  // time: it reported OK while inspecting nothing. If a slot cannot be read,
  // that is a FAILURE, not a pass.
  ok(subs.length >= 1, `${key}: its subs array was readable (an unreadable one makes every claim check below vacuous)`);
  ok(titles.length >= 1, `${key}: its titles array was readable`);

  // Titles state filters too — /budget's headline is literally "$ and $$ only,
  // still rated 4.4+", which is two claims, and nothing checked it before.
  for (const [slot, lines] of [["sub", subs], ["title", titles]]) {
    for (let i = 0; i < lines.length; i++) {
      const text = literals(lines[i]);
      const where = `${key} ${slot}[${i}]`;
      if (slot === "sub") ok(text.trim().length > 10, `${where}: copy was readable`);
      if (!text.trim()) continue;
      totalChecked++;
      const claim = text.toLowerCase();

      // HOURS — the template has no open-now filter at all.
      ok(!/open (right )?now|closing within|live hours|still open/.test(claim),
        `${where}: claims an HOURS filter. IntentPageClient does not filter on hours — remove the claim or implement the filter`);

      // PRICE — "$ and $$", "price band", "free and low-cost", "under $"
      if (/\$ and \$\$|price band|lowest price|free and low-cost|under \$/.test(claim)) {
        ok(/maxPrice:\s*\d/.test(floor),
          `${where}: makes a PRICE claim, so its floor must set maxPrice — otherwise the page cannot keep it`);
      }

      // REVIEW CEILING vs MINIMUM. These read almost identically in English and
      // mean opposite things:
      //   "We left off anything under 120 reviews"  -> a MINIMUM (floor.reviews)
      //   "Under 3,000 reviews, still rated 4.6+"   -> a CEILING (floor.maxReviews)
      // Only count it as a ceiling when it is NOT an exclusion phrasing.
      const minMatch = claim.match(/(?:left off anything|left out anything|nothing) under ([\d,]+) reviews/)
        || claim.match(/([\d,]+)\+ reviews/)
        || claim.match(/at least ([\d,]+) reviews/)
        || claim.match(/fewer than ([\d,]+) reviews/);
      const ceilMatch = !minMatch && claim.match(/under ([\d,]+) reviews/);

      if (minMatch) {
        ok(fReviews != null && num(minMatch[1]) === fReviews,
          `${where}: promises ${minMatch[1]} reviews but floor.reviews is ${fReviews} — the number in the promise must be the number in the code`);
      }
      if (ceilMatch) {
        ok(fMaxReviews != null,
          `${where}: claims a review CEILING, so its floor must set maxReviews (a floor.reviews minimum is the opposite claim)`);
        if (fMaxReviews != null) {
          ok(num(ceilMatch[1]) === fMaxReviews,
            `${where}: claims a ceiling of ${ceilMatch[1]} reviews but floor.maxReviews is ${fMaxReviews}`);
        }
      }
      // Two opposite claims in one string bind the wrong number to the wrong
      // floor, because the number checks read the first match.
      ok(!(minMatch && /under [\d,]+ reviews/.test(claim.replace(minMatch[0], ""))),
        `${where}: states a review MINIMUM and a review CEILING in one line — split them, one claim per line`);

      // RATING — any decimal in the copy is a rating claim. Review counts are
      // integers with commas, so nothing else in this copy looks like "4.6".
      for (const r of (claim.match(/\d\.\d/g) || [])) {
        ok(fRating != null && Number(r) === fRating,
          `${where}: states rating ${r} but floor.rating is ${fRating}`);
      }

      // UNBACKED EXCLUSIONS. An explicit "we left off X" must reduce to one of
      // the four predicates. If it names an attribute rankRows cannot see, the
      // page is promising a filter that does not exist — /budget's original bug.
      // Scoped to the SENTENCE holding the exclusion, not the whole subhead. A
      // whole-string test reads a neighbouring sentence as part of the claim:
      // "...tuned to the hour. We left off anything under 150 reviews." tripped
      // the hours rule, though the exclusion is purely about reviews and the
      // daypart language describes queries(h), which is real. A guard that
      // fires on true copy is a guard someone deletes.
      for (const sentence of claim.split(/(?<=\.)\s+/)) {
        if (!/left off|left out|excluded|filtered out/.test(sentence)) continue;
        ok(/reviews?|rating|rated|price|\$/.test(sentence),
          `${where}: states an exclusion that names no filterable attribute ("${sentence.trim()}"). rankRows filters on rating, reviews, maxReviews and maxPrice only`);
        const unbackable = (sentence.match(/\bcover\b|\bshade\b|\bindoors?\b|\bminutes?\b|\bmiles?\b|\bradius\b|\bdrive\b|\bparking\b|\breservations?\b|\bwaits?\b|\bcrowds?\b|\bhours?\b/g) || []);
        ok(unbackable.length === 0,
          `${where}: states an exclusion on "${unbackable.join('", "')}" — there is no such predicate. rankRows filters on rating, reviews, maxReviews and maxPrice only (the distancePenalty REORDERS, it never excludes)`);
      }
    }
  }
}

// A floor on the work done. If the array parser silently stops matching — a
// reformat, a prettier run, a slot rename — every per-variant check above runs
// zero times and this file still exits 0. That is the failure mode this guard
// has already had once. Nine intents x (>=2 subs + >=2 titles) is a safe floor.
ok(totalChecked >= 30, `inspected enough copy variants to be meaningful (got ${totalChecked}) — a low count means the array parser stopped matching, not that the copy shrank`);

if (fail.length) {
  console.error("check-intent-copy-matches-filter: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-intent-copy-matches-filter: OK — ${pass} assertions across ${entries.length} intent pages, ${totalChecked} copy variants (every stated filter has an implementing predicate)`);
