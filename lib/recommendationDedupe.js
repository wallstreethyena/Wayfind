// One venue, one homepage recommendation menu.
//
// A place can legitimately qualify for several ranked questions (a brewery is
// food, nightlife, a hidden gem and a creator find). Repeating it in every rail
// makes those questions look like aliases. These helpers preserve each rail's
// existing order while removing identities already claimed by an earlier menu.

const text = (v) => String(v == null ? "" : v).trim();

export function recommendationId(row) {
  if (!row) return "";
  if (row.kind === "experience") return text(row.id && `experience:${row.id}`);
  return text(
    row.place_id || row.placeId || row.id ||
    (row.p && (row.p.place_id || row.p.id)) ||
    (row.row && row.row.p && (row.row.p.place_id || row.row.p.id)) ||
    ""
  );
}

export function uniqueRecommendations(rows, excludedIds = [], limit = Infinity) {
  const seen = new Set(Array.from(excludedIds || [], (id) => text(id)).filter(Boolean));
  const out = [];
  const max = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : Infinity;
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = recommendationId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

export function recommendationIds(rows) {
  return uniqueRecommendations(rows).map(recommendationId).filter(Boolean);
}
