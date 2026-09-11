#!/usr/bin/env node
// Read-only editorial coverage census. Raw wf_editorial rows are a work ledger;
// coverage is counted separately from content that can actually clear the
// serving and review gates for one canonical place identity.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import atlasCards from "../data/atlas/editorial-cards.json" with { type: "json" };
import { atlasAsRow, atlasCardFor, atlasCardForName, indexAtlasCards, resolveAtlasId } from "../lib/atlasCards.js";
import { editorialFor } from "../lib/editorial.js";
import { knownForLine } from "../lib/knownFor.js";

export const CATEGORIES = ["food", "attractions", "beach", "nightlife", "hotels", "shopping"];
const CARD_PROSE_FIELDS = ["knownFor", "whyGo", "vibeCheck", "insiderMove", "currentUsefulDetail", "verifiedStory"];

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const usableInventoryLine = (value) => clean(value).length >= 24; // /api/known-for's actual floor
const hasCardProse = (card) => !!card && typeof card === "object" && CARD_PROSE_FIELDS.some((field) => clean(card[field]));
const hasCheckedCardSources = (card) => hasCardProse(card)
  && Array.isArray(card.sourceUrls)
  && card.sourceUrls.some((value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } });
const hasLegacyProse = (row) => !!row && ["knownFor", "why", "vibe", "move", "insiderMove", "story"].some((field) => clean(row[field]));
const issuesClear = (row) => row?.issues == null || (Array.isArray(row.issues) && row.issues.length === 0);

function atlasForRow(row, cards, cardIndex) {
  return atlasCardFor(cardIndex, row.place_id) || atlasCardForName(cards, row.name) || null;
}

function canonicalIdFor(row, cards, cardIndex, resolveCanonical) {
  const card = atlasForRow(row, cards, cardIndex);
  return clean(card?.placeId) || clean(resolveCanonical(row.place_id)) || clean(row.place_id);
}

