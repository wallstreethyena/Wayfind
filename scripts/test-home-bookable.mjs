// scripts/test-home-bookable.mjs — #3: one tasteful bookable card near the
// homepage top, product_url verbatim + attribution.
import { readFileSync } from "fs";
import { pickHomeExp } from "../lib/homeExpPick.js";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(h.includes("const [homeExp, setHomeExp]"), "the homepage bookable pick has state");
ok(h.includes('logEvent("tickets_out", null, { kind: "home_bookable"'), "the card is a tracked booking click");
ok(h.includes("Make a day of it"), "the tasteful bookable slot renders near the top");
ok(/href=\{homeExp\.url\}/.test(h) && !/viatorApiProductUrl|home.*product_code/.test(h), "the homepage card renders product_url VERBATIM (pid kept)");
ok(/\/pid=\/\.test\(t\.url\)/.test(h), "a home experience without pid= does not ship — no unattributed link");
ok(h.includes('rel="noopener sponsored nofollow"'), "affiliate rel on the homepage card");
ok(/homeExp && \(/.test(h), "the card is absent when there is no bookable inventory (fails soft)");

// HOUR-AWARE pick (owner: don't feature a night activity in the morning; don't
// stay frozen all day). Locked behaviorally on the extracted pure pick.
ok(/setHomeExp\(pickHomeExp\(items\)\)/.test(h) && /import \{ pickHomeExp \}/.test(h), "the pick routes through the hour-aware pickHomeExp");
ok(/todBucket\]/.test(h) && /visibilitychange/.test(h), "the pick refreshes on an hour ticker + tab focus (not frozen on last night's choice)");

const night = { title: "Sunset Sailing Cruise", url: "x?pid=1", image: "i", reviews: 5000, sellingOut: true };
const day = { title: "Kayak & Manatee Morning Tour", url: "x?pid=2", image: "i", reviews: 100 };
ok(pickHomeExp([night, day], 9) && pickHomeExp([night, day], 9).title === day.title, "9 AM: a night-coded selling-out tour is NOT featured (morning never shows night)");
ok(pickHomeExp([night, day], 20) && pickHomeExp([night, day], 20).title === night.title, "8 PM: the night-coded tour IS featured");
ok(pickHomeExp([], 9) === null && pickHomeExp(null, 12) === null, "no inventory → null (card absent, fails soft)");

console.log(`test-home-bookable: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
