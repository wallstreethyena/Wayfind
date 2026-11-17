// scripts/lib/npmAuditException.mjs
//
// The one allowed miss in the GitHub dependency audit.
//
// GHSA-fc5q-39xc-vjpf — picomatch ReDoS through repeated extglobs.
// https://github.com/advisories/GHSA-fc5q-39xc-vjpf
// Build-time only. The inputs are our own patterns. No patched release exists.
// Approved by Gabe 2026-11-17.
//
// The exception stops by itself:
//   - on 2027-02-01 UTC (it is valid through 2027-01-31 UTC), and
//   - sooner, if npm publishes any picomatch version outside the advisory's
//     vulnerable range.
// Every other moderate, high, or critical advisory still fails the audit.

import semver from "semver";

export const PICO_AUDIT_GHSA = "GHSA-fc5q-39xc-vjpf";
export const PICO_AUDIT_EXPIRY = "2027-01-31";
export const PICO_AUDIT_URL = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";

const FAIL_SEVERITIES = new Set(["moderate", "high", "critical"]);

function advisoryId(via) {
  const url = String(via && via.url || "");
  const match = url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i);
  return match ? match[0].toLowerCase() : "";
}

/** Moderate-or-worse advisory objects. String `via` entries are transitive. */
export function moderateAdvisories(audit) {
  const vulns = audit && audit.vulnerabilities;
  if (!vulns || typeof vulns !== "object") return [];
  const out = [];
  for (const vuln of Object.values(vulns)) {
    const vias = vuln && Array.isArray(vuln.via) ? vuln.via : [];
    for (const via of vias) {
      if (!via || typeof via !== "object") continue;
      const severity = String(via.severity || vuln.severity || "").toLowerCase();
      if (!FAIL_SEVERITIES.has(severity)) continue;
      out.push({
        id: advisoryId(via),
        url: String(via.url || ""),
        name: String(via.name || vuln.name || ""),
        severity,
        range: String(via.range || "").trim().replace(/\s+/g, ""),
        title: String(via.title || ""),
      });
    }
  }
  return out;
}

/**
 * The picomatch exception is active only while every published version is
 * still inside the advisory range and the hard date has not passed.
 * `versions` must be the full npm version list. An empty list cannot prove
 * that no patch exists.
 */
export function picoExceptionActive({ today, versions, vulnerableRange }) {
  if (String(today || "") > PICO_AUDIT_EXPIRY) {
    return { active: false, reason: "expired" };
  }
  const range = String(vulnerableRange || "").trim();
  if (!range) return { active: false, reason: "range-missing" };
  if (!Array.isArray(versions) || versions.length === 0) {
    return { active: false, reason: "versions-unknown" };
  }
  let comparable = 0;
  for (const version of versions) {
    if (!semver.valid(version)) continue;
    comparable += 1;
    let inside;
    try {
      inside = semver.satisfies(version, range, { includePrerelease: true });
    } catch {
      return { active: false, reason: "range-unreadable" };
    }
    if (!inside) return { active: false, reason: "patched-version", version: String(version) };
  }
  if (comparable === 0) return { active: false, reason: "versions-unknown" };
  return { active: true, reason: "unpatched" };
}

/**
 * @returns {{ fail: boolean, reason: string, advisories?: object[] }}
 * fail false: clean, or the single approved picomatch advisory while the
 * exception is still active. Anything else fails, including that advisory
 * once the exception has expired.
 */
export function auditDecision({ audit, today, versions }) {
  const advisories = moderateAdvisories(audit);
  if (advisories.length === 0) return { fail: false, reason: "clean" };
  const allowedId = PICO_AUDIT_GHSA.toLowerCase();
  const other = advisories.filter((item) => item.id !== allowedId);
  if (other.length > 0) return { fail: true, reason: "other-advisories", advisories: other };
  const ranges = [...new Set(advisories.map((item) => item.range).filter(Boolean))];
  if (ranges.length !== 1) return { fail: true, reason: "range-unclear", advisories };
  const exception = picoExceptionActive({ today, versions, vulnerableRange: ranges[0] });
  if (!exception.active) {
    return { fail: true, reason: exception.reason, advisories, version: exception.version, range: ranges[0] };
  }
  return { fail: false, reason: "exception", range: ranges[0] };
}
