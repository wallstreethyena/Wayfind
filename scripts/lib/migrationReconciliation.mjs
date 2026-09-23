import crypto from "node:crypto";

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

export function canonicalFileStem(file) {
  return typeof file === "string" && file.endsWith(".sql") ? file.slice(0, -4) : null;
}

// wf_migration_ledger_hashes() hashes PostgreSQL to_json(text[])::text. For a
// Management-API migration sent as one whole SQL file, that is byte-for-byte
// equivalent to JSON.stringify([sql]) in Node. Keep this helper pure so both
// the live guard and hermetic red-proofs use the exact same transformation.
export function migrationStatementArrayHash(statements) {
  if (!Array.isArray(statements)) return null;
  return crypto.createHash("sha256").update(JSON.stringify(statements), "utf8").digest("hex");
}

export function canonicalSingleStatementHash(sql) {
  return typeof sql === "string" ? migrationStatementArrayHash([sql]) : null;
}

// Pure comparator — reconciles one file against the actual production ledger
// and object-existence set. A normal logical-name ledger row keeps the old
// behavior. A Supabase apply that recorded the WHOLE FILE STEM as `name` is
// accepted only when its statement-array hash exactly matches this file.
export function reconcile(file, ledgerRows, objectSet, canonicalHash = null) {
  const parsed = parseFileName(file);
  if (!parsed) return { status: "fail", detail: `filename does not match the <version>_<name>.sql convention — cannot even attempt to reconcile it` };
  if (!Array.isArray(ledgerRows)) return { status: "fail", detail: "production ledger is not an array" };

  const logicalRows = ledgerRows.filter((row) => row?.name === parsed.name);
  if (logicalRows.length) return { status: "ok", via: "ledger" };

  const stem = canonicalFileStem(file);
  const stemRows = ledgerRows.filter((row) => row?.name === stem);
  if (stemRows.length) {
    if (stemRows.length !== 1) return { status: "fail", detail: `filename-stem ledger alias ${stem} appears ${stemRows.length} times — one canonical file cannot prove multiple applies` };
    if (!/^[a-f0-9]{64}$/.test(canonicalHash || "")) return { status: "fail", detail: `filename-stem ledger alias ${stem} cannot be verified because the canonical statement hash is missing` };
    if (stemRows[0].statements_sha256 !== canonicalHash) return { status: "fail", detail: `filename-stem ledger alias ${stem} exists but its statement hash does not match the committed migration file` };
    return { status: "ok", via: "ledger-filename-stem-hash" };
  }

  const allow = APPLIED_WITHOUT_LEDGER_ENTRY[file];
  if (allow) {
    const missing = allow.probes.filter((p) => !objectSet.has(`${p.kind}:${p.name}`));
    if (missing.length === 0) return { status: "ok", via: "allowlist" };
    return { status: "fail", detail: `allowlisted ("${allow.reason}") but the object(s) it claims are live no longer exist: ${missing.map((p) => `${p.kind} ${p.name}`).join(", ")} — the allowlist entry is stale, or this was rolled back` };
  }
  return { status: "unresolved" }; // every unresolved file fails
}

// Supabase assigns versions at apply time; canonical files normally match
// unique logical names. Some Management-API callers have historically stored
// the whole canonical filename stem as `name`; that spelling is accepted only
// with exact statement-array hash proof. Historical exceptions remain exact
// version/name/hash pins.
export function reconcileProduction(files, ledger, exceptions, canonicalHashes = new Map()) {
  const errors = [], canonical = new Map(), stems = new Map(), pins = new Map(), seen = new Set(), names = new Map(), claimedFiles = new Map();
  for (const file of files) {
    const parsed = parseFileName(file);
    if (!parsed) { errors.push(`invalid migration filename: ${file}`); continue; }
    if (canonical.has(parsed.name)) errors.push(`ambiguous canonical migration: ${parsed.name}`);
    canonical.set(parsed.name, file);
    const stem = canonicalFileStem(file);
    if (stems.has(stem)) errors.push(`ambiguous canonical filename stem: ${stem}`);
    stems.set(stem, file);
  }
  if (!Array.isArray(ledger) || !ledger.length) return {errors: [...errors, 'empty or invalid production ledger']};
  if (!Array.isArray(exceptions)) return {errors: [...errors, 'invalid historical exception manifest']};
  if (!(canonicalHashes instanceof Map)) return {errors: [...errors, 'invalid canonical migration hash map']};
  for (const pin of exceptions) {
    if (!pin || typeof pin.version !== 'string' || !/^\d{8,14}$/.test(pin.version) || typeof pin.name !== 'string' || !pin.name ||
        !/^[a-f0-9]{64}$/.test(pin.statements_sha256) || typeof pin.reason !== 'string' || !pin.reason.trim() || typeof pin.reviewed_by !== 'string' || !pin.reviewed_by.trim()) {
      errors.push('malformed historical exception'); continue;
    }
    if (pins.has(pin.version)) errors.push(`duplicate historical exception: ${pin.version}`);
    pins.set(pin.version, pin);
  }
  for (const row of ledger) names.set(row?.name, (names.get(row?.name) || 0) + 1);

  function claimCanonical(file, row) {
    const prior = claimedFiles.get(file);
    if (prior) errors.push(`multiple production migrations map to canonical file ${file}: ${prior} and ${row.version}`);
    else claimedFiles.set(file, row.version);
  }

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
      continue;
    }

    const logicalFile = canonical.get(row.name);
    if (logicalFile && names.get(row.name) === 1) {
      claimCanonical(logicalFile, row);
      continue;
    }

    const stemFile = stems.get(row.name);
    if (stemFile && names.get(row.name) === 1) {
      const expectedHash = canonicalHashes.get(stemFile);
      if (!/^[a-f0-9]{64}$/.test(expectedHash || "")) {
        errors.push(`cannot verify filename-stem migration alias: missing canonical statement hash for ${stemFile}`);
      } else if (expectedHash !== row.statements_sha256) {
        errors.push(`filename-stem migration alias hash mismatch: ${row.version} / ${row.name}`);
      } else {
        claimCanonical(stemFile, row);
      }
      continue;
    }

    errors.push(`unreviewed production migration: ${row.version} / ${row.name}`);
  }
  for (const version of pins.keys()) if (!seen.has(version)) errors.push(`historical exception absent from production: ${version}`);
  return { errors };
}

