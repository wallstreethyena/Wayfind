#!/usr/bin/env node
/**
 * check-credentialed-paths — the credentialed pass must actually reach code the
 * bare pass cannot, and every guard claiming to need it must really need it.
 *
 * WHY (2026-08-06). A guard whose assertions never execute is indistinguishable
 * from a guard that passes. lib/affiliates reads NEXT_PUBLIC_VIATOR_PID at
 * module load. The original premise was: without it, verifiedUrl is always
 * null, so guidePrimaryCta's `exact` branch is entered ZERO times. That loop
 * passed vacuously through #599, #602, #606 and #611, shipping two wrong
 * labels to production — Vercel's build was the first execution of that
 * branch anywhere.
 *
 * RE-DERIVED (2026-08-19, founder P0 / same-tab earning handoffs).
 * bookingTargets.verifiedUrl is now viatorProductGoUrl, not viatorDirectUrl.
 * The go hop does not need NEXT_PUBLIC_VIATOR_PID at client module load —
 * the server applies tracking. So a curated viatorUrl resolves exact=true
 * BARE, and the href is /api/viator/go. That is intended. Do not put
 * viatorDirectUrl back, and do not treat "bare exact > 0" as a failure.
 *
 * The credentialed pass is still needed: PID still gates the raw attributed
 * partner builders (viatorDirectUrl / withViatorTracking) at module load.
 * Bare, viatorDirectUrl returns the raw URL with no pid (attributed count 0).
 * With the stub, the same call stamps pid/mcid/medium. That is the branch
 * the first pass cannot reach.
 *
 * scripts/lib/guardEnv.mjs adds a second pass with stubbed public credentials.
 * This file stops that from becoming decoration in either direction:
 *
 *   - a guard listed as credentialed must have a branch that is genuinely
 *     unreachable bare (otherwise the extra run is pure suite time), and
 *   - the stubs must genuinely reach it (otherwise the pass proves nothing).
 *
 * Both halves are measured by SPAWNING a child, because the credential is read
 * at module load and cannot be toggled inside one process.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GUARD_STUB_ENV, CREDENTIALED_GUARDS, credentialedEnv } from "./lib/guardEnv.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the stub set is public-only and non-empty ─────────────────────────── */
const keys = Object.keys(GUARD_STUB_ENV);
ok(keys.length > 0, "GUARD_STUB_ENV must declare at least one credential, or the pass is a no-op");
for (const k of keys) {
  ok(k.startsWith("NEXT_PUBLIC_"),
    `${k} is not NEXT_PUBLIC_* — only values that already ship to the browser may be stubbed here; a server secret must never be modelled in the repo`);
  ok(String(GUARD_STUB_ENV[k] || "").length > 0, `${k} must have a non-empty stub value`);
}
// The stub must be obviously fake, so nobody mistakes it for a real credential.
// Every stub must be visibly synthetic — an optional letter prefix then zeros —
// so nobody can mistake one for a real credential or be tempted to "fix" it by
// pasting a live value in.
for (const k of keys) {
  ok(/^[A-Za-z]*0+$/.test(String(GUARD_STUB_ENV[k])),
    `${k} stub ${JSON.stringify(GUARD_STUB_ENV[k])} must be visibly synthetic (letters then zeros), never a real-looking id`);
}

/* ── 2. every listed guard exists and states a reason ─────────────────────── */
ok(CREDENTIALED_GUARDS.length > 0, "CREDENTIALED_GUARDS must not be empty");
for (const g of CREDENTIALED_GUARDS) {
  const file = String(g.cmd || "").split(/\s+/).pop();
  ok(file && existsSync(REPO + file), `${g.cmd}: the guard file must exist (${file})`);
  ok(String(g.why || "").length > 20, `${g.cmd}: must state WHY it needs a credential, specifically`);
}

