// lib/trendCsv.js — a deterministic CSV reader for a manually exported
// Exploding Topics snapshot. No LLM, no network, no heuristics.
//
// ⚠ THE SCHEMA BELOW IS DECLARED, NOT VERIFIED AGAINST A REAL EXPORT.
// At the time of writing, EXPLODING_TOPICS_RIGHTS_MODE is "unconfirmed", so this
// lane has never opened the owner's actual CSV — deliberately, because reading it
// is one of the things the licence has not yet cleared. Every column name here is
// therefore a HYPOTHESIS about Semrush's export format, sourced from their public
// UI vocabulary.
//
// That is why the parser is CONFIGURABLE and why an unrecognised header is a hard
// failure rather than a shrug. The dangerous version of this file is one that
// guesses a column, finds nothing, defaults to zero, and produces a snapshot full
// of topics with 0% growth that look like real data (AGENTS.md §5b — the
// plausible empty). When the owner runs the first real import, unknown or missing
// columns will name themselves in the error, and the fix is to edit COLUMN_SPECS
// — one place, in the open.
//
// NEVER: log a whole source row (it is licensed content), commit a CSV, or hand
// a raw row to a client. The importer reports COUNTS and REASONS; the rows stay
// server-side.

import { createHash } from "node:crypto";

/** Bump when COLUMN_SPECS changes shape. Stored on every snapshot row. */
export const SCHEMA_VERSION = "et-csv-v1-declared";

/**
 * Column contract.
 *
 * `aliases` are the header spellings accepted for one logical field —
 * case/spacing/punctuation insensitive after normalisation. `required` fields
 * failing means the file is not an Exploding Topics export we understand, and
 * the import writes nothing.
 *
 * `kind` drives coercion and is the reason forecasts can never be silently read
 * as observed data: they are separate fields with separate names, and
 * trendStrength.js reads only the observed ones.
 */
export const COLUMN_SPECS = [
  { field: "topic_key",      kind: "string", required: true,  aliases: ["topic id", "id", "slug", "topic slug", "path", "topic path"] },
  { field: "topic",          kind: "string", required: true,  aliases: ["topic", "topic name", "name", "keyword"] },
  { field: "source_category",kind: "string", required: true,  aliases: ["category", "source category", "industry", "vertical"] },
  { field: "classification", kind: "string", required: true,  aliases: ["status", "classification", "trend status", "state"] },
  { field: "search_volume",  kind: "number", required: true,  aliases: ["volume", "search volume", "monthly searches", "monthly search volume", "msv"] },
  { field: "observed_at",    kind: "date",   required: true,  aliases: ["date", "observed date", "as of", "data date", "snapshot date"] },

  // Observed growth. At least one must be present and parseable — enforced by
  // validateSchema, not by a per-column `required`, because Semrush's export
  // may legitimately carry 6mo but not 3mo depending on the filter used.
  { field: "growth_3mo",     kind: "percent", required: false, aliases: ["3 month growth", "growth 3m", "3mo", "3 months"] },
  { field: "growth_6mo",     kind: "percent", required: false, aliases: ["6 month growth", "growth 6m", "6mo", "6 months"] },
  { field: "growth_12mo",    kind: "percent", required: false, aliases: ["12 month growth", "growth 12m", "12mo", "1 year", "yoy", "year over year"] },
  { field: "growth_longterm",kind: "percent", required: false, aliases: ["5 year growth", "growth 5y", "long term growth", "60 month growth"] },

  // FORECAST — structurally separated from observed growth and never merged into
  // it. lib/trendStrength.js does not read these fields at all in v1.
  { field: "forecast_growth",kind: "percent", required: false, aliases: ["forecast", "forecast growth", "predicted growth", "projection"] },

  { field: "volatility",     kind: "number",  required: false, aliases: ["volatility", "variance"] },
  { field: "stability",      kind: "number",  required: false, aliases: ["stability", "consistency"] },
  { field: "seasonal",       kind: "bool",    required: false, aliases: ["seasonal", "is seasonal", "seasonality"] },
  { field: "channel",        kind: "string",  required: false, aliases: ["channel", "channels", "breakdown", "platform"] },
  { field: "exported_at",    kind: "date",    required: false, aliases: ["export date", "exported", "downloaded"] },
];

const REQUIRED_FIELDS = COLUMN_SPECS.filter((s) => s.required).map((s) => s.field);
const GROWTH_FIELDS = ["growth_3mo", "growth_6mo", "growth_12mo", "growth_longterm"];
export { REQUIRED_FIELDS, GROWTH_FIELDS };

const normHeader = (h) => String(h == null ? "" : h).toLowerCase().replace(/[_\-.]+/g, " ").replace(/[^a-z0-9 %]+/g, "").replace(/\s+/g, " ").trim();

