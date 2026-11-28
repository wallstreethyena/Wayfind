// lib/guideEventLinks.js: a hub guide links to every real Wayfind event page
// of its kind (SEO engine 2026-11-28).
//
// The Florida boat parade guide named five parades and linked to none of the
// event pages Wayfind already has (29 upcoming Florida boat parades in
// wf_events on 2026-11-28). Those event pages are where free Google visitors
// actually land (Winter Haven, St. Pete, Venice), so the hub now lists each one
// with its own name, town and date, read live from the same rows that power
// /florida-events/[slug]. Nothing is typed in by hand: a row that is not
// scheduled or sold out, not in Florida, or already over never shows, and a
// failed read hides the section instead of guessing.

import { isFloridaEvent, dateRangeLabel, upcomingFilter } from "./curatedEvents.js";
import { guideFetch } from "./landingInventory.js";

export const GUIDE_EVENT_LINKS = Object.freeze({
  "florida-christmas-boat-parades-2026": Object.freeze({
    heading: "Every Florida boat parade on Wayfind",
    lede: "Each parade has its own page with the organizer's date, start time and where to watch.",
    // PostgREST or() terms over wf_events. Name and slug only, never free text.
    match: Object.freeze([
      "slug.ilike.*boat*parade*",
      "slug.ilike.*boat-a-long*",
      "event_name.ilike.*boat parade*",
      "event_name.ilike.*lighted boat*",
    ]),
    max: 60,
  }),
});

export function guideEventLinkConfig(slug) {
  return GUIDE_EVENT_LINKS[slug] || null;
}

const SLUG_RX = /^[a-z0-9][a-z0-9-]{1,150}$/;

/** Rows → links. Pure, so the guard can prove the filtering. */
export function guideEventLinkRows(rows, { today, max = 60 } = {}) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const slug = String(r.slug || "");
    if (!SLUG_RX.test(slug) || seen.has(slug)) continue;
    if (r.event_status !== "scheduled" && r.event_status !== "sold_out") continue;
    if (!isFloridaEvent(r)) continue;
    const last = r.end_date || r.start_date;
    if (!last || (today && String(last) < today)) continue;
    const name = String(r.event_name || r.short_title || "").trim();
    if (!name) continue;
    seen.add(slug);
    out.push({
      slug,
      href: "/florida-events/" + slug,
      name,
      city: String(r.city || "").trim() || null,
      when: dateRangeLabel(r) || null,
      start: String(r.start_date || ""),
      soldOut: r.event_status === "sold_out",
    });
  }
  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : String(a.city || "").localeCompare(String(b.city || ""))));
  return out.slice(0, max);
}

/** Live read. Returns [] when unconfigured, at build time, or on any failure. */
export async function fetchGuideEventLinks(slug, { today, fetcher = guideFetch, env = process.env } = {}) {
  const cfg = guideEventLinkConfig(slug);
  if (!cfg || !today) return [];
  // Runs at build too (guideFetch has a deadline), so the first baked page is not empty.
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return [];
  try {
    const q = new URLSearchParams();
    q.set("select", "slug,event_name,short_title,start_date,end_date,city,state,lat,lng,event_status");
    q.set("event_status", "in.(scheduled,sold_out)");
    q.append("and", `(or(${upcomingFilter(today)}),or(${cfg.match.join(",")}))`);
    q.set("order", "start_date.asc");
    q.set("limit", String(cfg.max + 20));
    const r = await fetcher(`${url}/rest/v1/wf_events?${q.toString()}`, {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      next: { revalidate: 900 },
    });
    if (!r || !r.ok) return [];
    return guideEventLinkRows(await r.json(), { today, max: cfg.max });
  } catch {
    return [];
  }
}