/* ── 3. THE PREMISE, MEASURED ─────────────────────────────────────────────── */
// Two probes, both spawned, because affiliates reads the PID at module load.
//
// A. Exact tour CTAs may now resolve BARE (go hop, no client PID). That is
//    not a failure. Every exact href — bare AND credentialed — must be an
//    origin go route. A raw partner URL on an exact Book is the P0 miss.
// B. PID still gates viatorDirectUrl's attributed builder. Bare attributed
//    count is 0; credentialed returns a non-null viator.com URL with pid.
//    That is the code the first pass cannot reach.

function hrefHostKind(href) {
  if (typeof href !== "string" || !href.trim()) return "empty";
  try {
    const u = new URL(href, "https://wayfind.test");
    const host = u.hostname.replace(/^www\./, "");
    // Host only — viatorProductGoUrl puts viator.com in ?product=, and a
    // substring check would flag the honest go hop as a partner leak.
    if (host === "viator.com" || host === "booking.com" || host === "evyy.net" || host.endsWith(".evyy.net")) {
      return "partner";
    }
    if (u.pathname === "/api/viator/go" || u.pathname === "/api/commerce/go") return "go";
    return "other";
  } catch {
    return "empty";
  }
}

{
  const goSample = "/api/viator/go?product=" + encodeURIComponent("https://www.viator.com/tours/x/d1-1");
  ok(hrefHostKind(goSample) === "go",
    "self-test: a go hop whose query carries viator.com is still kind=go — host, not substring");
  ok(hrefHostKind("/api/commerce/go?offer=1") === "go", "self-test: commerce go is kind=go");
  ok(hrefHostKind("https://www.viator.com/tours/x/d1-1") === "partner",
    "self-test: a raw viator.com href is kind=partner");
  ok(hrefHostKind("https://www.booking.com/hotel/us/x.html") === "partner",
    "self-test: booking.com is kind=partner");
  ok(hrefHostKind("https://ticketmaster.evyy.net/c/1/2/3") === "partner",
    "self-test: evyy.net is kind=partner");
}

const CTA_PROBE = `
import { GUIDES } from "./lib/guides.js";
import { guidePrimaryCta } from "./lib/guideCta.js";
import { siteTodayStr } from "./lib/siteTime.js";
const t = siteTodayStr();
const hrefs = [];
for (const s of Object.keys(GUIDES)) {
  const c = guidePrimaryCta(GUIDES[s], t);
  if (c && c.kind === "tour" && c.exact) hrefs.push({ slug: s, href: c.href });
}
console.log(JSON.stringify({ n: hrefs.length, hrefs }));
`;

const DIRECT_SAMPLE = "https://www.viator.com/tours/Crystal-River/Swim-with-Manatees/d920-3842MANATEE";
const DIRECT_PROBE = `
import { viatorDirectUrl } from "./lib/affiliates.js";
const href = viatorDirectUrl(${JSON.stringify(DIRECT_SAMPLE)});
let attributed = false;
try {
  const u = new URL(href);
  const host = u.hostname.replace(/^www\\./, "");
  attributed = host === "viator.com" && !!(u.searchParams.get("pid") || "").trim();
} catch {}
console.log(JSON.stringify({ href: href == null ? null : String(href), attributed: !!attributed }));
`;

const runJson = (probe, env) => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
    cwd: REPO, env, encoding: "utf8",
  });
  const out = String(r.stdout || "").trim().split("\n").pop();
  try { return JSON.parse(out); } catch { return null; }
};

const bareEnv = { ...process.env };
for (const k of keys) delete bareEnv[k];
const credEnv = credentialedEnv(bareEnv);

const bareCta = runJson(CTA_PROBE, bareEnv);
const credCta = runJson(CTA_PROBE, credEnv);
ok(bareCta && Array.isArray(bareCta.hrefs) && credCta && Array.isArray(credCta.hrefs),
  `the exact-CTA probe must return href lists (bare=${JSON.stringify(bareCta)}, credentialed=${JSON.stringify(credCta)}) — if either is null the measurement is broken`);

const bare = bareCta && Number.isFinite(Number(bareCta.n)) ? Number(bareCta.n) : null;
const cred = credCta && Number.isFinite(Number(credCta.n)) ? Number(credCta.n) : null;
ok(bare !== null && cred !== null,
  `the probe must return counts (bare=${bare}, credentialed=${cred})`);
