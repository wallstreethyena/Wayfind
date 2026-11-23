// IndexNow guard (SEO engine 2026-11-23): the public key file must exist and
// match the key we submit with, or every submission is silently ignored; and a
// submission may only ever carry our own page URLs.
import { readFileSync, existsSync } from "node:fs";
import { INDEXNOW_KEY, INDEXNOW_HOST, INDEXNOW_KEY_LOCATION, buildIndexNowPayload, indexNowUrl } from "../lib/indexnow.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

ok(/^[a-f0-9]{32}$/.test(INDEXNOW_KEY), "key is 32 lowercase hex characters");
const keyFile = new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url);
ok(existsSync(keyFile), `public/${INDEXNOW_KEY}.txt exists`);
ok(existsSync(keyFile) && readFileSync(keyFile, "utf8").trim() === INDEXNOW_KEY, "key file holds exactly the key");
ok(INDEXNOW_HOST === "www.gowayfind.com" && INDEXNOW_KEY_LOCATION === `https://www.gowayfind.com/${INDEXNOW_KEY}.txt`, "host and key location are the canonical www host");

const p = buildIndexNowPayload(["/christmas-in-florida", "https://gowayfind.com/christmas-in-florida", "https://www.gowayfind.com/guides/things-to-do-sarasota#top", "https://evil.example.com/x", "/api/viator/go?x=1", "", null]);
ok(p.urlList.length === 2, "dedupes and drops foreign, API and empty inputs (got " + p.urlList.length + ")");
ok(p.urlList.every((u) => u.startsWith("https://www.gowayfind.com/")), "every URL is on www.gowayfind.com over https");
ok(p.urlList[1] === "https://www.gowayfind.com/guides/things-to-do-sarasota", "fragment stripped");
ok(indexNowUrl("https://www.gowayfind.com.evil.com/") === null && indexNowUrl("javascript:alert(1)") === null, "look alike hosts and odd schemes refused");
ok(p.key === INDEXNOW_KEY && p.host === INDEXNOW_HOST, "payload carries the key and host");

const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
ok(!mw.includes(`${INDEXNOW_KEY}`) && !/matcher:[^\]]*"\/:path\*"/.test(mw), "middleware does not intercept the key file (static)");

if (fail.length) { console.error("test-indexnow: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-indexnow: OK - ${pass} assertions (key file matches, own URLs only)`);
