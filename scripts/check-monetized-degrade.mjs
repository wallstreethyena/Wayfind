// scripts/check-monetized-degrade.mjs — DEGRADE BEHAVIOUR, not env presence.
//
// THE QUESTION EVERY OTHER CHECK GOT WRONG. On 2026-07-30 six revenue env vars
// were missing from Vercel production. Four were harmless: their fallback was a
// correct literal that still carried attribution (TP marker 750791, the Impact
// SID/campaign/ad). Two were bleeding: their fallback returned a WORKING,
// UNATTRIBUTED link — vrboUrl sending free traffic to Expedia out of our
// highest-commission category, and uberEatsUrl doing the same.
//
// "Is the env var set?" cannot tell those apart. Only degrade behaviour can:
//     env SET   -> the URL must be ATTRIBUTED (carry the id/marker/wrapper)
//     env UNSET -> the URL must be NULL (render nothing; free the slot)
// A builder that returns a bare destination on the unset path is the leak.
//
// CHILD PROCESS PER CASE. These modules read process.env at MODULE SCOPE
// (`const VRBO_TEMPLATE = (process.env... || "")`), so the value is frozen at
// first import. Mutating process.env and re-importing in one process tests
// nothing — the second import is cached. Each case therefore runs in its own
// node with its own env.
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

let pass = 0;
const fail = (m) => { console.error("check-monetized-degrade: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const AFF = new URL("../lib/affiliates.js", import.meta.url).pathname;

// WHERE THE LITERAL PROTECTION LIVES (asked 2026-07-30): NOT here. There is no
// LOAD_BEARING_LITERALS section in this file — deleting TP marker "750791" turns
// scripts/check-untracked-affiliate-links.mjs red, and that guard red-proves it
// independently. Duplicating the assertion here would be two sources of truth
// for one invariant, which is the anti-pattern this codebase keeps paying for.
// One guard owns it; this comment is the pointer so nobody looks for it here.


// Run one builder in a clean child with a specific env.
function call(fn, args, env) {
  const src = `import * as A from ${JSON.stringify(AFF)};
const r = A[${JSON.stringify(fn)}](...${JSON.stringify(args)});
process.stdout.write(JSON.stringify(r === undefined ? null : r));`;
  try {
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", src], {
      env: { ...process.env, ...env }, encoding: "utf8", timeout: 20000,
    }) || "null");
  } catch (e) { fail(`${fn} threw in a child process: ${String(e.message || e).slice(0, 160)}`); }
}

// ── the builders whose attribution depends on an env var ────────────────────
// `attributed` is the substring that PROVES the wrapper/id is present.
const BUILDERS = [
  {
    fn: "vrboUrl", args: ["Orlando, FL"], env: "NEXT_PUBLIC_VRBO_TEMPLATE",
    set: "https://track.example/x?u={url}", attributed: "track.example",
    mustFailClosed: true,
  },
  {
    fn: "experienceSearchUrl", args: ["kayak tour", "Sarasota"],
    env: "NEXT_PUBLIC_VIATOR_PID", set: "P00000000", attributed: "P00000000",
    // Also listed as unmonetized in the spec; it is monetized and ALREADY
    // correct — `if (VIATOR) ... if (GYG) ... return null`. Included because a
    // builder that fails closed today is exactly the one worth pinning.
    mustFailClosed: true, extraUnset: { NEXT_PUBLIC_GYG_PID: "" },
  },
  {
    fn: "ticketsUrl", args: [{ name: "The Ringling", address: "5401 Bay Shore Rd, Sarasota, FL 34243, USA", types: ["museum", "tourist_attraction"] }],
    env: "NEXT_PUBLIC_VIATOR_PID", set: "P00000000", attributed: "P00000000",
    mustFailClosed: true, extraUnset: { NEXT_PUBLIC_GYG_PID: "" },
  },
  {
    fn: "uberEatsUrl", args: ["Columbia Restaurant", "Sarasota"],
    env: "NEXT_PUBLIC_UBEREATS_TEMPLATE", set: "https://track.example/x?u={url}", attributed: "track.example",
    // EXEMPTION CLOSED 2026-08-13, on its own deadline. The template never
    // arrived and the Uber Eats project is parked pending affiliate approval, so
    // the exemption expired into its intended end state rather than being
    // extended. uberEatsUrl now returns null with the template unset, and the
    // two call sites fall through to the Maps CTA, so a restaurant card still
    // has a working action. Re-arming is an env change, not a code change.
    mustFailClosed: true,
  },
];

