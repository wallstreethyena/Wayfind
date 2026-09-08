const APPLIED_WITHOUT_LEDGER_ENTRY = {
  "20260729_wf_job_pulse.sql": {
    reason: "Ledger entry is named \"wf_job_pulse_spend_watch\" (20260729192501), not this filename.",
    probes: [{ kind: "table", name: "wf_job_pulse" }, { kind: "function", name: "wf_job_health" }],
  },
  "20260730_wf_cuisine_chips.sql": {
    reason: "Ledger entry is named \"wf_cuisine_chips_floor\" (20260729233040), not this filename.",
    probes: [{ kind: "function", name: "wf_cuisine_chips" }],
  },
  "20260813_wf_promotion_cron_and_lockdown.sql": {
    reason: "Consolidates the applied migrations wf_promotion_cron_jobs (20260813165059) and wf_promotion_lockdown (20260813165147) into one committed file.",
    probes: [{ kind: "view", name: "wf_promotion_health" }],
  },
  "20260822_wf_scout_verdicts.sql": {
    reason: "Ledger entry is named \"scout_verdicts_and_candidates\" (20260822164708), not this filename.",
    probes: [{ kind: "table", name: "wf_scout_verdicts" }, { kind: "function", name: "wf_scout_candidates" }],
  },
  "20260825_security_hardening_v5.sql": {
    reason: "File's own header: \"APPLIED TO PRODUCTION 2026-08-25 as four migrations\" (security_hardening_v5_definer_views_and_rpc_lockdown, security_hardening_v5_table_grants_least_privilege, security_hardening_v5_net_schema_and_default_privileges, fix_two_silent_rls_denials_comments_delete_and_waitlist_signed_in — all four ARE in the ledger; the repo file is a consolidated record with its own different derived name).",
    probes: [{ kind: "view", name: "wf_affiliate_worklist" }, { kind: "view", name: "wf_beach_water_geo" }],
  },
  "20260825_wf_client_permissions.sql": {
    reason: "Ledger entry is named \"wf_client_permissions_snapshot_source\" (20260825221345), not this filename.",
    probes: [{ kind: "function", name: "wf_client_permissions" }],
  },
  "20260825_wf_schema_audit.sql": {
    reason: "File's own header: \"APPLIED TO PRODUCTION 2026-08-25 as migration wf_schema_audit_exposure_watchdog\" (in the ledger; different derived name). Also independently corroborated live: app/api/cron/schema-watch/route.js calls this function in production.",
    probes: [{ kind: "function", name: "wf_schema_audit" }],
  },
  "20260904_editorial_publish_gate_symmetry.sql": {
    reason: "Applied directly against production 2026-09-04, not through migration tooling — no schema_migrations row exists for it. This file is the committed record.",
    probes: [{ kind: "constraint", name: "wf_editorial_verified_needs_content" }],
  },
  "20260905_editorial_read_gate.sql": {
    reason: "File's own header: \"APPLIED LIVE 2026-09-05 ... PROVEN BY PROBE\" — applied directly, no migration-tooling record exists.",
    probes: [{ kind: "view", name: "wf_editorial_servable" }],
  },
  "20260905_editorial_requires_servable_place.sql": {
    reason: "File's own header: \"APPLIED LIVE 2026-09-05 ... PROVEN BY PROBE\" — applied directly, no migration-tooling record exists.",
    probes: [{ kind: "trigger", name: "wf_editorial_servable_place" }, { kind: "function", name: "wf_editorial_requires_servable_place" }],
  },
};

export function parseFileName(f) {
  const m = f.match(/^(\d{8,14})_(.+)\.sql$/);
  return m ? { version: m[1], name: m[2] } : null;
}

// Pure comparator — reconciles one file against a ledger name-set and an
// object-existence set. Exported shape so the self-test below exercises the
// EXACT function the real run uses, not a re-implementation of it.
export function reconcile(file, ledgerNames, objectSet) {
  const parsed = parseFileName(file);
  if (!parsed) return { status: "fail", detail: `filename does not match the <version>_<name>.sql convention — cannot even attempt to reconcile it` };
  if (ledgerNames.has(parsed.name)) return { status: "ok", via: "ledger" };
  const allow = APPLIED_WITHOUT_LEDGER_ENTRY[file];
  if (allow) {
    const missing = allow.probes.filter((p) => !objectSet.has(`${p.kind}:${p.name}`));
    if (missing.length === 0) return { status: "ok", via: "allowlist" };
    return { status: "fail", detail: `allowlisted ("${allow.reason}") but the object(s) it claims are live no longer exist: ${missing.map((p) => `${p.kind} ${p.name}`).join(", ")} — the allowlist entry is stale, or this was rolled back` };
  }
  return { status: "unresolved" }; // every unresolved file fails
}


// Supabase assigns versions at apply time; canonical files match unique names.
// Historical exceptions pin the exact version, name and statement-array hash.
export function reconcileProduction(files, ledger, exceptions) {
  const errors = [], canonical = new Map(), pins = new Map(), seen = new Set(), names = new Map();
  for (const file of files) {
    const parsed = parseFileName(file);
    if (!parsed) { errors.push(`invalid migration filename: ${file}`); continue; }
    if (canonical.has(parsed.name)) errors.push(`ambiguous canonical migration: ${parsed.name}`);
    canonical.set(parsed.name, file);
  }
  if (!Array.isArray(ledger) || !ledger.length) return {errors: [...errors, 'empty or invalid production ledger']};
  if (!Array.isArray(exceptions)) return {errors: [...errors, 'invalid historical exception manifest']};
  for (const pin of exceptions) {
    if (!pin || typeof pin.version !== 'string' || !/^\d{8,14}$/.test(pin.version) || typeof pin.name !== 'string' || !pin.name ||
        !/^[a-f0-9]{64}$/.test(pin.statements_sha256) || typeof pin.reason !== 'string' || !pin.reason.trim() || typeof pin.reviewed_by !== 'string' || !pin.reviewed_by.trim()) {
      errors.push('malformed historical exception'); continue;
    }
    if (pins.has(pin.version)) errors.push(`duplicate historical exception: ${pin.version}`);
    pins.set(pin.version, pin);
  }
  for (const row of ledger) names.set(row?.name, (names.get(row?.name) || 0) + 1);
  for (const row of ledger) {
    if (!row || typeof row.version !== 'string' || typeof row.name !== 'string' || !/^[a-f0-9]{64}$/.test(row.statements_sha256)) {
      errors.push('invalid production ledger row or missing statement hash'); continue;
    }
    if (seen.has(row.version)) errors.push(`duplicate production version: ${row.version}`);
    seen.add(row.version);
    const pin = pins.get(row.version);
    if (pin) {
      if (pin.name !== row.name || pin.statements_sha256 !== row.statements_sha256) errors.push(`historical exception mismatch: ${row.version} / ${row.name}`);
      if (pin.canonical_file !== undefined) {
        if (typeof pin.canonical_file !== 'string' || !parseFileName(pin.canonical_file) || !files.includes(pin.canonical_file))
          errors.push(`historical mapping canonical file missing or invalid: ${row.version}`);
      } else if (canonical.has(row.name)) {
        errors.push(`historical exception now has a canonical file: ${row.name}; review and map the exact file`);
      }
    } else if (!canonical.has(row.name) || names.get(row.name) !== 1) errors.push(`unreviewed production migration: ${row.version} / ${row.name}`);
  }
  for (const version of pins.keys()) if (!seen.has(version)) errors.push(`historical exception absent from production: ${version}`);
  return { errors };
}
