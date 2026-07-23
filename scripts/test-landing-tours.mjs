// scripts/test-landing-tours.mjs — #4: bookable Viator cards on ranking pages,
// rendered CLIENT-SIDE (the build-time fetch returned empty), product_url verbatim.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const s = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
ok(s.includes("import TourStrip from"), "the ranking page mounts the client TourStrip");
ok(s.includes('catSlug === "things-to-do" ? <TourStrip'), "tours mount only on high-intent things-to-do pages");
const ts = readFileSync(new URL("../app/components/TourStrip.js", import.meta.url), "utf8");
ok(ts.startsWith('"use client"'), "TourStrip is a client island — it fetches /api/experiences at RUNTIME (the build-time read returned empty)");
ok(ts.includes('fetch("/api/experiences?"'), "TourStrip reads the runtime experiences endpoint");
ok(/href=\{t\.url\}/.test(ts) && !/viatorApiProductUrl|product_code/.test(ts), "product_url rendered VERBATIM (mcid+pid) — never rebuilt");
ok(/\/pid=\/\.test\(t\.url\)/.test(ts), "a tour without pid= does not ship");
ok(ts.includes('rel="noopener sponsored nofollow"') && ts.includes("never changes our rankings"), "affiliate rel + disclosure present");
ok(ts.includes("items.length < 2") , "the strip hides below 2 tours — never a lonely ad");
console.log(`test-landing-tours: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