for (const b of BUILDERS) {
  // (a) env SET -> attributed.
  const on = call(b.fn, b.args, { [b.env]: b.set });
  ok(typeof on === "string" && on.includes(b.attributed),
    `${b.fn} with ${b.env} SET must return an ATTRIBUTED url containing ${JSON.stringify(b.attributed)} — got ${JSON.stringify(on)}. If this fails the money is not being tracked even when configured.`);

  // (b) env UNSET -> null, or a dated exemption.
  const off = call(b.fn, b.args, { [b.env]: "", ...(b.extraUnset || {}) });
  if (b.mustFailClosed) {
    ok(off === null,
      `${b.fn} with ${b.env} UNSET returned ${JSON.stringify(off)} instead of null. That is a WORKING, UNATTRIBUTED link — it converts and pays us nothing, and it occupies the slot a live CTA would hold. Return null so the caller's null-check suppresses the row.`);
  } else {
    ok(!!b.expires, `${b.fn} is exempt from failing closed and MUST carry an expiry — an exemption without a deadline becomes permanent`);
    const due = Date.parse(b.expires + "T00:00:00Z");
    ok(Number.isFinite(due) && Date.now() < due,
      `THE ${b.fn} EXEMPTION EXPIRED ON ${b.expires}. It returns ${JSON.stringify(off)} with ${b.env} unset — donating traffic. Wire ${b.env}, or set mustFailClosed:true.`);
  }
}
ok(BUILDERS.filter((b) => !b.mustFailClosed).length <= 1, "at most ONE dated exemption — a second is a new leak wearing an exception's clothes");

// ── A PLACEHOLDER IS NOT A CREDENTIAL (2026-07-31) ──────────────────────────
// The third degrade state, and the one that had no test. `vercel env pull`
// cannot read back a var flagged Sensitive in the dashboard — it writes the
// literal string "[SENSITIVE]" — so sourcing .env.production.local set
// NEXT_PUBLIC_VIATOR_PID="[SENSITIVE]" and every Viator URL went out as
// ...?pid=%5BSENSITIVE%5D&mcid=42383&medium=link: a WORKING, UNATTRIBUTED link.
// That is vrboUrl's leak with a configured var standing in front of it, and it
// beats every presence check, because "[SENSITIVE]" is eleven characters long.
// The contract: a placeholder degrades EXACTLY like unset.
const RINGLING = { name: "The Ringling", address: "5401 Bay Shore Rd, Sarasota, FL 34243, USA", types: ["museum", "tourist_attraction"] };
for (const ph of ["[SENSITIVE]", "sensitive", "<your-pid>", "changeme", "undefined"]) {
  const t = call("ticketsUrl", [RINGLING], { NEXT_PUBLIC_VIATOR_PID: ph, NEXT_PUBLIC_GYG_PID: "" });
  ok(t === null,
    `ticketsUrl with NEXT_PUBLIC_VIATOR_PID=${JSON.stringify(ph)} returned ${JSON.stringify(t)} instead of null. A placeholder must fail CLOSED exactly like an unset var — never stamp itself onto a live viator.com link that converts and pays us nothing.`);
  const w = call("withViatorTracking", ["https://www.viator.com/tours/x", ph], {});
  ok(w === "https://www.viator.com/tours/x",
    `withViatorTracking with an explicit placeholder pid must pass the url through untouched (lib/viatorServer.js supplies its own pid this way) — got ${JSON.stringify(w)}`);
}
// THE OTHER HALF, and the one that matters more: a rejecter that rejects real
// credentials would take revenue to zero silently, which is worse than the bug
// it fixes. Every pid shape the suite and production actually use must survive.
for (const real of ["P00000000", "P_TEST_000000", "P00308545"]) {
  const w = call("withViatorTracking", ["https://www.viator.com/tours/x", real], {});
  ok(typeof w === "string" && w.includes(`pid=${real}`),
    `withViatorTracking must still stamp the REAL pid ${JSON.stringify(real)} — got ${JSON.stringify(w)}. The placeholder list is exact-match for exactly this reason.`);
}

