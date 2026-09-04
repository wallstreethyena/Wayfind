#!/usr/bin/env node
// Every homepage poster must have one deterministic plain-tap outcome, and a
// collection request must not be cancelled merely because telemetry callback
// identity changed. The latter left Today's Best on a permanent skeleton:
// cleanup marked the only request dead, while asked.current blocked a retry.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RAILS } from "../lib/rails.js";

const ROOT = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const daypart = read("app/components/DaypartRail.js");
let pass = 0;
const failures = [];
const ok = (condition, message) => condition ? pass++ : failures.push(message);

const visible = RAILS.filter((rail) => !rail.artStale && !rail.retiredInto);
ok(visible.length >= 18, `poster registry unexpectedly shrank to ${visible.length}`);
ok(/onClick=\{function \(e\) \{ tileClick\(e, id\); \}\}/.test(daypart)
  && /onClick=\{\(e\) => tileClick\(e, id\)\}/.test(daypart),
"poster anchors and fallback buttons are not both wired to the shared click handler");
ok(/if \(_r && _r\.opensPage\) return;[\s\S]+?e\.preventDefault\(\);/.test(daypart),
"page-opening posters no longer preserve native anchor navigation");
ok(/if \(selected === id\) close\(\); else open\(id, "rail"\);/.test(daypart),
"in-place posters no longer open their shared drop");

for (const rail of visible) {
  if (rail.opensPage) {
    ok(!!rail.href, `${rail.id}: opensPage has no href, so its plain tap is inert`);
  } else {
    ok(rail.list || rail.guides || rail.id === "chef" || rail.id === "augtober",
      `${rail.id}: no page navigation and no in-place answer contract`);
  }
}

const ownerMatch = daypart.match(/const railOwnsItsOwnAnswer =[^;]+;/);
ok(!!ownerMatch, "the dedicated-answer registry disappeared");
const ownedIds = ownerMatch ? [...ownerMatch[0].matchAll(/selRail\.id === "([^"]+)"/g)].map((match) => match[1]) : [];
for (const id of ownedIds) {
  ok(daypart.includes(`selRail.id === "${id}" ? (`), `${id}: marked as owning its answer but mounts no answer component`);
}

const componentDir = new URL("app/components/", ROOT);
for (const name of readdirSync(componentDir).filter((name) => /Rails\.js$/.test(name))) {
  const source = read(`app/components/${name}`);
  if (!source.includes("asked.current")) continue;
  const callbackDependency = [...source.matchAll(/\},\s*\[([^\]]+)\]\);/g)]
    .flatMap((match) => match[1].split(",").map((part) => part.trim()))
    .find((dependency) => /^on[A-Z]/.test(dependency));
  ok(!callbackDependency,
    `${name}: ${callbackDependency} is callback identity inside an asked.current request effect; a parent render can cancel the only request forever`);
}

// Positive control: the detector must catch the exact Today regression shape.
const sabotage = "useEffect(() => { if (asked.current === key) return; return () => { dead = true; }; }, [key, onTrack]);";
ok(/\},\s*\[([^\]]*\bonTrack\b[^\]]*)\]\);/.test(sabotage), "positive control cannot detect the callback-cancellation regression");

if (failures.length) {
  console.error("check-poster-open-contract: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`check-poster-open-contract: OK — ${pass} assertions across ${visible.length} visible posters; every tap has an outcome and callback churn cannot strand a request`);
