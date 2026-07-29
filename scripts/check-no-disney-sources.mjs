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
  "floridastateparks.org", "sarasotacountyparks.com", "mymanatee.org", "sarasotafl.gov",
  "cityofnorthport.com", "northportfl.gov", "venicegov.com", "longboatkey.org",
  "myfloridalicense.com",
  // tourism boards / official destination marketing
  "visitsarasota.com", "visitvenicefl.org", "annamariaisland.com", "enjoyflorida.com",
  "lakewoodranch.com", "mylwr.com", "starmandscircleassoc.com",
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

// User-generated / aggregated rather than primary. GRANDFATHERED: shipped cards
// already cite these and this branch is code-only (content is a separate pass).
// Named here so the debt is visible and counted rather than silently permitted.
const GRANDFATHERED_UGC = ["yelp.com", "tripadvisor.com", "toasttab.com", "facebook.com"];

// Single-venue commercial sites cited by a DIFFERENT card, where that venue is
// not itself in the vetted set. Found by this guard's positive assertion on its
// first run against shipped data. Grandfathered for the same reason as the UGC
// list — code-only branch — and listed individually so each is reviewable.
// (sharkysonthepier.com was flagged too but needed no entry: Sharky's On the
// Pier IS a vetted card, so the "official site of any vetted venue" rule below
// covers it. That is the difference between a rule and three more hostnames.)
const GRANDFATHERED_UNVETTED = ["lidoislandgrill.com", "mayaspeaktiki.com"];

// RATCHET. Both grandfather lists are frozen at exactly these entries. They may
// SHRINK — removing a host once its card is re-sourced is the goal — but never
// grow. A grandfather list with no pressure on it silently becomes the policy,
// which is how "temporary debt" turns permanent. Adding an entry fails the
// build and forces the conversation instead of quietly widening what is allowed.
// Drive both to zero: see the tracking issue.
const RATCHET = {
  GRANDFATHERED_UGC: ["facebook.com", "toasttab.com", "tripadvisor.com", "yelp.com"],
  GRANDFATHERED_UNVETTED: ["lidoislandgrill.com", "mayaspeaktiki.com"],
};

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
export function explainSource(host, officialWebsiteHost, vettedVenueHosts) {
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
  if (vettedVenueHosts && vettedVenueHosts.has(reg(host))) {
    return { ok: true, rule: "official-site-of-a-vetted-venue" };
  }
  const t = ALLOWED_THIRD_PARTY.find((d) => under(host, d));
  if (t) return { ok: true, rule: `allowed-third-party (${t})` };
  const u = GRANDFATHERED_UGC.find((d) => under(host, d));
  if (u) return { ok: true, rule: `grandfathered-ugc (${u}) — pending replacement` };
  const v = GRANDFATHERED_UNVETTED.find((d) => under(host, d));
  if (v) return { ok: true, rule: `grandfathered-unvetted (${v}) — pending replacement` };
  return { ok: false, rule: "not-in-any-permitted-set" };
}

