// scripts/check-ttd-dedup.mjs — no duplicate cards on the "Things to do" browse.
// Two causes were possible: (1) duplicate offers inside the Bookable rail; (2)
// the RPC returning a place and its identically-named tour. The Bookable rail
// now intentionally appears on All as well as every submenu, so the former
// render-exclusion rule is obsolete. This locks dedupe inside each result set.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-ttd-dedup: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const tb = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");

// 1) The Bookable rail is present on All and dedupes its own mixed inventory.
// 2026-08-04 — the mount gained a cat="attractions" prop when the rail was
// extended to all seven browse categories, so pinning the whole string broke.
// The INVARIANT is unchanged and is what is asserted: on ATTRACTIONS, the rail
// pulls the requested affiliate inventory on every submenu, including All.
{
  const mount = (home.match(/\{browseCat === "attractions" && center && <UnifiedBrowseCommerceRail[^\n]*/) || [""])[0];
  ok(mount.length > 0, "the attractions commerce rail is mounted");
  ok(/cat="attractions"/.test(mount), "it declares its own category, so the chip map cannot cross-resolve a sub id shared with another category");
  ok(!/includeExperiences=\{!!\(sub && sub !== "all"\)\}/.test(mount),
    "the Bookable rail is no longer suppressed on Attractions/All");
}
ok(/browseCat === "attractions" && \(sub === "all" \|\| !sub\) && <ThingsToDoList/.test(home),
  "ThingsToDoList still renders its ranked place-and-tour list in the ALL view");

const browseRail = readFileSync(new URL("../app/components/UnifiedBrowseCommerceRail.js", import.meta.url), "utf8");
ok(/const seen = new Set\(\)/.test(browseRail) && /if \(seen\.has\(name\) \|\| seenOffers\.has\(row\.key\)\) return false/.test(browseRail),
  "the unified Bookable rail dedupes its own mixed-provider rows by normalized title");

// 2) fetchThingsToDo dedups rows before returning.
ok(/_seenId/.test(tb) && /_seenName/.test(tb), "fetchThingsToDo dedups by id and normalized title");
ok(/kind === "experience" && r\.kind !== "experience"\) rows\[j\] = r/.test(tb), "on a title collision it keeps the PLACE over the tour");

console.log(`check-ttd-dedup: OK — ${pass} assertions (Bookable All enabled; each result set dedupes its own cards)`);
