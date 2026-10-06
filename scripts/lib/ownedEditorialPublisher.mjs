
// Operator-only Supabase transport for reviewed editorial packs.
// Raw-table existence checks belong here, outside website serving modules.
import { INVENTORY_EDITORIAL_SUPERSEDED, isReplaceablePlaceholder } from "../../lib/ownedEditorialReview.js";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const issue = (placeId, check, field, value = "") => ({ place_id: placeId || "(pack)", check, field, value: String(value) });
const PROSE = ["hook", "why_here", "know_before", "best_time", "local_tip"];

function restHeaders(key, prefer) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function jsonOrError(response, label) {
  if (!response.ok) throw new Error(`${label} ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json();
}

/** The prior-row facts the audit must preserve before a placeholder is replaced. */
export function priorRowAudit(row) {
  return {
    place_id: clean(row?.place_id),
    verified: row?.verified ?? null,
    issues: Array.isArray(row?.issues) ? row.issues : (row?.issues ?? null),
    written_at: row?.written_at ?? null,
    attempt_count: row?.attempt_count ?? null,
    last_attempted_at: row?.last_attempted_at ?? null,
    standard_version: row?.standard_version ?? null,
    facts_count: Array.isArray(row?.facts) ? row.facts.length : 0,
  };
}

/** Read-only exact-identity and no-existing-row check immediately before write. */
export async function preflightOwnedEditorial(candidates, { url, key, fetchImpl = fetch }) {
  if (!clean(url) || !clean(key)) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const base = clean(url).replace(/\/$/, "");
  const ids = candidates.map((candidate) => clean(candidate.place_id));
  const filter = `in.(${ids.join(",")})`;
  const invQuery = new URLSearchParams({
    select: "place_id,name,category,metro,primary_type,status,needs_review,editorial,editorial_card",
    place_id: filter,
  });
  const editorialQuery = new URLSearchParams({
    select: "place_id,hook,why_here,know_before,best_time,local_tip,facts,verified,issues,written_at,attempt_count,last_attempted_at,standard_version",
    place_id: filter,
  });
  const [inventoryResponse, editorialResponse] = await Promise.all([
    fetchImpl(`${base}/rest/v1/wf_inventory?${invQuery}`, { headers: restHeaders(key) }),
    fetchImpl(`${base}/rest/v1/wf_editorial?${editorialQuery}`, { headers: restHeaders(key) }),
  ]);
  const [inventoryRows, editorialRows] = await Promise.all([
    jsonOrError(inventoryResponse, "wf_inventory preflight"),
    jsonOrError(editorialResponse, "wf_editorial preflight"),
  ]);
  if (!Array.isArray(inventoryRows) || !Array.isArray(editorialRows)) {
    throw new Error("editorial preflight did not return row arrays");
  }
  const inventoryById = new Map(inventoryRows.map((row) => [row.place_id, row]));
  const existingById = new Map(editorialRows.map((row) => [row.place_id, row]));
  const errors = [];
  const reports = [];
  for (const candidate of candidates) {
    const pid = clean(candidate.place_id);
    const found = inventoryById.get(pid);
    if (!found) {
      errors.push(issue(pid, "inventory-missing", "place_id", pid));
      continue;
    }
    for (const field of ["name", "category", "metro", "primary_type"]) {
      if (clean(found[field]) !== clean(candidate[field])) errors.push(issue(pid, "identity-drift", field, `${candidate[field]} != ${found[field]}`));
    }
    if (found.status !== "OPERATIONAL") errors.push(issue(pid, "not-operational", "status", found.status));
    if (found.needs_review !== false) errors.push(issue(pid, "needs-review", "needs_review", found.needs_review));
    if (found.category === "excluded") errors.push(issue(pid, "excluded", "category", found.category));

    // An existing wf_editorial row is replaceable ONLY when it is a never-
    // verified, all-blank placeholder AND the reviewed pack recorded the same
    // state. Any other existing row refuses, exactly as before.
    const existing = existingById.get(pid);
    const replace = Boolean(existing) && isReplaceablePlaceholder(existing);
    if (existing && !replace) errors.push(issue(pid, "already-has-wf-editorial", "place_id", pid));
    if (replace && candidate?.inventory_snapshot?.wf_editorial_present !== true) {
      errors.push(issue(pid, "wf-editorial-snapshot-drift", "inventory_snapshot.wf_editorial_present", "placeholder row exists but the pack recorded none"));
    }

    // Inventory summary: refused unless the owner recorded that the owner row supersedes it.
    const inventoryOccupied = Boolean(clean(found.editorial));
    const superseded = candidate?.inventory_snapshot?.inventory_editorial_disposition === INVENTORY_EDITORIAL_SUPERSEDED;
    if (inventoryOccupied && !superseded) errors.push(issue(pid, "inventory-editorial-occupied", "editorial", "present"));
    if (found.editorial_card != null) errors.push(issue(pid, "inventory-editorial-card-occupied", "editorial_card", "present"));
    reports.push({
      place_id: pid,
      name: found.name,
      wf_editorial_present: Boolean(existing),
      replaces_placeholder: replace,
      prior_row: replace ? priorRowAudit(existing) : null,
      inventory_editorial_present: inventoryOccupied,
      inventory_editorial_disposition: inventoryOccupied && superseded ? INVENTORY_EDITORIAL_SUPERSEDED : "",
      inventory_editorial_card_present: found.editorial_card != null,
    });
  }
  return { ok: errors.length === 0, errors, reports };
}

/** The audit document for placeholder replacements; pure so it can be written before any DB write. */
export function buildReplacementAudit(reports, { pack = "", reviewedBy = "", researchedAt = "", now = new Date().toISOString() } = {}) {
  return {
    schema_version: "owned-editorial-replacement-audit-v1",
    recorded_at: now,
    pack: clean(pack),
    reviewed_by: clean(reviewedBy),
    researched_at: clean(researchedAt),
    replaced: (reports || []).filter((report) => report.replaces_placeholder).map((report) => ({
      place_id: report.place_id,
      name: report.name,
      prior_row: report.prior_row,
      inventory_editorial_disposition: report.inventory_editorial_disposition || "",
    })),
  };
}

// PostgREST filter for the UPDATE guard: never verified AND every prose slot
// null or empty. A race that gives the row real content (or verifies it) makes
// this match zero rows, so nothing is overwritten.
const blank = (field) => `or(${field}.is.null,${field}.eq.)`;
export function placeholderGuardQuery(placeId) {
  return `place_id=eq.${encodeURIComponent(clean(placeId))}&verified=not.is.true&and=(${PROSE.map(blank).join(",")})`;
}

/**
 * Insert missing rows (resolution=ignore-duplicates prevents overwrite). Rows
 * listed in `replacements` (a Set of place_ids preflight proved to be blank,
 * never-verified placeholders) are written with a guarded UPDATE instead, and a
 * guard that matches nothing fails loudly rather than overwriting.
 */
export async function writeOwnedEditorial(rows, { url, key, fetchImpl = fetch }, { replacements = new Set() } = {}) {
  if (!clean(url) || !clean(key)) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const base = clean(url).replace(/\/$/, "");
  const inserts = rows.filter((row) => !replacements.has(clean(row.place_id)));
  const updates = rows.filter((row) => replacements.has(clean(row.place_id)));
  const saved = [];

  if (inserts.length) {
    const endpoint = `${base}/rest/v1/wf_editorial?on_conflict=place_id&select=place_id,verified,issues`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { ...restHeaders(key, "resolution=ignore-duplicates,return=representation"), "Content-Type": "application/json" },
      body: JSON.stringify(inserts),
    });
    const got = await jsonOrError(response, "wf_editorial insert");
    if (!Array.isArray(got)) throw new Error("wf_editorial insert did not return a row array");
    if (got.length !== inserts.length) throw new Error(`wf_editorial insert persisted ${got.length}/${inserts.length}; a row appeared after preflight or was rejected`);
    const expected = new Set(inserts.map((row) => clean(row.place_id)));
    const returned = got.map((row) => clean(row.place_id));
    if (new Set(returned).size !== returned.length || expected.size !== returned.length || returned.some((pid) => !expected.has(pid))) {
      throw new Error("wf_editorial insert returned duplicate or unrelated place IDs");
    }
    saved.push(...got);
  }

  for (const row of updates) {
    const { place_id: placeId, ...fields } = row;
    const endpoint = `${base}/rest/v1/wf_editorial?${placeholderGuardQuery(placeId)}&select=place_id,verified,issues`;
    const response = await fetchImpl(endpoint, {
      method: "PATCH",
      headers: { ...restHeaders(key, "return=representation"), "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const got = await jsonOrError(response, "wf_editorial placeholder update");
    if (!Array.isArray(got)) throw new Error("wf_editorial placeholder update did not return a row array");
    if (got.length !== 1 || clean(got[0].place_id) !== clean(placeId)) {
      throw new Error(`wf_editorial placeholder update matched ${got.length}/1 for ${placeId}; the row changed after preflight and was not overwritten`);
    }
    saved.push(got[0]);
  }

  const bad = saved.filter((row) => row.verified !== true || row.issues != null);
  if (bad.length) throw new Error(`wf_editorial write returned ${bad.length} unpublishable row(s)`);
  return saved;
}
