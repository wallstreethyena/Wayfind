#!/usr/bin/env node
/**
 * check-boundary-alert — the alert that would have caught 2026-07-30 must keep
 * catching it.
 *
 * THE INCIDENT THIS IS PINNED TO
 * A ReferenceError shipped in v6.56 and crashed every bookable place sheet.
 * PostHog recorded 14 error-boundary crashes from 3 real users inside one
 * afternoon, each carrying message, stack and build. Nothing paged. The first
 * report was the owner noticing it on his own phone.
 *
 * WHY THE EXISTING RULE MISSED IT — and why this file asserts on NUMBERS
 * `error_spike` fires at 20+ errors across 24 HOURS. Fourteen in an afternoon is
 * under that, and a 24h window dilutes a brand-new build failing hard into a
 * quiet day's average. Two dimensions were missing: the HOUR (a burst is only
 * visible while it is a burst) and the BUILD (a new deploy breaking is a
 * different event from a long-standing trickle).
 *
 * So the guard replays the incident's exact shape and requires a page. If a later
 * change raises a threshold past 14/3, the blind spot comes back silently — which
 * is precisely how it existed in the first place.
 */
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const A = await import(path.resolve("lib/commandCenter/alerts.js"));
const PH = await import(path.resolve("lib/commandCenter/sources/posthog.js"));
const { computeAlerts, BOUNDARY_MIN_ERRORS, BOUNDARY_MIN_PEOPLE, BOUNDARY_FLOOD } = A;

const boundaryAlerts = (byBuild) =>
  computeAlerts({ boundaryErrors: { windowHours: 1, byBuild } }).filter((a) => a.id.startsWith("boundary_errors"));

/* ── 1. the real incident pages ───────────────────────────────────────────── */
const INCIDENT = [{ build: "v6.56", errors: 14, people: 3 }];
const fired = boundaryAlerts(INCIDENT);
ok(fired.length === 1, `THE 2026-07-30 SHAPE PAGES: 14 crashes / 3 people / 1 hour on v6.56 (got ${fired.length} alerts)`);
ok(fired[0] && fired[0].severity === "critical",
  `…at CRITICAL, because 3 distinct people on one build is systemic (got ${fired[0] && fired[0].severity})`);
ok(fired[0] && /v6\.56/.test(fired[0].title), "the build is named in the title — the first question is always 'which deploy'");
ok(fired[0] && /14/.test(fired[0].detail) && /3/.test(fired[0].detail), "the detail carries the counts");
ok(fired[0] && /app_error/.test(fired[0].detail), "it points at where the stack actually is");

// The thresholds themselves, pinned. A tidy-up that raises either past the
// incident restores the blind spot without failing anything else.
ok(BOUNDARY_MIN_ERRORS <= 14, `BOUNDARY_MIN_ERRORS (${BOUNDARY_MIN_ERRORS}) must be <= 14 or the real incident stops paging`);
ok(BOUNDARY_MIN_PEOPLE <= 3, `BOUNDARY_MIN_PEOPLE (${BOUNDARY_MIN_PEOPLE}) must be <= 3 or the real incident stops paging`);

/* ── 2. the old rule genuinely could not have caught it ───────────────────── */
// Asserted rather than asserted-about: the same volume through the 24h rule is
// silent. This is what justifies the new rule existing at all.
const old = computeAlerts({ errors24h: { exceptions: 0, app_errors: 14 } }).filter((a) => a.id === "error_spike");
ok(old.length === 0,
  "the pre-existing 24h error_spike rule stays SILENT on 14 app errors — this is the gap, demonstrated, not assumed");

/* ── 3. it does not page on noise ─────────────────────────────────────────── */
ok(boundaryAlerts([]).length === 0, "no crashes → no alert");
ok(boundaryAlerts([{ build: "v6.56", errors: 4, people: 2 }]).length === 0, "4 crashes is below the floor → no alert");
ok(boundaryAlerts([{ build: "v6.56", errors: 12, people: 1 }]).length === 0,
  "ONE person crashing 12 times does NOT page — that is a retry loop or one unhappy device, and paging on it is how an alert gets muted");
ok(boundaryAlerts([{ build: "v6.56", errors: BOUNDARY_FLOOD, people: 1 }]).length === 1,
  `…but a flood (${BOUNDARY_FLOOD}+) from even one person does page — at some volume it stops mattering whose device it is`);

/* ── 4. per-build, which is the whole point ───────────────────────────────── */
const two = boundaryAlerts([{ build: "v6.56", errors: 14, people: 3 }, { build: "v6.55", errors: 9, people: 2 }]);
ok(two.length === 2, `each build alerts separately (got ${two.length}) — a broken deploy must not hide inside another build's total`);
ok(new Set(two.map((a) => a.id)).size === 2, "their ids are distinct, so one cannot dedupe the other away");

/* ── 5. the source query carries both dimensions ──────────────────────────── */
ok(typeof PH.boundaryErrorsByBuild === "function", "boundaryErrorsByBuild is exported from the PostHog source");
const src = (await import("node:fs")).readFileSync(path.resolve("lib/commandCenter/sources/posthog.js"), "utf8");
const q = (/export function boundaryErrorsByBuild[\s\S]*?\n}/.exec(src) || [""])[0];
ok(q.length > 80, `found the query body (got ${q.length} chars) — an empty match would make the checks below vacuous`);
ok(/INTERVAL 1 HOUR/.test(q), "the window is ONE HOUR — a 24h window is what made the incident invisible");
ok(/GROUP BY build/.test(q), "it groups BY BUILD — without that dimension a new broken deploy is averaged into the noise");
ok(/uniq\(person_id\)/.test(q),
  "people is uniq(person_id), never count() — one user retrying must not read as many users, which is the rule's entire discriminator");
ok(/event = 'app_error'/.test(q), "it reads the boundary's own event");

/* ── 6. it is actually wired into the bundle both consumers use ───────────── */
const run = (await import("node:fs")).readFileSync(path.resolve("lib/commandCenter/alertsRun.js"), "utf8");
ok(/boundaryErrorsByBuild\(\)/.test(run), "gatherAlerts CALLS the source — an unwired rule is a rule that never fires");
ok(/boundaryErrors:\s*\{/.test(run), "…and passes it into computeAlerts under the key the rule reads");

if (fail.length) {
  console.error("check-boundary-alert: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-boundary-alert: OK — ${pass} assertions (the 14/3/v6.56 incident pages at critical, the old 24h rule provably would not have, one retrying user does not, per-build ids stay distinct, and the rule is wired into gatherAlerts)`);
