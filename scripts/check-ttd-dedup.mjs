// scripts/check-ttd-dedup.mjs — no duplicate cards on the "Things to do" browse.
// Two causes were possible: (1) STRUCTURAL — BookableExpRail (Viator tours) and
// ThingsToDoList (which interleaves the same tours in the ALL view) both rendered,
// so a tour showed twice; (2) DATA — the RPC could return a place and its
// identically-named tour. This locks both fixes: the rail renders only on a
// sub-filter (complement of ThingsToDoList's `sub === "all" || !sub`), and
// fetchThingsToDo dedups rows by id + normalized title.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-ttd-dedup: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const tb = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");

// 1) Rail + interleaving list are mutually exclusive by sub (no double-render).
ok(/browseCat === "attractions" && center && sub && sub !== "all" && <BookableExpRail/.test(home),
  "BookableExpRail renders ONLY on a sub-filter (so it never doubles the tours ThingsToDoList interleaves in the ALL view)");
ok(/browseCat === "attractions" && \(sub === "all" \|\| !sub\) && <ThingsToDoList/.test(home),
  "ThingsToDoList still renders in the ALL view (the two gates are complements)");

// 2) fetchThingsToDo dedups rows before returning.
ok(/_seenId/.test(tb) && /_seenName/.test(tb), "fetchThingsToDo dedups by id and normalized title");
ok(/kind === "experience" && r\.kind !== "experience"\) rows\[j\] = r/.test(tb), "on a title collision it keeps the PLACE over the tour");

console.log(`check-ttd-dedup: OK — ${pass} assertions (no duplicate cards on Things to do)`);
