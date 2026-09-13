// Operator-only Supabase transport for reviewed editorial packs.
// Raw-table existence checks belong here, outside website serving modules.
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const issue = (placeId, check, field, value = "") => ({ place_id: placeId || "(pack)", check, field, value: String(value) });

function restHeaders(key, prefer) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function jsonOrError(response, label) {
  if (!response.ok) throw new Error(`${label} ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json();
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
  const editorialQuery = new URLSearchParams({ select: "place_id", place_id: filter });
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
  const existing = new Set(editorialRows.map((row) => row.place_id));
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
    if (existing.has(pid)) errors.push(issue(pid, "already-has-wf-editorial", "place_id", pid));
    if (clean(found.editorial)) errors.push(issue(pid, "inventory-editorial-occupied", "editorial", "present"));
    if (found.editorial_card != null) errors.push(issue(pid, "inventory-editorial-card-occupied", "editorial_card", "present"));
    reports.push({
      place_id: pid,
      name: found.name,
      wf_editorial_present: existing.has(pid),
      inventory_editorial_present: Boolean(clean(found.editorial)),
      inventory_editorial_card_present: found.editorial_card != null,
    });
  }
  return { ok: errors.length === 0, errors, reports };
}

/** Insert only missing rows; resolution=ignore-duplicates prevents overwrite. */
export async function writeOwnedEditorial(rows, { url, key, fetchImpl = fetch }) {
  if (!clean(url) || !clean(key)) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const endpoint = `${clean(url).replace(/\/$/, "")}/rest/v1/wf_editorial?on_conflict=place_id&select=place_id,verified,issues`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { ...restHeaders(key, "resolution=ignore-duplicates,return=representation"), "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  const saved = await jsonOrError(response, "wf_editorial insert");
  if (!Array.isArray(saved)) throw new Error("wf_editorial insert did not return a row array");
  if (saved.length !== rows.length) throw new Error(`wf_editorial insert persisted ${saved.length}/${rows.length}; a row appeared after preflight or was rejected`);
  const expected = new Set(rows.map((row) => clean(row.place_id)));
  const returned = saved.map((row) => clean(row.place_id));
  if (new Set(returned).size !== returned.length || expected.size !== returned.length || returned.some((pid) => !expected.has(pid))) {
    throw new Error("wf_editorial insert returned duplicate or unrelated place IDs");
  }
  const bad = saved.filter((row) => row.verified !== true || row.issues != null);
  if (bad.length) throw new Error(`wf_editorial insert returned ${bad.length} unpublishable row(s)`);
  return saved;
}
