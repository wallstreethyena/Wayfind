// A zero-provider editorial publishing gate for source-grounded copy.
//
// The Atlas generators are deliberately parked in free mode. This module gives
// an operator a separate, auditable path for editorial researched from free
// public sources. This module is pure. Database transport lives in the
// operator-only scripts/lib/ownedEditorialPublisher.mjs module; website
// serving code must continue to use the filtered editorial view.
import { editorialRow } from "./atlasEditorial.js";
import { corpusOf, verifyAtlasEditorial } from "./atlasVerify.js";
import { isUsableCardHook } from "./editorialHook.js";

export const OWNED_EDITORIAL_SCHEMA = "owned-editorial-review-v1";
export const ALLOWED_SOURCE_CLASSES = new Set([
  "government",
  "tourism_dmo",
  "official_venue",
  "owned_wayfind",
]);

const PROSE_FIELDS = ["hook", "why_here", "know_before", "best_time", "local_tip"];
const WORD_CAPS = { why_here: 65, know_before: 35, best_time: 20, local_tip: 25 };
const BLOCKED_HOSTS = /(^|\.)(?:tripadvisor\.com|yelp\.com|disney\.com|go\.com)$/i;

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const words = (value) => clean(value).split(/\s+/).filter(Boolean).length;
const isIso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const issue = (placeId, check, field, value = "") => ({ place_id: placeId || "(pack)", check, field, value: String(value) });

function parseSourceUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return { error: "source-not-https" };
    if (BLOCKED_HOSTS.test(url.hostname)) return { error: "blocked-source-host" };
    return { url: url.href };
  } catch {
    return { error: "invalid-source-url" };
  }
}

/**
 * Validate a checked evidence pack and convert it to the canonical wf_editorial
 * row shape. This does not fetch a page, call a model, or touch the database.
 */
