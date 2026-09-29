// scripts/test-browse-back.mjs — the phone's Back button closes an open
// category instead of leaving Wayfind (owner, 2026-09-28: "the navigation of
// it is kind of weird"; reproduced on production: Home → Food → Back landed
// on the previous website). Structural lock on the three rules in
// app/home.js; the behaviour itself was verified in a real browser (see PR).
import { readFileSync } from "node:fs";

let pass = 0;
const fail = (m) => { console.error("test-browse-back: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const src = readFileSync("app/home.js", "utf8").replace(/^\s*\/\/.*$/gm, "");
ok(src.length > 400000, "positive control: home.js read intact");
const start = src.indexOf("const browseOpenRef = useRef(false);");
ok(start > 0, "the browse history effect exists");
const block = src.slice(start, start + 2200);
ok(/useEffect\(\(\) => \{\s*if \(!browseCat\) return undefined;/.test(block), "the effect runs only while a category is open");
ok(/if \(!\(window\.history\.state && window\.history\.state\.wf === "browse"\)\) window\.history\.pushState\(\{ wf: "browse" \}, ""\)/.test(block),
  "rule 1: opening a category pushes ONE browse entry, never a second one during a Back/Forward restore");
ok(/const onPop = \(\) => \{\s*if \(window\.history\.state && window\.history\.state\.wf === "browse"\) return;/.test(block),
  "rule 2: Back that lands on a browse entry (closing a detail sheet on top) keeps the category open");
ok(/closeBrowse\(\);/.test(block) && /browsePoppedRef\.current = true;/.test(block), "rule 2: otherwise Back closes the category through the normal closeBrowse path");
ok(/if \(!viaBack && window\.history\.state && window\.history\.state\.wf === "browse"\) window\.history\.back\(\);/.test(block),
  "rule 3: an in-app close steps back over our entry, so the next Back is never dead");
ok(/\}, \[!!browseCat\]\);/.test(block), "switching Food → Nightlife does not push again (keyed on open/closed only)");
ok(/useEffect\(\(\) => \{ if \(!browseCat\) setNavOpenCat\(null\); \}, \[browseCat\]\);/.test(src), "every close path releases the pressed tab, so the next tap on it reopens instead of deselecting");
// The detail sheet's own contract must be untouched.
ok(/window\.history\.pushState\(\{ wf: "detail" \}, ""\);/.test(src), "detail sheet still pushes its own entry");

console.log(`test-browse-back: OK — ${pass} assertions (category Back stays in-app; detail-on-top and in-app close paths covered)`);