// ── COMPLETENESS: every URL-shaped export is classified ─────────────────────
// A new builder must be triaged, not silently unguarded.
const src = readFileSync(AFF, "utf8");
const exports_ = [...src.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
ok(exports_.length >= 8, `only ${exports_.length} exports parsed from lib/affiliates.js — the matcher is broken and completeness would be vacuous`);
const KNOWN_UNMONETIZED = new Set([
  "isTicketyPlace",       // boolean predicate, returns no URL
  // INTERNAL path builder; returns /api/viator/go?product=... and hard-rejects
  // any non-viator.com host. Attribution is applied server-side by that route.
  "viatorProductGoUrl",
  "withViatorTracking",   // the wrapper ITSELF; tested via its callers above AND directly in the placeholder section
  // WRAPPER, NOT A DECISION POINT — and the reason matters. The attached spec
  // listed this as unmonetized; line 105 (`return VIATOR ? withViatorTracking(url) : url`)
  // says otherwise, so I first put it in BUILDERS and it failed leg (b) as a
  // real leak. But nulling it would have produced a FALSE GREEN: SIX call sites
  // write `Aff.viatorDirectUrl(x) || x`, so the raw viator.com URL renders
  // anyway. The fail-closed property for Viator lives at the DECISION points —
  // ticketsUrl() and experienceSearchUrl(), both asserted above, both already
  // correct. FLAGGED FOR THE AUDIT: those six `|| raw` fallbacks are an
  // unguarded degrade path if NEXT_PUBLIC_VIATOR_PID is ever unset. It is set in
  // production today, so this is a latent hazard, not a live leak.
  "viatorDirectUrl",
  "isTicketmasterFamily", // boolean predicate (host is TM-family?), returns no URL — same class as isTicketyPlace
  "tmImpactLink",         // literal-default credential (IMPACT_SID etc.), covered by check-untracked-affiliate-links
  "ticketOutUrl",         // delegates to tmImpactLink; same literal-default class
  "experienceGoUrl",      // returns our OWN /api/viator/go route — attribution happens server-side at the 302
  // Same class as experienceGoUrl: returns our OWN /api/eats/go route, which
  // resolves the exact store and applies NEXT_PUBLIC_UBEREATS_TEMPLATE at
  // runtime, server-side, at the 302 (v8.44 — the detail delivery rung moved
  // here so the primary CTA stops degrading to an unmonetized "See menu" when
  // the template env is unset at build time).
  "uberEatsGoUrl",
  "ticketmasterGoUrl",    // returns our OWN /api/ticketmaster/go route — same server-side-attribution class as experienceGoUrl
  "hotelUrl",             // Stay22: the href is rewritten at click time by LinkSwap, so a static assert would be wrong
  // hotelSearchUrl was DELETED from lib/affiliates.js 2026-07-30 (bare
  // booking.com link, unattributable by construction, zero callers). It is
  // deliberately NOT pre-classified here: if anyone re-adds it, this guard
  // must fail and force a triage rather than silently blessing the re-add.
]);
const covered = new Set([...BUILDERS.map((b) => b.fn), ...KNOWN_UNMONETIZED]);
for (const fn of exports_) {
  ok(covered.has(fn),
    `lib/affiliates.js exports ${fn}() and this guard does not classify it. Add it to BUILDERS (with its env var and the substring that proves attribution) or to KNOWN_UNMONETIZED with a reason. An unclassified URL builder is how the next VRBO ships.`);
}

console.log(`check-monetized-degrade: OK — ${pass} assertions across ${BUILDERS.length} builders (env SET => attributed, env UNSET => null; one dated exemption; every affiliates.js export classified)`);
