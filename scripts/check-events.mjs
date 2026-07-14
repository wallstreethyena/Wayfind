// Executes lib/eventTime.js against fixtures so the "TONIGHT · 9:30 AM" bug
// (every same-day event hardcoded to "Tonight") can never come back, and
// scans the event surfaces for the banned pattern.
import { eventWhenLabel } from "../lib/eventTime.js";
import { readFileSync, existsSync } from "fs";

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

// The banned hardcode must not reappear on any event surface.
const surfaces = ["app/home.js", "app/components/sheets/Detail.js", "app/components/sheets/Menu.js"];
for (const f of surfaces) {
  if (!existsSync(f)) { fail(`surface missing: ${f}`); continue; }
  const s = readFileSync(f, "utf8");
  if (/diff <= 0\) return "Tonight"|diff === 0 \? \("Tonight"/.test(s)) fail(`${f} still hardcodes same-day "Tonight" — route it through eventWhenLabel`);
  if (!s.includes("eventWhenLabel")) fail(`${f} no longer uses the shared eventWhenLabel helper`);
}

// v6.14 — Events tab taxonomy: fixed buckets, Tours default, Community catch-all.
const home = readFileSync("app/home.js", "utf8");
const ev = readFileSync("app/components/screens/Events.js", "utf8");
if (!/const \[eventCat, setEventCat\] = useState\("tours"\)/.test(home)) fail("Events tab must default to the Tours chip");
if (!home.includes("const EVENT_BUCKETS")) fail("EVENT_BUCKETS taxonomy missing");
for (const b of ["concerts", "comedy", "theater", "sports", "community"]) if (!new RegExp('key: "' + b + '"').test(home)) fail("missing bucket: " + b);
if (!home.includes('return "community"')) fail("eventBucket must collapse everything else into Community");
if (!ev.includes("🎟️ Tours") || !ev.includes("📍 Near me")) fail("Events filter row missing Tours/Near me chips");
if (!ev.includes('ViatorRail title="Bookable experiences near you"')) fail("Tours view must render the Viator rail");

if (failed) process.exit(1);
console.log("check-events: OK — same-day labels reflect the real hour (9:30 AM = 'This morning', not 'Tonight')");
