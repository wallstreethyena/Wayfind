// scripts/test-atlas-verify-timefmt.mjs — the verifier must not reject hours it
// supplied itself.
//
// MEASURED, not hypothetical. The 2026-07-29 verification run fired three times
// at ?limit=3 and published 0 of 9. Seven failed verification, and almost every
// issue was a clock time:
//   Cooper's Hawk    unsourced-number:know_before:11 AM | :9 PM | :10 PM
//   Miller's Ale     unsourced-number:know_before:11 AM | :2 AM
//   Culver's         unsourced-number:know_before:10 AM | :11 PM
// Google's regularOpeningHours.weekdayDescriptions render as
// "Monday: 11:00 AM – 10:00 PM". The model, handed that, writes "11 AM". norm()
// stripped ':' so the two became "1100am" and "11am" and never matched — the
// verifier rejected hours from its own corpus.
//
// This is why FAILED VERIFICATION was the GOOD news that run: it can only be
// written after the model returns a card, so it proved the Anthropic key fix
// landed. The publish rate being 0 was a second, unrelated defect.
import { verifyAtlasEditorial } from "../lib/atlasVerify.js";

let pass = 0;
const fail = (m) => { console.error("test-atlas-verify-timefmt: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const nums = (parsed, corpus) =>
  verifyAtlasEditorial(parsed, corpus, []).filter((p) => p.check === "unsourced-number");
const card = (o) => ({ hook: "", why_here: "", know_before: "", best_time: "", local_tip: "", facts: [], ...o });

// Verbatim Google format, including the en-dash it actually uses.
const HOURS = [
  "Monday: 11:00 AM – 10:00 PM", "Tuesday: 11:00 AM – 10:00 PM",
  "Friday: 11:00 AM – 12:00 AM", "Saturday: 9:00 AM – 2:00 AM", "Sunday: Closed",
].join("\n");

// ── the exact strings that were rejected in production ────────────────────
for (const t of ["11 AM", "10 PM", "9 AM", "12 AM", "2 AM"]) {
  ok(nums(card({ know_before: `Open ${t} most days.` }), HOURS).length === 0,
    `"${t}" is present in the corpus as "${t.replace(/(\d+)/, "$1:00")}" and must NOT be flagged`);
}
ok(nums(card({ know_before: "Open 11 AM to 10 PM, later on Saturday until 2 AM." }), HOURS).length === 0,
  "a whole sentence of sourced hours passes clean — this is the Cooper's Hawk / Miller's Ale case");

// ── and the check must still CATCH invention, or it is worthless ───────────
// :00 is dropped because a whole hour and its :00 form are the same instant.
// Any other minute value is untouched.
for (const t of ["2:47 AM", "11:30 PM", "4:15 PM"]) {
  ok(nums(card({ local_tip: `Go at ${t}.` }), HOURS).length > 0,
    `"${t}" is NOT in the corpus and must still be flagged — dropping :00 must not blind the check to real minutes`);
}
// NOTE "12 miles" was tried here and removed: "12:00 AM" is in the corpus, so the
// bare token 12 legitimately substring-matches. That is pre-existing behaviour of
// the substring check, not something the time fix introduced, and a fixture that
// depends on it would be asserting a bug.
for (const n of ["$47", "1962", "5,000", "37 miles"]) {
  ok(nums(card({ why_here: `It has ${n} of them.` }), HOURS).length > 0,
    `invented figure "${n}" is still caught`);
}
// The two real ones from that run.
ok(nums(card({ why_here: "Serving 5,000 tacos a night." }), HOURS).length > 0,
  "Tacos My Guey's invented 5,000 is still caught");
ok(nums(card({ local_tip: "Arrive by 2:47 AM." }), HOURS).length > 0,
  "Tacos My Guey's invented 2:47 AM is still caught");

// Both sides non-empty, or this file proves nothing.
ok(nums(card({ know_before: "Open 11 AM." }), HOURS).length === 0
   && nums(card({ know_before: "Open 3:33 AM." }), HOURS).length > 0,
  "the fixture set exercises BOTH a pass and a fail");

// ── the canonicaliser is symmetric ────────────────────────────────────────
// The model may also write the :00 form while a source omits it.
ok(nums(card({ know_before: "Doors at 7:00 PM." }), "Live music from 7 PM nightly.").length === 0,
  "it works in the other direction too — model writes 7:00 PM, source says 7 PM");

console.log(`test-atlas-verify-timefmt: OK — ${pass} assertions (sourced hours pass in either format, invented minutes and figures still caught)`);
