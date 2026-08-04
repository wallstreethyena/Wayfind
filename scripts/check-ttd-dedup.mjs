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
// 2026-08-04 — the mount gained a cat="attractions" prop when the rail was
// extended to all seven browse categories, so pinning the whole string broke.
// The INVARIANT is unchanged and is what is asserted: on ATTRACTIONS, the rail
// pulls experience inventory only for a real sub-filter, so it never doubles
// the tours ThingsToDoList already interleaves under "all".
{
  const mount = (home.match(/\{browseCat === "attractions" && center && <UnifiedBrowseCommerceRail[^\n]*/) || [""])[0];
  ok(mount.length > 0, "the attractions commerce rail is mounted");
  ok(/cat="attractions"/.test(mount), "it declares its own category, so the chip map cannot cross-resolve a sub id shared with another category");
  ok(/includeExperiences=\{!!\(sub && sub !== "all"\)\}/.test(mount),
    "the single commerce rail includes tours ONLY on a sub-filter (so it never doubles the tours ThingsToDoList interleaves in ALL)");
}
ok(/browseCat === "attractions" && \(sub === "all" \|\| !sub\) && <ThingsToDoList/.test(home),
  "ThingsToDoList still renders in the ALL view (the two gates are complements)");

// 2) fetchThingsToDo dedups rows before returning.
ok(/_seenId/.test(tb) && /_seenName/.test(tb), "fetchThingsToDo dedups by id and normalized title");
ok(/kind === "experience" && r\.kind !== "experience"\) rows\[j\] = r/.test(tb), "on a title collision it keeps the PLACE over the tour");

console.log(`check-ttd-dedup: OK — ${pass} assertions (no duplicate cards on Things to do)`);
