// lib/holidayReport.js: the Florida Holiday Events Report (owner, 2026-11-27:
// "a Florida holiday events report built from Wayfind's own numbers, the kind
// of thing reporters and bloggers cite").
//
// Pure. Every number on /reports/florida-holiday-events-2026 comes from this
// module, and every input is a listing Wayfind already publishes:
//   * the Christmas in Florida collection (lib/christmasBrowse.js
//     christmasBrowseCached), the same cached list /christmas-in-florida shows,
//     so the report and the page can never disagree;
//   * the New Year's Eve model (lib/newYearsEve.js), counted on its own and
//     never added to the Christmas total, so nothing is counted twice.
//
// Honesty rules (owner: "never invent numbers, unknown stays unknown"):
//   * Third party Viator tours are left out; the report counts events and
//     seasonal experiences, not bookable products.
//   * Free share is computed only over listings with a published price; the
//     listings with no price announced are reported as their own number.
//   * A day count uses the browse's own service date rule (select nights,
//     weekday cadences, closed dates), never the season envelope alone.
//   * No year over year trend: Wayfind has no 2025 holiday collection to
//     compare against, so the report says nothing about last year.
//   * Copy has no dashes (owner rule for public Wayfind copy).
import { CHRISTMAS_BROWSE_CATEGORIES, CHRISTMAS_REGIONS, filterChristmasBrowse } from "./christmasBrowse.js";
import { CHRISTMAS_SEASON_END } from "./christmasResearch.js";

export const HOLIDAY_REPORT_PATH = "/reports/florida-holiday-events-2026";
export const HOLIDAY_REPORT_CSV_PATH = HOLIDAY_REPORT_PATH + "/data.csv";
export const HOLIDAY_REPORT_PUBLISHED = "2026-11-27";
export const HOLIDAY_REPORT_TITLE = "Florida Holiday Events Report 2026";
export const HOLIDAY_REPORT_SEASON_END = CHRISTMAS_SEASON_END;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(day) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}
export function addDays(day, n) {
  const { y, m, d } = parts(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}
/** "Saturday, Dec 12" */
export function reportDayLabel(day) {
  const { m, d, wd } = parts(day);
  return DAYS[wd] + ", " + MONTHS[m - 1] + " " + d;
}
/** "Dec 12" */
export function reportShortDay(day) {
  const { m, d } = parts(day);
  return MONTHS[m - 1] + " " + d;
}
/** "November 27, 2026" */
export function reportLongDate(day) {
  const { y, m, d } = parts(day);
  return LONG_MONTHS[m - 1] + " " + d + ", " + y;
}

// Research labels that are not in the ten region list: folded into the region
// that contains them, so one area never shows as two bars.
const REGION_ALIASES = Object.freeze({
  "Palm Beaches": "Treasure Coast & Palm Beaches",
  "Treasure Coast": "Treasure Coast & Palm Beaches",
  "South Florida": "South Florida & Keys",
  "Florida Keys": "South Florida & Keys",
  "Northeast Florida": "First Coast",
  "Space Coast": "Daytona & Space Coast",
  "Big Bend": "North Florida & Big Bend",
  "North Florida": "North Florida & Big Bend",
});
export function reportRegion(region) {
  const r = String(region || "").trim();
  if (CHRISTMAS_REGIONS.includes(r)) return r;
  return REGION_ALIASES[r] || null;
}

// A trailing parenthetical names a neighborhood or the town it sits in
// ("Key West (Stock Island)"): the listing counts toward the town before it.
const cityKey = (c) => String(c || "").replace(/\s*\([^)]*\)\s*$/, "").trim().replace(/\s+/g, " ").replace(/^Saint\b/i, "St.").replace(/^St\b(?!\.)/i, "St.");