// ── Content integrity: a name match is not proof the SQL is the same ────────
// reconcileProduction() maps a production ledger row to a repo file by logical
// NAME. That proves the migration was applied, not that production ran the SQL
// that is committed. This compares the live statement-array hash of every
// name-matched row with the exact committed file. A difference is drift unless
// a reviewed baseline entry pins BOTH sides by hash, so a later edit to either
// the committed file or the production ledger text fails again. Historical
// exception pins are skipped here: they are already exact hash pins.
// Read-only by construction: it compares hashes and never touches production.
const HEX64 = /^[a-f0-9]{64}$/;
export const CONTENT_BASELINE_KINDS = Object.freeze(["comments-or-whitespace-only", "statement-text-differs"]);

export function verifyLedgerContent({ files, ledger, canonicalHashes, baseline, exceptions = [] }) {
  const errors = [];
  let verified = 0, baselined = 0;
  if (!Array.isArray(files) || !Array.isArray(ledger) || !(canonicalHashes instanceof Map) || !Array.isArray(baseline) || !Array.isArray(exceptions)) {
    return { errors: ["content check received invalid input"], verified, baselined };
  }
  const canonical = new Map();
  for (const file of files) { const parsed = parseFileName(file); if (parsed) canonical.set(parsed.name, file); }
  const names = new Map();
  for (const row of ledger) names.set(row?.name, (names.get(row?.name) || 0) + 1);
  const pinned = new Set(exceptions.map((pin) => pin?.version));
  const entries = new Map();
  for (const entry of baseline) {
    const shapeOk = entry && typeof entry.version === "string" && /^\d{8,14}$/.test(entry.version)
      && typeof entry.name === "string" && entry.name && typeof entry.file === "string" && parseFileName(entry.file)
      && HEX64.test(entry.ledger_sha256 || "") && HEX64.test(entry.file_sha256 || "") && entry.ledger_sha256 !== entry.file_sha256
      && CONTENT_BASELINE_KINDS.includes(entry.kind)
      && typeof entry.reason === "string" && entry.reason.trim().length >= 20
      && typeof entry.reviewed_by === "string" && entry.reviewed_by.trim();
    if (!shapeOk) { errors.push(`malformed content baseline entry: ${entry?.version || "(no version)"}`); continue; }
    if (entries.has(entry.version)) errors.push(`duplicate content baseline entry: ${entry.version}`);
    entries.set(entry.version, entry);
  }
  const used = new Set();
  for (const row of ledger) {
    if (!row || pinned.has(row.version)) continue;
    const file = canonical.get(row.name);
    if (!file || names.get(row.name) !== 1) continue;
    const fileHash = canonicalHashes.get(file);
    if (!HEX64.test(fileHash || "") || !HEX64.test(row.statements_sha256 || "")) {
      errors.push(`content check cannot hash ${file} against production ${row.version} / ${row.name}`);
      continue;
    }
    if (fileHash === row.statements_sha256) { verified++; continue; }
    const entry = entries.get(row.version);
    if (!entry) {
      errors.push(`content drift: supabase/migrations/${file} does not match production ${row.version} / ${row.name} (ledger ${row.statements_sha256.slice(0, 12)}, file ${fileHash.slice(0, 12)}); fix the file or review it into scripts/migration-content-baseline.json`);
      continue;
    }
    used.add(row.version);
    if (entry.name !== row.name || entry.file !== file) errors.push(`content baseline ${row.version} names ${entry.name} / ${entry.file}, but production maps it to ${row.name} / ${file}`);
    else if (entry.ledger_sha256 !== row.statements_sha256) errors.push(`content drift: production ledger text for ${row.version} / ${row.name} changed since it was baselined`);
    else if (entry.file_sha256 !== fileHash) errors.push(`content drift: supabase/migrations/${file} was edited after its difference from production ${row.version} was baselined`);
    else baselined++;
  }
  for (const version of entries.keys()) {
    if (!used.has(version)) errors.push(`stale content baseline entry ${version}: it no longer describes a name-matched production difference (now exact, renamed or gone); remove it`);
  }
  return { errors, verified, baselined };
}
