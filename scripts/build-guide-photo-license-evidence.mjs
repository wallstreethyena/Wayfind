#!/usr/bin/env node
/**
 * build-guide-photo-license-evidence — re-checks, AT THE SOURCE, the licence of
 * every guide photo the pick-photo pipeline added (every pick photo in
 * lib/guidePickPhotoManifest.js, and every hero in lib/guideHero.js whose file
 * lives under /guides/picks/), and writes the evidence ledger
 * data/guide-pick-photos/_reports/license-evidence.json.
 *
 * NETWORK: this is a manual audit tool (run it when photos are added or
 * re-reviewed). It calls the Wikimedia Commons API and fetches public Flickr
 * photo pages; it never calls a paid API and is not part of the build.
 * scripts/check-guide-pick-photos.mjs then enforces, offline, that every
 * photo on the site has a ledger row that agrees with what the site credits.
 *
 * For each file the ledger stores what the SOURCE says today (title, author,
 * licence, date) next to what Wayfind stores and renders (credit, licence,
 * deed URL, modification notice), plus whether the licence allows commercial
 * use (CC0, CC BY and CC BY-SA do; NC and ND never pass).
 *
 *   node scripts/build-guide-photo-license-evidence.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { GUIDE_PICK_PHOTOS } from "../lib/guidePickPhotoManifest.js";
import { GUIDE_HERO_ART } from "../lib/guideHero.js";

const OUT = "data/guide-pick-photos/_reports/license-evidence.json";
const UA = "WayfindGuidePhotoAudit/1.0 (https://github.com/wallstreethyena/Wayfind; editorial photo credit audit)";
const TODAY = new Date().toISOString().slice(0, 10);
// Photos kept for now but to be replaced when a newer licensed photo exists.
const REPLACEMENT_CANDIDATES = JSON.parse(readFileSync("data/guide-pick-photos/_reports/replacement-candidates.json", "utf8")).candidates;

const strip = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
const CC_URL_RX = /creativecommons\.org\/(licenses\/(by|by-sa|by-nc|by-nd|by-nc-sa|by-nc-nd)\/(\d\.\d)|publicdomain\/zero\/1\.0)/;
function licenceFromUrl(url) {
  const m = CC_URL_RX.exec(String(url || ""));
  if (!m) return null;
  if (!m[2]) return "CC0 1.0 Universal";
  return `CC ${m[2].toUpperCase()} ${m[3]}`;
}
function normaliseCommonsLicence(short) {
  const s = String(short || "").trim();
  if (/^CC0/i.test(s)) return "CC0 1.0 Universal";
  const m = /^CC[ -](BY(?:-NC)?(?:-SA|-ND)?)[ -](\d\.\d)/i.exec(s);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : s;
}
const commercialOk = (lic) => /^(CC0 1\.0 Universal|CC BY(-SA)? [234]\.0)$/.test(lic || "");
const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ── 1. every new photo usage, grouped by file ─────────────────────────────
const files = new Map();
function add(src, usage, stored) {
  if (!files.has(src)) files.set(src, { src, stored, usages: [] });
  const f = files.get(src);
  for (const k of ["sourceUrl", "license", "licenseUrl", "credit"]) {
    if (f.stored[k] !== stored[k]) f.inconsistent = `${k} differs between usages of the same file`;
  }
  f.usages.push(usage);
}
for (const [slug, g] of Object.entries(GUIDE_PICK_PHOTOS)) {
  for (const [pick, e] of Object.entries(g.picks || {})) {
    add(e.src, { slug, role: "pick", pick }, { sourceKind: e.sourceKind, sourceUrl: e.sourceUrl, creditHref: e.creditHref, credit: e.credit, license: e.license, licenseUrl: e.licenseUrl, modificationNotice: e.modificationNotice });
  }
}
for (const [slug, a] of Object.entries(GUIDE_HERO_ART)) {
  if (!a || !a.src || !a.src.startsWith("/guides/picks/")) continue;
  const host = new URL(a.source).hostname;
  add(a.src, { slug, role: "hero" }, { sourceKind: host === "www.flickr.com" ? "flickr" : "commons", sourceUrl: a.source, creditHref: a.source, credit: a.credit, license: a.license, licenseUrl: a.licenseUrl, modificationNotice: a.modificationNotice });
}

// ── 2. Wikimedia Commons: live extmetadata, 40 titles per call ─────────────
function commonsTitle(url) {
  const u = new URL(url);
  return decodeURIComponent(u.pathname.replace(/^\/wiki\//, "")).replace(/_/g, " ");
}
const commonsLive = new Map();
const commonsTitles = [...new Set([...files.values()].filter((f) => f.stored.sourceKind === "commons").map((f) => commonsTitle(f.stored.sourceUrl)))];
for (let i = 0; i < commonsTitles.length; i += 40) {
  const batch = commonsTitles.slice(i, i + 40);
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", redirects: "1", prop: "imageinfo", iiprop: "extmetadata|url|size",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ObjectName|DateTimeOriginal|Restrictions|UsageTerms", titles: batch.join("|") });
  const res = await fetch("https://commons.wikimedia.org/w/api.php?" + params, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  const j = await res.json();
  const alias = new Map();
  for (const n of j.query.normalized || []) alias.set(n.to, n.from);
  for (const r of j.query.redirects || []) alias.set(r.to, alias.get(r.from) || r.from);
  for (const p of j.query.pages) {
    const asked = alias.get(p.title) || p.title;
    if (p.missing || !p.imageinfo) { commonsLive.set(asked, { missing: true }); continue; }
    const m = p.imageinfo[0].extmetadata || {};
    const v = (k) => (m[k] ? m[k].value : "");
    commonsLive.set(asked, { title: strip(v("ObjectName")) || p.title.replace(/^File:/, ""), author: strip(v("Artist")), licenceRaw: strip(v("LicenseShortName")),
      licence: normaliseCommonsLicence(strip(v("LicenseShortName"))), licenceUrl: strip(v("LicenseUrl")), date: strip(v("DateTimeOriginal")).slice(0, 40),
      restrictions: strip(v("Restrictions")), width: p.imageinfo[0].width, height: p.imageinfo[0].height, redirectedTo: p.title !== asked ? p.title : null });
  }
  await new Promise((r) => setTimeout(r, 1500));
}

// ── 3. Flickr: the live public photo page ─────────────────────────────────
const flickrLive = new Map();
for (const url of new Set([...files.values()].filter((f) => f.stored.sourceKind === "flickr").map((f) => f.stored.sourceUrl))) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  const html = await res.text();
  const owner = /"owner":\{"pathAlias":"?([^",]*)"?,"username":"([^"]*)","realname":"([^"]*)","displayname":"([^"]*)","nsid":"([^"]*)"/.exec(html);
  const lic = /"license": "(https:\/\/creativecommons\.org\/[^"]+)"/.exec(html);
  const title = /<meta property="og:title" content="([^"]*)"/.exec(html);
  const taken = /"dateTaken":"([^"]*)"/.exec(html);
  const urlOwner = new URL(url).pathname.split("/")[2];
  flickrLive.set(url, { status: res.status, ownerMatchesUrl: !!owner && (owner[5] === urlOwner || owner[1] === urlOwner),
    author: owner ? (owner[3] || owner[2]) : "", displayName: owner ? owner[4] : "", licenceUrl: lic ? lic[1] : "", licence: licenceFromUrl(lic && lic[1]),
    title: title ? strip(title[1]) : "", date: taken ? taken[1] : "" });
  await new Promise((r) => setTimeout(r, 1000));
}

// ── 4. compare and write the ledger ───────────────────────────────────────
const rows = [];
for (const f of [...files.values()].sort((a, b) => a.src.localeCompare(b.src))) {
  const s = f.stored;
  const live = s.sourceKind === "commons" ? commonsLive.get(commonsTitle(s.sourceUrl)) : flickrLive.get(s.sourceUrl);
  const problems = [];
  if (!existsSync("public" + f.src)) problems.push("file missing from public/");
  if (f.inconsistent) problems.push(f.inconsistent);
  if (!live || live.missing) problems.push("source page not found");
  if (live && live.status && live.status !== 200) problems.push(`source page HTTP ${live.status}`);
  if (live && live.ownerMatchesUrl === false) problems.push("Flickr owner on the page does not match the URL");
  if (live && !live.missing && live.licence !== s.license) problems.push(`licence at source is "${live.licenceRaw || live.licence}", Wayfind stores "${s.license}"`);
  if (licenceFromUrl(s.licenseUrl) !== s.license) problems.push("stored licence URL does not match the stored licence");
  if (!commercialOk(s.license)) problems.push("licence does not allow commercial use");
  if (!s.credit || !s.sourceUrl || !s.modificationNotice) problems.push("stored attribution incomplete");
  const authorAgrees = !!live && !!live.author && (fold(live.author).includes(fold(s.credit)) || fold(s.credit).includes(fold(live.author)));
  const candidate = REPLACEMENT_CANDIDATES.find((c) => c.src === f.src) || null;
  rows.push({
    src: f.src,
    usedBy: f.usages,
    source: { kind: s.sourceKind, url: s.sourceUrl, title: live && live.title || null, author: live && live.author || null,
      displayName: live && live.displayName || undefined, dateTaken: live && live.date || null, licence: live && live.licence || null,
      licenceUrl: live && live.licenceUrl || null, restrictions: live && live.restrictions || undefined },
    wayfind: { credit: s.credit, creditHref: s.creditHref, license: s.license, licenseUrl: s.licenseUrl, modificationNotice: s.modificationNotice },
    commercialUse: commercialOk(s.license) && (!live || commercialOk(live.licence)),
    authorMatchesCredit: authorAgrees,
    replacementCandidate: candidate ? candidate.reason : undefined,
    status: problems.length ? "needs-review" : "verified",
    problems: problems.length ? problems : undefined,
    verifiedAt: TODAY,
  });
}
const summary = {
  files: rows.length, usages: rows.reduce((n, r) => n + r.usedBy.length, 0),
  verified: rows.filter((r) => r.status === "verified").length,
  needsReview: rows.filter((r) => r.status !== "verified").map((r) => r.src),
  authorDiffers: rows.filter((r) => !r.authorMatchesCredit).map((r) => `${r.src} | credit "${r.wayfind.credit}" | source "${r.source.author}"`),
  byLicence: rows.reduce((m, r) => ((m[r.wayfind.license] = (m[r.wayfind.license] || 0) + 1), m), {}),
  replacementCandidates: rows.filter((r) => r.replacementCandidate).map((r) => r.src),
};
writeFileSync(OUT, JSON.stringify({ generatedBy: "scripts/build-guide-photo-license-evidence.mjs", verifiedAt: TODAY,
  rule: "Every photo added by the guide pick-photo pipeline, re-checked at its source. commercialUse is true only for CC0, CC BY and CC BY-SA (2.0 to 4.0); NC and ND never pass.",
  summary, files: rows }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
