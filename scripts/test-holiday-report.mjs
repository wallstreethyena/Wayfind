#!/usr/bin/env node
// Locks the Florida Holiday Events Report (lib/holidayReport.js and
// /reports/florida-holiday-events-2026). Owner 2026-11-27: a citable report
// built only from Wayfind's own listings; never invent numbers, unknown stays
// unknown. Asserts on the model's output (the CALL), with a known positive and
// a known negative for every rule, plus a consistency check against the real
// Christmas collection the page reads.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  HOLIDAY_REPORT_CSV_PATH, HOLIDAY_REPORT_PATH, holidayReportCsv, holidayReportModel, holidayReportSchema,
  reportListings, reportRegion, dailyOpenCounts,
} from "../lib/holidayReport.js";
import { christmasBrowseListings, filterChristmasBrowse } from "../lib/christmasBrowse.js";
import { holidayReportData } from "../lib/holidayReportData.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const TODAY = "2026-12-01"; // a Tuesday

const card = (id, over = {}) => ({
  id, event_id: id, kind: "event", name: id, title: id, city: "Tampa", region: "Tampa Bay",
  browse_categories: ["lights"], christmasRail: "lights", price_kind: "free", audience: "family",
  start_date: "2026-11-20", end_date: "2027-01-03", season_undated: false, dayRule: null,
  temporalStatus: { openingSoon: false }, ...over,
});

const fixtures = [
  card("lights-a"),
  card("lights-b", { city: "Saint Petersburg", price_kind: "paid" }),
  card("parade-sat", { browse_categories: ["parade"], christmasRail: "parades", start_date: "2026-12-05", end_date: "2026-12-05", price_kind: "unannounced", temporalStatus: { openingSoon: true }, city: "St Petersburg" }),
  card("select-nights", { browse_categories: ["concert"], christmasRail: "shows-outings", occurrence_dates: ["2026-12-05", "2026-12-12"], start_date: "2026-12-05", end_date: "2026-12-12", price_kind: "paid", audience: "all-ages", region: "Palm Beaches", city: "West Palm Beach" }),
  card("undated", { season_undated: true, start_date: null, end_date: null, price_kind: "free", region: "Central Florida", city: "Orlando" }),
  card("tour-1", { kind: "tour", price_kind: "paid" }),
];

// 1. What counts: tours never; everything else once.
const counted = reportListings(fixtures);
ok(counted.length === 5 && !counted.some((c) => c.kind === "tour"), "third party tours are left out, every other listing counts once");

const m = holidayReportModel(fixtures, { today: TODAY });
ok(m.total === 5, "total excludes the tour");

// 2. Price: free share only over listings with a published price.
ok(m.free === 2 && m.paid === 2 && m.unannounced === 1, "price buckets come from price_kind (tour excluded)");
ok(m.priced === 4 && m.freeShareOfPriced === 50, "free share is 2 of 4 priced, not 2 of 5 total");
ok(m.unannouncedShare === 20, "no price announced is its own share, never folded into free");

// 3. Days: the browse's own one day rule.
const day = (d) => m.daily.find((x) => x.day === d)?.count;
ok(day("2026-12-05") === 4, "Dec 5: both light shows, the one day parade and the select night show");
ok(day("2026-12-06") === 2, "Dec 6: the select night show is NOT open between its listed nights");
ok(m.daily.every((d) => d.count <= 4), "an undated season never counts toward a day");
ok(m.busiestDay.day === "2026-12-05" && m.busiestDay.count === 4, "busiest day is the computed max");
ok(m.busiestDays.length === 1 && m.findings.find((f) => f.id === "busiest").text.startsWith("Saturday, Dec 5 is the busiest day"), "a single top day is named as the busiest");
const tie = holidayReportModel([card("t1", { start_date: "2026-12-05", end_date: "2026-12-05" }), card("t2", { start_date: "2026-12-12", end_date: "2026-12-12" })], { today: TODAY });
ok(tie.busiestDays.map((d) => d.day).join() === "2026-12-05,2026-12-12", "two days with the same top count are both kept");
ok(/^Saturday, Dec 5 and Saturday, Dec 12 tie as the busiest days/.test(tie.findings.find((f) => f.id === "busiest").text), "a tie is reported as a tie, never as one winner");
ok(!/is the busiest day/.test(tie.findings.find((f) => f.id === "busiest").text), "the tied finding does not crown one day");
ok(m.saturdays.every((s) => new Date(s.day + "T12:00:00Z").getUTCDay() === 6), "Saturdays are Saturdays");
ok(m.daily[0].day === TODAY && m.daily.at(-1).day === m.seasonEnd, "the day series runs from today through the season end");
ok(dailyOpenCounts(fixtures, "2027-02-01").length === 0, "after the season there are no day counts");
ok(m.notStarted === 1, "not started yet comes from the temporal status");

