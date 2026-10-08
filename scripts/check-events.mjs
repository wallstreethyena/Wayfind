// Executes lib/eventTime.js against fixtures so the "TONIGHT · 9:30 AM" bug
// (every same-day event hardcoded to "Tonight") can never come back, and
// scans the event surfaces for the banned pattern.
import { eventWhenLabel } from "../lib/eventTime.js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { fallSkinLive } from "../lib/fallSkin.js";

let failed = 0;
const fail = (m) => { failed++; console.error("check-events: FAIL — " + m); };
const NOW = new Date(2026, 6, 11, 9, 25); // Sat Jul 11 2026, 9:25 AM — matches the reported screenshot
const eq = (got, want, msg) => { if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };

// The exact bug from the screenshot: a 9:30 AM event today must NOT say "Tonight".
eq(eventWhenLabel({ date: "2026-07-11", time: "09:30:00" }, NOW), "This morning", "9:30 AM today");
eq(eventWhenLabel({ date: "2026-07-11", time: "14:00:00" }, NOW), "This afternoon", "2 PM today");
eq(eventWhenLabel({ date: "2026-07-11", time: "20:00:00" }, NOW), "Tonight", "8 PM today");
eq(eventWhenLabel({ date: "2026-07-11", time: "" }, NOW), "Today", "today, no time");
eq(eventWhenLabel({ date: "2026-07-12", time: "10:00:00" }, NOW), "Tomorrow", "Sun Jul 12 = tomorrow (more specific wins over weekend)");
eq(eventWhenLabel({ date: "2026-07-13", time: "19:00:00" }, NOW), null, "Mon Jul 13 (+2 weekday) -> no chip");
eq(eventWhenLabel({ date: "2026-07-10", time: "19:00:00" }, NOW), null, "past event -> no label");
eq(eventWhenLabel({ date: "2026-07-20", time: "19:00:00" }, NOW), null, "far future weekday -> no chip");
eq(eventWhenLabel(null, NOW), null, "null event");
eq(eventWhenLabel({ time: "10:00:00" }, NOW), null, "no date");
// Weekend branch (unreachable from a Saturday now): from Thu Jul 9, Sat Jul 11 is +2 and a weekend day.
const THU = new Date(2026, 6, 9, 12, 0);
eq(eventWhenLabel({ date: "2026-07-11", time: "10:00:00" }, THU), "This weekend", "Sat +2 from Thu -> weekend");
eq(eventWhenLabel({ date: "2026-07-10", time: "10:00:00" }, THU), "Tomorrow", "Fri +1 from Thu -> tomorrow");

// The banned hardcode must not reappear ANYWHERE that could grow an event
// surface — cheap to check, and a re-introduction is the whole point.
const noHardcode = ["app/home.js", "app/components/sheets/Detail.js", "app/components/sheets/Menu.js"];
// ...but only the files that actually RENDER an event time can be required to
// call the shared helper. Menu.js left this list in #480: its event UI lived in
// the `community` sub-state, which was unreachable (nothing ever set menuSheet
// to "community") and was deleted along with three others. Requiring the import
// in a file with no events UI would force a dead import to satisfy a guard,
// which is how a check starts shaping the code instead of protecting it.
// If events UI returns to Menu.js, put it back in this list.
const mustUseHelper = ["app/home.js", "app/components/sheets/Detail.js"];
for (const f of noHardcode) {
  if (!existsSync(f)) { fail(`surface missing: ${f}`); continue; }
  const s = readFileSync(f, "utf8");
  if (/diff <= 0\) return "Tonight"|diff === 0 \? \("Tonight"/.test(s)) fail(`${f} still hardcodes same-day "Tonight" — route it through eventWhenLabel`);
  if (mustUseHelper.includes(f) && !s.includes("eventWhenLabel")) fail(`${f} no longer uses the shared eventWhenLabel helper`);
}
// Falsifiability: the presence check must still be pointed at real files, or the
// loop above silently checks nothing but the hardcode.
if (!mustUseHelper.length) fail("mustUseHelper is empty — the shared-helper assertion would be vacuous");
for (const f of mustUseHelper) if (!noHardcode.includes(f)) fail(`${f} must also be in noHardcode`);

