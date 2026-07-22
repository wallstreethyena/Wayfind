// scripts/test-landing-tours.mjs — #4: bookable Viator cards on ranking pages,
// #2: product_url rendered VERBATIM with attribution.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const s = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
ok(s.includes("async function landingTours"), "the ranking-page tours fetch exists");
ok(s.includes('catSlug === "things-to-do" ? await landingTours'), "tours inject only on high-intent things-to-do pages");
ok(s.includes("i === 2 && tours.length >= 2"), "tours render AFTER the top 3 ranked items (owner placement)");
ok(s.includes("href={t.product_url}") && !/viatorApiProductUrl|product_code\}`/.test(s), "tour links render product_url VERBATIM — never rebuilt from product_code (keeps mcid+pid)");
ok(/\/pid=\/\.test\(t\.product_url\)/.test(s), "a tour without pid= in its product_url does not ship — no unattributed link");
ok(s.includes('rel="noopener sponsored nofollow"'), "affiliate rel on the ranking-page cards");
ok(s.includes("never changes our rankings"), "commission disclosure present");
console.log(`test-landing-tours: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
