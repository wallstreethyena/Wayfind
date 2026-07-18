// scripts/test-sparse-category.mjs — locks "sparse-category honesty" on the
// browse feed (7/17 incident: Family returned 2 results, no end-of-list
// affordance, feed read as frozen while it silently shrank 60->13 mid-render).
// Three behaviours must stay wired:
//   (a) an end-of-feed line that names the count + city ("That's all N ... near {city}"),
//       with a widen-radius / relax-filter next step when the category is sparse (<8),
//   (b) card-shaped loading skeletons while the query lands (feed visibly completes),
//   (c) the city is named + approximate-location is disclosed when outside coverage.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-sparse-category: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// (b) loading skeletons on the browse feed (not a bare spinner over a shrinking list).
ok(/aria-busy="true"[^]{0,160}wf-skeleton/.test(home), "browse feed renders loading skeletons (aria-busy + wf-skeleton) while the category query lands");
ok(/Array\.from\(\{ length: 5 \}\)[^]{0,200}wf-skeleton/.test(home), "the skeleton is a card-shaped grid, not a single spinner");

// (a) end-of-feed honesty line + sparse next step.
ok(home.includes("That's all "), "browse feed shows an end-of-feed 'That's all N …' line so a short list reads as complete");
ok(/view\.length < 8/.test(home), "the widen/relax next step is gated on a sparse (<8) result count");
ok(/const _widen = \(\) =>/.test(home) && /_mi \+ " mi/.test(home), "sparse feed offers a widen-the-radius action (mechanic pinned, not the marketing copy)");
ok(home.includes("Show all ") && /setSub\("all"\)/.test(home), "sparse feed offers a relax-the-filter action when a sub-filter is active");

// (c) name the city + disclose approximate/out-of-coverage location.
ok(/near \{_city\}/.test(home), "the end-of-feed line names which city's results are shown");
ok(/locApprox \? " \(approximate location\)"/.test(home), "an approximate / out-of-coverage location is disclosed on the end-of-feed line");

console.log(`test-sparse-category: OK — ${pass} assertions (end-of-feed count+city, sparse widen/relax, loading skeletons)`);
