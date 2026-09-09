#!/usr/bin/env node
/**
 * check-editorial-coverage-pipeline — WO-C (2026-09-04), "Why Wayfind picked
 * this" is missing from most detail cards, and the owner's recollection is
 * that the writing job stopped persisting its output.
 *
 * WHAT ACTUALLY HAPPENED, measured against wf_job_pulse and wf_spend_ledger
 * (see the WO-C report for the full evidence chain):
 *
 *   1. app/api/cron/atlas-build used to open-code `if (gateShut() ||
 *      gateFree()) return Response.json({skipped:...})` BEFORE its first
 *      recordPulse() call. WAYFIND_GATE flipped to "free" around 2026-08-25;
 *      every atlas-build/atlas-retry run from then until 2026-09-04 07:10
 *      UTC (~9.5 days, confirmed as a dead gap in wf_job_pulse) returned
 *      early and wrote NOTHING to wf_job_pulse — not even a failed pulse.
 *      That is app/api/cron/job-watch's own documented failure shape
 *      (lib/jobFail.js) landing on a THIRD file that predated the fix.
 *   2. Separately and only found by tracing the RENDER path: from #1029
 *      (2026-08-29) to #1096 (2026-09-04), Detail.js's "Why Wayfind picked
 *      this" block read ONLY the live per-view `insight` value and never
 *      wf_editorial at all — so every row atlas-build DID manage to write
 *      and verify was structurally invisible on this exact UI block the
 *      entire time, regardless of the cron's health. #1096 added the
 *      `whyWayfindPickedBody(insight) || whyWayfindPickedBody({
 *      why_wayfind_picked_this: editorial?.why })` fallback this guard's
 *      clause D locks.
 *   3. #1096 also replaced the blanket free-mode skip with a per-place
 *      `spendAllow("details_enterprise")` ledger check — correct, and
 *      within the existing spend law. But `details_enterprise` is a SHARED
 *      free-tier SKU (950/month) that live user place-detail fetches
 *      (lib/placeDetails.js) also draw from, and it was already at 950/950
 *      for September BEFORE atlas-build's new code even shipped. Every
 *      candidate atlas-build selects is deferred, `rows` stays empty, and
 *      the ORIGINAL final-pulse code reported that as `attempted: 0, note:
 *      null` — byte-identical to a healthy empty queue. Clause A/B below
 *      exercise the fix for that (this guard's clause on the pulse note).
 *
 * Four structural clauses, asserted BY CALL wherever the thing can be
 * called without a live credential (lib/providerHealth's breaker runs
 * entirely off the in-process memory cache when no Supabase env is present
 * — see lib/serverCache.cget/cset — so clause C exercises the REAL
 * open->observe->reset->closed round trip, not a mock). Where a live call
 * would need a network credential (the Supabase upsert itself, the
 * Anthropic call), this guard says so and checks the shape that determines
 * what WOULD be sent, per CLAUDE.md's rule that a weaker check must say so
 * rather than read as proof.
 *
 *   A. THE WRITER PERSISTS WHAT IT GENERATES — lib/atlasEditorial.js's
 *      editorialRow(), fed a realistic fake provider reply, produces a row
 *      that is verified:true and carries the generated text through
 *      unmangled.
 *   B. A PROVIDER FAILURE NEVER WRITES A PLACEHOLDER — the same function,
 *      fed exactly what route.js passes on every failure path (parsed:null,
 *      issues:["PENDING SOURCE"/"FAILED VERIFICATION"/"BLOCKED — ..."]),
 *      never has a placeholder string in ANY content field.
 *   C. THE BREAKER'S LATCHED STATE IS OBSERVABLE AND RESETTABLE — a real
 *      trip -> breakerOpen() sees it -> resetBreaker() clears it ->
 *      breakerOpen() sees it closed, round-tripped through real calls.
 *   D. THE SERVING PATH RENDERS NOTHING RATHER THAN FILLER — lib/insightWhy
 *      .whyWayfindPickedBody(), called with every absent/error/empty/filler
 *      shape, always returns "" (positive control included, so an
 *      always-empty stub could not pass this file).
 *
 * Plus one regression lock on the pulse-honesty fix (WO-C clause 1/3 above):
 * a fully-deferred run must not report identically to a genuinely idle one.
 *
 * RED-PROVING. A/B/C/D are exercised by calling the real functions with
 * both a positive and a negative fixture — the round trip itself IS the
 * red-proof (there is no "mutate the code" step for a pure function you are
 * already calling both ways). The pulse-honesty clause is structural (it
 * has to be: it targets one exact line in a Next.js route handler this
 * guard cannot invoke without live Supabase/Anthropic credentials, which
 * check-guard-hermeticity forbids), so it is red-proven the way this repo's
 * other structural guards are (check-cron-honesty.mjs, check-job-pulse-
 * contract.mjs): the assertion is run against the LITERAL pre-fix source
 * (captured from git history) and must fail there, then run against the
 * current file and must pass.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const rel = (p) => path.join(REPO, p);

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const { editorialRow, sourcedFacts, contentIssues } = await import(path.join(REPO, "lib/atlasEditorial.js"));
const { whyWayfindPickedBody } = await import(path.join(REPO, "lib/insightWhy.js"));
const { classifyProviderFailure, tripBreaker, breakerOpen, resetBreaker, BREAKER_COOLDOWN_MS } =
  await import(path.join(REPO, "lib/providerHealth.js"));

// ── CLAUSE A — the writer persists what it generates ───────────────────────
{
  const place = { place_id: "ChIJ_guard_fixture_A", name: "Guard Fixture Cafe" };
  const goodReply = {
    hook: "A 40-year diner that never stopped serving a $4 breakfast special.",
    why_here: "This is the kind of place that has outlasted three different owners on the same block and still runs the same $4 breakfast special every weekday morning. It is not fancy — vinyl booths, a counter, a regulars-only rhythm — but the biscuits are made from scratch every morning and the coffee never stops. Go for the eggs, stay because everyone already knows your order by the third visit.",
    know_before: "Cash preferred, ATM two doors down. Closes at 2pm sharp, no exceptions.",
    best_time: "Weekday mornings before 9am, before the regulars' rush.",
    local_tip: "Ask for the biscuit off-menu — it is not on the printed menu but they always have it.",
    facts: [{ claim: "The diner has run the same $4 breakfast special since 1985", source: "https://example.com/guard-fixture-cafe/history" }],
  };
  const row = editorialRow(place, goodReply, "2026-09-04T00:00:00.000Z", []);
  ok(row.place_id === place.place_id, "CLAUSE A: editorialRow keeps the place_id it was given — a written row must be attributable to the place it was written for");
  ok(row.verified === true, `CLAUSE A: a well-sourced, adequately-long reply (hook ${goodReply.hook.length}ch, why_here ${goodReply.why_here.length}ch, 1 sourced fact) must publish (verified:true) — got verified:${row.verified}, issues:${JSON.stringify(row.issues)}`);
  ok(row.issues === null, "CLAUSE A: a publishable row carries no issues — `verified` and `issues` must never disagree");
  ok(row.hook === goodReply.hook, "CLAUSE A: the writer must persist the GENERATED hook unmangled, not a truncated or re-derived version");
  ok(row.why_here === goodReply.why_here, "CLAUSE A: the writer must persist the GENERATED why_here unmangled");
  ok(row.local_tip === goodReply.local_tip, "CLAUSE A: the writer must persist the GENERATED local_tip unmangled");
  ok(Array.isArray(row.facts) && row.facts.length === 1 && row.facts[0].source === goodReply.facts[0].source,
    "CLAUSE A: a real https-sourced fact must survive into the written row (sourcedFacts filters, it must not also drop good ones)");
  ok(row.standard_version === "atlas-590-v1", "CLAUSE A: every written row is stamped with the standard it was written to — an un-stamped row cannot be told apart from one written before the standard existed");
}

// ── negative control for clause A's threshold, so "always verified:true"
//    could not pass this file by accident (CLAUDE.md: carry a positive AND
//    a negative control) ───────────────────────────────────────────────────
{
  const thin = { hook: "Nice place.", why_here: "A decent spot.", know_before: null, best_time: null, local_tip: null, facts: [] };
  const row = editorialRow({ place_id: "ChIJ_guard_fixture_thin" }, thin, "2026-09-04T00:00:00.000Z", []);
  ok(row.verified === false, "CLAUSE A negative control: a thin/unsourced reply (short hook, no facts) must NOT publish — a guard that only proves the positive path cannot tell a real fix from one that always returns verified:true");
  ok(Array.isArray(row.issues) && row.issues.includes("thin-hook") && row.issues.includes("no-sourced-facts"),
    `CLAUSE A negative control: the specific content-bar failures must be named in issues, not just verified:false — got ${JSON.stringify(row.issues)}`);
}

// ── CLAUSE B — a provider failure never writes a placeholder ───────────────
// The exact three shapes app/api/cron/atlas-build/route.js writes on its
// three give-up paths: model/Places unreachable, §7-blocked source, and
// failed honesty verification. `parsed` is null in every one — the route
// never invents content to fill the row when the provider failed.
{
  const failureIssues = [
    ["PENDING SOURCE", "no Places/Anthropic response"],
    ["BLOCKED — §7 source", "denied-host official page"],
    ["FAILED VERIFICATION", "invented-fact rejection"],
  ];
  for (const [issue, label] of failureIssues) {
    const row = editorialRow({ place_id: "ChIJ_guard_fixture_B_" + issue.replace(/\W+/g, "_") }, null, "2026-09-04T00:00:00.000Z", [issue]);
    ok(row.verified === false, `CLAUSE B (${label}): a provider-failure row must never be verified:true`);
    ok(row.hook === null, `CLAUSE B (${label}): hook must be null on a provider failure — never a placeholder string like "${issue}"`);
    ok(row.why_here === null, `CLAUSE B (${label}): why_here must be null on a provider failure — this is exactly the field Detail.js renders as "Why Wayfind picked this"`);
    ok(row.know_before === null && row.best_time === null && row.local_tip === null, `CLAUSE B (${label}): every content field must be null, not partially filled`);
    ok(Array.isArray(row.facts) && row.facts.length === 0, `CLAUSE B (${label}): facts must be empty, never fabricated to look sourced`);
    ok(Array.isArray(row.issues) && row.issues.includes(issue), `CLAUSE B (${label}): the REASON is recorded in issues (for the retry selector), never smuggled into a content field`);
  }
}

// -- CLAUSE C -- the breaker's latched state is observable and resettable ----
// RUN IN A CHILD PROCESS WITH AN EXPLICIT, MINIMAL ENV (2026-09-09).
//
// This used to trip a breaker named by the FIXED string
// "guard-fixture-provider" in THIS process. lib/serverCache's cget/cset fall
// through to the shared wf_places_cache whenever Supabase credentials are in
// scope -- which they are inside a Vercel build -- so the fixture was not a
// fixture at all: it was one production row that every process running the
// suite shared. Two builds at once, ordinary on a busy afternoon, raced it,
// and whichever reached the precondition while the other held the breaker
// open failed with "the fixture provider must start closed". Every preview
// deployment in the repo went red for it, on changes that touched none of
// this. Measured after the fact: six concurrent runs of the old code failed
// four times; six of the new code passed six times.
//
// The header of this file already CLAIMED this could not happen ("this guard
// must not be able to touch real production breaker state even if it somehow
// ran with live Supabase credentials in scope"). It now enforces it, the way
// scripts/check-dead-provider-parked.mjs already does: an explicit
// `env: { NODE_ENV: "test" }` means no Supabase credentials reach the child,
// serverCache stays on its in-memory tier, and nothing shared is touched.
// That also avoids the leak a unique-key-only fix would have introduced --
// a new row per build, and nothing prunes wf_places_cache.
//
// The child imports and calls the REAL helpers; only the environment is
// controlled. check-guard-hermeticity requires exactly this shape: no
// process.env read in the parent decides any verdict here.
{
  const probe = `
import { breakerOpen, tripBreaker, resetBreaker } from "${path.join(REPO, "lib/providerHealth.js")}";
const PROVIDER = "guard-fixture-provider";
const out = {};
out.closedBefore = await breakerOpen(PROVIDER);
out.tripped = await tripBreaker(PROVIDER, "billing", "guard fixture: simulated credit exhaustion");
out.openState = await breakerOpen(PROVIDER);
out.resetResult = await resetBreaker(PROVIDER);
out.closedAfter = await breakerOpen(PROVIDER);
out.noopReset = await resetBreaker(PROVIDER);
console.log(JSON.stringify(out));
`;
  let R = {};
  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 30000,
    });
    R = JSON.parse(String(stdout).trim().split("\n").pop());
  } catch (e) {
    ok(false, `CLAUSE C: the breaker probe must run at all -- ${String((e && e.message) || e).slice(0, 200)}`);
  }

  ok(R.closedBefore === null, "CLAUSE C precondition: the fixture provider starts closed in a process with no Supabase env, or this round-trip proves nothing");
  ok(R.tripped === true, "CLAUSE C: tripBreaker must report success -- a breaker that cannot be tripped cannot be tested as latched");
  ok(!!R.openState && R.openState.kind === "billing", `CLAUSE C: a tripped breaker must be OBSERVABLE by call -- breakerOpen returned ${JSON.stringify(R.openState)}`);
  ok(typeof (R.openState || {}).reason === "string" && R.openState.reason.includes("guard fixture"),
    "CLAUSE C: the latched reason must be readable, not just the fact of latching -- an operator deciding whether to reset needs to know why it tripped");
  ok((R.resetResult || {}).ok === true, `CLAUSE C: resetBreaker must report success -- got ${JSON.stringify(R.resetResult)}`);
  ok((R.resetResult || {}).wasOpen === true, "CLAUSE C: resetBreaker must report what it found BEFORE clearing (wasOpen:true) -- a reset that cannot say whether it did anything is not auditable");
  ok((R.resetResult || {}).before && R.resetResult.before.kind === "billing", "CLAUSE C: resetBreaker's `before` must carry the state that was cleared, for the audit trail");
  ok(R.closedAfter === null, `CLAUSE C: a breaker must be RESETTABLE by call -- breakerOpen after resetBreaker() returned ${JSON.stringify(R.closedAfter)}, expected null (closed)`);
  ok((R.noopReset || {}).ok === true && (R.noopReset || {}).wasOpen === false,
    "CLAUSE C negative control: resetting an already-closed breaker must report wasOpen:false, not a false positive 'cleared'");

  // The probe must be ISOLATED, not merely conventional. Read the code that
  // is actually handed to the child: an env object naming any Supabase
  // credential would put the shared cache back in reach and quietly restore
  // the 2026-09-09 race.
  {
    // Comments stripped first: the paragraph above quotes this very literal,
    // and a check satisfied by its own prose is decoration (CLAUDE.md's
    // prose-vs-code trap).
    const selfCode = readFileSync(fileURLToPath(import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    const envLiteral = /env:\s*\{\s*NODE_ENV:\s*"test"\s*\}/;
    ok(envLiteral.test(selfCode),
      "CLAUSE C: the probe child is spawned with an explicit minimal env in CODE -- inheriting this process's env is what made the fixture a shared production row");
    ok(!/env:\s*process\.env/.test(selfCode),
      "CLAUSE C: the probe child never inherits process.env -- that is the exact regression this clause exists to prevent");
    ok(!envLiteral.test("// env: { NODE_ENV: \"test\" } named only in a comment".replace(/^\s*\/\/.*$/gm, " ")),
      "CLAUSE C self-test: the literal named only in a comment does NOT satisfy the check");
  }

  // Pure functions, safe in-process: no cache, no env, no shared state.
  ok(typeof BREAKER_COOLDOWN_MS === "number" && BREAKER_COOLDOWN_MS > 0 && BREAKER_COOLDOWN_MS <= 60 * 60 * 1000,
    "CLAUSE C: the self-clearing cooldown must be a bounded positive duration (currently expected <=1h) -- this is what a stuck breaker degrades to if the reset route above is ever removed without a replacement");
  ok(classifyProviderFailure(402, "") === "billing", "CLAUSE C: classifyProviderFailure must classify HTTP 402 as billing");
  ok(classifyProviderFailure(400, "Your credit balance is too low, please purchase credits") === "billing",
    "CLAUSE C: classifyProviderFailure must classify the exact 400 message the 579-call incident shipped as billing");
  ok(classifyProviderFailure(429, "You have exceeded your monthly usage limit") === "quota", "CLAUSE C: classifyProviderFailure must classify a hard quota 429 as quota");
  ok(classifyProviderFailure(429, "rate limited, please slow down") === null, "CLAUSE C negative control: a PLAIN rate-limit 429 must NOT classify as quota -- that would trip the breaker on a transient blip, not a deterministic refusal");
  ok(classifyProviderFailure(500, "internal server error") === null, "CLAUSE C negative control: a generic 500 must NOT trip the breaker -- retrying a transient failure is correct");
}

// ── CLAUSE D — the serving path renders nothing rather than filler ─────────
{
  const mustBeEmpty = [
    ["null", null],
    ["undefined", undefined],
    ["not an object", "why is this a string"],
    ["{error:true}", { error: true }],
    ["{unavailable:true}", { unavailable: true }],
    ["empty string", { why_wayfind_picked_this: "" }],
    ["whitespace only", { why_wayfind_picked_this: "   \n\t  " }],
    ["meta-commentary leak", { why_wayfind_picked_this: "This is a food establishment, not a museum, so I cannot assess it as requested." }],
    ["legacy filler", { why_wayfind_picked_this: "A highly reviewed nearby option worth a look while you are nearby." }],
  ];
  for (const [label, input] of mustBeEmpty) {
    const body = whyWayfindPickedBody(input);
    ok(body === "", `CLAUSE D (${label}): whyWayfindPickedBody must return "" (render nothing) — got ${JSON.stringify(body)}`);
  }
  // positive control — a guard whose function always returns "" would pass
  // every assertion above and catch nothing.
  const real = "Founded in 1962, this dive bar still runs the original neon sign and a well-drink happy hour that locals will not shut up about. It is loud, cash-friendly, and best on a Thursday when the regulars' pool league takes over the back room. Skip it if you want a quiet date-night spot — this is not that.";
  const goodBody = whyWayfindPickedBody({ why_wayfind_picked_this: real });
  ok(goodBody === real, `CLAUSE D positive control: a genuine, specific, non-filler paragraph must render THROUGH unmangled — got ${JSON.stringify(goodBody)}. Without this control, an always-empty stub would pass every case above.`);
}

// ── CLAUSE D (structural) — Detail.js routes BOTH sources through the SAME
//    honesty gate, and omits the whole block on empty, never just the text.
//    Comments/strings stripped first (CLAUDE.md: a guard that greps raw
//    source fails on its own explanatory comment). ───────────────────────
{
  const detailPath = rel("app/components/sheets/Detail.js");
  const raw = readFileSync(detailPath, "utf8");
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  const FALLBACK_RX = /const body = whyWayfindPickedBody\(insight\) \|\| whyWayfindPickedBody\(\{\s*why_wayfind_picked_this:\s*editorial\?\.why\s*\}\)/;
  ok(FALLBACK_RX.test(stripped),
    "CLAUSE D (structural): Detail.js must resolve the Why-Wayfind body from BOTH the live insight AND the wf_editorial fallback, and BOTH must pass through whyWayfindPickedBody — a raw `editorial?.why` used directly would bypass the honesty gate clause D just proved");

  // the render gate must sit immediately after, and return null (paint
  // nothing) rather than an empty heading/paragraph.
  const gateIdx = stripped.search(FALLBACK_RX);
  ok(gateIdx >= 0, "CLAUSE D (structural): fallback expression must be found before checking what follows it");
  const after = stripped.slice(gateIdx, gateIdx + 400);
  ok(/if\s*\(!body\)\s*return\s*null;/.test(after),
    "CLAUSE D (structural): the very next statement after computing `body` must be `if (!body) return null` — painting the heading/shell first and hiding it later is the exact bug #1029 fixed (Cirque Italia flashed the heading, then wrote nothing)");

  // RED-PROVE: this exact assertion pair must fail against the code as it
  // shipped for 5-6 days (#1029 -> #1096), when the fallback did not exist.
  const preFix1096 = 'const body = whyWayfindPickedBody(insight);\n                  if (!body) return null;';
  ok(!FALLBACK_RX.test(preFix1096),
    "CLAUSE D self-test: the fallback-presence regex must FAIL against the pre-#1096 source (insight-only, no wf_editorial fallback) — proving the assertion can fail, not just pass by construction");
}

// ── REGRESSION LOCK — the pulse-honesty fix (a fully-deferred run must not
//    read identically to a genuinely idle one). Structural: this targets one
//    line inside a Next.js cron route handler this guard cannot invoke
//    without a live CRON_SECRET + Supabase + Anthropic (check-guard-
//    hermeticity forbids reading those), so — same pattern as check-cron-
//    honesty.mjs's own self-test — the check is proven against the LITERAL
//    pre-fix source captured from git history (4c6b1a8c) before being
//    trusted against the live file. ───────────────────────────────────────
{
  const routePath = rel("app/api/cron/atlas-build/route.js");
  const raw = readFileSync(routePath, "utf8");
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  // The bug: `attempted: rows.length` alone means a fully-deferred run
  // (places selected, every one deferred by the spend gate / deadline /
  // provider halt) reports attempted:0 — indistinguishable from "no missing
  // rows", which pulses its own explicit note text on an EARLIER, separate
  // return path. The fix: attempted falls back to places.length, and the
  // note names the deferral, when rows stayed empty.
  const HONEST_ATTEMPTED = /attempted:\s*rows\.length\s*\|\|\s*places\.length/;
  const HONEST_NOTE = /rows\.length === 0[\s\S]{0,120}deferred/;

  ok(HONEST_ATTEMPTED.test(stripped), "REGRESSION LOCK: the final pulse's `attempted` must fall back to places.length when rows stayed empty — `attempted: rows.length` alone reads a fully-deferred run as idle");
  ok(HONEST_NOTE.test(stripped), "REGRESSION LOCK: the final pulse's `note` must name the deferral (mentioning `deferred`) when rows.length is 0 and places existed — a null note there is indistinguishable from a healthy empty queue");

  // RED-PROVE against the literal pre-fix block (commit 4c6b1a8c, before
  // WO-C). Captured verbatim so this is not a regex tuned to pass on
  // anything — it must actually fail on the code that shipped the bug.
  const preFix = `
  const publishedCount = rows.filter((r) => r.verified).length;
  await pulse({
    attempted: rows.length,
    succeeded: publishedCount,
    note: stats.providerHalt
      ? \`\${stats.providerHalt.kind}: \${stats.providerHalt.msg}\`
      : publishedCount === 0 && rows.length > 0
        ? \`0 published of \${rows.length}: pending=\${pending} unverified=\${unverified} with_page=\${withPage}\`
        : null,
  });`;
  ok(!HONEST_ATTEMPTED.test(preFix), "REGRESSION LOCK self-test: the attempted-fallback regex must FAIL against the exact pre-fix block shipped in 4c6b1a8c — proving it can fail");
  ok(!HONEST_NOTE.test(preFix), "REGRESSION LOCK self-test: the note-names-deferral regex must FAIL against the exact pre-fix block shipped in 4c6b1a8c — proving it can fail");
}

if (fail.length) {
  console.error(`check-editorial-coverage-pipeline: ${fail.length} FAILURE(S)`);
  for (const m of fail) console.error("  FAIL: " + m);
  process.exit(1);
}
console.log(`check-editorial-coverage-pipeline: OK — ${pass} assertions across 4 clauses (writer persistence, no-placeholder-on-failure, breaker observe/reset, serving honesty) + 1 pulse-honesty regression lock, each with a positive and negative control`);
