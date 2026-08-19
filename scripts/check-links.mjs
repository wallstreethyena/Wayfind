// v5.77 prebuild gate — outbound links stay CENTRALIZED. The recurring bug class
// (broken button / dead link / wrong affiliate default) came from link handling
// scattered across the app with no validation. This locks the consolidation:
//   1. lib/links.js is the single source of truth (safeUrl/openExternal/ticketHref).
//   2. home.js's ticketUrl() validates through safeUrl (so a bad URL -> null ->
//      the caller hides the control, never href="null").
//   3. The openers that were migrated route through lib/links, not a raw
//      window.open of an unvalidated URL.
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("check-links: FAIL — " + m); failures++; };
const read = (p) => readFileSync(join(root, p), "utf8");

// 1. The single source of truth exists and exports the contract.
const links = read("lib/links.js");
for (const ex of ["export function safeUrl", "export function openExternal", "export function ticketHref", "export function isSafeUrl"]) {
  if (!links.includes(ex)) fail(`lib/links.js missing ${ex}`);
}

// 2. home.js's ticketUrl validates through safeUrl and its openExternal delegates
// to the central opener — so nothing in the shell opens/renders an unvalidated URL.
const home = read("app/home.js");
if (!/function ticketUrl\(url[^)]*\)\s*\{[\s\S]{0,240}safeUrl\(/.test(home)) fail("home.js ticketUrl() no longer validates through safeUrl (a bad ticket URL would reach the DOM again)");
if (!/function openExternal\(url\)\s*\{\s*return safeOpenExternal\(url\)/.test(home)) fail("home.js openExternal() no longer delegates to the central validated opener");
if (!home.includes('from "../lib/links"')) fail("home.js does not import from lib/links");

// 3. The migrated openers route through lib/links, not a raw unvalidated window.open.
const migrated = {
  // Menu.js left this map in #480. Its only external open lived in the
  // `community` events block, which was UNREACHABLE (nothing ever set menuSheet
  // to "community") and was deleted along with three other dead sub-states.
  // Requiring the import in a file that opens nothing would force a dead import
  // to satisfy a guard — the check shaping the code instead of protecting it.
  // Coverage is NOT lost: the sweep added below scans every sheet and screen for
  // a raw window.open, which is the half that actually matters. That sweep was
  // written for this PR precisely because removing Menu.js from this map would
  // otherwise have left it unguarded — the comment here originally claimed such
  // a sweep already existed, and an injected window.open proved it did not.
  // Put Menu.js back in this map if it opens an external URL again.
  "app/components/screens/Surprise.js": /openExternal\(p\.mapsUrl\)/,
  "app/components/screens/Itinerary.js": /openExternal\(u\)/,
};
if (!Object.keys(migrated).length) fail("the migrated-openers map is empty — the loop below would assert nothing");
for (const [file, rx] of Object.entries(migrated)) {
  const s = read(file);
  if (!s.includes('from "../../../lib/links"')) fail(`${file} does not import the central opener from lib/links`);
  if (!rx.test(s)) fail(`${file} no longer routes its external open through openExternal`);
}
// 3b. NO raw window.open in any sheet or screen. These are the files the map
// above governs, and a file that drops out of it (because its opener was
// deleted) must not be able to reintroduce an unvalidated open unnoticed.
// Scope is deliberately sheets/ + screens/ only: three components OUTSIDE them
// (BookItLink, BestNearby, TodaysBest) hold pre-existing raw opens of internally
// built directions URLs. Widening the sweep to cover those is a separate review,
// not a silent side effect of a deletion PR.
{
  const dirs = ["app/components/sheets", "app/components/screens"];
  let scanned = 0;
  for (const d of dirs) {
    for (const f of readdirSync(d).filter((x) => x.endsWith(".js"))) {
      const rel = d + "/" + f;
      const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1 ");
      scanned++;
      if (/\bwindow\.open\s*\(/.test(src)) fail(`${rel} calls window.open directly — route it through openExternal from lib/links so the URL is validated`);
    }
  }
  // Falsifiability: an empty scan would pass silently.
  if (scanned < 8) fail(`the raw-window.open sweep only scanned ${scanned} files — expected every sheet and screen`);
  console.log(`  (raw-window.open sweep: ${scanned} sheets/screens clean)`);
}

// Founder P0 (dead money handoffs, 2026-08-19): earning Ticketmaster clicks
// navigate SAME-TAB through /api/ticketmaster/go. lib/links.js "same-tab banned"
// still applies to openExternal / window.open — it does NOT apply to a native
// <a href="/api/*/go">. Do not restore window.open here.
const tb = read("app/events/[city]/[slug]/TicketButton.js");
if (!tb.includes("safeUrl(url)") || !tb.includes('from "../../../../lib/links"')) fail("TicketButton.js must validate its url through lib/links safeUrl");
if (!tb.includes("ticketmasterGoUrl") || !tb.includes("/api/ticketmaster/go")) fail("TicketButton earning href must go through /api/ticketmaster/go (founder P0)");
if (/\bwindow\.open\s*\(/.test(tb.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1 "))) {
  fail("TicketButton must not window.open — same-tab native go route (founder P0). openExternal's same-tab ban still holds for popup openers.");
}

if (failures) { console.error(`check-links: ${failures} failure(s)`); process.exit(1); }
console.log("check-links: OK — lib/links is the single validated source of truth; ticketUrl/openExternal + the migrated openers all route through it");