// v6.20 — Events tab: opens on real events (best-paying populated category, not
// Tours); the Viator rail is PERMANENTLY pinned on top of every filter; the
// chip row is replaced by ONE dropdown filter pill housing categories, with
// "Local events" (Near me + Community merged) and a new "Business events" source
// carrying an honest empty state.
const home = readFileSync("app/home.js", "utf8");
const ev = readFileSync("app/components/screens/Events.js", "utf8");
if (!/const \[eventCat, setEventCat\] = useState\("auto"\)/.test(home)) fail("Events tab must default to 'auto' (best populated category), not the Tours tab");
if (!home.includes("const EVENT_BUCKETS")) fail("EVENT_BUCKETS taxonomy missing");
for (const b of ["concerts", "comedy", "theater", "sports", "community"]) if (!new RegExp('key: "' + b + '"').test(home)) fail("missing bucket: " + b);
if (!home.includes('return "community"')) fail("eventBucket must collapse everything else into Community");
// The dropdown filter (not chips): every category present, Business + Local.
if (!ev.includes("const EVENT_FILTERS")) fail("Events must define the EVENT_FILTERS dropdown categories");
for (const k of ["concerts", "comedy", "theater", "sports", "local", "business"]) if (!new RegExp('key: "' + k + '"').test(ev)) fail("Events filter dropdown missing category: " + k);
if (!ev.includes('label: "Local events"')) fail("Events must merge Near me + Community into 'Local events'");
if (!ev.includes('label: "Business events"')) fail("Events must offer the Business events source");
if (!ev.includes("No business events yet")) fail("Business events must show an honest empty state (never fabricated)");
if (ev.includes("🎟️ Tours") || ev.includes("📍 Near me")) fail("the old Tours/Near me chip row must be gone (replaced by the dropdown filter)");
if (!ev.includes('aria-haspopup="listbox"')) fail("the category filter must be a dropdown button, not a chip row");
if (!ev.includes('ViatorRail title="Bookable experiences near you"')) fail("the Viator tours rail must be pinned on top of the Events view");

