#!/usr/bin/env node
/**
 * test-editorial-staff-notes — operator notes and stale-flagged hours must never reach a customer.
 *
 * THE INCIDENT (2026-10-08, live on Cracker Barrel and Ringling): the owner's Atlas cards carry
 * internal reminders inside customer fields ("Open daily 7am-9pm. Verified 2026-09-28; refresh
 * before display."). cardToEditorial() mapped them straight to the "Good to know" card, so
 * shoppers read a staff note AND hours the owner had flagged for re-verification, under a header
 * that said "Hours unavailable".
 *
 * CALL-level: imports lib/atlasCards + lib/editorialScrub and INVOKES them on every real card in
 * data/atlas/editorial-cards.json.
 * data/atlas/editorial-cards.json is owner-curated and is never edited; the fix is at the read layer.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cardToEditorial } from "../lib/atlasCards.js";
import { mapWfEditorial } from "../lib/editorialRule.js";
import { isGeneralHoursClause, scrubEditorial, scrubEditorialText } from "../lib/editorialScrub.js";

const repo = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const cards = JSON.parse(readFileSync(path.join(repo, "data/atlas/editorial-cards.json"), "utf8"));
const NOTE = /refresh before display|verify before (?:display|publish)|Verified \d{4}-\d{2}-\d{2}|Verified \d{1,2} [A-Z][a-z]{2} \d{4}|Verified 20/i;
const un = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Positive control for every absence assertion below: the probe MUST find a known operator note.
ok(NOTE.test("Open daily 7am–9pm. Verified 2026-09-28; refresh before display."), "NOTE probe must match the exact reported bug string");
ok(NOTE.test("Verified 19 Aug 2026; refresh before display.") && NOTE.test("Refresh before display."), "NOTE probe must match the other stored variants");

// 1. Every real card, every rendered field: no operator phrasing.
let flagged = 0, changed = 0, normal = 0, normalSame = 0;
for (const c of cards) {
  const ed = cardToEditorial(c);
  for (const [k, v] of Object.entries(ed)) {
    if (typeof v === "string") ok(!NOTE.test(v), `${c.name}: editorial.${k} still carries an operator note: ${v.slice(0, 90)}`);
  }
  const raw = un(c.currentUsefulDetail);
  if (raw && /refresh before display/i.test(raw)) {
    flagged++;
    if (ed.goodToKnow !== raw) changed++;
    // 2. A stale-flagged card yields NO general-opening-hours clause.
    const left = (ed.goodToKnow || "").split(/(?<=[.!?])\s+|;\s+/);
    ok(!left.some((cl) => isGeneralHoursClause(cl)), `${c.name}: stale-flagged card still states opening hours: ${ed.goodToKnow}`);
    ok(!/\bopen (?:daily|every ?day|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*) ?[–-]? ?\d/i.test(ed.goodToKnow || ""), `${c.name}: stale-flagged card still says "open daily <time>"`);
  } else if (raw && !NOTE.test(raw)) {
    // 3. Positive control: a normal card's text is byte-for-byte unchanged.
    normal++;
    if (ed.goodToKnow === raw) normalSame++;
    ok(ed.goodToKnow === raw, `${c.name}: a normal card's Good to know was altered`);
  }
}
ok(flagged >= 300, `expected >=300 refresh-flagged cards in the data, saw ${flagged}`);
ok(normal >= 1 && normalSame === normal, `positive control: ${normalSame}/${normal} normal cards unchanged`);

// 4. The two reported pages, by their real place ids.
const crackerBarrel = cards.find((c) => c.placeId === "ChIJYyfzl39Qw4gRRSr5_0Mz9qU");
ok(!!crackerBarrel && /Open daily 7am/.test(crackerBarrel.currentUsefulDetail) && /refresh before display/.test(crackerBarrel.currentUsefulDetail), "Cracker Barrel fixture drifted: the bug input is gone from the data");
ok(cardToEditorial(crackerBarrel).goodToKnow === null, "Cracker Barrel: Good to know must be empty (note + stale hours removed)");
ok(cardToEditorial(crackerBarrel).watchOut === crackerBarrel.watchOut, "Cracker Barrel: the real Heads up text must be untouched");

// 5. Unit controls on the scrubber itself.
ok(scrubEditorialText("Open daily 7am–9pm. Verified 2026-09-28; refresh before display.") === null, "note + hours only -> null");
ok(scrubEditorialText("Open daily 7am–9pm.") === "Open daily 7am–9pm.", "hours with NO flag are left alone (no invented policy)");
ok(scrubEditorialText("Open 8am to sundown, 365 days a year; $5 per vehicle. Verified 2026-07-18; refresh before display.") === "$5 per vehicle.", "price survives next to stale hours");
ok(scrubEditorialText("Closed for repairs. Verified 2026-07-18; refresh before display.") === "Closed for repairs.", "non-hours fact survives, note stripped");
ok(scrubEditorialText("Lunch 11am–2pm at St. Armands. Refresh before display.") === null, "'St.' does not split a sentence");
ok(scrubEditorial({ a: "x. Refresh before display.", b: 5, c: null }).b === 5, "non-strings pass through");

// 4b. Narrow scope (reviewer, PR #1670): non-hours facts that merely contain a time are KEPT.
const FL = " Verified 2026-07-18; refresh before display.";
for (const keep of ["Happy hour 4-6pm half-price oysters.", "Shows daily at 1pm and 2pm.", "Closed for summer, reopens Oct 1.", "Free tours Saturdays at 10am.", "Reservations: 941-383-0102."]) {
  ok(scrubEditorialText(keep + FL) === keep, `kept (non-hours): ${keep} -> ${scrubEditorialText(keep + FL)}`);
}
ok(scrubEditorialText("Open daily 11am–10pm, with live music nightly." + FL) === "Live music nightly.", "', with' tail kept when the head is hours");
ok(scrubEditorialText("Daily 3:30–10pm, happy hour 3:30–5, live music Fri–Sat 6–9." + FL) === "Happy hour 3:30–5, live music Fri–Sat 6–9.", "mixed clause: hours piece dropped, happy hour kept");
const bee = cards.find((c) => c.name === "Bee Ridge Park");
ok(!!bee && !/open daily 6am/i.test(cardToEditorial(bee).goodToKnow || ""), "Bee Ridge Park: 'open daily 6am–11pm' dropped");
ok(/open daily/i.test(bee.currentUsefulDetail), "Bee Ridge fixture drifted");

// 5b. Fleet rows (wf_editorial -> mapWfEditorial) get the same scrub (Ringling-class: not an Atlas card).
const fleet = mapWfEditorial({ verified: true, name: "Fleet Place", why_here: "A real why.", best_time: "Open daily 10am–5pm. Verified 2026-09-28; refresh before display.", know_before: "Closed Mondays. Refresh before display.", facts: [] });
ok(fleet.goodToKnow === null && fleet.watchOut === null && fleet.why === "A real why.", "fleet row: stale hours + note stripped, real text kept");

if (fail.length) { console.error("test-editorial-staff-notes FAILED:\n - " + fail.slice(0, 25).join("\n - ")); process.exit(1); }
console.log(`test-editorial-staff-notes: ${pass} assertions passed; ${cards.length} real cards scanned, ${flagged} refresh-flagged (${changed} changed output), ${normalSame}/${normal} normal cards byte-identical; fleet mapper scrubbed`);
