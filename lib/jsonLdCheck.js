// lib/jsonLdCheck.js — ONE validator for every JSON-LD block Wayfind publishes
// (2026-11-27, owner-approved site-wide structured data mission).
//
// It encodes the parts of Google's structured-data rules that have actually
// broken here (measured on 22 live page types the same day): Events with no
// PostalAddress or a relative image, ItemLists whose numberOfItems disagrees
// with what they list, duplicate URLs in a list or breadcrumb, relative URLs.
// It runs in two places:
//   * build time (scripts/test-jsonld-builders.mjs) on every builder a plain
//     node script can call, with fixtures, so a broken builder fails the build;
//   * production (scripts/check-live-jsonld.mjs, canary.yml) on the HTML of
//     one URL per route type, so inline page builders are covered too.
// Pure: no imports, no I/O.

const SCHEMA_CONTEXT = /^https?:\/\/schema\.org\/?$/;
const ABS = /^https:\/\/[^\s/]+\.[^\s/]+/;
const EVENT_STATUS = new Set(["EventScheduled", "EventCancelled", "EventPostponed", "EventRescheduled", "EventMovedOnline"].map((s) => "https://schema.org/" + s));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const typesOf = (n) => (Array.isArray(n && n["@type"]) ? n["@type"] : [n && n["@type"]]).filter(Boolean);
const isType = (n, t) => typesOf(n).includes(t);

function urlProblems(value, where, out) {
  const list = Array.isArray(value) ? value : [value];
  for (const v of list) {
    const u = typeof v === "string" ? v : v && typeof v === "object" && typeof v.url === "string" ? v.url : null;
    if (u != null && !ABS.test(u)) out.push(`${where}: "${String(u).slice(0, 80)}" is not an absolute https URL`);
  }
}

function eventProblems(e, where, out) {
  if (!e.name || !String(e.name).trim()) out.push(`${where}: Event has no name`);
  if (!e.startDate) out.push(`${where}: Event has no startDate`);
  else if (!ISO_DATE.test(String(e.startDate))) out.push(`${where}: Event startDate "${e.startDate}" is not ISO 8601`);
  if (e.endDate && !ISO_DATE.test(String(e.endDate))) out.push(`${where}: Event endDate "${e.endDate}" is not ISO 8601`);
  if (e.eventStatus && !EVENT_STATUS.has(e.eventStatus)) out.push(`${where}: Event eventStatus "${e.eventStatus}" is not a schema.org EventStatusType`);
  const loc = Array.isArray(e.location) ? e.location[0] : e.location;
  if (!loc) out.push(`${where}: Event has no location (required)`);
  else if (isType(loc, "Place")) {
    if (!loc.name) out.push(`${where}: Event location has no name`);
    const a = loc.address;
    if (!a) out.push(`${where}: Event location has no address (required)`);
    else if (typeof a === "string") out.push(`${where}: Event location.address is plain text, not a PostalAddress`);
    else if (!a.addressLocality && !a.streetAddress) out.push(`${where}: Event PostalAddress has neither streetAddress nor addressLocality`);
  } else if (!isType(loc, "VirtualLocation")) out.push(`${where}: Event location is neither a Place nor a VirtualLocation`);
  if (e.image) urlProblems(e.image, `${where}.image`, out);
  if (e.url) urlProblems(e.url, `${where}.url`, out);
  const offers = Array.isArray(e.offers) ? e.offers : e.offers ? [e.offers] : [];
  for (const o of offers) {
    if ((o.price != null || o.lowPrice != null) && !o.priceCurrency) out.push(`${where}: Event offer has a price but no priceCurrency`);
    if (o.price != null && !/^\d+(\.\d+)?$/.test(String(o.price))) out.push(`${where}: Event offer price "${o.price}" is not a number`);
    if (o.url) urlProblems(o.url, `${where}.offers.url`, out);
  }
}