/**
 * RFC4180-ish CSV split. Handles quoted fields, embedded commas/newlines and
 * doubled quotes. Deliberately hand-written and dependency-free: this parses
 * licensed data, and a transitive dependency on the path that reads it is a
 * supply-chain surface for no benefit.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const src = String(text || "").replace(/^﻿/, ""); // strip BOM — Excel exports carry one
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  // A trailing field/row with content, or a file with no final newline.
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // An unterminated quote means the file is truncated or malformed. Say so —
  // silently accepting it yields a last row containing the rest of the file.
  if (inQuotes) throw new Error("malformed CSV: unterminated quoted field (the file may be truncated)");
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

/**
 * CSV FORMULA INJECTION. A cell beginning = + - @ TAB or CR is executed as a
 * formula when the operator opens the file in Excel/Sheets. This system writes
 * operator-facing reports, so a hostile topic name could reach a spreadsheet on
 * the owner's machine.
 *
 * Neutralise by prefixing an apostrophe rather than stripping: the value stays
 * legible and auditable, and the cell is inert. Returns { value, sanitized }.
 */
export function sanitizeCell(raw) {
  const s = String(raw == null ? "" : raw);
  if (/^[=+\-@\t\r]/.test(s)) return { value: "'" + s, sanitized: true };
  return { value: s, sanitized: false };
}