// Bare exact MAY be > 0. The go hop is the founder P0. Do not require bare===0.
ok((bare || 0) + (cred || 0) > 0,
  "PROBE BROKEN: no guide resolved an exact tour CTA in either pass — a curated viatorUrl must hop, or this check is counting nothing");

const allExact = [
  ...((bareCta && bareCta.hrefs) || []).map((h) => ({ pass: "bare", ...h })),
  ...((credCta && credCta.hrefs) || []).map((h) => ({ pass: "credentialed", ...h })),
];
for (const row of allExact) {
  const kind = hrefHostKind(row.href);
  ok(kind === "go",
    `${row.pass} exact CTA ${row.slug} must be an origin go route (/api/viator/go or /api/commerce/go), not a raw partner URL (kind=${kind}, href=${row.href})`);
  ok(kind !== "partner",
    `${row.pass} exact CTA ${row.slug} is a raw partner href (viator.com / booking.com / evyy.net) — that is the dead-money handoff`);
}

const bareDirect = runJson(DIRECT_PROBE, bareEnv);
const credDirect = runJson(DIRECT_PROBE, credEnv);
ok(bareDirect && credDirect,
  `the viatorDirectUrl probe must return JSON (bare=${JSON.stringify(bareDirect)}, credentialed=${JSON.stringify(credDirect)})`);
// Bare: unattributed (raw URL, no pid) — attributed count 0. The function
// returns the input URL when VIATOR is unset; it does not return null. Count
// attributed results so the measurement matches the builder.
ok(bareDirect && bareDirect.attributed === false,
  `PREMISE FAILED: bare viatorDirectUrl must not stamp a pid (got ${JSON.stringify(bareDirect)})`);
ok(credDirect && credDirect.href && credDirect.attributed === true,
  `THE PASS PROVES NOTHING: credentialed viatorDirectUrl must return a non-null attributed viator.com URL (got ${JSON.stringify(credDirect)})`);
ok(credDirect && typeof credDirect.href === "string" && credDirect.href.includes(GUARD_STUB_ENV.NEXT_PUBLIC_VIATOR_PID),
  "credentialed viatorDirectUrl must carry the stub PID — otherwise the second pass did not apply GUARD_STUB_ENV");
ok(bareDirect && credDirect && bareDirect.href !== credDirect.href,
  `the credentialed pass must reach strictly more than the bare pass (bareDirect=${JSON.stringify(bareDirect)}, credDirect=${JSON.stringify(credDirect)})`);

/* ── 4. the runner must actually perform the pass ─────────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const runner = strip(readFileSync(REPO + "scripts/run-guards.mjs", "utf8"));
ok(/CREDENTIALED_GUARDS/.test(runner), "run-guards must iterate CREDENTIALED_GUARDS");
ok(/credentialedEnv\s*\(/.test(runner), "run-guards must apply credentialedEnv to the second pass");
ok(/spawnSync\([\s\S]{0,400}credentialedEnv/.test(runner),
  "the credentialed env must reach an actual spawn, not merely be imported");
ok(/status\s*!==\s*0[\s\S]{0,400}credentialed pass exited/.test(runner),
  "a failing credentialed pass must fail the suite — a second run nobody checks is decoration");
ok(/WF_SUPPRESS_ANALYTICS:\s*["']1["']/.test(runner.split("CREDENTIALED_GUARDS")[1] || ""),
  "the credentialed pass must keep analytics suppressed — it runs the same guards, and they must not write to production");

if (fail.length) {
  console.error("check-credentialed-paths: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-credentialed-paths: OK — ${pass} assertions; ${keys.length} public stub(s), ` +
  `${CREDENTIALED_GUARDS.length} guard(s) in the credentialed set; ` +
  `MEASURED by spawn: ${bare} exact go-CTA(s) bare vs ${cred} credentialed (bare exact is allowed); ` +
  `viatorDirectUrl attributed ${bareDirect && bareDirect.attributed ? 1 : 0} bare vs ${credDirect && credDirect.attributed ? 1 : 0} credentialed, so the second pass reaches code the first cannot`
);
