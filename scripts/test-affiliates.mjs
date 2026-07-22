// Gate: affiliate URL hygiene (July 2026 audit, Phase 8). Outbound Viator
// URLs must carry pid/mcid/medium EXACTLY once with consistent values, no
// matter what the source URL already contains — string concatenation used
// to double them. Runs in prebuild alongside the other guardrails.
process.env.NEXT_PUBLIC_VIATOR_PID = "P00000000";
const { withViatorTracking, ticketsUrl, viatorDirectUrl } = await import("../lib/affiliates.js");

let failures = 0;
const fail = (m) => { console.error("test-affiliates: FAIL — " + m); failures++; };
const countParam = (url, name) => [...new URL(url).searchParams.keys()].filter((k) => k === name).length;

// 1. Clean URL gains each tracking param exactly once.
{
  const u = withViatorTracking("https://www.viator.com/tours/Sarasota/x/d123-456");
  for (const p of ["pid", "mcid", "medium"]) if (countParam(u, p) !== 1) fail(`clean URL: ${p} appears ${countParam(u, p)} times`);
  if (new URL(u).searchParams.get("pid") !== "P00000000") fail("pid value wrong");
}

// 2. URL that ALREADY carries tracking params (the double-append bug):
//    still exactly once, and OUR values win.
{
  const u = withViatorTracking("https://www.viator.com/tours/x?pid=POLDPID&mcid=99999&medium=banner&foo=1");
  for (const p of ["pid", "mcid", "medium"]) if (countParam(u, p) !== 1) fail(`pre-tracked URL: ${p} appears ${countParam(u, p)} times`);
  const sp = new URL(u).searchParams;
  if (sp.get("pid") !== "P00000000") fail("pre-tracked: pid not overridden");
  if (sp.get("mcid") !== "42383") fail("pre-tracked: mcid not normalized");
  if (sp.get("medium") !== "link") fail("pre-tracked: medium not normalized");
  if (sp.get("foo") !== "1") fail("pre-tracked: unrelated params must survive");
}

// 3. Search URL built by ticketsUrl keeps the query text intact.
{
  const u = ticketsUrl({ name: "The Ringling", address: "5401 Bay Shore Rd, Sarasota, FL 34243, USA", types: ["museum"] });
  const sp = new URL(u).searchParams;
  if (sp.get("text") !== "The Ringling Sarasota") fail("ticketsUrl text mangled: " + sp.get("text"));
  if (countParam(u, "pid") !== 1) fail("ticketsUrl pid count");
}

// 4. viatorDirectUrl rejects non-Viator URLs and tracks Viator ones.
{
  if (viatorDirectUrl("https://evil.example/phish") !== null) fail("non-viator URL must be rejected");
  const u = viatorDirectUrl("https://www.viator.com/tours/x?pid=POLD");
  if (countParam(u, "pid") !== 1 || new URL(u).searchParams.get("pid") !== "P00000000") fail("viatorDirectUrl dedupe");
}

// 5. No PID configured -> URL passes through untracked, never breaks.
{
  process.env.NEXT_PUBLIC_VIATOR_PID = "";
  const u = withViatorTracking("https://www.viator.com/tours/x", "");
  if (u !== "https://www.viator.com/tours/x") fail("no-PID passthrough changed the URL");
}

if (failures) process.exit(1);
console.log("test-affiliates: OK — pid/mcid/medium exactly once, values consistent, passthroughs safe");

// v6.53 (owner report): beaches NEVER show Viator, even with tourist_attraction
const { isTicketyPlace } = await import("../lib/affiliates.js");
const _ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
_ok(isTicketyPlace({ types: ["zoo", "tourist_attraction"] }) === true, "zoo stays tickety");
_ok(isTicketyPlace({ types: ["beach", "tourist_attraction"] }) === false, "beach-typed place never tickety");
_ok(isTicketyPlace({ types: ["natural_feature", "tourist_attraction"] }) === false, "natural features never tickety");
_ok(isTicketyPlace({ types: ["tourist_attraction"], category: "beach" }) === false, "beach-categorized place never tickety");
console.log("test-affiliates: beach-gate cases OK");
