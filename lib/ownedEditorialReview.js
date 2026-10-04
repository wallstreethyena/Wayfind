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
// Owner rule 2026-09-29: with no verified evidence, best_time and local_tip may
// be absent (null/blank). hook, why_here and know_before stay required. A field
// that IS present still needs citations and its word cap.
export const REQUIRED_PROSE_FIELDS = ["hook", "why_here", "know_before"];
export const OPTIONAL_PROSE_FIELDS = ["best_time", "local_tip"];
const WORD_CAPS = { why_here: 65, know_before: 35, best_time: 20, local_tip: 25 };
const BLOCKED_HOSTS = /(^|\.)(?:tripadvisor\.com|yelp\.com|disney\.com|go\.com)$/i;

// Owner rule 2026-09-29: local press is a DESCRIPTIVE-only source class,
// restricted to these hosts. It can never be the only support for an
// operational datum (see pressOperationalProblems).
export const LOCAL_PRESS_CLASS = "local_press";
export const LOCAL_PRESS_HOSTS = ["sarasotamagazine.com", "yourobserver.com", "heraldtribune.com"];
const isLocalPressHost = (hostname) => LOCAL_PRESS_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));

// The prior wf_editorial slot may be replaced only when it never carried any
// prose and was never verified. Any other existing row still refuses.
export const INVENTORY_EDITORIAL_SUPERSEDED = "owner-row-supersedes";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const words = (value) => clean(value).split(/\s+/).filter(Boolean).length;
const isIso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const issue = (placeId, check, field, value = "") => ({ place_id: placeId || "(pack)", check, field, value: String(value) });

/** True only for a never-verified wf_editorial row with all five prose slots blank. */
export function isReplaceablePlaceholder(row) {
  if (!row || typeof row !== "object") return false;
  if (row.verified === true) return false;
  return PROSE_FIELDS.every((field) => !clean(row[field]));
}

// Operational data: what a reader would act on and what changes. A press
// article is never the sole support for any of these.
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY = "(?:mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)";
const FULL_DAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const STREET_TYPE = "(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|pkwy|parkway|trl|trail|way|hwy|highway|cir|circle|pl|place|sq|square|ter|terrace)";
export const OPERATIONAL_DATUM_PATTERNS = [
  ["clock-time", /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)(?![a-z])|\b\d{1,2}:\d{2}\b|\b(?:noon|midnight)\b/gi],
  ["days-of-week", new RegExp(`\\b${FULL_DAY}s?\\b(?:\\s?(?:-|–|—|to|through|thru)\\s?(?:${FULL_DAY}|${DAY})s?\\b)?|\\b${DAY}\\.?\\s?(?:-|–|—|to|through|thru)\\s?(?:${FULL_DAY}|${DAY})s?\\b|\\b(?:weekdays?|weekends?|daily|nightly|seven days)\\b`, "gi")],
  ["price", /\$\s?\d|\b\d[\d,.]*\s?(?:dollars?|cents?|bucks)\b/gi],
  ["date", new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}\\b|\\b\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\b`, "gi")],
  ["year", /\b(?:19|20)\d{2}\b/g],
  ["street-address", new RegExp(`\\b\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9.'-]+\\s+){0,3}${STREET_TYPE}\\b\\.?`, "gi")],
  ["phone", /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g],
  ["zip", /\b(?:FL|Florida)\s+\d{5}(?:-\d{4})?\b|(?<![$\d,.])\b3[34]\d{3}\b(?![,.]?\d)/gi],
];

/** Every operational datum in a text, as { kind, text }. Deterministic; no model. */
export function operationalData(text) {
  const found = [];
  const value = String(text || "");
  for (const [kind, pattern] of OPERATIONAL_DATUM_PATTERNS) {
    for (const match of value.matchAll(pattern)) found.push({ kind, text: match[0] });
  }
  return found;
}

// Backing is TOKEN EQUALITY WITHIN A DATUM TYPE, never a substring match: "$12"
// must not be "backed" by "2012" or "12 Main St". Each datum is normalized to
// `kind:canonical` and compared to the canonical tokens the backing text holds.
const MONTH_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const STREET_LONG = { st: "street", ave: "avenue", blvd: "boulevard", rd: "road", dr: "drive", ln: "lane", ct: "court", pkwy: "parkway", trl: "trail", hwy: "highway", cir: "circle", pl: "place", sq: "square", ter: "terrace" };
const DAY_ABBR = (word) => String(word).toLowerCase().slice(0, 3);
function clockToken(text) {
  const lower = text.toLowerCase();
  if (/noon/.test(lower)) return "time:12:00pm";
  if (/midnight/.test(lower)) return "time:12:00am";
  const m = lower.match(/(\d{1,2})(?::(\d{2}))?\s?(?:(a|p)\.?m\.?)?/);
  let hour = Number(m[1]);
  const minute = m[2] || "00";
  let meridiem = m[3] ? `${m[3]}m` : "";
  if (!meridiem && hour >= 13 && hour <= 23) { hour -= 12; meridiem = "pm"; }
  return `time:${hour}:${minute}${meridiem}`;
}
export function datumToken(kind, text) {
  const value = String(text || "").trim();
  switch (kind) {
    case "clock-time": return clockToken(value);
    case "days-of-week": {
      const words = value.toLowerCase().match(/[a-z]+/g) || [];
      const days = words.filter((word) => /^(mon|tue|wed|thu|fri|sat|sun)/.test(word) && word !== "sunset").map(DAY_ABBR);
      return days.length ? `days:${days.join("-")}` : `days:${words.join(" ")}`;
    }
    case "price": return `price:${parseFloat(((value.match(/\d[\d,]*(?:\.\d+)?/) || ["0"])[0]).replace(/,/g, ""))}`;
    case "date": {
      const named = value.toLowerCase().match(/^([a-z]+)\.?\s+(\d{1,2})/);
      if (named) return `date:${MONTH_NUM[named[1].slice(0, 3)]}-${Number(named[2])}`;
      const [mm, dd, yy] = value.split("/");
      return `date:${Number(mm)}-${Number(dd)}${yy ? `-${yy}` : ""}`;
    }
    case "year": return `year:${value}`;
    case "phone": return `phone:${value.replace(/\D/g, "")}`;
    case "zip": return `zip:${value.replace(/\D/g, "")}`;
    case "street-address": {
      const words = value.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).map((word) => STREET_LONG[word] || word);
      return `address:${words.join(" ")}`;
    }
    default: return `${kind}:${value.toLowerCase()}`;
  }
}
/** The set of canonical operational tokens a text carries. */
export function operationalTokens(text) {
  return new Set(operationalData(text).map((datum) => datumToken(datum.kind, datum.text)));
}

