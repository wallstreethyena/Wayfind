#!/usr/bin/env node
// scripts/test-viator-smoke-shape.mjs — hermetic proof for the PURE parsing
// half of the layer-1 production smoke test (lib/viatorSmokeAssert.js). The
// live half (scripts/live-viator-smoke.mjs) dials real production and cannot
// run in the guard suite; this is what CAN be red-proven here — the shape
// rule itself, against fixture Location headers and probe bodies, both
// directions (a good redirect passes, every specific way a bad one fails is
// individually caught — CLAUDE.md: "a guard that fires on CORRECT code is
// worse than no guard").
import { assertViatorRedirectShape, assertProbeShape } from "../lib/viatorSmokeAssert.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const GOOD_PID = "P00000123"; // fixture shape, not a real credential
const good = (host = "www.viator.com", pid = GOOD_PID, mcid = "42383", medium = "link") =>
  `https://${host}/tours/Orlando/some-tour/d123-${pid}?pid=${pid}&mcid=${mcid}&medium=${medium}`;

// ── 1. the positive control — a genuinely correct redirect passes whole ────
{
  const v = assertViatorRedirectShape(good());
  ok(v.ok === true, "a well-formed www.viator.com redirect with pid/mcid=42383/medium=link passes");
  ok(v.reasons.length === 0, "…with no reasons logged");
}
ok(assertViatorRedirectShape(good("viator.com")).ok === true, "the apex host viator.com (no www) also passes — task spec: host is viator.com");

// ── 2. every specific way it can fail, each caught on its own ─────────────
ok(assertViatorRedirectShape(good("viator.com.evil.tld")).hostOk === false, "a lookalike host (viator.com.evil.tld) fails the host check");
ok(assertViatorRedirectShape(good("evil.tld")).hostOk === false, "an unrelated host fails the host check");
ok(assertViatorRedirectShape("https://www.viator.com/tours/x?mcid=42383&medium=link").pidPresent === false, "a missing pid parameter is caught");
ok(assertViatorRedirectShape(good("www.viator.com", "AB")).pidShapeOk === false, "a too-short pid (length<=3, fails both /^P\\d{6,}$/ and length>3) fails the shape check");
ok(assertViatorRedirectShape(good("www.viator.com", "P1234567")).pidShapeOk === true, "a real-shaped pid (P + 7 digits) clears /^P\\d{6,}$/");
ok(assertViatorRedirectShape(good("www.viator.com", "notPshapedbutlong")).pidShapeOk === true, "a pid that fails the P###### pattern but is longer than 3 chars still clears the OR bar, exactly as specified");
for (const placeholder of ["changeme", "[SENSITIVE]", "TODO", "<your-pid-here>", "xxxxxxx"]) {
  ok(assertViatorRedirectShape(good("www.viator.com", placeholder)).pidNotPlaceholder === false,
    `a placeholder pid ("${placeholder}") is rejected by lib/envPlaceholder.js, not accepted as a real credential`);
}
ok(assertViatorRedirectShape(good("www.viator.com", GOOD_PID, "99999")).mcidOk === false, "a wrong mcid is caught");
ok(assertViatorRedirectShape(good("www.viator.com", GOOD_PID, "42383", "email")).mediumOk === false, "a wrong medium is caught");
ok(assertViatorRedirectShape("not a url at all").ok === false, "a completely malformed Location never throws — it fails cleanly");
ok(assertViatorRedirectShape("not a url at all").reasons.length > 0, "…and says why");
ok(assertViatorRedirectShape(null).ok === false, "null Location does not throw");
ok(assertViatorRedirectShape(undefined).ok === false, "undefined Location does not throw");

// ── 3. the verdict object itself never carries the raw pid ─────────────────
// This is the property lib/secretOutputGuard.js's runtime enforcement (proven
// in scripts/test-secret-output-guard.mjs) is a BACKSTOP for: the primary
// defense is that assertViatorRedirectShape() never puts the value anywhere
// in its return shape to begin with. Checked against a placeholder pid
// specifically because it is ordinary-looking text that WOULD show up in the
// dump if any field carried it verbatim — a real credential would too, but
// using one here would defeat the point of never typing one into this repo.
{
  const v = assertViatorRedirectShape(good("www.viator.com", "changeme"));
  const dump = JSON.stringify(v);
  ok(!dump.includes("changeme"),
    "the verdict object never echoes the raw pid value anywhere — no field in {ok,host,hostOk,pidPresent,pidShapeOk,pidNotPlaceholder,mcidOk,mediumOk,reasons} carries it, even for a placeholder whose 'reason' explains WHY it failed");
}
const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/viatorSmokeAssert.js"), "utf8");
ok(!/console\.\w+\(/.test(SRC), "lib/viatorSmokeAssert.js never CALLS console itself (matched as a call, not a mention in prose) — it returns a verdict, the caller decides what to print");

// ── 4. probe shape ──────────────────────────────────────────────────────────
ok(assertProbeShape({ hasKey: true, keyLooksValid: true, hasPid: true, upstreamStatus: 200 }).ok === true, "a fully healthy probe body passes");
ok(assertProbeShape({ hasKey: false, keyLooksValid: false, hasPid: true, upstreamStatus: 200 }).ok === false, "hasKey:false fails");
ok(assertProbeShape({ hasKey: true, keyLooksValid: true, hasPid: false, upstreamStatus: 200 }).ok === false, "hasPid:false fails");
ok(assertProbeShape({ hasKey: true, keyLooksValid: true, hasPid: true, upstreamStatus: 500 }).ok === false, "a non-2xx upstreamStatus fails");
ok(assertProbeShape({ hasKey: true, keyLooksValid: true, hasPid: true, upstreamStatus: "network_error" }).ok === false, "a string upstreamStatus (network_error) fails — not a 2xx number");
ok(assertProbeShape({}).ok === false, "an empty body fails closed, not open");
ok(assertProbeShape(null).ok === false, "a null body does not throw and fails closed");

if (fails.length) {
  console.error("test-viator-smoke-shape: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`test-viator-smoke-shape: OK — ${pass} assertions; a correct Viator redirect passes whole, every individual defect (host/pid/mcid/medium/placeholder) is caught on its own, malformed input never throws, and the probe-shape rule fails closed`);
