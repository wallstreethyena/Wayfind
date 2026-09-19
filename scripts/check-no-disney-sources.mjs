// scripts/check-no-disney-sources.mjs — AGENTS.md §7, enforced in the build.
//
// §7: "No scraping, polling, or automated requests against
// disneyworld.disney.go.com, the My Disney Experience app, or any Disney
// reservation endpoint. Google Places is the only source of identifiers."
//
// Why this file exists: on 2026-07-28 an agent rendered five Disney park pages
// in a browser and wrote five Atlas editorial cards from the returned DOM.
// Nothing caught it — §7 was enforced only by an agent remembering to read
// AGENTS.md, and that agent had not. A constraint enforced by memory is not
// enforced.
//
// v2 — ENTITY RULE, not a hostname denylist.
//
// v1 matched four literal hostnames in raw text. That has the same defect
// however long the list gets: the day a fifth subdomain appears, a card sourced
// from it ships green. Two changes fix it at the entity level:
//
//   1. Sources are PARSED (new URL) and reduced to a normalised hostname —
//      lowercased, trailing dot stripped, leading "www." stripped. Matching raw
//      text is how v1 could be fooled by casing or a URL inside a comment.
//   2. A hostname is Disney if it is, or sits under, a known Disney property —
//      OR if any label in it contains the token "disney". The token clause is
//      what makes this a rule: a host nobody has thought of yet is blocked the
//      day it appears, with no edit to this file.
//
// AND the half v1 was missing entirely — a POSITIVE assertion. v1 only said
// "not Disney", so a card sourced from a fourth-party site nobody vetted shipped
// green despite having nothing to do with Disney. Every editorial source must
// now be affirmatively permitted: the card's OWN official site (265 of 343
// current refs), Google Places/Maps, or an explicitly listed third party.
//
// THE DISTINCTION THIS GUARD KEEPS — read before "fixing" a failure here.
//
//   PROHIBITED  taking CONTENT from a prohibited domain — a card whose
//               sourceUrls cites one, or code that fetch()es / navigates one.
//   ALLOWED     handing the USER an outbound link. app/components/curatedData.js
//               links to disneyworld.disney.go.com/calendars/ so a visitor can
//               check today's showtimes at the official source. That is a
//               hyperlink, not an automated request, and it is good product
//               behaviour. v1 briefly flagged those links because it spliced an
//               ungrouped alternation into its probes. Never delete curation to
//               get this green (AGENTS.md §5).
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "scripts/check-no-disney-sources.mjs";

// ── entity definitions ────────────────────────────────────────────────────
// Disney-owned reservation / planning properties, suffix-matched so every
// subdomain is covered by one entry. This list is a floor, not the rule — the
// token check below is what actually makes the guard entity-level.
const DISNEY_PROPERTIES = [
  "disney.com", "disney.go.com", "disneyworld.com", "disneyland.com",
  "disneysprings.com", "mydisneyexperience.com", "shopdisney.com",
  "disneyvacationclub.com", "disneycruise.com", "waltdisneyworld.com",
];

// §7 names Google Places as the permitted source of identifiers.
const GOOGLE_SOURCES = ["googleapis.com", "google.com", "goo.gl"];

// Third parties explicitly vetted for editorial sourcing. Adding a host here is
// a deliberate, reviewable act — that is the point of the list existing.
const ALLOWED_THIRD_PARTY = [
  // government / public authority
  "myfwc.com", "floridadep.gov", "myfloridahouse.gov", "nps.gov",
  "floridastateparks.org", "sarasotacountyparks.com", "scgov.net",
  "floridahealthybeaches.com", "mymanatee.org", "sarasotafl.gov",
  "cityofnorthport.com", "northportfl.gov", "venicegov.com", "longboatkey.org",
  "myfloridalicense.com",
  // tourism boards / official destination marketing
  "visitsarasota.com", "visitvenicefl.org", "annamariaisland.com", "enjoyflorida.com",
  "lakewoodranch.com", "mylwr.com", "starmandscircleassoc.com",
  // Visit Orlando's Magical Dining program site (prix-fixe event listings)
  "magicaldining.com",
  // conservation / naturalist / trail authorities
  "sarasotaaudubon.org", "manateeaudubon.org", "floridabirdingtrail.com", "ebird.org",
  "floridahikes.com", "asbpa.org", "savingplaces.org", "pdga.com", "circusringoffame.org",
  // named publications and public records
  "sarasotamagazine.com", "yourobserver.com", "fox13news.com", "wusf.org",
  "businessobserverfl.com", "propublica.org", "hmdb.org", "aaa.com",
  "thefloridacatholic.org", "dioceseofvenice.org", "veniceareahistoricalsociety.org",
  "peta.org", "islander.org", "letsplaysarasota.com", "automotivemuseumguide.com",
  "thebaysarasota.org", "hsosc.com", "thegatorclub.com", "doctorsofficeami.com",
  "wikipedia.org",
];