/**
 * Local press may support only descriptive claims. Returns issues (check
 * `press-operational-claim`) for:
 *   - a fact sourced to a press item whose claim holds an operational datum
 *     unless the identical claim is also mapped under a non-press evidence item;
 *   - a prose field that cites a press item and holds an operational datum that
 *     no non-press item cited by that same field carries.
 */
export function pressOperationalProblems(pid, editorial, evidenceByUrl) {
  const problems = [];
  const isPress = (item) => item?.source_class === LOCAL_PRESS_CLASS;
  const backing = [...evidenceByUrl.values()].filter((item) => !isPress(item));
  const factList = Array.isArray(editorial?.facts) ? editorial.facts : [];
  for (let index = 0; index < factList.length; index++) {
    const fact = factList[index] || {};
    const source = evidenceByUrl.get(parseSourceUrl(fact.source).url);
    const claim = clean(fact.claim);
    if (!isPress(source) || !operationalData(claim).length) continue;
    if (!backing.some((item) => item.supports.includes(claim))) {
      problems.push(issue(pid, "press-operational-claim", `editorial.facts[${index}].claim`, claim));
    }
  }
  for (const field of PROSE_FIELDS) {
    const text = clean(editorial?.[field]);
    const cited = (Array.isArray(editorial?.citations?.[field]) ? editorial.citations[field] : [])
      .map((raw) => evidenceByUrl.get(parseSourceUrl(raw).url)).filter(Boolean);
    if (!text || !cited.some(isPress)) continue;
    const support = cited.filter((item) => !isPress(item)).map((item) => item.supports.join(" ")).join(" ");
    const backed = operationalTokens(support);
    for (const datum of operationalData(text)) {
      if (!backed.has(datumToken(datum.kind, datum.text))) {
        problems.push(issue(pid, "press-operational-claim", `editorial.${field}`, `${datum.kind}: ${datum.text}`));
      }
    }
  }
  return problems;
}

function parseSourceUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return { error: "source-not-https" };
    if (BLOCKED_HOSTS.test(url.hostname)) return { error: "blocked-source-host" };
    return { url: url.href, hostname: url.hostname.toLowerCase().replace(/^www\./, "") };
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
    // A wf_editorial row may pre-exist ONLY as a never-verified, all-blank
    // placeholder, and the pack must carry that prior row so the audit history
    // can be preserved before it is replaced. Anything else still refuses.
    if (inventory?.wf_editorial_present !== false) {
      const prior = inventory?.wf_editorial_prior;
      if (!(inventory?.wf_editorial_present === true && isReplaceablePlaceholder(prior))) {
        errors.push(issue(pid, "already-has-wf-editorial", "inventory_snapshot.wf_editorial_present", inventory?.wf_editorial_present));
      }
    }
    // An occupied wf_inventory.editorial (Google-derived one-line summary) is
    // refused unless the owner explicitly records that the owner row supersedes it.
    if (inventory?.inventory_editorial_present === true && inventory?.inventory_editorial_disposition !== INVENTORY_EDITORIAL_SUPERSEDED) {
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
      if (item.source_class === LOCAL_PRESS_CLASS) {
        if (parsed.hostname && !isLocalPressHost(parsed.hostname)) errors.push(issue(pid, "local-press-host", `${prefix}.source`, parsed.hostname));
      } else if (!ALLOWED_SOURCE_CLASSES.has(item.source_class)) {
        errors.push(issue(pid, "source-class", `${prefix}.source_class`, item.source_class));
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.checked_at || ""))) errors.push(issue(pid, "invalid-date", `${prefix}.checked_at`, item.checked_at));
      const supports = Array.isArray(item.supports) ? item.supports.map(clean).filter(Boolean) : [];
      if (!supports.length) errors.push(issue(pid, "no-supported-claims", `${prefix}.supports`));
      if (sourceUrl) evidenceByUrl.set(sourceUrl, { ...item, source: sourceUrl, supports });
    }

    const editorial = candidate?.editorial || {};
    for (const field of PROSE_FIELDS) {
      const value = clean(editorial[field]);
      if (!value && REQUIRED_PROSE_FIELDS.includes(field)) errors.push(issue(pid, "missing", `editorial.${field}`));
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
      // An absent optional field carries no claim, so it needs no citation.
      if (OPTIONAL_PROSE_FIELDS.includes(field) && !clean(editorial[field])) continue;
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

    errors.push(...pressOperationalProblems(pid, editorial, evidenceByUrl));

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
      replaces_placeholder: inventory?.wf_editorial_present === true,
      inventory_editorial_present: inventory?.inventory_editorial_present === true,
      inventory_editorial_disposition: inventory?.inventory_editorial_present === true ? clean(inventory?.inventory_editorial_disposition) : "",
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