// 4. Regions and cities.
ok(reportRegion("Palm Beaches") === "Treasure Coast & Palm Beaches" && reportRegion("Tampa Bay") === "Tampa Bay", "research region labels fold into the ten regions");
ok(reportRegion("Atlantis") === null, "an unknown region is not invented");
ok(m.regions.find((r) => r.name === "Treasure Coast & Palm Beaches").count === 1, "the folded region is counted once");
ok(m.regions.length === 10 && m.unplaced === 0, "all ten regions are listed and every listing is placed");
ok(holidayReportModel([card("kw1", { city: "Key West" }), card("kw2", { city: "Key West (Stock Island)" })], { today: TODAY }).cities[0].count === 2, "a trailing parenthetical folds into its town");
const stp = m.cities.find((c) => c.city === "St. Petersburg");
ok(stp && stp.count === 2, "Saint Petersburg and St Petersburg are one city");

// 5. Types: the Christmas page's own categories; a listing may be in two.
ok(m.types.find((t) => t.id === "lights").count === 3, "light displays: two light shows plus the undated light listing");
ok(m.types.find((t) => t.id === "parades").count === 1 && m.types.find((t) => t.id === "shows").count === 1, "parades and shows counted from their categories");
ok(!m.types.some((t) => t.count === 0), "empty types are not shown");

// 6. Findings: computed, no dashes, no claims beyond the model.
ok(m.findings.length >= 4, "findings are produced");
const text = m.findings.map((f) => f.text).join(" ");
ok(!/[–—]/.test(text) && !/ - /.test(text), "findings carry no dashes (owner copy rule)");
ok(text.includes("Wayfind counts 5 holiday events and experiences"), "the total finding quotes the model total");
ok(!/last year|2025|percent more|grew|increase/i.test(text), "no year over year claim without prior year data");
ok(!m.findings.some((f) => f.id === "free"), "the free share finding needs at least 10 priced listings (4 here)");
const bigFree = holidayReportModel(Array.from({ length: 12 }, (_, i) => card("f" + i, { price_kind: i < 9 ? "free" : "paid" })), { today: TODAY });
ok(bigFree.findings.find((f) => f.id === "free").text.startsWith("75% of the holiday events with a published price are free"), "with enough priced listings the free share is quoted (9 of 12)");

// 7. New Year's Eve: separate, never summed; a degraded read drops it.
const nye = { degraded: false, all: [{ price: "Free", fireworks: true }, { price: "From $40" }], regions: [{ count: 2 }, { count: 0 }] };
const withNye = holidayReportModel(fixtures, { today: TODAY, nye });
ok(withNye.nye.total === 2 && withNye.nye.free === 1 && withNye.nye.areas === 1 && withNye.total === m.total, "NYE is its own section and does not change the holiday total");
ok(holidayReportModel(fixtures, { today: TODAY, nye: { ...nye, degraded: true } }).nye === null, "a degraded NYE read shows no partial numbers");

// 8. CSV and structured data.
const csv = holidayReportCsv(withNye);
const csvRows = csv.trim().split("\n");
ok(csvRows[0] === "section,label,count,as_of", "CSV header");
ok(csvRows.some((r) => r === `price,Free,2,${TODAY}`) && csvRows.some((r) => r.startsWith(`"summary,`) === false && r.startsWith("summary,") && r.includes(",5,")), "CSV carries the model numbers");
ok(csvRows.some((r) => r.startsWith('region,Treasure Coast & Palm Beaches,1,')), "CSV region row");
ok(csvRows.some((r) => r.startsWith('summary,"Holiday events and experiences, ')), "a label with a comma is quoted");
ok(csvRows.filter((r) => r.startsWith("open_on_day,")).length === m.daily.length, "one CSV row per day");
const schema = holidayReportSchema(m, { siteUrl: "https://www.gowayfind.com", description: "d" });
const ds = schema["@graph"].find((g) => g["@type"] === "Dataset");
const art = schema["@graph"].find((g) => g["@type"] === "Article");
ok(ds && ds.distribution[0].contentUrl === "https://www.gowayfind.com" + HOLIDAY_REPORT_CSV_PATH && ds.temporalCoverage === TODAY + "/" + m.seasonEnd, "Dataset points at the CSV and states the date range");
ok(art && art.url === "https://www.gowayfind.com" + HOLIDAY_REPORT_PATH && art.dateModified === TODAY && art.author.name === "WAYFIND LLC", "Article carries the page, the data date and the publisher");
ok(schema["@graph"].some((g) => g["@type"] === "BreadcrumbList"), "breadcrumbs ship with the schema");
assert.throws(() => holidayReportModel(fixtures, { today: "Dec 1" }), /Eastern calendar date/); n++;

