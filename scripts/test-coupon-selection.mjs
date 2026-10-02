// test-coupon-selection — a venue's FIRST coupon expiring must not hide a still-valid later one (2026-10-01).
// lib/coupons.js indexed coupons by Place ID keeping only the first per venue, so when cpn-geckos-19th-hole
// ends (2026-12-31) the evergreen cpn-geckos-happy-hour for the SAME venue became unreachable
// (check-coupon-place-match went red 2027-01-02). Explicit reference dates only; no host clock.
import { COUPONS, couponIsLive, couponForPlace, couponForPlaceName } from "../lib/coupons.js";
import { siteTodayStr } from "../lib/siteTime.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const keyOf = (c) => (c && (c.placeId || c.venuePlaceId)) ? String(c.placeId || c.venuePlaceId) : null;
// The OLD behaviour, verbatim in spirit: first coupon per venue id, else null. Used as a CONTROL.
const oldPick = (k, today) => { const c = COUPONS.find((x) => keyOf(x) === k); return c && couponIsLive(c, today) ? c : null; };

const GECKO = "ChIJH9Womvo8w4gR3b99nAsCHXY";
const geckoRows = COUPONS.filter((c) => keyOf(c) === GECKO);
ok(geckoRows.length >= 2, `the Gecko's venue has >=2 coupons in the registry (${geckoRows.length}) — the scenario this guards`);
const dated = geckoRows.find((c) => c.expires), evergreen = geckoRows.find((c) => !c.expires);
ok(!!dated && !!evergreen && COUPONS.indexOf(dated) < COUPONS.indexOf(evergreen), "a DATED offer precedes an EVERGREEN one for the venue (the order that exposed the bug)");
const pick = (id, today) => (couponForPlace({ place_id: id, name: "" }, today) || {}).id || null;
const expDay = String(dated.expires).slice(0, 10); // 2026-12-31
const dayAfter = (iso) => new Date(Date.parse(iso + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);

// 1) valid dated first offer wins while live (existing priority), including its last day
ok(pick(GECKO, "2026-10-01") === dated.id, `before expiry the first offer (${dated.id}) is returned — priority preserved`);
ok(pick(GECKO, expDay) === dated.id, "on its last day (inclusive) the first offer is still returned");
// 2) expired first offer + valid evergreen alternative
ok(pick(GECKO, dayAfter(expDay)) === evergreen.id, `the day after ${expDay} the evergreen alternative (${evergreen.id}) is returned`);
ok(pick(GECKO, "2027-01-02") === evergreen.id, "2027-01-02: the evergreen offer is returned (this is the failing date from the sweep)");
// 3) CONTROL: the old first-wins logic returns NOTHING at that date, so this test discriminates
ok(oldPick(GECKO, "2027-01-02") === null, "control: the OLD first-per-venue logic hides the valid offer at 2027-01-02");
// exact boundary in venue-local time (EST, UTC-5): 23:59:59 ET on 12-31 vs 00:00:00 ET on 01-01
const lastSecond = new Date("2027-01-01T04:59:59Z"), nextSecond = new Date("2027-01-01T05:00:00Z");
ok(pick(GECKO, siteTodayStr(lastSecond)) === dated.id, "23:59:59 ET on 2026-12-31 -> first offer still live");
ok(pick(GECKO, siteTodayStr(nextSecond)) === evergreen.id, "00:00:00 ET on 2027-01-01 -> evergreen alternative");
// never an expired card, never a non-live card
ok(geckoRows.every((c) => { const r = couponForPlace({ place_id: GECKO }, "2099-01-01"); return !r || couponIsLive(r, "2099-01-01"); }), "a returned coupon is always live at the asked date");

// 4) multiple valid offers: the FIRST in registry order wins, not the last or a random one
for (const [id, rows] of Object.entries(COUPONS.reduce((m, c) => { const k = keyOf(c); if (k) (m[k] = m[k] || []).push(c); return m; }, {}))) {
  if (rows.length < 2) continue;
  const t = "2026-10-01";
  const firstLive = rows.find((c) => couponIsLive(c, t));
  ok((couponForPlace({ place_id: id }, t) || null) === (firstLive || null), `${id}: first live offer in registry order is returned`);
}

// 5) no eligible offers: a venue whose coupons are ALL dated returns null once every one has ended
const byVenue = COUPONS.reduce((m, c) => { const k = keyOf(c); if (k) (m[k] = m[k] || []).push(c); return m; }, {});
const allDated = Object.entries(byVenue).find(([, rows]) => rows.every((c) => c.expires));
ok(!!allDated, "control: at least one venue has only dated coupons");
if (allDated) {
  const last = allDated[1].map((c) => String(c.expires).slice(0, 10)).sort().pop();
  ok(couponForPlace({ place_id: allDated[0] }, dayAfter(last)) === null, "no eligible offers -> null (not an expired card, not a name fallback)");
}

// 6) different venues stay separate; identity still beats name; malformed input is inert
const venues = Object.keys(byVenue);
ok(venues.length >= 5, `several distinct venues are indexed (${venues.length})`);
for (const v of venues) { const r = couponForPlace({ place_id: v }, "2026-10-01"); ok(!r || keyOf(r) === v, `${v}: never returns another venue's coupon`); }
ok(couponForPlace(null, "2026-10-01") === null && couponForPlace({}, "2026-10-01") === null, "null / empty place is inert");
ok(couponForPlace({ place_id: "ChIJ-definitely-not-indexed", name: "" }, "2026-10-01") === null, "an unknown id with no name resolves nothing");
// the NAME map is untouched: it still keeps the first row on purpose (wrong-branch guard), so identity must be used for chains
ok(typeof couponForPlaceName === "function", "name lookup still exported and unchanged in behavior");

if (bad) { console.error(`\ntest-coupon-selection: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`test-coupon-selection: OK — ${n} assertions (expired first offer cannot hide a valid evergreen one; registry priority kept; boundary 2026-12-31 23:59:59 ET / 2027-01-02; venues stay separate; old logic proven to fail via control)`);