export function reviewOwnedEditorialPack(pack) {
  const errors = [];
  const candidates = Array.isArray(pack?.candidates) ? pack.candidates : [];
  if (pack?.schema_version !== OWNED_EDITORIAL_SCHEMA) {
    errors.push(issue(null, "schema-version", "schema_version", pack?.schema_version));
  }
  if (!isIso(pack?.researched_at)) errors.push(issue(null, "invalid-time", "researched_at", pack?.researched_at));
  if (!candidates.length || candidates.length > 40) {
    errors.push(issue(null, "candidate-count", "candidates", candidates.length));
  }

  const ids = new Set();
  const rows = [];
  const reports = [];
  for (const candidate of candidates) {
    const pid = clean(candidate?.place_id);
    const before = errors.length;
    for (const field of ["place_id", "name", "category", "metro", "primary_type"]) {
      if (!clean(candidate?.[field])) errors.push(issue(pid, "missing", field));
    }
    if (ids.has(pid)) errors.push(issue(pid, "duplicate-place-id", "place_id", pid));
    ids.add(pid);

    const inventory = candidate?.inventory_snapshot;
    for (const field of ["wf_editorial_present", "inventory_editorial_present", "inventory_editorial_card_present"]) {
      if (typeof inventory?.[field] !== "boolean") errors.push(issue(pid, "missing-inventory-state", `inventory_snapshot.${field}`));
    }
    if (inventory?.wf_editorial_present !== false) {
      errors.push(issue(pid, "already-has-wf-editorial", "inventory_snapshot.wf_editorial_present", inventory?.wf_editorial_present));
    }
    if (inventory?.inventory_editorial_present === true) {
      errors.push(issue(pid, "inventory-editorial-occupied", "inventory_snapshot.inventory_editorial_present", true));
    }
    if (inventory?.inventory_editorial_card_present === true) {
      errors.push(issue(pid, "inventory-editorial-card-occupied", "inventory_snapshot.inventory_editorial_card_present", true));
    }

    const evidence = Array.isArray(candidate?.evidence) ? candidate.evidence : [];
    if (!evidence.length) errors.push(issue(pid, "no-evidence", "evidence"));
    const evidenceByUrl = new Map();
    for (let index = 0; index < evidence.length; index++) {
      const item = evidence[index] || {};
      const prefix = `evidence[${index}]`;
      const parsed = parseSourceUrl(item.source);
      if (parsed.error) errors.push(issue(pid, parsed.error, `${prefix}.source`, item.source));
      const sourceUrl = parsed.url;
      if (sourceUrl && evidenceByUrl.has(sourceUrl)) errors.push(issue(pid, "duplicate-source", `${prefix}.source`, sourceUrl));
      if (!clean(item.source_name)) errors.push(issue(pid, "missing", `${prefix}.source_name`));
      if (!ALLOWED_SOURCE_CLASSES.has(item.source_class)) errors.push(issue(pid, "source-class", `${prefix}.source_class`, item.source_class));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.checked_at || ""))) errors.push(issue(pid, "invalid-date", `${prefix}.checked_at`, item.checked_at));
      const supports = Array.isArray(item.supports) ? item.supports.map(clean).filter(Boolean) : [];
      if (!supports.length) errors.push(issue(pid, "no-supported-claims", `${prefix}.supports`));
      if (sourceUrl) evidenceByUrl.set(sourceUrl, { ...item, source: sourceUrl, supports });
    }

    const editorial = candidate?.editorial || {};
    for (const field of PROSE_FIELDS) {
      const value = clean(editorial[field]);
      if (!value) errors.push(issue(pid, "missing", `editorial.${field}`));
      if (WORD_CAPS[field] && words(value) > WORD_CAPS[field]) {
        errors.push(issue(pid, "word-cap", `editorial.${field}`, `${words(value)} > ${WORD_CAPS[field]}`));
      }
    }
    if (clean(editorial.hook).length > 120) errors.push(issue(pid, "character-cap", "editorial.hook", clean(editorial.hook).length));
    if (clean(editorial.hook) && !isUsableCardHook(editorial.hook, candidate?.name)) {
      errors.push(issue(pid, "unusable-hook", "editorial.hook", editorial.hook));
    }

    const allowedUrls = [...evidenceByUrl.keys()];
    const citations = editorial?.citations;
    for (const field of PROSE_FIELDS) {
      const cited = Array.isArray(citations?.[field]) ? citations[field] : [];
      if (!cited.length) errors.push(issue(pid, "missing-citation", `editorial.citations.${field}`));
      for (const rawUrl of cited) {
        const parsed = parseSourceUrl(rawUrl);
        if (!parsed.url || !evidenceByUrl.has(parsed.url)) {
          errors.push(issue(pid, "citation-not-in-evidence", `editorial.citations.${field}`, rawUrl));
        }
      }
    }

    const facts = Array.isArray(editorial.facts) ? editorial.facts : [];
    if (!facts.length || facts.length > 6) errors.push(issue(pid, "fact-count", "editorial.facts", facts.length));
    for (let index = 0; index < facts.length; index++) {
      const fact = facts[index] || {};
      const parsed = parseSourceUrl(fact.source);
      const source = parsed.url && evidenceByUrl.get(parsed.url);
      if (!clean(fact.claim)) errors.push(issue(pid, "missing", `editorial.facts[${index}].claim`));
      if (!source) {
        errors.push(issue(pid, "fact-source-not-in-evidence", `editorial.facts[${index}].source`, fact.source));
      } else if (!source.supports.includes(clean(fact.claim))) {
        errors.push(issue(pid, "fact-not-mapped-exactly", `editorial.facts[${index}].claim`, fact.claim));
      }
    }

    const parsedEditorial = {
      hook: clean(editorial.hook),
      why_here: clean(editorial.why_here),
      know_before: clean(editorial.know_before),
      best_time: clean(editorial.best_time),
      local_tip: clean(editorial.local_tip),
      facts: facts.map((fact) => ({ claim: clean(fact?.claim), source: parseSourceUrl(fact?.source).url || clean(fact?.source) })),
    };
    const sources = evidence.map((item) => ({ text: (Array.isArray(item?.supports) ? item.supports : []).join(" ") }));
    const corpus = corpusOf({ name: candidate?.name, google_summary: `${candidate?.category || ""} ${candidate?.metro || ""} ${candidate?.primary_type || ""}` }, sources);
    const verifierErrors = verifyAtlasEditorial(parsedEditorial, corpus, allowedUrls);
    for (const found of verifierErrors) errors.push(issue(pid, found.check, `editorial.${found.field}`, found.value));

    const row = editorialRow({ place_id: pid }, parsedEditorial, pack?.researched_at, null);
    if (!row.verified || row.issues !== null) {
      errors.push(issue(pid, "not-publishable", "editorial", (row.issues || []).join(",")));
    }
    if (errors.length === before) rows.push(row);
    reports.push({
      place_id: pid,
      name: clean(candidate?.name),
      source_count: evidenceByUrl.size,
      inventory_editorial_present: inventory?.inventory_editorial_present === true,
      inventory_editorial_card_present: inventory?.inventory_editorial_card_present === true,
      ok: errors.length === before,
    });
  }
  return { ok: errors.length === 0, errors, rows, reports };
}

const STATIC_EDITORIAL_KEYS = ["hook", "why_here", "knownFor", "whyGo", "editorial", "editorial_card"];

/** Find candidate IDs that already have prose in a versioned Atlas/legacy object. */
export function findStaticEditorialConflicts(candidates, documents) {
  const wanted = new Set(candidates.map((candidate) => clean(candidate.place_id)));
  const conflicts = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== "object") return;
    const pid = clean(value.place_id || value.placeId);
    if (wanted.has(pid) && STATIC_EDITORIAL_KEYS.some((key) => clean(value[key]))) {
      conflicts.push({ place_id: pid, path });
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  for (const document of documents || []) visit(document.value, document.path);
  return conflicts;
}
