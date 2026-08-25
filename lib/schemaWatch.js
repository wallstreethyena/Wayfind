// lib/schemaWatch.js — "the schema is locked down" and "the schema is STILL
// locked down" are separate facts.
//
// THE FAILURE THIS ANSWERS. On 2026-08-25 a Supabase security email arrived
// leading with a stale CRITICAL. Underneath it, unread, were two advisor ERRORs
// and three findings the advisor does not check for at all:
//
//   - wf_affiliate_worklist was a SECURITY DEFINER view, so it ran as postgres,
//     ignored RLS on wf_affiliate_opportunities, and served the entire
//     monetisation worklist to anyone holding the publishable key;
//   - wf_promotion_enqueue_by_score was anon-callable and enqueues work the cron
//     drains through PAID Google Place Details calls;
//   - anon held TRUNCATE on all 60 public tables (RLS does not restrict
//     TRUNCATE) and 88 INSERT/UPDATE/DELETE grants with no policy behind them.
//
// None of that was new. security_hardening_v1..v4 (27 Jul, 28 Jul, 13 Aug) had
// each locked down the objects that existed at the time, and the next migration
// created new ones born wide open, because ALTER DEFAULT PRIVILEGES granted anon
// ALL on every new table and EXECUTE on every new function. v5 fixed the default.
//
// WHY THIS FILE EXISTS ANYWAY. Fixing the default stops objects being BORN
// exposed. It does not stop someone writing `grant insert ... to anon` by hand,
// it does not cover objects created by supabase_admin (whose defaults postgres
// cannot alter), and it cannot see a policy dropped later. The default is
// prevention; wf_schema_audit() + /api/cron/schema-watch are detection.
//
// WHY NOT A BUILD GUARD. 129 migrations have been applied to this project and
// 10 exist as files in the repo. The schema is the one part of Wayfind that
// never passes through a commit, and check-guard-hermeticity rightly forbids a
// guard from holding a live credential — so a repo guard is structurally blind
// here. The invariants live in the database; this file only classifies them.
//
// Pure. No I/O, so every threshold is unit-testable without a database.

// Loudest first. 'info' rows are context (recent migrations), never an alarm.
export const SEVERITY_ORDER = { critical: 0, high: 1, warn: 2, info: 3 };

// What is worth waking someone for. A 'warn' is real but survives until the
// weekly read; critical/high mean the anon key can reach something it should
// not, right now.
export const ALARM_SEVERITIES = ["critical", "high"];

/**
 * Split audit rows into findings (actionable) and context (informational).
 *
 * Returns { findings, context, counts, scanned, alarming }.
 *   findings  critical/high/warn, sorted loudest first
 *   context   the info rows — recent migrations, i.e. what a finding arrived in
 *   alarming  true when anything critical or high is present
 *
 * An UNKNOWN severity is treated as 'high', not dropped. A row this code does
 * not recognise is a row a future migration added to the audit, and silently
 * discarding it would reproduce the exact failure mode the audit exists to
 * catch — an absence of reporting reading as an absence of problems.
 */
export function classifyAudit(rows) {
  const findings = [], context = [];
  for (const r of rows || []) {
    const sev = String(r && r.severity || "").toLowerCase();
    const known = Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, sev);
    const row = { ...r, severity: known ? sev : "high" };
    if (row.severity === "info") context.push(row);
    else findings.push(row);
  }
  findings.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return s !== 0 ? s : String(a.kind || "").localeCompare(String(b.kind || ""));
  });
  const counts = { critical: 0, high: 0, warn: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity]++;
  return {
    findings,
    context,
    counts,
    scanned: (rows || []).length,
    alarming: ALARM_SEVERITIES.some((s) => counts[s] > 0),
  };
}

/** One line per finding, actionable without opening a dashboard. */
export function findingLine(f) {
  return `${String(f.severity || "").toUpperCase()} ${f.kind} ${f.object} — ${f.detail}`;
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function emailHtml({ findings, counts, context }) {
  const rows = (findings || []).map((f) => {
    const color = f.severity === "critical" ? "#b91c1c" : f.severity === "high" ? "#c2410c" : "#a16207";
    return `<li style="margin:8px 0"><b style="color:${color}">${esc(f.severity).toUpperCase()}</b> `
      + `<code>${esc(f.kind)}</code> · <code>${esc(f.object)}</code>`
      + `<br><span style="color:#555">${esc(f.detail)}</span></li>`;
  }).join("");
  const recent = (context || []).slice(0, 8)
    .map((c) => `<li style="margin:3px 0"><code>${esc(c.object)}</code> ${esc(c.detail)}</li>`).join("");
  return `<div style="font:14px/1.5 -apple-system,system-ui,sans-serif">
    <h2 style="margin:0 0 4px">Wayfind — the database schema drifted back open</h2>
    <p style="color:#666;margin:0 0 14px">Supabase's own advisor does not check most of these. The 2026-08-25 audit found an anon-readable SECURITY DEFINER view serving the affiliate worklist, an anon-callable RPC that spends money on Google calls, and anon holding TRUNCATE on all 60 tables.</p>
    <ul style="padding-left:18px">${rows}</ul>
    <p style="color:#666;margin:16px 0 4px"><b>${counts.critical} critical · ${counts.high} high · ${counts.warn} warn.</b> Migrations applied in the last 8 days — a finding above almost certainly arrived in one of them:</p>
    <ul style="padding-left:18px;color:#666;font-size:13px">${recent || "<li>none</li>"}</ul>
  </div>`;
}
