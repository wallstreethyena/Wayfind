// The one advisory the guards audit step may ignore.
//
// GHSA-fc5q-39xc-vjpf is picomatch ReDoS through a single branch of repeated
// extglobs. Checked 2026-11-17: the vulnerable range is <=4.0.7, the newest
// version npm will install is 4.0.7, and first_patched_version is null.
// `npm audit fix --force` would downgrade @sentry/nextjs to 8.38.0. Remove
// this exception when picomatch ships a fix. Every other moderate, high, or
// critical advisory still fails.

export const PICOMATCH_REDOS = "GHSA-fc5q-39xc-vjpf";

const BLOCKING = new Set(["moderate", "high", "critical"]);
const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

/**
 * Advisories at moderate or above that are not the known picomatch exception.
 * Transitive packages that only name another package in `via` are not their
 * own advisory. A report that is not an npm audit document fails closed.
 * Returns a list of problems; empty means the report may pass.
 */
export function unexpectedAdvisories(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return ["npm audit did not return a report"];
  }
  if (report.error) {
    const err = report.error;
    const msg = typeof err === "string" ? err : (err.summary || err.code || "npm audit error");
    return [`npm audit error: ${msg}`];
  }
  const vulns = report.vulnerabilities;
  if (!vulns || typeof vulns !== "object" || Array.isArray(vulns)) {
    return ["npm audit report has no vulnerabilities object"];
  }
  const problems = [];
  for (const [name, vuln] of Object.entries(vulns)) {
    const vias = vuln && Array.isArray(vuln.via) ? vuln.via : [];
    for (const via of vias) {
      if (!via || typeof via !== "object") continue;
      const severity = String(via.severity || (vuln && vuln.severity) || "").toLowerCase();
      if (!BLOCKING.has(severity)) continue;
      const id = String(via.url || "").match(GHSA)?.[0]?.toLowerCase() || "";
      if (!id) {
        problems.push(`${name}: blocking advisory has no GHSA id (${via.title || via.url || "unknown"})`);
        continue;
      }
      if (id !== PICOMATCH_REDOS.toLowerCase()) problems.push(`${id} via ${name} (${severity})`);
    }
  }
  return problems;
}

/** True when the known picomatch advisory is present at a blocking severity. */
export function picomatchExceptionSeen(report) {
  if (!report || typeof report !== "object" || !report.vulnerabilities) return false;
  for (const vuln of Object.values(report.vulnerabilities)) {
    const vias = vuln && Array.isArray(vuln.via) ? vuln.via : [];
    for (const via of vias) {
      if (!via || typeof via !== "object") continue;
      const severity = String(via.severity || "").toLowerCase();
      if (!BLOCKING.has(severity)) continue;
      const id = String(via.url || "").match(GHSA)?.[0]?.toLowerCase() || "";
      if (id === PICOMATCH_REDOS.toLowerCase()) return true;
    }
  }
  return false;
}
