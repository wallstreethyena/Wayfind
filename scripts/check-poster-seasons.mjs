#!/usr/bin/env node
// scripts/check-poster-seasons.mjs - the seasonal homepage posters (Fall,
// Halloween, Christmas) show and hide on their own every year. EXECUTED: it
// CALLS lib/posterSeasons.js, lib/dayparts.js orderFor and the exact track
// predicate DaypartRail uses (railOnPosterTrack) for 2026, 2027 and 2028
// (Thanksgiving: Nov 26 2026, Nov 25 2027, Nov 23 2028). The DaypartRail
// component itself cannot be rendered in plain node here (it is wired to
// browser-only data hooks), so the last section is a STATIC check that the
// component calls the shared predicate - said plainly, not claimed as a render.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { posterSeasonLive, posterSeasonWindow, railOnPosterTrack, POSTER_SEASONS } from "../lib/posterSeasons.js";
import { DAYPARTS, DAYPART_IDS, orderFor } from "../lib/dayparts.js";
import { RAILS } from "../lib/rails.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const day = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const ids = RAILS.map((r) => r.id);
const byId = new Map(RAILS.map((r) => [r.id, r]));
// What the track really shows: the ordered ids through the real predicate.
const track = (band, today) => orderFor(band, ids, today).filter((id) => railOnPosterTrack(byId.get(id), today));

const THANKS = { 2026: "2026-11-26", 2027: "2027-11-25", 2028: "2028-11-23" };
for (const y of [2026, 2027, 2028]) {
  const fall = posterSeasonWindow("augtober", y), hw = posterSeasonWindow("halloween", y), xm = posterSeasonWindow("christmas", y);
  ok(fall.start === `${y}-08-15` && fall.end === THANKS[y], `${y}: fall window is Aug 15 .. Thanksgiving ${THANKS[y]} (got ${fall.start}..${fall.end})`);
  ok(hw.start === `${y}-10-10` && hw.end === `${y}-10-31`, `${y}: halloween window Oct 10 .. Oct 31`);
  ok(xm.start === `${y}-10-13` && xm.end === `${y + 1}-01-01`, `${y}: christmas window Oct 13 .. Jan 1 ${y + 1} (got ${xm.end})`);
  for (const [id, w] of [["augtober", fall], ["halloween", hw], ["christmas", xm]]) {
    ok(posterSeasonLive(id, w.start), `${y} ${id}: start day ${w.start} live`);
    ok(!posterSeasonLive(id, day(w.start, -1)), `${y} ${id}: day before start not live`);
    ok(posterSeasonLive(id, w.end), `${y} ${id}: end day ${w.end} live`);
    ok(!posterSeasonLive(id, day(w.end, 1)), `${y} ${id}: day after end not live`);
    // mid-season, and the far side of the year
    ok(posterSeasonLive(id, day(w.start, 3)), `${y} ${id}: three days in is live`);
  }
  ok(posterSeasonLive("christmas", `${y + 1}-01-01`) && !posterSeasonLive("christmas", `${y + 1}-01-02`), `${y}: christmas live Jan 1 ${y + 1}, gone Jan 2`);
  ok(posterSeasonLive("christmas", `${y}-12-25`) && !posterSeasonLive("christmas", `${y}-06-15`), `${y}: christmas live Dec 25, not in June`);
  ok(!posterSeasonLive("christmas", `${y}-01-02`) && posterSeasonLive("christmas", `${y}-01-01`), `${y}: the previous season's Jan 1 is live and Jan 2 is not`);
  ok(posterSeasonLive("breakfast", `${y}-03-03`) && posterSeasonLive("tonight", `${y}-07-04`), `${y}: non-seasonal rails are always live`);
}
ok(posterSeasonLive("augtober", "garbage") && posterSeasonLive("halloween", ""), "a malformed date fails open (never blanks the track)");
ok(Object.keys(POSTER_SEASONS).sort().join() === "augtober,christmas,halloween", "the window table holds exactly the three seasonal posters");

// The specific calls from the request, through the real predicate
ok(!railOnPosterTrack(byId.get("augtober"), "2026-08-14") && railOnPosterTrack(byId.get("augtober"), "2026-08-15"), "Fall absent Aug 14, present Aug 15");
ok(byId.get("halloween").seasonalThrough === undefined, "lib/rails.js no longer hard-codes a halloween seasonalThrough");
ok(!railOnPosterTrack({ id: "x", seasonalThrough: "2026-10-31" }, "2026-11-01") && railOnPosterTrack({ id: "x", seasonalThrough: "2026-10-31" }, "2026-10-31"), "generic per-rail seasonalThrough still honoured");
ok(!railOnPosterTrack({ id: "x", posterHidden: true }, "2026-10-14") && !railOnPosterTrack({ id: "x", artStale: true }, "2026-10-14") && !railOnPosterTrack({ id: "x", retiredInto: "y" }, "2026-10-14"), "posterHidden / artStale / retiredInto still hide a poster");

