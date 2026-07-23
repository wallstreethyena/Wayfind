// scripts/test-home-bookable.mjs — #3: one tasteful bookable card near the
// homepage top, product_url verbatim + attribution.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(h.includes("const [homeExp, setHomeExp]"), "the homepage bookable pick has state");
ok(h.includes('logEvent("tickets_out", null, { kind: "home_bookable"'), "the card is a tracked booking click");
ok(h.includes("Make a day of it"), "the tasteful bookable slot renders near the top");
ok(/href=\{homeExp\.url\}/.test(h) && !/viatorApiProductUrl|home.*product_code/.test(h), "the homepage card renders product_url VERBATIM (pid kept)");
ok(/\/pid=\/\.test\(t\.url\)/.test(h), "a home experience without pid= does not ship — no unattributed link");
ok(/\(Number\(!!b\.sellingOut\) - Number\(!!a\.sellingOut\)\)/.test(h), "the pick is the top selling-out, else top-reviewed");
ok(h.includes('rel="noopener sponsored nofollow"'), "affiliate rel on the homepage card");
ok(/homeExp && \(/.test(h), "the card is absent when there is no bookable inventory (fails soft)");
console.log(`test-home-bookable: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