function listProblems(n, where, out, kind) {
  const items = Array.isArray(n.itemListElement) ? n.itemListElement : [];
  const seen = new Set();
  items.forEach((li, i) => {
    const at = `${where}[${i}]`;
    if (li.position !== i + 1) out.push(`${at}: position ${li.position}, expected ${i + 1}`);
    const target = typeof li.item === "string" ? li.item : li.item && typeof li.item === "object" ? li.item.url || li.item["@id"] : li.url;
    if (kind === "BreadcrumbList") {
      if (!li.name && !(li.item && li.item.name)) out.push(`${at}: breadcrumb has no name`);
      if (i < items.length - 1 && !target) out.push(`${at}: breadcrumb has no item URL`);
    }
    if (target) {
      urlProblems(target, at, out);
      if (seen.has(target)) out.push(`${at}: duplicate URL ${target}`);
      seen.add(target);
    }
    if (li.item && typeof li.item === "object") nodeProblems(li.item, `${at}.item`, out);
  });
  if (kind === "ItemList" && n.numberOfItems != null && n.numberOfItems !== items.length) {
    out.push(`${where}: numberOfItems ${n.numberOfItems} but ${items.length} items are listed`);
  }
}

function nodeProblems(n, where, out) {
  if (!n || typeof n !== "object") { out.push(`${where}: not an object`); return; }
  if (Array.isArray(n["@graph"])) { n["@graph"].forEach((g, i) => nodeProblems(g, `${where}.@graph[${i}]`, out)); return; }
  if (!typesOf(n).length) { out.push(`${where}: no @type`); return; }
  if (isType(n, "Event")) eventProblems(n, where, out);
  if (isType(n, "BreadcrumbList")) listProblems(n, `${where}.BreadcrumbList`, out, "BreadcrumbList");
  if (isType(n, "ItemList")) listProblems(n, `${where}.ItemList`, out, "ItemList");
  if (isType(n, "CollectionPage") && n.mainEntity && typeof n.mainEntity === "object") nodeProblems(n.mainEntity, `${where}.mainEntity`, out);
  if (isType(n, "FAQPage")) {
    for (const [i, q] of (Array.isArray(n.mainEntity) ? n.mainEntity : []).entries()) {
      if (!q.name || !(q.acceptedAnswer && q.acceptedAnswer.text)) out.push(`${where}.FAQ[${i}]: question without name or answer text`);
    }
  }
  if (isType(n, "Article") || isType(n, "BlogPosting") || isType(n, "NewsArticle")) {
    if (!n.headline) out.push(`${where}: Article has no headline`);
    if (n.image) urlProblems(n.image, `${where}.image`, out);
  }
  if (isType(n, "Organization") && n.logo) urlProblems(n.logo, `${where}.logo`, out);
}

/** Problems with one top-level JSON-LD block (parsed object). [] when valid. */
export function jsonLdProblems(block, where = "ld") {
  const out = [];
  // A top-level array of nodes is valid JSON-LD (Google reads each one).
  if (Array.isArray(block)) {
    if (!block.length) return [`${where}: an empty JSON-LD array`];
    return block.flatMap((b, i) => jsonLdProblems(b, `${where}[${i}]`));
  }
  if (!block || typeof block !== "object") return [`${where}: a JSON-LD block must be an object or an array of objects`];
  if (!SCHEMA_CONTEXT.test(String(block["@context"] || ""))) out.push(`${where}: @context is not https://schema.org`);
  nodeProblems(block, where, out);
  return out;
}

/** Every <script type="application/ld+json"> block in an HTML string, checked. */
export function htmlJsonLdProblems(html, where = "page") {
  const out = [];
  let count = 0;
  for (const m of String(html || "").matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    count++;
    let block;
    try { block = JSON.parse(m[1]); } catch (e) { out.push(`${where} ld#${count}: invalid JSON (${e.message})`); continue; }
    out.push(...jsonLdProblems(block, `${where} ld#${count}`));
  }
  return { count, problems: out };
}
