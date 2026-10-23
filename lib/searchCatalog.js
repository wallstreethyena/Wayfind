// lib/searchCatalog.js — guides, coupons, and section pages the search box can open.
//
// These live in the repo, not in Postgres, so search works before the unified
// index migration is applied. The migration's wf_search_replace_documents()
// can load the same rows later. Expired guides and coupons stay out.

import { GUIDES } from "./guides.js";
import { currentGuides } from "./guideLifecycle.js";
import { COUPONS, couponIsLive } from "./coupons.js";
import { COVERED_CITIES, LANDING_CITIES } from "./landingCities.js";
import { siteTodayStr } from "./siteTime.js";

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function cityFromLabel(label) {
  const text = normalize(label);
  if (!text) return null;
  let best = null;
  for (const [slug, city] of Object.entries(COVERED_CITIES)) {
    const name = normalize(city.name);
    if (!name) continue;
    if (text === name || text.startsWith(`${name} `)) {
      if (!best || name.length > best.name.length) best = { slug, name: city.name, label: name };
    }
  }
  return best;
}

const SECTION_PAGES = [
  { title: "Halloween in Florida", href: "/halloween-in-florida", keywords: ["halloween", "spooky", "haunted"], category: "events" },
  { title: "Fall in Florida", href: "/fall-in-florida", keywords: ["fall", "autumn"], category: "events" },
  { title: "Christmas in Florida", href: "/christmas-in-florida", keywords: ["christmas", "holiday"], category: "events" },
  { title: "Coupons and local deals", href: "/coupons", keywords: ["coupon", "coupons", "deals", "discounts"], category: "coupons" },
  { title: "Wayfind guides", href: "/guides", keywords: ["guides", "guide"], category: "guides" },
  { title: "Hidden gems", href: "/hidden-gems", keywords: ["hidden gems"], category: "attractions" },
  { title: "Tonight", href: "/tonight", keywords: ["tonight"], category: "nightlife" },
  { title: "Worth the drive", href: "/worth-the-drive", keywords: ["worth the drive"], category: "attractions" },
  { title: "Quick bite", href: "/quick-bite", keywords: ["quick bite", "lunch"], category: "food" },
  { title: "Family day", href: "/family", keywords: ["family", "kids"], category: "attractions" },
  { title: "Date night", href: "/date-night", keywords: ["date night", "romantic"], category: "nightlife" },
  { title: "Budget and cheap eats", href: "/budget", keywords: ["cheap", "budget", "cheap eats"], category: "food" },
];

function cityPages() {
  const docs = [];
  for (const [slug, city] of Object.entries(LANDING_CITIES)) {
    const base = { city_slug: slug, city_name: city.name, lat: city.lat, lng: city.lng, kind: "page" };
    docs.push({ ...base, title: `Things to do in ${city.name}`, href: `/things-to-do/${slug}`, keywords: ["things to do", "activities"], category: "attractions", secondary: `Page · ${city.name}, ${city.state}` });
    docs.push({ ...base, title: `Restaurants in ${city.name}`, href: `/restaurants/${slug}`, keywords: ["restaurants", "brunch", "breakfast", "food"], category: "food", secondary: `Page · ${city.name}, ${city.state}` });
    docs.push({ ...base, title: `Beaches in ${city.name}`, href: `/beaches/${slug}`, keywords: ["beach", "beaches"], category: "beach", secondary: `Page · ${city.name}, ${city.state}` });
    docs.push({ ...base, title: `Nightlife in ${city.name}`, href: `/nightlife/${slug}`, keywords: ["nightlife", "bars"], category: "nightlife", secondary: `Page · ${city.name}, ${city.state}` });
    docs.push({ ...base, title: `Events in ${city.name}`, href: `/events/${slug}/this-weekend`, keywords: ["events"], category: "events", secondary: `Event · ${city.name}, ${city.state}` });
  }
  return docs;
}

export function buildSearchCatalog({ today = siteTodayStr() } = {}) {
  const docs = [...cityPages(), ...SECTION_PAGES.map((page) => ({ ...page, kind: "page", secondary: `Page · ${page.title}` }))];
  for (const [slug, guide] of Object.entries(currentGuides(GUIDES, today))) {
    if (!guide || !guide.title) continue;
    const city = cityFromLabel(guide.region);
    const keywords = [guide.keyword, ...(guide.relatedKeywords || [])].filter((word) => typeof word === "string");
    docs.push({
      kind: "guide",
      title: guide.title,
      href: `/guides/${slug}`,
      secondary: `Guide${guide.region ? ` · ${guide.region}` : ""}`,
      city_slug: city && city.slug,
      city_name: city && city.name,
      category: "guides",
      keywords,
      kid_friendly: null,
    });
  }
  for (const coupon of COUPONS) {
    if (!couponIsLive(coupon, today)) continue;
    const city = cityFromLabel(coupon.area);
    const business = String(coupon.business || "").split("—")[0].trim();
    docs.push({
      kind: "coupon",
      title: [business, coupon.title].filter(Boolean).join(": "),
      href: `/coupons#${coupon.id}`,
      secondary: `Coupon${coupon.area ? ` · ${coupon.area}` : ""}`,
      city_slug: city && city.slug,
      city_name: city && city.name,
      category: "coupons",
      keywords: ["coupon", "deal", coupon.title].filter(Boolean),
      price_band: null,
    });
  }
  return docs;
}