// A card may use its own official site as editorial evidence. Citing a different
// venue's site requires a reviewed card -> domain pairing here. This keeps
// legitimate first-party evidence without letting the card inventory expand its
// own content-source allowlist. #405's founding case is the city fishing-pier
// card citing its on-site restaurant for the factual "Sharky's sits at the foot"
// detail. Link targets (`officialWebsite`) are validated separately below.
const EXPLICIT_CROSS_CARD_SOURCES = new Map([
  // Venice Fishing Pier: its editorial says Sharky's sits at the foot; the
  // cited restaurant page is the first-party evidence for that on-site detail.
  ["ChIJnXtixd5bw4gRrKDqLZC8Dlk", new Set(["sharkysonthepier.com"])],
  // Sharky's On the Pier: its history names the sibling Fins opening next door;
  // the cited Fins about page is the first-party evidence for that relationship.
  ["ChIJnXtixd5bw4gRxq8VhqIqo3I", new Set(["finsatsharkys.com"])],
]);

// ── hostname handling ─────────────────────────────────────────────────────
/** Parse a candidate source to a normalised hostname, or null if not an http(s) URL. */
export function hostOf(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  return u.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** True when host is `domain` or any subdomain of it. */
const under = (host, domain) => host === domain || host.endsWith("." + domain);

/** Coarse registrable domain — last two labels. Sufficient for self-source matching. */
const reg = (h) => { const p = h.split("."); return p.length <= 2 ? h : p.slice(-2).join("."); };

/**
 * Entity check. Disney if the host sits under a known property, OR if any label
 * contains the token "disney". The second clause is the rule; the first only
 * covers properties whose hostname carries no "disney" label.
 */
export function isDisneyHost(host) {
  if (!host) return false;
  if (DISNEY_PROPERTIES.some((d) => under(host, d))) return true;
  return host.split(".").some((label) => label.includes("disney"));
}

/**
 * Why a host was permitted or refused — the rule that decided, by name.
 * Over-blocking is the right default, but only if the block is legible: when the
 * "disney" token eventually false-positives on an unrelated host, this makes it
 * one read instead of a bisect.
 * @returns {{ok: boolean, rule: string}}
 */
export function explainSource(host, officialWebsiteHost, crossCardSourceHosts) {
  if (!host) return { ok: false, rule: "unparseable-source" };
  if (DISNEY_PROPERTIES.some((d) => under(host, d))) {
    return { ok: false, rule: `disney-property-suffix (${DISNEY_PROPERTIES.find((d) => under(host, d))})` };
  }
  const tok = host.split(".").find((l) => l.includes("disney"));
  if (tok) return { ok: false, rule: `disney-token-in-label ("${tok}")` };
  const g = GOOGLE_SOURCES.find((d) => under(host, d));
  if (g) return { ok: true, rule: `google-source (${g})` };
  if (officialWebsiteHost && reg(host) === reg(officialWebsiteHost)) {
    return { ok: true, rule: "card-own-official-site" };
  }
  if (crossCardSourceHosts && crossCardSourceHosts.has(reg(host))) {
    return { ok: true, rule: "explicit-cross-card-source" };
  }
  const t = ALLOWED_THIRD_PARTY.find((d) => under(host, d));
  if (t) return { ok: true, rule: `allowed-third-party (${t})` };
  return { ok: false, rule: "not-in-any-permitted-set" };
}

/** Affirmatively permitted, given the card that cites it. */
export function isPermittedSource(host, officialWebsiteHost, crossCardSourceHosts) {
  if (!host) return false;
  if (isDisneyHost(host)) return false;                       // §7 outranks everything
  if (GOOGLE_SOURCES.some((d) => under(host, d))) return true;
  if (officialWebsiteHost && reg(host) === reg(officialWebsiteHost)) return true;
  if (crossCardSourceHosts && crossCardSourceHosts.has(reg(host))) return true;
  if (ALLOWED_THIRD_PARTY.some((d) => under(host, d))) return true;
  return false;
}

function auditEditorialRows(rows, rel, onPermit = () => {}) {
  let accepted = 0;
  const found = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const refs = [
      ...(Array.isArray(row.sourceUrls) ? row.sourceUrls : []),
      ...(Array.isArray(row.source_urls) ? row.source_urls : []),
      ...(Array.isArray(row.facts) ? row.facts.map((f) => f && f.source).filter(Boolean) : []),
    ];
    // `officialWebsite` is a link target. It remains valid first-party context
    // for this row's own sources, but never authorizes a sibling row. Existing
    // Disney publication restrictions are preserved here.
    if (row.officialWebsite) {
      const owh = hostOf(row.officialWebsite);
      if (owh === null) found.push(`${rel}: "${row.name || row.placeId || "?"}" has an unparseable officialWebsite`);
      else if (isDisneyHost(owh)) found.push(`${rel}: "${row.name || row.placeId || "?"}" publishes a Disney officialWebsite — ${owh}\n      blocked by: ${explainSource(owh, null, null).rule}  (AGENTS.md §7)`);
    }
    if (!refs.length) continue;
    const owHost = row.officialWebsite ? hostOf(row.officialWebsite) : null;
    const who = row.name || row.placeId || "?";
    const crossCardSourceHosts = EXPLICIT_CROSS_CARD_SOURCES.get(row.placeId);
    for (const ref of refs) {
      const h = hostOf(ref);
      if (h === null) { found.push(`${rel}: "${who}" has an unparseable source (${String(ref).slice(0, 80)})`); continue; }
      const verdict = explainSource(h, owHost, crossCardSourceHosts);
      if (isDisneyHost(h)) { found.push(`${rel}: "${who}" is sourced from a Disney property — ${h}\n      blocked by: ${verdict.rule}  (AGENTS.md §7)`); continue; }
      if (!verdict.ok) { found.push(`${rel}: "${who}" cites an unvetted source — ${h}\n      blocked by: ${verdict.rule}  (record a reviewed card -> domain pairing; reserve ALLOWED_THIRD_PARTY for shared publishers)`); continue; }
      onPermit(verdict, h, who);
      accepted++;
    }
  }
  return { accepted, problems: found };
}