// 9. Consistency with the real Christmas collection (the repo's research
// listings, the same builder /christmas-in-florida uses at build time).
const real = christmasBrowseListings([], "2026-11-27");
const rm = holidayReportModel(real, { today: "2026-11-27" });
ok(rm.total === real.filter((c) => c.kind !== "tour").length && rm.total > 100, "the report total equals the Christmas collection minus tours (" + rm.total + ")");
ok(rm.busiestDays.every((d) => d.count === rm.busiestDay.count) && rm.daily.filter((d) => d.count === rm.busiestDay.count).length === rm.busiestDays.length, "busiestDays holds exactly the days at the top count");
ok(rm.busiestDay.count === filterChristmasBrowse(real, { date: rm.busiestDay.day }, "2026-11-27").length, "the busiest day equals the Christmas page's own one day filter");
ok(rm.free + rm.paid + rm.unannounced === rm.total, "price buckets add up to the total");
ok(rm.regions.reduce((s, r) => s + r.count, 0) + rm.unplaced === rm.total, "regions add up to the total");
ok(rm.cities.reduce((s, c) => s + c.count, 0) === rm.total, "cities add up to the total");

// 10. The data read: a failed Christmas read shows no numbers; a failed NYE read only drops that section.
const failed = await holidayReportData({ today: "2026-11-27", browse: async () => { throw new Error("down"); }, readNye: async () => ({ degraded: false, all: [] }) });
ok(failed.ok === false && !failed.model, "a failed Christmas read returns no model");
const empty = await holidayReportData({ today: "2026-11-27", browse: async () => ({ listings: [] }), readNye: async () => null });
ok(empty.ok === false, "an empty collection is treated as unavailable, never as zero events");
const good = await holidayReportData({ today: "2026-11-27", browse: async () => ({ listings: real }), readNye: async () => { throw new Error("nye down"); } });
ok(good.ok === true && good.model.total === rm.total && good.model.nye === null, "a failed NYE read keeps the report and drops only that section");

// 11. The page and its wiring.
const PAGE = "app/reports/florida-holiday-events-2026/page.js";
const src = readFileSync(PAGE, "utf8");
const code = src.replace(/\/\/[^\n]*/g, "");
ok(/export const dynamic = "force-dynamic"/.test(code), "the page renders at request time (a build read is a skip)");
ok(/holidayReportData\(\)/.test(code) && /holidayReportSchema\(/.test(code), "the page reads the model and ships its JSON-LD");
for (const href of ["/christmas-in-florida", "/new-years-in-florida", "/spring-break-in-florida", "/how-wayfind-ranks", "/editorial-policy"]) ok(code.includes(`href="${href}"`), "the page links " + href);
ok(code.includes("HOLIDAY_REPORT_CSV_PATH") && existsSync("app/reports/florida-holiday-events-2026/data.csv/route.js"), "the CSV download exists and is linked");
ok(/canonical: URL_/.test(code) && /index: true/.test(code), "canonical and indexable");
const visible = src.replace(/\/\/[^\n]*/g, "").replace(/\{[^{}]*\}/g, " ");
ok(!/[–—]/.test(visible), "page copy carries no en or em dashes");
ok(!/\b(?:sold out|best|#1|number one)\b/i.test(visible.replace(/"[^"]*"/g, " ").replace(/className=\S+/g, "")), "no unsupported ranking or availability claim in the page copy");
ok(readFileSync("app/sitemap.js", "utf8").includes("HOLIDAY_REPORT_PATH"), "the report is in the sitemap");
ok(readFileSync("app/llms.txt/route.js", "utf8").includes("/reports/florida-holiday-events-2026"), "the report is listed in llms.txt");

console.log(`test-holiday-report: OK (${n} assertions)`);
