// scripts/test-site-time.mjs — locks the ONE shared siteTodayStr and its use as
// the single source of "today" for date cutoffs (B11/B20 events, C1 coupons).
import { siteTodayStr, siteTodayParts, siteAnchorDate } from "../lib/siteTime.js";
import { couponIsLive } from "../lib/coupons.js";
import { windowRange, filterByWindow } from "../lib/eventsList.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-site-time: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eq = (a, b, m) => ok(a === b, `${m} (got ${a} want ${b})`);

// "Today" is the VENUE-local (US Eastern) calendar day, never the server's UTC day.
eq(siteTodayStr(new Date("2026-08-01T00:30:00Z")), "2026-07-31", "00:30 UTC Aug 1 = 8:30pm EDT Jul 31 -> ET day Jul 31");
eq(siteTodayStr(new Date("2026-07-31T18:00:00Z")), "2026-07-31", "2pm EDT control -> Jul 31");
eq(siteTodayStr(new Date("2026-01-15T04:30:00Z")), "2026-01-14", "winter 04:30 UTC = 11:30pm EST Jan 14 -> ET day Jan 14 (DST-aware)");

// couponIsLive: '>=' keeps a coupon live THROUGH its expiry day, dead the day after.
ok(couponIsLive({ id: "x", title: "t", expires: "2026-07-31" }, "2026-07-31") === true, "coupon live on its expiry day");
ok(couponIsLive({ id: "x", title: "t", expires: "2026-07-31" }, "2026-08-01") === false, "coupon dead the day after expiry");
ok(couponIsLive({ id: "x", title: "t", expires: null }, "2026-08-01") === true, "no-expiry coupon always live");
ok(couponIsLive({ id: "x", title: "t", expires: "2026-07-31" }) === true || couponIsLive({ id: "x", title: "t", expires: "2999-01-01" }) === true, "couponIsLive runs with the real venue-local default without throwing");

// Wiring: the shared module is the single source; UTC toISOString day cutoffs are gone.
const coup = readFileSync(new URL("../lib/coupons.js", import.meta.url), "utf8");
ok(/import \{ siteTodayStr \} from "\.\/siteTime\.js"/.test(coup), "coupons.js imports siteTodayStr from the shared module");
ok(/todayIso \|\| siteTodayStr\(\)/.test(coup), "couponIsLive defaults 'today' to venue-local siteTodayStr");
ok(!/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(coup), "coupons.js no longer uses a UTC toISOString day");
const scr = readFileSync(new URL("../app/components/screens/Coupons.js", import.meta.url), "utf8");
ok(/siteTodayStr\(\)/.test(scr) && !/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(scr), "Coupons screen uses siteTodayStr, not a UTC day");
const ep = readFileSync(new URL("../lib/eventsPipeline.js", import.meta.url), "utf8");
ok(/from "\.\/siteTime\.js"/.test(ep) && /export \{ siteTodayStr \}/.test(ep), "eventsPipeline re-exports the shared siteTodayStr (route.js importer unaffected)");

// Day-math primitives + the event-window fix, locked at the boundary instant
// (8:30 PM EDT Jul 31 = 00:30 UTC Aug 1). Before the fix, UTC rolled the day to
// Aug 1 and "tonight" dropped tonight's still-upcoming events on the SEO pages.
const NOW = new Date("2026-08-01T00:30:00Z");
eq(siteTodayParts(NOW).d, 31, "siteTodayParts anchors to the ET day (31), not UTC (1)");
eq(siteAnchorDate(NOW).getDate(), 31, "siteAnchorDate reads the ET calendar day (31)");
eq(windowRange("tonight", NOW).start, "2026-07-31", "windowRange tonight.start = tonight (ET), not tomorrow");
eq(windowRange("tonight", NOW).end, "2026-07-31", "windowRange tonight.end = tonight (ET)");
eq(filterByWindow([{ date: "2026-07-31" }, { date: "2026-08-01" }], "tonight", NOW).length, 1, "tonight's event survives after 8 PM ET (only Jul 31 counts as 'tonight')");

console.log(`test-site-time: OK — ${pass} assertions (one venue-local siteTodayStr; coupons + events + day-math route through it)`);
