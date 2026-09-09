// scripts/test-atlas-build.mjs — locks the Atlas editorial pipeline
// (/api/cron/atlas-build). It's a metered, resumable batch job; these invariants
// keep it safe, honest, and non-destructive. (Runs server-side with the app's
// keys; the owner triggers it — this guard verifies structure, not live output.)
import { readFileSync } from "fs";
import { pathToFileURL } from "node:url";

let pass = 0;
const fail = (m) => { console.error("test-atlas-build: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
// The pipeline's surface is now two files: the route (when to give up on a
// place) and lib/atlasEditorial.js (whether what came back is publishable). The
// row builder moved there in v6.49 so the publish decision could be unit-tested
// with real inputs — scripts/test-atlas-editorial-row.mjs. Read both; the rules
// below are unchanged.
//
// Whole-line comments are stripped first. This file used to assert
// `verified: false` and kept passing after that line was DELETED, because a
// comment nearby quoted it — a green test asserting the opposite of the truth,
// which is worse than no test.
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// WO-D-atlas-cache-batch (2026-09-04): the RIDE_RX skip list and the
// atlas-590-v1 SYSTEM prompt (NEVER invent a fact / {"pending":true} / the
// JSON-shape rules) moved to lib/atlasCache.js so scripts/atlas-batch.mjs can
// share them byte-for-byte with this route instead of re-deriving a second
// copy. Follow the code: the assertions below are unchanged, the union of
// files they read now includes where the content actually lives.
const r = [src("../app/api/cron/atlas-build/route.js"), src("../lib/atlasEditorial.js"), src("../lib/atlasCache.js"), src("../lib/paidAi.js")]
  .join("\n")
  .split("\n")
  .filter((l) => !/^\s*\/\//.test(l))
  .join("\n");

// Auth: fail-CLOSED (unset secret never opens).
ok(/if \(!secret \|\| \(auth !== "Bearer " \+ secret/.test(r), "CRON_SECRET gated, fail-closed");

// Resumable + non-destructive: the BUILD path selects only MISSING rows and never
// overwrites an existing editorial.
//
// v6.67 — the route now has two modes. `?retry=1` deliberately DOES overwrite,
// because the retry path exists to re-attempt rows that already carry a failed
// record (515 of them, all failed against a rejected API key). So the assertion
// is no longer "the route only ever mentions wf_atlas_missing" — it is that the
// two selectors are chosen by mode, and that the DESTRUCTIVE one is reachable
// only under retryMode. A guard that just checked for the old literal would have
// been satisfied by deleting the branch.
ok(/refreshMode \? "wf_atlas_stale" : retryMode \? "wf_atlas_retryable" : "wf_atlas_missing"/.test(r),
  "the selector is chosen by mode: missing, retryable, or verified-and-older-than-21-days");
ok(/const retryMode = url\.searchParams\.get\("retry"\) === "1"/.test(r),
  "retry mode is opt-in per request and defaults OFF — the scheduled build path can never overwrite by accident");
ok(/if \(retryMode\) \{[\s\S]{0,900}?wf_editorial_record_attempt/.test(r) && /else \{[\s\S]{0,300}?ignore-duplicates/.test(r),
  "retry overwrites only through the attempt RPC; the default build branch remains insert-with-ignore-duplicates");
ok(/wf_editorial_record_attempt/.test(r),
  "the overwrite goes through the attempt-recording RPC, so a retry cannot rewrite a row without also counting the attempt");
ok(/on_conflict=place_id/.test(r) && /resolution=ignore-duplicates/.test(r), "ON CONFLICT (place_id) DO NOTHING — never overwrites existing rows");
ok(/else if \(refreshMode\)[\s\S]{0,900}?resolution=merge-duplicates/.test(r) && /if \(!refreshMode\) rows\.push/.test(r),
  "refresh replaces a stored row only after a successful verified rewrite; failure paths preserve the old copy");
// v6.49: `verified` is DERIVED from the row's own issue list, not hardcoded.
// It was `verified: false` and nothing ever set it true, so the fleet wrote 169
// clean rows no user could see. scripts/check-editorial-publish.mjs owns the
// full rule (derived here AND still gated in every reader); this keeps the
// pipeline's own test honest about what it writes.
ok(/verified: flags === null/.test(r) && !/verified: (false|true)/.test(r), "publish flag is derived from the row's issues, never hardcoded");
ok(/standard_version: "atlas-590-v1"/.test(r), "stamps standard_version=atlas-590-v1");

// Sourcing: real Places Details + Claude; never fabricates.
ok(/places\.googleapis\.com\/v1\/places\//.test(r) && /X-Goog-FieldMask/.test(r), "sources facts from Google Places Details");
ok(/api\.anthropic\.com/.test(r) && /atlas-590-v1/.test(r), "writes the editorial with Claude to the atlas-590-v1 standard");
ok(/NEVER invent a fact/.test(r) && /\{"pending":true\}/.test(r), "the prompt forbids invention + allows a pending escape hatch");
ok(/\/\^https\?:\\\/\\\//.test(r) || /\/\^https\?:\/\//.test(r), "facts are filtered to claims with a real http(s) source URL");

// Honesty fallbacks: unsourceable → PENDING SOURCE (empty facts); rides → RIDE-LEVEL.
ok(/"PENDING SOURCE"/.test(r), "unsourceable places stored issues=['PENDING SOURCE'], not invented");
ok(/RIDE-LEVEL/.test(r) && /RIDE_RX/.test(r), "ride-level rows skipped + flagged, not written as places");

// v2 sourcing: the model is handed the venue's own page text, not just a link.
ok(/async function officialPage\(/.test(r), "fetches the official homepage as a source");
ok(/official_page_text/.test(r), "page text is passed into the model context");
ok(/officialPage\(url, timeoutMs = \d+\)/.test(r), "the page fetch is timeout-bounded");
ok(/officialPage[\s\S]{0,900}?catch \(e\) \{\s*return null;/.test(r), "the page fetch is fail-soft (falls back to Places-only)");

// v2 honesty gate: nothing unverifiable reaches a row.
ok(/verifyAtlasEditorial/.test(r) && /lib\/atlasVerify/.test(r), "runs the atlasVerify honesty gate");
ok(/"FAILED VERIFICATION"/.test(r), "unverifiable cards are parked, not published");
ok(/problems\.length[\s\S]{0,260}?editorialRow\(place, null/.test(r), "a failed card writes NO editorial content");

// Bounded cost.
ok(/Math\.min\(parseInt\(url\.searchParams\.get\("limit"[\s\S]*, 25\)/.test(r), "per-call batch is bounded (≤25)");
ok(/maxDuration = 60/.test(r), "60s function ceiling");
ok(/spendAllow\("details_enterprise"\)/.test(r), "every Atlas Details call is admitted by the shared free-tier ledger");

// Affiliate opportunities flagged (the get-paid follow-up), fail-soft.
//
// 2026-09-09: this used to read the ROUTE for the literal strings
// `wf_affiliate_opportunities` and `suggested_partner`. The write then moved into
// lib/affiliateOpportunity.js (so the RPC call site would be visible to
// check-rpc-schema-contract.mjs) and this went red. Following the code rather
// than deleting the assertion, per CLAUDE.md: what matters is that the route
// still FLAGS bookable-but-unlinked places and that the flag still reaches the
// queue — not which file the table name is spelled in. The dangerous half is the
// inverse: the old form would have gone GREEN if the write had moved away and
// been dropped entirely.
ok(/toOpportunityRow\s*\(/.test(r) && /recordAffiliateOpportunities\s*\(/.test(r),
  "bookable-but-unlinked places are still shaped and recorded as affiliate opportunities");
ok(/suggested_partner|suggestedPartner/.test(r), "each flagged place still carries a suggested partner");
const oppLib = src("../lib/affiliateOpportunity.js");
ok(/wf_affiliate_opportunity_seen/.test(oppLib) && /suggested_partner/.test(oppLib),
  "the recorded opportunity reaches wf_affiliate_opportunities through the atomic RPC, carrying its suggested partner");


// ---------------------------------------------------------------------------
// THE PARKED-JOB HEARTBEAT (2026-09-09). Proven by EXECUTING the real route in a
// child process with explicit env, not by reading it.
//
// THE DEFECT. The cost gate returned at the first line of GET() — before `pulse`
// was even defined, and before CRON_SECRET was checked. So with WAYFIND_GATE=free
// all three Atlas crons answered HTTP 200 and wrote nothing at all. Measured on
// production: atlas-build, atlas-retry and atlas-refresh last pulsed 2026-09-04,
// six runs in fourteen days against ~336 scheduled, while promote-index (2,824
// runs), cuisine-classify and scout ran normally minutes earlier. job-watch
// cannot report a dormant job that leaves nothing to read.
//
// The existing assertions in this file do NOT cover it: they check the later case
// where Atlas selected places and deferred them all. That path pulses. This one
// returned before any pulse could exist.
//
// Deliberately NOT asserted here: that the gate is open. Parking Atlas is a spend
// decision. What is asserted is that a parked Atlas SAYS SO.
{
  const { register } = await import("node:module");
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const ROOT = new URL("..", import.meta.url);
  const ROUTE_URL = new URL("../app/api/cron/atlas-build/route.js", import.meta.url);
  const HOOK = JSON.stringify(new URL("./lib/nodeResolveHook.mjs", import.meta.url).href);

  // The child traps fetch: it records every wf_job_pulse body and FLAGS any other
  // outbound call, so "this skip spends nothing" is observed rather than assumed.
  const child = (routeHref) => `
    import { register } from "node:module";
    register(${HOOK}, import.meta.url);
    const pulses = [], other = [];
    globalThis.fetch = async (u, init) => {
      const url = String(u);
      if (url.includes("/rest/v1/wf_job_pulse")) { pulses.push(JSON.parse(init.body)); return { ok: true, status: 201, json: async () => ({}), text: async () => "" }; }
      other.push(url.slice(0, 120));
      return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
    };
    const route = await import(${JSON.stringify(routeHref)});
    const hit = async (qs, hdr) => {
      const res = await route.GET(new Request("https://gowayfind.com/api/cron/atlas-build" + qs, { headers: hdr || {} }));
      let body = null; try { body = await res.json(); } catch (e) {}
      return { status: res.status, body };
    };
    const out = {
      unauth:  await hit("", {}),
      build:   await hit("",           { authorization: "Bearer probe-secret" }),
      retry:   await hit("?retry=1",   { authorization: "Bearer probe-secret" }),
      refresh: await hit("?refresh=1", { authorization: "Bearer probe-secret" }),
    };
    console.log(JSON.stringify({ ...out, pulses, other }));
  `;

  const ENV = {
    ...process.env,
    CRON_SECRET: "probe-secret",
    WAYFIND_GATE: "free",
    SUPABASE_URL: "https://probe.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "probe-key-not-real",
  };
  // The child is written to a temp FILE rather than passed with -e: in eval mode
  // `import.meta.url` is not a real path, and the resolve hook's parentURL
  // handling depends on one. A file has an unambiguous URL.
  const runDir = mkdtempSync(path.join(tmpdir(), "wf-atlas-probe-"));
  const run = (routeHref) => {
    const f = path.join(runDir, `probe-${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(f, child(routeHref));
    return JSON.parse(execFileSync(process.execPath, [f], { encoding: "utf8", env: ENV, timeout: 30000 }));
  };

  const real = run(ROUTE_URL.href);

  // 1. AUTH COMES FIRST. An unauthenticated caller learns nothing — not even
  //    which spend mode production is in — and cannot make us write a row.
  ok(real.unauth.status === 401, `an unauthenticated GET returned ${real.unauth.status}, not 401 — the cost gate is answering before CRON_SECRET again, in a route whose own comments call it fail-closed.`);
  ok(!/gate/i.test(JSON.stringify(real.unauth.body || {})), `the 401 body leaked the gate mode: ${JSON.stringify(real.unauth.body)}`);

  // 2. EVERY MODE REPORTS ITS OWN PARKING, under its own job name.
  for (const [mode, job] of [["build", "atlas-build"], ["retry", "atlas-retry"], ["refresh", "atlas-refresh"]]) {
    const r = real[mode];
    ok(r.status === 200 && r.body && r.body.ok === true, `${job}: a gate skip answered ${r.status} ${JSON.stringify(r.body)} — it must be an honest 200 with ok:true, not a failure body.`);
    const p = real.pulses.filter((x) => x.job === job);
    ok(p.length === 1, `${job}: recorded ${p.length} pulses on a gate skip, expected exactly 1. Zero is the defect — a parked job indistinguishable from a dead one.`);
    if (p.length === 1) {
      ok(p[0].attempted === 0 && p[0].succeeded === 0 && p[0].failed === 0,
        `${job}: skip pulse was ${JSON.stringify(p[0])} — must be 0/0/0 so classifyHealth reads it as IDLE and a deliberately parked job never pages anyone.`);
      ok(/^intentional skip: gate=free/.test(p[0].note || ""),
        `${job}: skip note was ${JSON.stringify(p[0].note)} — it must name the reason, and must NOT begin with billing:/quota:, which classifyHealth anchors its escalation match to.`);
    }
  }
  ok(real.pulses.length === 3, `a parked run wrote ${real.pulses.length} pulse rows across three modes, expected 3.`);

  // 3. THE SKIP STILL SPENDS NOTHING. The whole point of the gate.
  ok(real.other.length === 0, `a gate-skipped run made ${real.other.length} non-pulse outbound call(s): ${real.other.join(", ")} — the skip must return before Google or Anthropic is touched.`);

  // 4. RED-PROVE by restoring the SHIPPED defect: gate first, before auth and
  //    before pulse exists. The mutant lives in a temp dir OUTSIDE the repo, with
  //    its relative imports rewritten, so no fixture can ever be mistaken for a
  //    real file (see claude/wayfind-INCIDENT-the-guard-fixture-that-was-a-production-row).
  const routeSrc = readFileSync(new URL(ROUTE_URL), "utf8");
  const GATE = routeSrc.match(/\n  if \(gateShut\(\) \|\| gateFree\(\)\) \{[\s\S]*?\n  \}\n/);
  ok(!!GATE, "could not locate the gate block to mutate; the red-prove would have been meaningless.");
  const dir = mkdtempSync(path.join(tmpdir(), "wf-atlas-mutant-"));
  try {
    if (GATE) {
      const mutated = routeSrc
        .replace(GATE[0], "\n")
        .replace("export async function GET(req) {", 'export async function GET(req) {\n  if (gateShut() || gateFree()) return Response.json({ skipped: "gate free: atlas re-buy is disabled" });')
        // Every relative specifier is rewritten to an absolute URL against the
        // REAL route directory, so the mutant runs the same lib code the route
        // does. The extension is added here because the resolve hook only fills
        // it in for specifiers that still start with "." — an absolute href
        // skips that branch, which is a trap worth naming rather than hitting
        // twice.
        .replace(/from\s+"(\.[^"]*)"/g, (_m, spec) => {
          const abs = new URL(spec, ROUTE_URL);
          if (!/\.(js|mjs|cjs|json)$/.test(abs.pathname)) abs.pathname += ".js";
          return `from "${abs.href}"`;
        });
      ok(mutated !== routeSrc && /GET\(req\) \{\n  if \(gateShut/.test(mutated), "the ordering mutation did not apply; the red-prove would have been meaningless.");
      const mfile = path.join(dir, "route.mutant.mjs");
      writeFileSync(mfile, mutated);
      const bad = run(pathToFileURL(mfile).href);
      ok(bad.pulses.length === 0, `RED-PROVE FAILED: the pre-fix ordering still wrote ${bad.pulses.length} pulse(s). It must write none — that silence is the defect, and if the mutant does not reproduce it these assertions prove nothing.`);
      ok(bad.unauth.status === 200, `RED-PROVE FAILED: the pre-fix ordering returned ${bad.unauth.status} to an unauthenticated caller; the shipped defect answered 200.`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(runDir, { recursive: true, force: true });
  }
  pass += 0;
}

console.log(`test-atlas-build: OK — ${pass} assertions (fail-closed, resumable, non-destructive, never-fabricates, bounded)`);