const coerce = {
  string: (v) => (String(v).trim() || null),
  number: (v) => {
    const s = String(v).replace(/[, ]/g, "").replace(/[^0-9.eE+-]/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  },
  // "+190%" / "190%" / "1.9x" / "190" all mean the same growth. Normalised to a
  // RATIO (1.9 = +190%), because a percentage that is sometimes a multiplier is
  // how a 190% growth becomes a 19000% growth in one careless read.
  percent: (v) => {
    const s = String(v).trim();
    if (!s) return null;
    const mx = s.match(/^([+-]?[\d.,]+)\s*x$/i);
    if (mx) { const n = Number(mx[1].replace(/,/g, "")); return Number.isFinite(n) ? n - 1 : null; }
    const n = Number(s.replace(/[%+,\s]/g, ""));
    if (!Number.isFinite(n)) return null;
    return n / 100;
  },
  date: (v) => {
    const s = String(v).trim();
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  },
  bool: (v) => {
    const s = String(v).trim().toLowerCase();
    if (!s) return null;
    if (["true", "yes", "y", "1"].includes(s)) return true;
    if (["false", "no", "n", "0"].includes(s)) return false;
    return null;
  },
};

/**
 * Map the header row onto COLUMN_SPECS.
 *
 * Fails loudly and specifically:
 *   - a required column absent → names the field AND the aliases it accepts
 *   - no observed-growth column at all → the file cannot support a trend verdict
 *   - two headers claiming one field → ambiguous, refuse rather than pick
 *
 * Unknown EXTRA columns are reported but tolerated: Semrush adding a column
 * should not break an import, whereas Semrush RENAMING one must.
 */
export function validateSchema(headerRow) {
  const headers = (headerRow || []).map(normHeader);
  const map = {}, ambiguous = [], unknown = [];
  const claimed = new Set();

  for (const spec of COLUMN_SPECS) {
    const idxs = [];
    headers.forEach((h, i) => { if (h && spec.aliases.some((a) => normHeader(a) === h)) idxs.push(i); });
    if (idxs.length > 1) ambiguous.push(`${spec.field} (columns ${idxs.map((i) => i + 1).join(", ")})`);
    if (idxs.length >= 1) { map[spec.field] = idxs[0]; claimed.add(idxs[0]); }
  }
  headers.forEach((h, i) => { if (h && !claimed.has(i)) unknown.push(h); });

  const missing = REQUIRED_FIELDS.filter((f) => map[f] === undefined);
  const growth = GROWTH_FIELDS.filter((f) => map[f] !== undefined);

  const errors = [];
  if (missing.length) {
    errors.push(
      `missing required column(s): ${missing.join(", ")}. ` +
      missing.map((f) => {
        const s = COLUMN_SPECS.find((x) => x.field === f);
        return `"${f}" accepts headers: ${s.aliases.join(" | ")}`;
      }).join("; ") +
      `. If the real export spells these differently, add the spelling to COLUMN_SPECS in lib/trendCsv.js — do not rename the file's headers by hand.`
    );
  }
  if (!growth.length) {
    errors.push(
      `no observed-growth column found (need at least one of: ${GROWTH_FIELDS.join(", ")}). ` +
      `A snapshot without measured growth cannot produce a trend verdict, and a forecast column is not a substitute.`
    );
  }
  if (ambiguous.length) errors.push(`ambiguous columns — two headers map to one field: ${ambiguous.join(", ")}`);

  return { ok: errors.length === 0, map, errors, unknown, growthFields: growth, schemaVersion: SCHEMA_VERSION };
}

/** Stable content hash of the source file — the idempotency key for an import. */
export function sourceHash(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

/**
 * Parse a whole snapshot. PURE — no I/O, so the guards run it on fixtures
 * without touching a database or a real export.
 *
 * Returns accepted rows, rejected rows WITH REASONS, and duplicate rows. Every
 * row lands in exactly one bucket, and `requested === accepted + rejected +
 * duplicates` is asserted by the caller — a row that silently disappears is the
 * failure this counting exists to make impossible.
 */
export function readSnapshot(text) {
  const hash = sourceHash(text);
  let rows;
  try { rows = parseCsv(text); }
  catch (e) { return { ok: false, status: "failed", hash, errors: [String(e.message)], accepted: [], rejected: [], duplicates: [] }; }

  if (rows.length < 2) {
    return { ok: false, status: "failed", hash, errors: ["file has no data rows (a header alone is not a snapshot)"], accepted: [], rejected: [], duplicates: [] };
  }

  const schema = validateSchema(rows[0]);
  if (!schema.ok) {
    // NOTHING is written on a schema failure — not even the valid-looking rows.
    // A partially-understood file produces a partially-wrong snapshot, and a
    // wrong ranking input is worse than an absent one.
    return { ok: false, status: "failed", hash, errors: schema.errors, unknownColumns: schema.unknown, accepted: [], rejected: [], duplicates: [] };
  }

  const accepted = [], rejected = [], duplicates = [];
  const seen = new Map();
  let sanitizedCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    const lineNo = r + 1;
    // SANITIZE STRINGS ONLY — and this distinction is load-bearing, not a
    // micro-optimisation. A growth cell legitimately reads "+41%" and a negative
    // one reads "-8%"; both start with a character on the formula-injection list.
    // Neutralising those turns "+41%" into "'+41%", which parses as nothing, and
    // the whole snapshot lands with zero measurable growth — a file full of
    // real data reading as a file full of nothing (AGENTS.md §5b).
    //
    // Numeric/percent/date/bool cells cannot carry an injection anyway: their
    // coercion produces a Number or an ISO string and never passes raw text
    // through. The injection risk is exactly the fields whose TEXT survives into
    // an operator-facing report — topic names, categories, classifications — so
    // that is precisely where the guard is applied.
    const get = (field, kind) => {
      const i = schema.map[field];
      if (i === undefined || i >= raw.length) return null;
      if (kind !== "string") return raw[i];
      const { value, sanitized } = sanitizeCell(raw[i]);
      if (sanitized) sanitizedCount++;
      return value;
    };

    const rec = { _line: lineNo };
    for (const spec of COLUMN_SPECS) {
      if (schema.map[spec.field] === undefined) { rec[spec.field] = null; continue; }
      rec[spec.field] = coerce[spec.kind](get(spec.field, spec.kind));
    }

    // Required-value check. An empty required cell is a malformed row, not a
    // zero — this is the §5 corollary applied per row.
    const emptyRequired = REQUIRED_FIELDS.filter((f) => rec[f] === null || rec[f] === "");
    if (emptyRequired.length) {
      // The row number and the FIELD names, never the row's content — the values
      // are licensed and must not reach a log.
      rejected.push({ line: lineNo, topic_key: rec.topic_key || null, reason: `empty required value(s): ${emptyRequired.join(", ")}` });
      continue;
    }
    if (!schema.growthFields.some((f) => rec[f] !== null)) {
      rejected.push({ line: lineNo, topic_key: rec.topic_key, reason: "no parseable observed-growth value in any growth column" });
      continue;
    }

    // Deterministic dedup: FIRST occurrence of a topic_key wins, later ones are
    // duplicates. Deterministic matters because the same file must import
    // identically every time — "last wins" would make row order load-bearing.
    const key = String(rec.topic_key).toLowerCase();
    if (seen.has(key)) {
      duplicates.push({ line: lineNo, topic_key: rec.topic_key, reason: `duplicate topic_key — first seen on line ${seen.get(key)}` });
      continue;
    }
    seen.set(key, lineNo);
    accepted.push(rec);
  }

  const requested = rows.length - 1;
  const counted = accepted.length + rejected.length + duplicates.length;
  if (counted !== requested) {
    // A row that fell out of every bucket. Refuse the whole import rather than
    // report counts that do not add up.
    return { ok: false, status: "failed", hash, errors: [`row accounting mismatch: ${requested} data rows in, ${counted} classified`], accepted: [], rejected: [], duplicates: [] };
  }

  return {
    ok: true,
    // PARTIAL is a real, distinct status: the file parsed and some rows landed,
    // but some did not. Reporting that as "complete" is how a half-imported
    // snapshot silently becomes the ranking input.
    status: rejected.length || duplicates.length ? "partial" : "complete",
    hash, schemaVersion: SCHEMA_VERSION, unknownColumns: schema.unknown,
    growthFields: schema.growthFields,
    requested, accepted, rejected, duplicates, sanitizedCells: sanitizedCount,
  };
}
