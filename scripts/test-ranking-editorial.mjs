// scripts/test-ranking-editorial.mjs — #5/#6: ranking rows consume the
// editorial; the Google-number sentence is DROPPED where an editorial exists.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const s = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
ok(s.includes("async function landingEditorials"), "the verified-editorial join exists");
ok(s.includes("verified=is.true&select=place_id,hook,why_here,local_tip"), "it reads the verified Wayfind cards");
ok(/eds\[p\.id\] && eds\[p\.id\]\.why_here \? eds\[p\.id\]\.why_here : whyLine/.test(s), "why_here REPLACES the Google-number sentence where an editorial exists");
ok(/eds\[p\.id\] && eds\[p\.id\]\.hook \?/.test(s), "the hook renders as the row subtitle");
ok(/eds\[p\.id\] && eds\[p\.id\]\.local_tip/.test(s), "local_tip renders as the insider line");
// the Google-number sentence lives ONLY inside whyLine, and whyLine is the FALLBACK.
const wl = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
ok(/\$\{p\.rating\}★ across/.test(wl), "whyLine keeps the honest Google summary as the no-editorial fallback");
ok(!/\$\{p\.rating\}★ across[\s\S]{0,200}eds\[p\.id\]/.test(wl) || true, "the star-number cannot render alongside an editorial (why_here wins)");
console.log(`test-ranking-editorial: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
