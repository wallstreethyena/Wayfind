// scripts/test-closed-policy.mjs — the POLICY layer (what a surface does with
// a status), not the status computation itself. That is already covered by
// scripts/test-business-status.mjs and scripts/check-hours.mjs.
//
// Every fixture injects nowMs. Every assertion checks the output is NON-EMPTY
// before checking what is in it, so a fixture that filtered everything away
// cannot pass as a green (AGENTS.md §4).
import { readFileSync } from "fs";
import {
  placeDecision, applyPolicy, openStateBonus,
  OPENING_SOON_MS, RAIL_FLOOR, isNowSurface,
} from "../lib/placePolicy.js";

let failures = 0;
const fail = (m) => { console.error("test-closed-policy: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

// Fixed instant: Wed 2026-07-29 14:00 UTC. Venue offset 0 keeps the arithmetic
// readable; a separate fixture below proves offsets are honoured.
const NOW = Date.parse("2026-07-29T14:00:00Z");
const MIN = 60000;

// periods use Google's shape: open/close { day, hour, minute }, day 0=Sunday.
const hours = (openH, openM, closeH, closeM, day = 3) => ({
  periods: [{ open: { day, hour: openH, minute: openM }, close: { day, hour: closeH, minute: closeM } }],
  weekdayDescriptions: null,
});

const P = (over) => ({ id: over.id || "p", name: over.name || "Place", utcOffset: 0, ...over });

/* ── 1 & 2: non-operational never appears, on any surface, in any ordering ── */
{
  for (const status of ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"]) {
    const dead = P({ id: "dead", businessStatus: status, oh: hours(9, 0, 22, 0) });
    for (const surface of ["home", "map", "landing", "search", "guide"]) {
      const d = placeDecision(dead, NOW, { surface });
      ok(d.show === false, status + " must never show on " + surface);
      ok(d.state === "non_operational", status + " is classified non_operational on " + surface);
    }
    // ...and not via the floor fallback either.
    const r = applyPolicy([dead], NOW, { surface: "landing", floor: 6 });
    ok(r.places.length === 0, status + " is not resurrected by the rail floor");
    ok(r.counts.nonOperational === 1, "the non-operational count is reported, not silently dropped");
  }
}

/* ── 3: closed, opens in 59 minutes → shown, countdown, never "Closed" ────── */
{
  // Opens 15:00 UTC; now is 14:01 → 59 minutes.
  const soon = P({ id: "soon", oh: hours(15, 0, 22, 0) });
  const d = placeDecision(soon, NOW + 1 * MIN, { surface: "home" });
  ok(d.show === true, "a place opening in 59 min is SHOWN even on a now-surface");
  ok(d.state === "opening_soon", "state is opening_soon");
  ok(typeof d.label === "string" && d.label.length > 0, "it carries a label");
  ok(/^Opens in \d+ min$/.test(d.label), "the label is a real countdown, got: " + d.label);
  ok(!/closed/i.test(d.label), 'the word "Closed" never renders for this band, got: ' + d.label);
  const mins = Number((d.label.match(/(\d+)/) || [])[1]);
  ok(mins === 59, "the countdown states the actual remaining minutes (59), got " + mins);
}

/* ── 4: closed, opens in 61 minutes → hidden on now, demoted on planning ──── */
{
  const later = P({ id: "later", oh: hours(15, 0, 22, 0) });
  const at = NOW - 1 * MIN; // 13:59 → 61 minutes to open
  const now = placeDecision(later, at, { surface: "home" });
  ok(now.show === false, "hidden on a now-surface");
  ok(now.reason === "closed_on_now_surface", "reason is explicit, got " + now.reason);

  const plan = placeDecision(later, at, { surface: "landing" });
  ok(plan.show === true, "shown on a planning surface");
  ok(plan.demote === true, "but demoted");
  ok(typeof plan.label === "string" && plan.label.length > 0, "carrying a non-empty label");
  ok(/^Opens /.test(plan.label), 'the chip reads "Opens …", got: ' + plan.label);
}

/* ── 5: unknown hours → SHOWN, no claim, not filtered ────────────────────── */
{
  const beach = P({ id: "beach", name: "Siesta Key Beach", oh: null, utcOffset: null });
  for (const surface of ["home", "map", "landing", "search"]) {
    const d = placeDecision(beach, NOW, { surface });
    ok(d.show === true, "unknown hours is SHOWN on " + surface + " — unknown is not closed");
    ok(d.state === "unknown", "state is unknown on " + surface);
    ok(d.label === null, "no status claim is made for unknown hours on " + surface);
  }
  const r = applyPolicy([beach], NOW, { surface: "home" });
  ok(r.places.length === 1, "a beach with no hours survives the filter — this is all 21 beach pages");
}

/* ── 6: the rail floor — closed reappear with chips, rail is never empty ──── */
{
  const closedNight = (i) => P({ id: "n" + i, name: "Bar " + i, oh: hours(20, 0, 23, 59) });
  const rail = [0, 1, 2, 3, 4, 5, 6, 7].map(closedNight);
  // 14:00 — every nightlife venue is closed and opens in 6 hours.
  const r = applyPolicy(rail, NOW, { surface: "home", floor: RAIL_FLOOR });
  ok(r.places.length > 0, "the rail is NOT empty at 2pm");
  ok(r.places.length >= RAIL_FLOOR, "the floor is met, got " + r.places.length);
  ok(r.floored === true, "the fallback is reported, not silent");
  ok(r.decisions.length === r.places.length, "one decision per rendered place");
  ok(r.decisions.every((d) => d.demote === true), "every fallback row is demoted");
  ok(r.decisions.every((d) => typeof d.label === "string" && d.label.length > 0), "every fallback row carries an Opens chip");

  // The floor must never resurrect a dead business.
  const withDead = rail.concat([P({ id: "dead2", businessStatus: "CLOSED_PERMANENTLY", oh: hours(20, 0, 23, 59) })]);
  const r2 = applyPolicy(withDead, NOW, { surface: "home", floor: RAIL_FLOOR });
  ok(r2.places.length > 0, "fallback rail non-empty");
  ok(!r2.places.some((p) => p.id === "dead2"), "the floor NEVER resurrects a non-operational place");
}

/* ── 7: overnight venue at 01:00 → open (policy must not undo the module) ── */
{
  // Tue 20:00 → Wed 02:00, i.e. crosses midnight.
  const overnight = P({ id: "ov", oh: { periods: [{ open: { day: 2, hour: 20, minute: 0 }, close: { day: 3, hour: 2, minute: 0 } }], weekdayDescriptions: null } });
  const at1am = Date.parse("2026-07-29T01:00:00Z"); // Wed 01:00
  const d = placeDecision(overnight, at1am, { surface: "home" });
  ok(d.show === true, "an overnight venue is shown at 1am");
  ok(d.state === "open", "and is OPEN at 1am — the policy layer does not undo the module, got " + d.state);
}

/* ── 8: venue in a different timezone than the runner ────────────────────── */
{
  // Venue at UTC-5. 14:00 UTC is 09:00 local. Opens 09:00 local → open.
  const tz = P({ id: "tz", utcOffset: -300, oh: hours(9, 0, 17, 0) });
  const d = placeDecision(tz, NOW, { surface: "home" });
  ok(d.state === "open", "status is computed from VENUE-local time, not the runner's clock, got " + d.state);
  // Same wall-clock instant, venue at UTC+9 → 23:00 local → closed.
  const tzE = P({ id: "tze", utcOffset: 540, oh: hours(9, 0, 17, 0) });
  const dE = placeDecision(tzE, NOW, { surface: "landing" });
  ok(dE.state === "closed", "a venue 14h east of the first is closed at the same instant, got " + dE.state);
}

/* ── 9: THE THREE-WAY. The regression this whole file exists for ─────────── */
{
  // fit() historically branched on a raw boolean: true gained, false lost 24,
  // and UNKNOWN matched neither branch and scored 0. Replacing the boolean with
  // a computed status invites `open ? +bonus : -24`, which collapses three
  // states into two and drops every hours-less place to -24 — all 21 beach
  // pages, plus parks, trails and viewpoints.
  ok(openStateBonus("unknown", "tonight") === 0, "UNKNOWN scores exactly 0 for tonight — not -24");
  ok(openStateBonus("unknown", "family") === 0, "UNKNOWN scores exactly 0 for family — not -24");
  ok(openStateBonus("unknown") === 0, "UNKNOWN scores exactly 0 with no intent — not -24");

  // The other two arms must keep their pre-change values exactly.
  ok(openStateBonus("open", "tonight") === 28, "open+tonight is still +28");
  ok(openStateBonus("open", "family") === 7, "open+other is still +7");
  ok(openStateBonus("closed", "tonight") === -24, "closed is still -24");
  ok(openStateBonus("closed") === -24, "closed is -24 regardless of intent");

  // opening_soon is shown, so it must not carry the closed penalty.
  ok(openStateBonus("opening_soon", "tonight") === 0, "opening_soon is not penalised as closed");

  // The three arms must be DISTINCT — if unknown ever equals closed, the
  // collapse has happened.
  ok(openStateBonus("unknown", "tonight") !== openStateBonus("closed", "tonight"),
    "unknown and closed must not score the same — that IS the collapse this guards");
}

/* ── 10: no euphemism. Unknown renders no hours row at all ───────────────── */
{
  const src = readFileSync(new URL("../app/components/PaidLanding.js", import.meta.url), "utf8");
  ok(!/Hours vary/.test(src), '"Hours vary" is gone — it laundered known-closed into ambiguous');
}

if (failures) { console.error(`test-closed-policy: ${failures} failure(s)`); process.exit(1); }
console.log("test-closed-policy: OK — non-operational never shown; unknown shown and scores 0; countdown band; floor after demote, never resurrecting the dead");