// ── scan ──────────────────────────────────────────────────────────────────
const DESCRIBES_RULE = new Set([SELF, "AGENTS.md", "CLAUDE.md", "docs/editorial-standard.md"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".next", "out", "coverage", ".vercel", ".worktrees", "tmp"]);
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIR.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|mjs|jsx|ts|tsx|json)$/.test(e)) acc.push(p);
  }
  return acc;
}

// --verbose prints the deciding rule for every PERMITTED source too, not just
// blocks, so reviewers can audit why each editorial reference is accepted.
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");
let pass = 0;
const permits = [];
const problems = [];
const files = walk(ROOT);

for (const p of files.filter((f) => f.endsWith(".json"))) {
  const rel = relative(ROOT, p);
  if (DESCRIBES_RULE.has(rel)) continue;
  let data;
  try { data = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  const audited = auditEditorialRows(Array.isArray(data) ? data : [data], rel, (verdict, h, who) => {
    if (VERBOSE) permits.push(`  permitted by ${verdict.rule.padEnd(46)} ${h.padEnd(30)} "${who}"`);
  });
  problems.push(...audited.problems);
  pass += audited.accepted;
}

// Code that REQUESTS a Disney property. A hyperlink handed to the user is fine.
const REQUEST_VERBS = /\b(?:fetch|axios(?:\.\w+)?|request|got|goto|navigate)\s*\(/;
for (const p of files.filter((f) => /\.(js|mjs|jsx|ts|tsx)$/.test(f))) {
  const rel = relative(ROOT, p);
  if (DESCRIBES_RULE.has(rel)) continue;
  const src = readFileSync(p, "utf8");
  if (!/disney/i.test(src)) continue;
  for (const line of src.split("\n")) {
    if (!REQUEST_VERBS.test(line)) continue;
    for (const m of line.match(/["'`](https?:\/\/[^"'`]+)["'`]/g) || []) {
      const h = hostOf(m.slice(1, -1));
      if (isDisneyHost(h)) problems.push(`${rel}: code makes an automated request to a Disney property — ${h}`);
    }
  }
}
pass++;

// ── self-test: prove the RULE, not the list ───────────────────────────────
// None of these is a literal entry in DISNEY_PROPERTIES. If any passes, this
// file is a longer denylist rather than an entity rule.
{
  const MUST_FAIL = [
    "booking.disneyworld.disney.go.com", // deep subdomain of a listed property
    "reservations.disney.com",           // reservation endpoint on a subdomain
    "disneyparks-reservations.net",      // invented: unlisted TLD, carries the token
    "tickets.disneyholidays.co.uk",      // invented: foreign TLD, carries the token
    "DISNEYWORLD.DISNEY.GO.COM",         // casing
    "disneyworld.disney.go.com.",        // trailing dot
    "www.disneysprings.com",             // www prefix
  ];
  for (const h of MUST_FAIL) {
    if (!isDisneyHost(hostOf("https://" + h + "/x"))) {
      console.error(`check-no-disney-sources: FAIL — self-test: ${h} was NOT recognised as Disney (denylist, not entity rule)`);
      process.exit(1);
    }
    pass++;
  }

  // Must PASS — a guard cannot go green by rejecting everything.
  const MUST_PASS = [
    ["https://seaworld.com/orlando/", "seaworld.com"],       // venue's own site
    ["https://places.googleapis.com/v1/places/x", null],     // Google Places
    ["https://www.nps.gov/foo", null],                       // vetted third party
  ];
  for (const [url, ow] of MUST_PASS) {
    if (!isPermittedSource(hostOf(url), ow, new Set())) {
      console.error(`check-no-disney-sources: FAIL — self-test: ${url} should be permitted but was rejected`);
      process.exit(1);
    }
    pass++;
  }

  // An unvetted fourth party must fail even though it is not Disney.
  if (isPermittedSource(hostOf("https://random-blog.example/post"), "seaworld.com", new Set())) {
    console.error("check-no-disney-sources: FAIL — self-test: an unvetted fourth-party source was permitted");
    process.exit(1);
  }
  pass++;

  // Every block must name the rule that produced it.
  const REASONS = [
    ["https://booking.disneyworld.disney.go.com/x", "disney-property-suffix"],
    ["https://disneyparks-reservations.net/x", "disney-token-in-label"],
    ["https://random-blog.example/x", "not-in-any-permitted-set"],
    ["https://places.googleapis.com/x", "google-source"],
    ["https://www.nps.gov/x", "allowed-third-party"],
  ];
  for (const [url, expect] of REASONS) {
    const r = explainSource(hostOf(url), null, new Set());
    if (!r.rule.startsWith(expect)) {
      console.error(`check-no-disney-sources: FAIL — self-test: ${url} reported rule "${r.rule}", expected "${expect}*"`);
      process.exit(1);
    }
    pass++;
  }

  // #405's exact scope: a card's own official host remains valid evidence, but
  // adding that officialWebsite to another inventory row must not grant
  // transitive content-source permission. This fixture goes through the same
  // row auditor as repository data; restoring the old global vetted-host set
  // makes its second row falsely pass and turns this test red.
  const sharkys = hostOf("https://www.sharkysonthepier.com/");
  const transitiveFixture = auditEditorialRows([
    {
      placeId: "fixture-official-owner",
      name: "Fixture Official Owner",
      officialWebsite: "https://unvetted-venue.example/",
      sourceUrls: ["https://unvetted-venue.example/about"],
    },
    {
      placeId: "fixture-different-card",
      name: "Fixture Different Card",
      officialWebsite: "https://different-card.example/",
      sourceUrls: ["https://unvetted-venue.example/about"],
    },
  ], "fixture/transitive-vetted-host.json");
  if (transitiveFixture.accepted !== 1 || transitiveFixture.problems.length !== 1 ||
      !transitiveFixture.problems[0].includes('"Fixture Different Card" cites an unvetted source')) {
    console.error("check-no-disney-sources: FAIL — self-test: inventory membership granted transitive content-source permission");
    process.exit(1);
  }
  pass++;
  const pierSources = EXPLICIT_CROSS_CARD_SOURCES.get("ChIJnXtixd5bw4gRrKDqLZC8Dlk");
  if (!isPermittedSource(sharkys, "venicegov.com", pierSources)) {
    console.error("check-no-disney-sources: FAIL — self-test: the reviewed Sharky's / Venice Fishing Pier source pairing was rejected");
    process.exit(1);
  }
  pass++;
  if (!isPermittedSource(sharkys, sharkys, new Set())) {
    console.error("check-no-disney-sources: FAIL — self-test: a card's own official site was rejected as content evidence");
    process.exit(1);
  }
  pass++;

  // A curated outbound link is not a request.
  const LINK = `{ text: "check the calendar", url: "https://disneyworld.disney.go.com/calendars/", label: "Park schedule" }`;
  if (REQUEST_VERBS.test(LINK)) {
    console.error("check-no-disney-sources: FAIL — self-test: a curated `url:` link was misread as a request");
    process.exit(1);
  }
  pass++;
}

if (problems.length) {
  console.error("check-no-disney-sources: FAIL — AGENTS.md §7 / unvetted editorial source\n");
  for (const p of problems.slice(0, 40)) console.error("  " + p);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  console.error("\n  Remove the SOURCING. Do NOT delete a curated outbound link to get green (AGENTS.md §5).");
  console.error("  Disney parks have no compliant automated source: their domains are prohibited here, and");
  console.error("  Google Places supplies identifiers, not editorial detail. Those cards are hand-written or absent.");
  process.exit(1);
}

if (VERBOSE) {
  permits.sort((a, b) => a.localeCompare(b));
  for (const line of permits) console.log(line);
  console.log("");
}

console.log(
  `check-no-disney-sources: OK — ${pass} checks, ${files.length} files scanned ` +
  `(entity rule: token + property suffix; every source affirmatively permitted; ` +
  `cross-card venue sources require an explicit pairing)`
);