for (const band of DAYPART_IDS) {
  const raw = orderFor(band, ids, "2026-10-14");
  ok(raw.indexOf("halloween") === raw.indexOf("augtober") + 1, `${band}: halloween directly after augtober in orderFor on Oct 14 2026 (got ${raw.slice(0, 4).join(", ")})`);
  ok(DAYPARTS[band].order.indexOf('halloween') === DAYPARTS[band].order.indexOf('augtober') + 1 && DAYPARTS[band].order.includes('halloween'), `${band}: the band's own list seats halloween directly after augtober`);
  const noDate = orderFor(band, ids);
  ok(noDate.indexOf("halloween") === noDate.indexOf("augtober") + 1, `${band}: and in the static (no date) order`);
  const t = track(band, "2026-10-14");
  ok(t[0] === "augtober" && t[1] === "halloween" && t.includes("christmas") && t.indexOf("christmas") > 1, `${band} Oct 14 2026: track starts Fall, Halloween, Christmas behind (got ${t.slice(0, 4).join(", ")})`);
  const nov = track(band, "2026-11-01");
  ok(!nov.includes("halloween") && nov.includes("augtober") && nov.includes("christmas"), `${band}: halloween absent Nov 1, fall and christmas present`);
  // Christmas returns to its old slot (2nd morning/lunch/night, 3rd afternoon) once Halloween is hidden
  const slot = band === "afternoon" ? 2 : 1;
  ok(nov[0] === "augtober" && nov.indexOf("christmas") === slot, `${band} Nov 1: christmas back in its owner slot ${slot + 1} (got ${nov.slice(0, 4).join(", ")})`);
  ok(track(band, "2026-11-27")[0] === "christmas" && !track(band, "2026-11-27").includes("augtober"), `${band}: Christmas first all day Nov 27 2026, Fall gone`);
  ok(track(band, "2026-12-31")[0] === "christmas", `${band}: Christmas first Dec 31`);
  ok(track(band, "2027-01-01")[0] === "christmas", `${band}: Christmas still first Jan 1 2027`);
  ok(!track(band, "2027-01-02").includes("christmas") && !track(band, "2027-01-02").includes("halloween") && !track(band, "2027-01-02").includes("augtober"), `${band}: all three seasonal posters gone Jan 2 2027`);
  ok(!track(band, "2027-07-15").some((id) => POSTER_SEASONS[id]), `${band}: no seasonal poster in July`);
  // A mutated band list cannot break the Halloween adjacency
}
ok((() => { const o = orderFor("morning", ["a", "halloween", "b", "augtober", "c"]); return o.indexOf("halloween") === o.indexOf("augtober") + 1; })(), "orderFor re-seats halloween next to augtober even if a band list is edited wrongly");

// ── Static wiring (not a render; DaypartRail cannot load under plain node) ──
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const dr = strip(readFileSync(path.join(ROOT, "app/components/DaypartRail.js"), "utf8"));
ok(/import\s*\{\s*railOnPosterTrack\s*\}\s*from\s*"\.\.\/\.\.\/lib\/posterSeasons\.js"/.test(dr), "DaypartRail imports railOnPosterTrack");
ok((dr.match(/railOnPosterTrack\(r, siteTodayStr\(\)\)/g) || []).length === 1, "the track filter calls railOnPosterTrack(r, siteTodayStr()) exactly once");
ok(!/\.seasonalThrough/.test(dr), "DaypartRail no longer carries its own halloween-era seasonalThrough check");
const rl = strip(readFileSync(path.join(ROOT, "lib/rails.js"), "utf8"));
ok(!/seasonalThrough\s*:\s*"20\d\d-/.test(rl), "lib/rails.js carries no dated seasonalThrough literal");

console.log(`\ncheck-poster-seasons: ${fail ? "FAIL" : "OK"} - ${pass} assertions; windows computed for 2026/2027/2028 (Thanksgiving ${Object.values(THANKS).join(", ")}), Halloween pinned right of Fall in 4 bands, predicate executed; DaypartRail wiring is static`);
process.exit(fail ? 1 : 0);
