#!/usr/bin/env node
// scripts/check-viator-pid.mjs — Wayfind's Viator partner ID can't drift (2026-10-19).
//
// Owner decision: every Viator link goes to Wayfind's own partner account,
// P00320881. Until 2026-10-19 every click carried a different pid that is not on
// the owner's Viator account, so no click was ever credited. This guard fails if:
//   1. lib/viatorPid.js no longer pins P00320881;
//   2. the retired pid appears in ANY git-tracked file (code, docs, fixtures, data);
//   3. a Viator URL through withViatorTracking (stored foreign pid, explicit pid,
//      no pid) or a built search link comes out without pid=P00320881,
//      mcid=42383 and a correct medium.
import { execFileSync } from "node:child_process";
import { WAYFIND_VIATOR_PID } from "../lib/viatorPid.js";
import { withViatorTracking } from "../lib/affiliates.js";

let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };
const WANT = "P00320881";
// Built from parts so this file is not itself a hit for the repo-wide search.
const RETIRED = ["P003", "08545"].join("");

ok(WAYFIND_VIATOR_PID === WANT, `lib/viatorPid.js pins ${WANT}`);

let hits = "";
try {
  hits = execFileSync("git", ["grep", "-n", "-I", "-F", RETIRED], { encoding: "utf8" });
} catch (e) {
  if (e.status !== 1) { console.error("check-viator-pid: FAIL — git grep could not run:", e.message); process.exit(1); }
}
ok(hits.trim() === "", `the retired Viator pid appears in tracked files:\n${hits}`);

const cases = [
  ["stored foreign pid", `https://www.viator.com/tours/Sarasota/x/d25738-108117P1?mcid=42383&pid=${RETIRED}&medium=api&api_version=2.0`, undefined, "api"],
  ["explicit caller pid", "https://www.viator.com/tours/x/d1-1P1?medium=api", "P00000000", "api"],
  ["no pid at all", "https://www.viator.com/searchResults/all?text=kayak", undefined, "link"],
];
for (const [label, raw, pid, medium] of cases) {
  const out = withViatorTracking(raw, pid, { campaign: "wf-na-qa-check" });
  const u = new URL(out);
  ok(u.searchParams.getAll("pid").length === 1 && u.searchParams.get("pid") === WANT, `${label}: pid=${WANT} exactly once (got ${u.searchParams.getAll("pid")})`);
  ok(u.searchParams.get("mcid") === "42383", `${label}: mcid=42383`);
  ok(u.searchParams.get("medium") === medium, `${label}: medium=${medium}`);
  ok(u.searchParams.get("campaign") === "wf-na-qa-check", `${label}: campaign tag kept`);
  ok(out.includes(`pid=${WANT}`), `${label}: output carries pid=${WANT}`);
  ok(!out.includes(RETIRED), `${label}: no retired pid in output`);
}

console.log(`check-viator-pid: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
