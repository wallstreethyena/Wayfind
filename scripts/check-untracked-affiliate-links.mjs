// scripts/check-untracked-affiliate-links.mjs — an affiliate link we cannot
// attribute must not render.
//
// THE FAILURE THIS CLOSES. vrboUrl() ended in `return dest` when
// NEXT_PUBLIC_VRBO_TEMPLATE was unset. That is not a dead link — it is a
// WORKING, fully untracked one. The user clicks, lands on VRBO, may book, and we
// earn nothing: free traffic to Expedia out of our highest-commission category.
// The variable was verified missing in Vercel production on 2026-07-30, so that
// was the live behaviour, silently, for as long as the code shipped.
//
// A dead monetized CTA is worse than no CTA: it occupies the slot a live one
// would hold, and it looks healthy from every angle except the payout report.
//
// THE DISTINCTION THIS GUARD ENCODES. Two kinds of affiliate env var:
//   - IDs / markers (TP_MARKER_ACCOUNT, IMPACT_SID, CAMPAIGN, AD): a literal
//     fallback is legitimate — the value is knowable and stable, and the
//     fallback is why Travelpayouts and Ticketmaster stayed attributed while
//     their vars were missing from production.
//   - TEMPLATES (…_TEMPLATE): account-specific wrappers. No literal is
//     guessable, so the only honest degrade is to render NOTHING.
// So: a *_TEMPLATE builder must fail closed. Anything else is a silent leak.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-untracked-affiliate-links: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const raw = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");
// Comment-stripped: the notes above and in affiliates.js DESCRIBE `return dest`
// while explaining why it is forbidden — the #430 prose-vs-code trap.
const src = stripComments(raw);

// Each *_TEMPLATE-backed builder, and what it returns when the template is absent.
// Matching the FUNCTION BODY rather than the guard line: the guard line contains
// parentheses (`indexOf("{url}") < 0`), and a naive `[^)]*` regex silently fails
// to match it — which reads as "no branch found" instead of "leak found".
const BUILDERS = [
  { fn: "vrboUrl", env: "NEXT_PUBLIC_VRBO_TEMPLATE", mustFailClosed: true },
  // KNOWN, OWNER-DECIDED EXCEPTION. uberEatsUrl has the identical leak — it
  // returns a bare, untracked ubereats URL when the template is unset, and that
  // var is MISSING in Vercel production. It is exempt only because the
  // detail-action-layer work order explicitly said to keep the row rendering
  // ("still firing eats_out") until a template exists. That is a deliberate
  // decision to send unattributed traffic, not an oversight — flagged back to
  // the owner 2026-07-30. Flip mustFailClosed to true the moment that changes.
  { fn: "uberEatsUrl", env: "NEXT_PUBLIC_UBEREATS_TEMPLATE", mustFailClosed: false },
];
ok(BUILDERS.length >= 2, "the builder list is populated");
// The exemption list must stay SMALL and deliberate. A third untracked builder
// is a new leak, not a new exception.
ok(BUILDERS.filter((b) => !b.mustFailClosed).length <= 1,
  "at most ONE builder may be exempt from failing closed. A second means someone widened the exception instead of fixing a leak.");

for (const b of BUILDERS) {
  const i = src.indexOf("export function " + b.fn);
  ok(i >= 0, `${b.fn} still exists in lib/affiliates.js`);
  const body = src.slice(i, src.indexOf("\n}", i));
  ok(body.length > 60, `${b.fn}'s body parsed to ${body.length} chars — the slice is wrong, so the check below is vacuous`);
  const leaks = /return dest;/.test(body);
  if (b.mustFailClosed) {
    ok(!leaks, `${b.fn} returns the bare destination when ${b.env} is unset — a WORKING, UNTRACKED link. It earns nothing and occupies the slot a live CTA would hold. Return null so the caller's null-check suppresses the row.`);
    ok(/return null;/.test(body), `${b.fn} fails CLOSED (returns null) when it cannot attribute`);
  } else {
    // The exemption is asserted to STILL BE the known one, so it cannot quietly
    // become a different, unreviewed leak.
    ok(leaks, `${b.fn} is on the exemption list but no longer leaks — remove the exemption and set mustFailClosed:true`);
  }
}

// The VRBO case by name, so the failure message teaches the specific incident.
ok(/vrboUrl/.test(src), "vrboUrl still exists");
const vrbo = src.slice(src.indexOf("export function vrboUrl"), src.indexOf("export function vrboUrl") + 700);
ok(!/return dest;/.test(vrbo),
  "vrboUrl must never `return dest` — that is the bare vrbo.com URL with no affiliate wrapper (the 2026-07-30 leak)");

// ID/marker fallbacks are LEGITIMATE and must not be "fixed" into null by
// someone applying this rule too broadly — that would dark Travelpayouts and
// Ticketmaster, which are attributed today ONLY because of these literals.
for (const [name, lit] of [["TP_MARKER", "750791"], ["TM_IMPACT_SID", "7475855"]]) {
  const f = name === "TP_MARKER"
    ? stripComments(readFileSync(new URL("../lib/travelpayouts.js", import.meta.url), "utf8"))
    : src;
  ok(new RegExp(`${name}\\s*=\\s*\\(process\\.env\\.\\w+\\s*\\|\\|\\s*"${lit}"`).test(f),
    `${name} keeps its literal fallback "${lit}" — its env var is MISSING in Vercel production, and this literal is the only reason that program is attributed at all. Removing it darks a live program.`);
}

// ── self-test ───────────────────────────────────────────────────────────────
{
  // The leak detector must fire on real code...
  if (!/return dest;/.test(stripComments('export function f(){ if (!T) return dest; }'))) fail("self-test: the leak detector missed real `return dest;` — not load-bearing");
  // ...and must NOT fire on the fixed shape.
  if (/return dest;/.test(stripComments('export function f(){ if (!T) return null; }'))) fail("self-test: the leak detector fired on the FIXED shape — it cannot tell them apart");
  if (!/return dest;/.test(stripComments('return dest;'))) fail("self-test: stripComments removed real code");
  if (/return dest;/.test(stripComments('// return dest; is forbidden'))) fail("self-test: stripComments did NOT remove the phrase from a comment — prose would trip the check");
  pass += 4;
}

console.log(`check-untracked-affiliate-links: OK — ${pass} assertions (every *_TEMPLATE builder fails CLOSED so an unattributable link renders nothing; ID/marker literal fallbacks preserved because they are the only thing keeping Travelpayouts and Ticketmaster attributed)`);
