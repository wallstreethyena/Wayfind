// scripts/test-showtime-dedup.mjs — locks B12. When a specific date is selected
// (mergeDates=false) the client dedup key must include TIME, so two distinct
// showtimes of one show at one venue on that day stay separate cards instead of
// collapsing to the earliest one.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-showtime-dedup: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

ok(/normEvtKey\(e\) \+ "\|" \+ \(e\.date \|\| ""\) \+ "\|" \+ \(e\.time \|\| ""\)/.test(home),
  "date-selected dedup key includes time (distinct showtimes stay separate)");
ok(!/normEvtKey\(e\) \+ "\|" \+ \(e\.date \|\| ""\);/.test(home),
  "the old date-only dedup key (dropped later showtimes) is gone");

console.log(`test-showtime-dedup: OK — ${pass} assertions (same-day showtimes no longer collapse)`);