/** The listings the report counts: every Christmas collection listing except third party tours. */
export function reportListings(listings) {
  return (Array.isArray(listings) ? listings : []).filter((c) => c && c.kind !== "tour" && (c.id || c.event_id));
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function countBy(items, keyOf) {
  const m = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/**
 * Listings open on each day from `today` through the season end, using the
 * browse's own one day filter (it honors select nights and day rules and
 * never counts an undated season). Returns [{ day, count }].
 */
export function dailyOpenCounts(listings, today, end = HOLIDAY_REPORT_SEASON_END) {
  const out = [];
  if (!ISO_DAY.test(String(today || "")) || today > end) return out;
  for (let day = today; day <= end; day = addDays(day, 1)) {
    out.push({ day, count: filterChristmasBrowse(listings, { date: day }, today).length });
  }
  return out;
}

/**
 * The whole report model. `listings`: christmasBrowseCached().listings.
 * `nye`: an nyeModel() result, or null when its read failed (the section is
 * then left out rather than shown with partial numbers).
 */
export function holidayReportModel(listings, { today, nye = null } = {}) {
  if (!ISO_DAY.test(String(today || ""))) throw new Error("holidayReportModel requires an Eastern calendar date");
  const all = reportListings(listings);
  const total = all.length;

  const free = all.filter((c) => c.price_kind === "free").length;
  const paid = all.filter((c) => c.price_kind === "paid").length;
  const unannounced = total - free - paid;
  const family = all.filter((c) => c.audience === "family").length;
  const adultsOnly = all.filter((c) => c.audience === "adults-only").length;
  const undated = all.filter((c) => c.season_undated).length;
  // Starts after today (its first date is still ahead), from the browse's own temporal status.
  const notStarted = all.filter((c) => c.temporalStatus && c.temporalStatus.openingSoon === true).length;

  const regionCounts = countBy(all, (c) => reportRegion(c.region));
  const regions = CHRISTMAS_REGIONS.map((name) => ({ name, count: regionCounts.get(name) || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const unplaced = total - regions.reduce((s, r) => s + r.count, 0);

  const cityCounts = countBy(all, (c) => cityKey(c.city));
  const cities = [...cityCounts.entries()].map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  const topCities = cities.slice(0, 10);

  // Types: the same categories the Christmas page filters by (a listing can
  // sit in more than one type, so these do not add up to the total).
  const types = CHRISTMAS_BROWSE_CATEGORIES.map((cat) => ({
    id: cat.id, label: cat.label,
    count: filterChristmasBrowse(all, { category: cat.id }, today).length,
  })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const daily = dailyOpenCounts(all, today);
  const saturdays = daily.filter((d) => parts(d.day).wd === 6);
  const busiestDay = daily.reduce((best, d) => (!best || d.count > best.count ? d : best), null);
  // Every day that shares the top count: a tie is reported as a tie, never as one winner.
  const busiestDays = busiestDay && busiestDay.count > 0 ? daily.filter((d) => d.count === busiestDay.count) : [];
  const busiestSaturday = saturdays.reduce((best, d) => (!best || d.count > best.count ? d : best), null);
  const christmasEve = daily.find((d) => d.day === "2026-12-24") || null;

  const priced = free + paid;
  const model = {
    today, total, free, paid, unannounced, priced,
    freeShareOfPriced: pct(free, priced),
    unannouncedShare: pct(unannounced, total),
    family, familyShare: pct(family, total), adultsOnly,
    undated, notStarted,
    regions, unplaced, cities, topCities, cityCount: cities.length,
    types, daily, saturdays, busiestDay, busiestDays, busiestSaturday, christmasEve,
    nye: nyeSection(nye),
    seasonEnd: HOLIDAY_REPORT_SEASON_END,
  };
  model.findings = reportFindings(model);
  return model;
}

function nyeSection(nye) {
  if (!nye || nye.degraded || !Array.isArray(nye.all)) return null;
  const total = nye.all.length;
  if (!total) return null;
  const free = nye.all.filter((c) => c.price === "Free").length;
  const fireworks = nye.all.filter((c) => c.fireworks === true).length;
  const areas = (nye.regions || []).filter((r) => r.count > 0).length;
  return { total, free, fireworks, areas };
}

const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const TYPE_PHRASE = Object.freeze({ santa: "Santa visits", "drive-thru": "drive thru light shows" });
const typePhrase = (t) => TYPE_PHRASE[t.id] || t.label.toLowerCase();

/** The short, quotable lines at the top of the report. Each one is computed. */
export function reportFindings(m) {
  const out = [];
  if (!m.total) return out;
  out.push({
    id: "total",
    text: `Wayfind counts ${plural(m.total, "holiday event or experience", "holiday events and experiences")} across Florida from ${reportShortDay(m.today)} through ${reportShortDay(m.seasonEnd)}, ${m.seasonEnd.slice(0, 4)}, in ${plural(m.cityCount, "city and town", "cities and towns")}.`,
  });
  const tops = m.busiestDays || [];
  if (tops.length) {
    const count = plural(tops[0].count, "holiday listing", "holiday listings");
    const topSet = new Set(tops.map((d) => d.day));
    const sat = m.busiestSaturday && !topSet.has(m.busiestSaturday.day) && m.busiestSaturday.count > 0
      ? ` The busiest Saturday is ${reportDayLabel(m.busiestSaturday.day)}, with ${m.busiestSaturday.count}.`
      : "";
    const text = tops.length === 1
      ? `${reportDayLabel(tops[0].day)} is the busiest day of the season, with ${count} open statewide.${sat}`
      : tops.length === 2
        ? `${reportDayLabel(tops[0].day)} and ${reportDayLabel(tops[1].day)} tie as the busiest days of the season, with ${count} open statewide on each.${sat}`
        : `${tops.length} days tie as the busiest of the season, with ${count} open statewide on each, starting ${reportDayLabel(tops[0].day)}.${sat}`;
    out.push({ id: "busiest", text });
  }
  if (m.freeShareOfPriced != null && m.priced >= 10) {
    out.push({ id: "free", text: `${m.freeShareOfPriced}% of the holiday events with a published price are free to attend (${m.free} of ${m.priced}).` });
  }
  const top = m.regions[0];
  const city = m.topCities[0];
  if (top && top.count > 0 && city) {
    out.push({ id: "where", text: `${top.name} has the most holiday listings of any Florida region (${top.count}), and ${city.city} leads all cities with ${city.count}.` });
  }
  const type = m.types[0];
  if (type) out.push({ id: "type", text: `The most common type of holiday listing is ${typePhrase(type)}, with ${type.count}.` });
  const byId = new Map(m.types.map((t) => [t.id, t.count]));
  const lineup = [["lights", "light displays", "light display"], ["parades", "parades", "parade"], ["boat-parades", "holiday boat parades", "holiday boat parade"]]
    .filter(([id]) => byId.get(id) > 0).map(([id, many, one]) => plural(byId.get(id), one, many));
  if (lineup.length >= 2) out.push({ id: "lineup", text: `The season includes ${lineup.slice(0, -1).join(", ")} and ${lineup[lineup.length - 1]}.` });
  if (m.familyShare != null && m.family > 0) out.push({ id: "family", text: `${m.familyShare}% of the listings are marked family friendly by their organizers.` });
  return out;
}

/** The Dataset download: one row per number on the page. */
export function holidayReportCsv(m) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [["section", "label", "count", "as_of"]];
  const add = (section, label, count) => rows.push([section, label, count, m.today]);
  add("summary", "Holiday events and experiences, " + m.today + " through " + m.seasonEnd, m.total);
  add("price", "Free", m.free);
  add("price", "Ticketed", m.paid);
  add("price", "Price not announced", m.unannounced);
  add("audience", "Family friendly", m.family);
  add("audience", "Adults only", m.adultsOnly);
  add("dates", "Season confirmed, dates not announced", m.undated);
  add("dates", "Not started yet", m.notStarted);
  for (const r of m.regions) add("region", r.name, r.count);
  if (m.unplaced) add("region", "Region not mapped", m.unplaced);
  for (const c of m.cities) add("city", c.city, c.count);
  for (const t of m.types) add("type", t.label, t.count);
  for (const d of m.daily) add("open_on_day", d.day, d.count);
  if (m.nye) {
    add("new_years_eve", "New Year's Eve plans", m.nye.total);
    add("new_years_eve", "Free New Year's Eve plans", m.nye.free);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

/** Article + Dataset structured data for the report page. */
export function holidayReportSchema(m, { siteUrl, description }) {
  const url = siteUrl + HOLIDAY_REPORT_PATH;
  const org = { "@type": "Organization", name: "WAYFIND LLC", url: siteUrl, logo: siteUrl + "/icon-512.png" };
  const article = {
    "@type": "Article",
    "@id": url + "#article",
    headline: HOLIDAY_REPORT_TITLE,
    description,
    url,
    mainEntityOfPage: url,
    datePublished: HOLIDAY_REPORT_PUBLISHED,
    dateModified: m.today,
    author: org,
    publisher: org,
    image: [siteUrl + "/api/og?t=" + encodeURIComponent(HOLIDAY_REPORT_TITLE)],
    about: { "@id": url + "#dataset" },
  };
  const dataset = {
    "@type": "Dataset",
    "@id": url + "#dataset",
    name: "Florida holiday events, 2026 season (Wayfind)",
    description: "Counts of Florida holiday events and experiences listed on Wayfind from " + m.today + " through " + m.seasonEnd + ", by region, city, type, price status and day. Built from Wayfind's verified event listings.",
    url,
    creator: org,
    publisher: org,
    isAccessibleForFree: true,
    dateModified: m.today,
    temporalCoverage: m.today + "/" + m.seasonEnd,
    spatialCoverage: { "@type": "Place", name: "Florida, United States" },
    keywords: ["Florida holiday events", "Christmas events Florida", "holiday light shows Florida", "Florida boat parades", "New Year's Eve Florida"],
    variableMeasured: ["Holiday events and experiences", "Free events", "Ticketed events", "Events by region", "Events by city", "Events by type", "Events open per day"],
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: siteUrl + HOLIDAY_REPORT_CSV_PATH }],
  };
  const crumbs = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wayfind", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Christmas in Florida", item: siteUrl + "/christmas-in-florida" },
      { "@type": "ListItem", position: 3, name: HOLIDAY_REPORT_TITLE, item: url },
    ],
  };
  return { "@context": "https://schema.org", "@graph": [article, dataset, crumbs] };
}
