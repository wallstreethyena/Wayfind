// scripts/check-events-paged-list.mjs
//
// 2026-10-08: the Events tab mounted every card of a ~180 card rail at once.
// Measured on production at 390px with 4x CPU throttling: first event card at
// 10.5 to 11.8 s, ~6.5 s of long tasks. The list now mounts EVENTS_PAGE cards
// and adds the next page when its "More" tile scrolls into view or is tapped.
//
// The owner's condition: "If pagination or incremental loading is needed,
// preserve complete discoverability." So this guard CALLS pageOfEvents to prove
// every event (including the 181st) is reachable in order by paging, and checks
// the screen counts, day strip and ordering still come from the FULL list.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const ev = await loadComponent(fileURLToPath(new URL("../app/components/screens/Events.js", import.meta.url)), REPO);
const { pageOfEvents, EVENTS_PAGE, halloweenChipFor } = ev;
ok(EVENTS_PAGE >= 12 && EVENTS_PAGE <= 40, `a page is a phone-sized batch (${EVENTS_PAGE})`);

const list = Array.from({ length: 181 }, (_, i) => ({ id: "e" + i, date: "2026-10-" + String(9 + (i % 23)).padStart(2, "0") }));
const first = pageOfEvents(list, EVENTS_PAGE);
ok(first.items.length === EVENTS_PAGE && first.remaining === 181 - EVENTS_PAGE && first.total === 181, "the first page mounts one batch and reports the rest");
let n = EVENTS_PAGE, seen = first.items.length, steps = 0;
while (pageOfEvents(list, n).remaining > 0 && steps < 50) { n += EVENTS_PAGE; steps += 1; seen = pageOfEvents(list, n).items.length; }
ok(seen === 181 && pageOfEvents(list, n).items[180].id === "e180", "paging reaches every event, the 181st included, in the original order");
ok(pageOfEvents(list, n).items.every((e, i) => e.id === "e" + i), "paging never reorders or drops");
ok(pageOfEvents([], EVENTS_PAGE).items.length === 0 && pageOfEvents(list.slice(0, 5), EVENTS_PAGE).remaining === 0, "short lists render whole with no More tile");
ok(pageOfEvents(list, 0).items.length === EVENTS_PAGE && pageOfEvents(list, 9999).items.length === 181, "bad page sizes clamp safely");

// Date discoverability: the strip covers eight days; Halloween gets its own chip
// while the season is live and Oct 31 is beyond that window.
const week = (from) => Array.from({ length: 8 }, (_, i) => { const d = new Date(Date.UTC(2026, 9, from + i)); return { value: d.toISOString().slice(0, 10) }; });
const hc = halloweenChipFor(week(8), "2026-10-08", true);
ok(hc && hc.value === "2026-10-31" && hc.top === "Halloween" && hc.day === 31, "on Oct 8 the strip gains a Halloween chip for Oct 31");
ok(halloweenChipFor(week(25), "2026-10-25", true) === null, "no extra chip once Oct 31 is already in the eight-day strip");
ok(halloweenChipFor(week(8), "2026-11-02", true) === null, "no Halloween chip after Halloween");
ok(halloweenChipFor(week(8), "2026-10-08", false) === null, "no Halloween chip outside the fall season");
const src = readFileSync(new URL("../app/components/screens/Events.js", import.meta.url), "utf8");
ok(/\{page\.items\.map\(\(e\) => <EventCard /.test(src) && /page\.remaining > 0 \? <RailMore /.test(src), "the rail mounts the current page and a More tile while events remain");
ok(/const countFor = \(dateVal\) => dedupeEvents\(catBase\.filter/.test(src) && /const allCount = dedupeEvents\(catBase, true\)\.length/.test(src), "day counts and the total still come from the full category list");
ok(/const page = pageOfEvents\(shown,/.test(src) && src.indexOf("shown = sortEventsForList(shown") < src.indexOf("const page = pageOfEvents(shown,"), "the page is cut AFTER filtering and ordering, never before");
ok(/loaded=\{page\.items\.length\}/.test(src), "the rail header says how many of the total are loaded");
ok(/const halloweenChip = halloweenChipFor\(eventDateChips, siteTodayStr\(\), seasonLive\);/.test(src) && /if \(halloweenChip\) eventDateChips\.push\(halloweenChip\);/.test(src), "the Events screen adds the Halloween chip to the strip it renders");

if (fail.length) {
  console.error(`check-events-paged-list: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-events-paged-list: OK — ${pass} assertions; pageOfEvents CALLED over 181 events (every one reachable in order); the page is cut after filter and sort; counts stay on the full list; halloweenChipFor CALLED (Oct 31 reachable by date)`);
