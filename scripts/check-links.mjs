// v5.77 prebuild gate — outbound links stay CENTRALIZED. The recurring bug class
// (broken button / dead link / wrong affiliate default) came from link handling
// scattered across the app with no validation. This locks the consolidation:
//   1. lib/links.js is the single source of truth (safeUrl/openExternal/ticketHref).
//   2. home.js's ticketUrl() validates through safeUrl (so a bad URL -> null ->
//      the caller hides the control, never href="null").
//   3. The openers that were migrated route through lib/links, not a raw
//      window.open of an unvalidated URL.
import { readFileSync } from "fs";
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
if (!/function ticketUrl\(url\)\s*\{[\s\S]{0,160}safeUrl\(/.test(home)) fail("home.js ticketUrl() no longer validates through safeUrl (a bad ticket URL would reach the DOM again)");
if (!/function openExternal\(url\)\s*\{\s*return safeOpenExternal\(url\)/.test(home)) fail("home.js openExternal() no longer delegates to the central validated opener");
if (!home.includes('from "../lib/links"')) fail("home.js does not import from lib/links");

// 3. The migrated openers route through lib/links, not a raw unvalidated window.open.
const migrated = {
  "app/components/sheets/Menu.js": /openExternal\(e\.url\)/,
  "app/components/screens/Surprise.js": /openExternal\(p\.mapsUrl\)/,
  "app/components/screens/Itinerary.js": /openExternal\(u\)/,
};
for (const [file, rx] of Object.entries(migrated)) {
  const s = read(file);
  if (!s.includes('from "../../../lib/links"')) fail(`${file} does not import the central opener from lib/links`);
  if (!rx.test(s)) fail(`${file} no longer routes its external open through openExternal`);
}
// TicketButton keeps a DIRECT window.open (anti-Stay22) but must validate via safeUrl.
const tb = read("app/events/[city]/[slug]/TicketButton.js");
if (!tb.includes("safeUrl(url)") || !tb.includes('from "../../../../lib/links"')) fail("TicketButton.js must validate its url through lib/links safeUrl");

if (failures) { console.error(`check-links: ${failures} failure(s)`); process.exit(1); }
console.log("check-links: OK — lib/links is the single validated source of truth; ticketUrl/openExternal + the migrated openers all route through it");