// ── Fall and Halloween default (owner, 2026-10-08) ─────────────────────────
// EXECUTED, not grepped: load the real Events screen module and call its
// exported resolution helpers with a fall row + a concert row.
const REPO = fileURLToPath(new URL("..", import.meta.url));
const evMod = await loadComponent(fileURLToPath(new URL("../app/components/screens/Events.js", import.meta.url)), REPO);
const bucketOf = (e) => (e.segment === "Concert" ? "concerts" : "community"); // mirrors app/home.js eventBucket for these fixtures
const concert = { id: "c1", segment: "Concert", fall: false };
const fallRow = { id: "f1", segment: "Halloween", fall: true, fallTheme: true };
// Season tag only (holiday lights, a musical running in October): fall:true but no theme.
const seasonOnly = { id: "s1", segment: "Theater", fall: true, fallTheme: false };
const keys = (live) => evMod.eventFiltersFor(live).map((f) => f.key);
if (!keys(true).includes("fall")) fail("fall filter must exist while the season is live");
if (keys(false).includes("fall")) fail("fall filter must NOT exist off season (2026-12-01 fixture)");
if (fallSkinLive("2026-12-01")) fail("fixture 2026-12-01 must be off season");
if (!fallSkinLive("2026-10-08")) fail("fixture 2026-10-08 must be in season");
for (const k of ["concerts", "comedy", "theater", "sports", "local", "business", "tours"]) if (!keys(true).includes(k) || !keys(false).includes(k)) fail("category must stay reachable in and out of season: " + k);
// Mirror of the screen's resolution: explicit/deep-link key wins, else first populated priority key.
const resolve = (cat, rows, live) => {
  const fs = evMod.eventFiltersFor(live);
  if (fs.some((f) => f.key === cat)) return cat;
  return evMod.defaultPriorityFor(live).find((k) => { const f = fs.find((x) => x.key === k); return f && rows.filter((e) => evMod.filterMatches(f, e, bucketOf)).length > 0; }) || "local";
};
eq(resolve("auto", [concert, fallRow], true), "fall", "auto in season with a fall row");
eq(resolve("auto", [concert], true), "concerts", "auto in season with no fall rows falls through to concerts");
eq(resolve("auto", [concert, fallRow], false), "concerts", "auto off season ignores fall rows");
eq(resolve("concerts", [concert, fallRow], true), "concerts", "?cat=concerts still resolves in season");
eq(resolve("local", [concert, fallRow], true), "local", "?cat=local still resolves in season");
eq(resolve("fall", [concert, fallRow], false), "concerts", "?cat=fall off season degrades to the normal default");
const fallF = evMod.eventFiltersFor(true).find((f) => f.key === "fall");
if (!(evMod.filterMatches(fallF, fallRow, bucketOf) && !evMod.filterMatches(fallF, concert, bucketOf))) fail("fall filter must match a themed fall row and not a concert");
if (evMod.filterMatches(fallF, seasonOnly, bucketOf)) fail("fall filter must NOT match a row whose only fall signal is the season tag (fallTheme false)");
eq(resolve("auto", [concert, seasonOnly], true), "concerts", "auto in season with only season-tagged rows does not open on Fall and Halloween");
if (!/\{activeFilter\.label\} worth planning around/.test(ev)) fail("grid heading must read '<label> worth planning around' (Fall and Halloween worth planning around)");
if (!ev.includes('label: "Fall and Halloween"')) fail("fall filter label missing");
// The feed row carries the flag (boolean) from the same isFallEvent law.
const baseRow = { event_id: "x1", slug: "x1", start_date: "2026-10-31", event_name: "Test" };
eq(curatedToFeedEvent({ ...baseRow, category: "halloween", tags: ["halloween"] })?.fall, true, "curatedToFeedEvent flags a tagged fall row");
eq(curatedToFeedEvent({ ...baseRow, event_name: "Jazz Night", category: "music" })?.fall, false, "curatedToFeedEvent flags a non-fall row false (boolean)");
eq(curatedToFeedEvent({ ...baseRow, category: "halloween", tags: ["halloween"] })?.fallTheme, true, "a Halloween-tagged row carries fallTheme true");
eq(curatedToFeedEvent({ ...baseRow, event_name: "Holiday Lights in Largo Central Park", category: "holiday", tags: ["festival", "holiday", "fall"] })?.fallTheme, false, "holiday lights tagged fall are not Fall and Halloween");
eq(curatedToFeedEvent({ ...baseRow, event_name: "Dear Evan Hansen at Manatee Performing Arts Center", category: "arts", subcategory: "theatre", tags: ["theatre", "musical", "fall"] })?.fallTheme, false, "a musical running in October is not Fall and Halloween");
eq(curatedToFeedEvent({ ...baseRow, event_name: "Big Mama's Collard Greens Fest", category: "food", subcategory: "food-festival", tags: ["festival", "food", "fall"] })?.fallTheme, false, "a food festival with only the season tag is not Fall and Halloween");
eq(curatedToFeedEvent({ ...baseRow, event_name: "Hunsader Farms Pumpkin Festival", category: "seasonal", tags: ["fall"] })?.fallTheme, true, "a pumpkin festival is Fall and Halloween by its name");
eq(curatedToFeedEvent({ ...baseRow, event_name: "Celtoberfest", category: "festival", subcategory: "fall-festival", tags: ["fall"] })?.fallTheme, true, "a fall festival subcategory counts");

if (failed) process.exit(1);
console.log("check-events: OK — same-day labels reflect the real hour (9:30 AM = 'This morning', not 'Tonight'); fall filter season gated and theme based (season tag alone excluded), auto resolves fall then concerts, deep links keep working");