/** Pure coverage model used by the CLI and fixtures. Unknown is never silently reported as a missing page. */
export function buildEditorialCoverage({
  inventory = [], identityInventory = inventory, ledgerRows = [], servableRows = [],
  cards = atlasCards, legacyLookup = editorialFor, resolveCanonical = resolveAtlasId,
  categories = CATEGORIES,
} = {}) {
  const cardIndex = indexAtlasCards(cards);
  const identityById = new Map(identityInventory.map((row) => [clean(row?.place_id), row]));
  const groups = new Map();
  const canonicalByInputId = new Map();
  for (const row of inventory) {
    const placeId = clean(row?.place_id);
    if (!placeId) continue;
    const canonicalId = canonicalIdFor(row, cards, cardIndex, resolveCanonical);
    canonicalByInputId.set(placeId, canonicalId);
    const group = groups.get(canonicalId) || { canonical_id: canonicalId, rows: [] };
    group.rows.push(row);
    groups.set(canonicalId, group);
  }

  const servableByCanonical = new Map();
  for (const row of servableRows) {
    const placeId = clean(row?.place_id);
    const id = canonicalByInputId.get(placeId) || clean(resolveCanonical(placeId));
    if (id && !servableByCanonical.has(id)) servableByCanonical.set(id, row);
  }
  const ledgerCanonical = (row) => {
    const placeId = clean(row?.place_id);
    return canonicalByInputId.get(placeId) || clean(resolveCanonical(placeId));
  };
  const wanted = new Set(groups.keys());
  const scopedLedger = ledgerRows.filter((row) => wanted.has(ledgerCanonical(row)));
  const scopedView = servableRows.filter((row) => wanted.has(ledgerCanonical(row)));
  const ledgerByCanonical = new Map();
  for (const row of scopedLedger) {
    const id = ledgerCanonical(row);
    const list = ledgerByCanonical.get(id) || [];
    list.push(row);
    ledgerByCanonical.set(id, list);
  }

  const totals = Object.fromEntries(["listed", "editorial_available", "stored_card_only", "summary_only", "no_known_content", "review_needed", "suppressed", "unknown"].map((key) => [key, 0]));
  const byCategory = Object.fromEntries(categories.map((category) => [category, { ...totals }]));
  const primarySources = { atlas: 0, wf_editorial: 0, legacy: 0 };
  let overlaps = 0;
  let storedCardOverlaps = 0;

  for (const group of groups.values()) {
    const representative = identityById.get(group.canonical_id)
      || group.rows.find((row) => clean(row.place_id) === group.canonical_id)
      || null;
    const category = clean(representative?.category || group.rows[0]?.category);
    if (!byCategory[category]) continue;
    const bucket = byCategory[category];
    bucket.listed++; totals.listed++;

    if (!representative) {
      bucket.unknown++; totals.unknown++;
      continue;
    }
    if (representative.status !== "OPERATIONAL" || representative.excluded === true) {
      bucket.suppressed++; totals.suppressed++;
      continue;
    }
    if (representative.excluded !== false) {
      bucket.unknown++; totals.unknown++;
      continue;
    }

    const atlas = group.rows.map((row) => atlasForRow(row, cards, cardIndex)).find((card) => knownForLine(atlasAsRow(card)));
    const wf = servableByCanonical.get(group.canonical_id);
    const wfVisible = wf && issuesClear(wf) && !!knownForLine(wf);
    // editorialFor() has a prefix fallback, but /api/editorial gates the
    // returned editorial's own name through an exact inventory lookup. Count
    // it here only when that exact identity is the row being measured.
    const legacy = group.rows.map((row) => ({ row, editorial: legacyLookup(row.name) }))
      .find(({ row, editorial }) => hasLegacyProse(editorial) && clean(editorial.name || row.name) === clean(row.name))?.editorial;
    const sourceCard = group.rows.map((row) => row.editorial_card).find(hasCheckedCardSources);
    const sources = [atlas && "atlas", wfVisible && "wf_editorial", legacy && "legacy"].filter(Boolean);

    if (sources.length) {
      bucket.editorial_available++; totals.editorial_available++;
      primarySources[sources[0]]++;
      if (sources.length > 1) overlaps++;
      if (sourceCard) storedCardOverlaps++;
      continue;
    }
    if (sourceCard) {
      // Inventory editorial_card is stored content, but the generic
      // /api/editorial and /api/known-for paths do not read it. Do not turn a
      // source URL in storage into a claim that readers can see the card.
      bucket.stored_card_only++; totals.stored_card_only++;
      continue;
    }

    const inventoryLine = group.rows.some((row) => usableInventoryLine(row.editorial));
    const unsourcedCard = group.rows.some((row) => hasCardProse(row.editorial_card));
    if (inventoryLine || unsourcedCard) {
      bucket.summary_only++; totals.summary_only++;
    } else if (representative.needs_review === true) {
      bucket.review_needed++; totals.review_needed++;
    } else if (representative.needs_review !== false) {
      bucket.unknown++; totals.unknown++;
    } else if (ledgerByCanonical.has(group.canonical_id) || group.rows.some((row) => clean(row.editorial) || row.editorial_card != null)) {
      bucket.unknown++; totals.unknown++;
    } else {
      bucket.no_known_content++; totals.no_known_content++;
    }
  }

  return {
    byCategory, totals, primarySources, overlaps, storedCardOverlaps,
    ledger: {
      raw_rows: scopedLedger.length,
      verified_rows: scopedLedger.filter((row) => row.verified === true).length,
      verified_issue_free_rows: scopedLedger.filter((row) => row.verified === true && issuesClear(row)).length,
      unverified_or_issued_rows: scopedLedger.filter((row) => row.verified !== true || !issuesClear(row)).length,
      read_gated_view_rows: scopedView.length,
      review_servable_rows: scopedView.filter((row) => {
        const inv = identityById.get(ledgerCanonical(row));
        return inv?.status === "OPERATIONAL" && inv.excluded !== true && inv.needs_review === false;
      }).length,
    },
  };
}