/** Affirmatively permitted, given the card that cites it. */
export function isPermittedSource(host, officialWebsiteHost, vettedVenueHosts) {
  if (!host) return false;
  if (isDisneyHost(host)) return false;                       // §7 outranks everything
  if (GOOGLE_SOURCES.some((d) => under(host, d))) return true;
  if (officialWebsiteHost && reg(host) === reg(officialWebsiteHost)) return true;
  // The official site of ANY venue already in the vetted card set. A neighbouring
  // business describing a shared location (Sharky's On the Pier on the Venice
  // Fishing Pier card) is first-party content from a venue we have already
  // vetted — permitting it is a rule, not an exception per hostname.
  if (vettedVenueHosts && vettedVenueHosts.has(reg(host))) return true;
  if (ALLOWED_THIRD_PARTY.some((d) => under(host, d))) return true;
  if (GRANDFATHERED_UGC.some((d) => under(host, d))) return true;
  if (GRANDFATHERED_UNVETTED.some((d) => under(host, d))) return true;
  return false;
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
// blocks. That is what lets the grandfathered inventory regenerate itself: run
// `node scripts/check-no-disney-sources.mjs --verbose | grep grandfathered`
// instead of maintaining a hand-built list that goes stale the moment someone
// adds a card. #407 closes when that output is empty.
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");
let pass = 0, ugcRefs = 0, grandfatheredRefs = 0;
const permits = [];
const problems = [];
const files = walk(ROOT);

// Pass 1 — every venue we have already vetted, by registrable domain of its
// officialWebsite. Pass 2 treats these as first-party.
const VETTED_VENUE_HOSTS = new Set();
for (const p of files.filter((f) => f.endsWith(".json"))) {
  if (DESCRIBES_RULE.has(relative(ROOT, p))) continue;
  let data;
  try { data = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  for (const row of (Array.isArray(data) ? data : [data])) {
    const h = row && row.officialWebsite ? hostOf(row.officialWebsite) : null;
    if (h) VETTED_VENUE_HOSTS.add(reg(h));
  }
}

for (const p of files.filter((f) => f.endsWith(".json"))) {
  const rel = relative(ROOT, p);
  if (DESCRIBES_RULE.has(rel)) continue;
  let data;
  try { data = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  for (const row of (Array.isArray(data) ? data : [data])) {
    if (!row || typeof row !== "object") continue;
    const refs = [
      ...(Array.isArray(row.sourceUrls) ? row.sourceUrls : []),
      ...(Array.isArray(row.source_urls) ? row.source_urls : []),
      ...(Array.isArray(row.facts) ? row.facts.map((f) => f && f.source).filter(Boolean) : []),
    ];
    // officialWebsite is PUBLISHED, so it is as much a §7 surface as a source.
    // It was previously read only as context (to build VETTED_VENUE_HOSTS) and
    // never validated as a value — a card carrying
    // officialWebsite: "https://www.disneysprings.com/..." shipped green.
    // Proven by injection on 2026-07-29. Disney Springs is a Disney-owned
    // district full of venues that are NOT Disney-operated (House of Blues is
    // Live Nation, The Edison and Paradiso 37 are independent, Splitsville is
    // independent) so this is checked PER VENUE against the resolved host,
    // never by blanket-omitting a district.
    if (row.officialWebsite) {
      const owh = hostOf(row.officialWebsite);
      if (owh === null) problems.push(`${rel}: "${row.name || row.placeId || "?"}" has an unparseable officialWebsite`);
      else if (isDisneyHost(owh)) problems.push(`${rel}: "${row.name || row.placeId || "?"}" publishes a Disney officialWebsite — ${owh}\n      blocked by: ${explainSource(owh, null, null).rule}  (AGENTS.md §7)`);
    }
    if (!refs.length) continue;
    const owHost = row.officialWebsite ? hostOf(row.officialWebsite) : null;
    const who = row.name || row.placeId || "?";
    for (const ref of refs) {
      const h = hostOf(ref);
      if (h === null) { problems.push(`${rel}: "${who}" has an unparseable source (${String(ref).slice(0, 80)})`); continue; }
      const verdict = explainSource(h, owHost, VETTED_VENUE_HOSTS);
      if (isDisneyHost(h)) { problems.push(`${rel}: "${who}" is sourced from a Disney property — ${h}\n      blocked by: ${verdict.rule}  (AGENTS.md §7)`); continue; }
      if (!verdict.ok) { problems.push(`${rel}: "${who}" cites an unvetted source — ${h}\n      blocked by: ${verdict.rule}  (add to ALLOWED_THIRD_PARTY only after vetting)`); continue; }
      // Count by the DECIDING rule, not by list membership. These disagreed:
      // Green Turtle Shell & Gift Shop's officialWebsite IS its facebook page —
      // its only web presence — so that ref is permitted as the card's own
      // official site, not as grandfathered UGC. Counting membership reported
      // 4 UGC refs while the inventory showed 3, and the inventory was right.
      // A number that disagrees with the list it summarises is worse than no
      // number: #407 is scoped off this count.
      if (verdict.rule.startsWith("grandfathered-ugc")) ugcRefs++;
      if (verdict.rule.startsWith("grandfathered-unvetted")) grandfatheredRefs++;
      if (VERBOSE) permits.push(`  permitted by ${verdict.rule.padEnd(46)} ${h.padEnd(30)} "${who}"`);
      pass++;
    }
  }
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

// ── ratchet: the grandfather lists may shrink, never grow ─────────────────
{
  const sorted = (a) => [...a].sort().join(",");
  for (const [name, frozen] of Object.entries(RATCHET)) {
    const live = name === "GRANDFATHERED_UGC" ? GRANDFATHERED_UGC : GRANDFATHERED_UNVETTED;
    const added = live.filter((h) => !frozen.includes(h));
    if (added.length) {
      console.error(`check-no-disney-sources: FAIL — ${name} grew: ${added.join(", ")}`);
      console.error("  Grandfather lists are a ratchet. They may shrink as cards are re-sourced,");
      console.error("  never grow. Re-source the card, or make the case for ALLOWED_THIRD_PARTY.");
      process.exit(1);
    }
    // Shrinking is the goal — allowed, and worth saying out loud.
    const removed = frozen.filter((h) => !live.includes(h));
    if (removed.length) console.log(`check-no-disney-sources: ${name} shrank by ${removed.length} (${removed.join(", ")}) — update RATCHET to lock it in.`);
    if (sorted(live) === sorted(frozen)) pass++;
  }
}

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
    if (!isPermittedSource(hostOf(url), ow, VETTED_VENUE_HOSTS)) {
      console.error(`check-no-disney-sources: FAIL — self-test: ${url} should be permitted but was rejected`);
      process.exit(1);
    }
    pass++;
  }

  // An unvetted fourth party must fail even though it is not Disney.
  if (isPermittedSource(hostOf("https://random-blog.example/post"), "seaworld.com", VETTED_VENUE_HOSTS)) {
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
    ["https://www.yelp.com/biz/x", "grandfathered-ugc"],
  ];
  for (const [url, expect] of REASONS) {
    const r = explainSource(hostOf(url), null, new Set());
    if (!r.rule.startsWith(expect)) {
      console.error(`check-no-disney-sources: FAIL — self-test: ${url} reported rule "${r.rule}", expected "${expect}*"`);
      process.exit(1);
    }
    pass++;
  }

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
  // Grandfathered first — that is the list anyone running this wants to see.
  const rank = (l) => (l.includes("grandfathered") ? 0 : 1);
  permits.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const line of permits) console.log(line);
  console.log("");
}

console.log(
  `check-no-disney-sources: OK — ${pass} checks, ${files.length} files scanned ` +
  `(entity rule: token + property suffix; every source affirmatively permitted; ` +
  `${ugcRefs} UGC + ${grandfatheredRefs} unvetted-venue refs grandfathered, pending the content pass)`
);
