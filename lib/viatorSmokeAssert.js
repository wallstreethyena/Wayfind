// lib/viatorSmokeAssert.js — PURE shape-checking for a live Viator redirect.
//
// WHY THIS IS ITS OWN MODULE. scripts/live-viator-smoke.mjs hits real
// production (https://www.gowayfind.com/api/viator/go) and cannot be part of
// the hermetic guard suite — its whole point is a live network call, and
// scripts/check-guard-hermeticity.mjs exists precisely to keep the guard
// suite from depending on anything outside the repo. But "the parsing and
// assertion logic is correct" is a claim about pure code, and pure code can
// and must be red-proven with fixtures + mutation like everything else in
// this repo (CLAUDE.md: "a guard that fires on CORRECT code is worse than no
// guard"; "assert on the CALL, not the string"). So the SHAPE CHECK lives
// here, importable by both the live script (real Location header) and a
// hermetic test (synthetic Location strings) — see
// scripts/test-viator-smoke-shape.mjs.
//
// THE ABSOLUTE RULE THIS FILE SERVES: never echo, log or persist the pid
// value itself. Every function below returns BOOLEANS and SHAPES
// (host, param names present, regex results) — never the raw credential.
// assertViatorRedirectShape() does not accept a `print` callback and does not
// call console.* itself, by construction: the caller decides what to log, and
// the caller (scripts/live-viator-smoke.mjs) is separately guarded by
// lib/secretOutputGuard.js so even a mistake at the call site cannot leak it.
import { isPlaceholderCredential } from "./envPlaceholder.js";

// Same shape the probe endpoint documents (app/api/viator/go/route.js): a
// real Viator publisher id is "P" + at least 6 digits in every live-verified
// sample, but the task's own acceptance rule also allows any id longer than 3
// characters (some partner ids observed in the wild do not follow the P######
// convention). Keep both, exactly as specified.
const PID_SHAPE = /^P\d{6,}$/;

/**
 * Judge a Viator redirect's Location header URL. Pure: no network, no I/O,
 * never throws (a malformed URL is a FAILED shape, not an exception).
 *
 * @param {string} locationUrl the exact `Location` header value from a 302
 * @returns {{
 *   ok: boolean,
 *   host: string|null,
 *   hostOk: boolean,
 *   pidPresent: boolean,
 *   pidShapeOk: boolean,
 *   pidNotPlaceholder: boolean,
 *   mcidOk: boolean,
 *   mediumOk: boolean,
 *   reasons: string[],
 * }}
 */
export function assertViatorRedirectShape(locationUrl) {
  const reasons = [];
  let url;
  try {
    url = new URL(String(locationUrl || ""));
  } catch {
    return {
      ok: false, host: null, hostOk: false, pidPresent: false, pidShapeOk: false,
      pidNotPlaceholder: false, mcidOk: false, mediumOk: false,
      reasons: ["Location did not parse as a URL"],
    };
  }
  const host = url.hostname.toLowerCase();
  const hostOk = host === "viator.com" || host === "www.viator.com";
  if (!hostOk) reasons.push(`host "${host}" is not viator.com / www.viator.com`);

  const pid = url.searchParams.get("pid") || "";
  const pidPresent = pid.length > 0;
  if (!pidPresent) reasons.push("pid parameter is missing from the redirect");

  // Exactly the rule given: a real-looking Pnnnnnn id OR (loosely) any pid
  // longer than 3 characters — never the raw value in the reasons array.
  const pidShapeOk = pidPresent && (PID_SHAPE.test(pid) || pid.length > 3);
  if (pidPresent && !pidShapeOk) reasons.push("pid does not clear the shape bar (/^P\\d{6,}$/ or length>3)");

  const pidNotPlaceholder = pidPresent && !isPlaceholderCredential(pid);
  if (pidPresent && !pidNotPlaceholder) reasons.push("pid is a recognized PLACEHOLDER string, not a real credential");

  const mcid = url.searchParams.get("mcid");
  const mcidOk = mcid === "42383";
  if (!mcidOk) reasons.push(`mcid "${mcid}" !== "42383"`);

  const medium = url.searchParams.get("medium");
  const mediumOk = medium === "link";
  if (!mediumOk) reasons.push(`medium "${medium}" !== "link"`);

  const ok = hostOk && pidPresent && pidShapeOk && pidNotPlaceholder && mcidOk && mediumOk;
  return { ok, host, hostOk, pidPresent, pidShapeOk, pidNotPlaceholder, mcidOk, mediumOk, reasons };
}

/**
 * Judge the /api/viator/go?probe=1 JSON body. Pure, booleans only — the probe
 * endpoint itself already never echoes a value; this just states the
 * pass/fail rule once so the live script and its test agree.
 */
export function assertProbeShape(probeBody) {
  const b = probeBody || {};
  const reasons = [];
  if (b.hasKey !== true) reasons.push("hasKey is not true — VIATOR_API_KEY missing/placeholder on the live deploy");
  if (b.keyLooksValid !== true) reasons.push("keyLooksValid is not true");
  if (b.hasPid !== true) reasons.push("hasPid is not true — NEXT_PUBLIC_VIATOR_PID missing/placeholder on the live deploy");
  const upstreamOk = typeof b.upstreamStatus === "number" && b.upstreamStatus >= 200 && b.upstreamStatus < 300;
  if (!upstreamOk) reasons.push(`upstreamStatus "${b.upstreamStatus}" is not a 2xx`);
  return { ok: b.hasKey === true && b.keyLooksValid === true && b.hasPid === true && upstreamOk, reasons };
}