function credentials() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) {
    try {
      const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
      const get = (name) => (file.match(new RegExp("^" + name + "=(.*)$", "m")) || [])[1]?.trim().replace(/^[\"']|[\"']$/g, "") || "";
      url ||= get("NEXT_PUBLIC_SUPABASE_URL");
      key ||= get("SUPABASE_SERVICE_ROLE_KEY") || get("SUPABASE_SERVICE_KEY");
    } catch { /* handled explicitly in main */ }
  }
  return { url: clean(url).replace(/\/$/, ""), key: clean(key) };
}

/** Fetch every PostgREST page and prove the result length equals count=exact. */
export async function fetchComplete(path, { url, key, fetchImpl = fetch, pageSize = 1000 } = {}) {
  const rows = [];
  let total = null;
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetchImpl(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, authorization: "Bearer " + key, accept: "application/json", prefer: "count=exact", range: `${offset}-${offset + pageSize - 1}`, "range-unit": "items" },
    });
    if (!response?.ok) throw new Error(`source failed (${response?.status || "no response"}): ${path.slice(0, 80)}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`source returned a non-array: ${path.slice(0, 80)}`);
    const range = response.headers?.get?.("content-range") || "";
    const match = /^(?:\d+-\d+|\*)\/(\d+)$/.exec(range);
    if (!match) throw new Error(`source omitted an exact Content-Range: ${path.slice(0, 80)}`);
    const pageTotal = Number(match[1]);
    if (total != null && total !== pageTotal) throw new Error(`source count changed during pagination: ${total} -> ${pageTotal}`);
    total = pageTotal;
    rows.push(...page);
    if (rows.length >= total) break;
    if (!page.length) throw new Error(`source ended at ${rows.length}/${total}: ${path.slice(0, 80)}`);
  }
  if (rows.length !== total) throw new Error(`source returned ${rows.length}/${total} rows: ${path.slice(0, 80)}`);
  return rows;
}

const quoteId = (id) => `"${encodeURIComponent(id)}"`;
async function fetchIds(relation, select, ids, connection) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    if (batch.length) out.push(...await fetchComplete(`${relation}?select=${select}&place_id=in.(${batch.map(quoteId).join(",")})&order=place_id.asc`, connection));
  }
  return out;
}

export function formatCoverage(report, metro) {
  const lines = [`\nEditorial coverage — ${metro} (canonical places)\n`, "  category      listed  editorial  stored-card  summary-only  no-content  review  suppressed  unknown", "  " + "-".repeat(101)];
  for (const category of CATEGORIES) {
    const row = report.byCategory[category];
    lines.push(`  ${category.padEnd(13)}${String(row.listed).padStart(5)}${String(row.editorial_available).padStart(11)}${String(row.stored_card_only).padStart(13)}${String(row.summary_only).padStart(14)}${String(row.no_known_content).padStart(12)}${String(row.review_needed).padStart(8)}${String(row.suppressed).padStart(12)}${String(row.unknown).padStart(9)}`);
  }
  const t = report.totals;
  lines.push("  " + "-".repeat(101));
  lines.push(`  ${"TOTAL".padEnd(13)}${String(t.listed).padStart(5)}${String(t.editorial_available).padStart(11)}${String(t.stored_card_only).padStart(13)}${String(t.summary_only).padStart(14)}${String(t.no_known_content).padStart(12)}${String(t.review_needed).padStart(8)}${String(t.suppressed).padStart(12)}${String(t.unknown).padStart(9)}\n`);
  lines.push(`  generic editorial source (deduped): Atlas ${report.primarySources.atlas}; verified wf_editorial ${report.primarySources.wf_editorial}; existing legacy ${report.primarySources.legacy}; multi-source overlaps ${report.overlaps}; stored-card overlaps ${report.storedCardOverlaps}`);
  lines.push(`  wf_editorial ledger (rows, not coverage): raw ${report.ledger.raw_rows}; verified ${report.ledger.verified_rows}; verified + issue-free ${report.ledger.verified_issue_free_rows}; unverified/issued ${report.ledger.unverified_or_issued_rows}; read-gated view ${report.ledger.read_gated_view_rows}; review-servable ${report.ledger.review_servable_rows}\n`);
  lines.push("  editorial    = content available to the generic APIs from Atlas, the verified read-gated wf view, or existing legacy editorial");
  lines.push("  stored-card  = source-backed inventory editorial_card exists, but no generic API currently serves it");
  lines.push("  summary-only = inventory prose exists, but no generic editorial source is available for that canonical place");
  lines.push("  no-content   = operational, unflagged, non-excluded, with no generic editorial, stored card, or inventory summary found");
  lines.push("  review       = otherwise servable but needs_review=true and has no known content");
  lines.push("  suppressed   = non-operational or excluded; unknown is never relabeled as a content gap\n");
  return lines.join("\n");
}

async function main() {
  const metro = clean(process.argv[2] || "orlando").toLowerCase();
  const connection = credentials();
  if (!connection.url || !connection.key) throw new Error("no Supabase credentials — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; refusing to print unmeasured coverage");
  const inventory = await fetchComplete(`wf_inventory?metro=eq.${encodeURIComponent(metro)}&select=place_id,name,category,metro,status,needs_review,excluded,editorial,editorial_card&order=place_id.asc`, connection);
  const cardIndex = indexAtlasCards(atlasCards);
  const canonicalIds = [...new Set(inventory.map((row) => canonicalIdFor(row, atlasCards, cardIndex, resolveAtlasId)))];
  const queryIds = [...new Set([...inventory.map((row) => clean(row.place_id)), ...canonicalIds])];
  const [identityInventory, ledgerRows, servableRows] = await Promise.all([
    fetchIds("wf_inventory", "place_id,name,category,metro,status,needs_review,excluded,editorial,editorial_card", canonicalIds, connection),
    fetchIds("wf_editorial", "place_id,hook,why_here,local_tip,verified,issues", queryIds, connection),
    fetchIds("wf_editorial_servable", "place_id,hook,why_here,local_tip,verified,issues", queryIds, connection),
  ]);
  console.log(formatCoverage(buildEditorialCoverage({ inventory, identityInventory, ledgerRows, servableRows }), metro));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { console.error(`report-editorial-coverage: ${error.message}`); process.exitCode = 2; });
}
