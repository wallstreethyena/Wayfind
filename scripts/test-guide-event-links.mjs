// Guide event links guard (SEO engine 2026-11-28): the Florida boat parade hub
// links to every real Wayfind boat parade page, read live from wf_events. Only
// scheduled or sold out Florida rows that are not over show; nothing is typed
// in by hand; a failed or unconfigured read shows nothing, never a guess.
import { readFileSync } from "node:fs";
import { GUIDE_EVENT_LINKS, guideEventLinkConfig, guideEventLinkRows, fetchGuideEventLinks } from "../lib/guideEventLinks.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const cfg = guideEventLinkConfig("florida-christmas-boat-parades-2026");
ok(cfg && cfg.heading && cfg.match.length >= 2, "boat parade hub has an event link config");
ok(guideEventLinkConfig("not-a-guide") === null, "other guides get no config");
ok(Object.values(GUIDE_EVENT_LINKS).every((c) => c.match.every((m) => /^(slug|event_name)\.ilike\.\*[a-z* -]+\*$/.test(m))), "match terms only touch slug or event_name with ilike");

const fl = { state: "FL" };
const rows = [
  { ...fl, slug: "b-parade-2026", event_name: "B Parade", city: "Tampa", start_date: "2026-12-19", end_date: null, event_status: "scheduled" },
  { ...fl, slug: "a-parade-2026", event_name: "A Parade", short_title: "A", city: "Naples", start_date: "2026-12-05", end_date: "2026-12-05", event_status: "sold_out" },
  { ...fl, slug: "a-parade-2026", event_name: "A Parade dup", city: "Naples", start_date: "2026-12-05", event_status: "scheduled" },
  { ...fl, slug: "over-2026", event_name: "Over", start_date: "2026-11-20", end_date: "2026-11-21", event_status: "scheduled" },
  { ...fl, slug: "gone-2026", event_name: "Canceled", start_date: "2026-12-12", event_status: "canceled" },
  { state: "CA", slug: "newport-2026", event_name: "Newport Beach", start_date: "2026-12-16", event_status: "scheduled" },
  { ...fl, slug: "Bad Slug!", event_name: "Bad", start_date: "2026-12-12", event_status: "scheduled" },
  { ...fl, slug: "noname-2026", event_name: "", start_date: "2026-12-12", event_status: "scheduled" },
  null,
];
const out = guideEventLinkRows(rows, { today: "2026-11-28" });
ok(out.length === 2, "keeps only upcoming, displayable, Florida, named, well formed, unique rows (got " + out.length + ")");
ok(out[0] && out[0].slug === "a-parade-2026" && out[1].slug === "b-parade-2026", "sorted by start date");
ok(out[0] && out[0].name === "A Parade", "anchor text is the full event name, not the short title");
ok(out[0] && out[0].soldOut === true && out[1].soldOut === false, "sold out is carried so the link can say so");
ok(out.every((l) => l.href === "/florida-events/" + l.slug), "links go to the Wayfind event page, never outside");
ok(out[0] && out[0].when === "Dec 5" && out[1].when === "Dec 19", "date label comes from the row");
ok(guideEventLinkRows("x").length === 0 && guideEventLinkRows([], {}).length === 0, "bad input is empty");
ok(guideEventLinkRows(rows, { today: "2026-11-28", max: 1 }).length === 1, "max is respected");

// Fetch: fails closed, and the query is scoped.
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
let seen = "";
const good = await fetchGuideEventLinks("florida-christmas-boat-parades-2026", { today: "2026-11-28", env, fetcher: async (u) => { seen = u; return { ok: true, json: async () => rows }; } });
ok(good.length === 2, "fetch maps rows through the same filter");
const q = decodeURIComponent(seen);
ok(q.includes("/rest/v1/wf_events?") && q.includes("event_status=in.(scheduled,sold_out)") && q.includes("end_date.gte.2026-11-28") && q.includes("slug.ilike.*boat*parade*"), "query asks for upcoming displayable boat parade rows");
ok((await fetchGuideEventLinks("florida-christmas-boat-parades-2026", { today: "2026-11-28", env, fetcher: async () => ({ ok: false }) })).length === 0, "HTTP failure shows nothing");
ok((await fetchGuideEventLinks("florida-christmas-boat-parades-2026", { today: "2026-11-28", env, fetcher: async () => { throw new Error("down"); } })).length === 0, "thrown read shows nothing");
ok((await fetchGuideEventLinks("other-guide", { today: "2026-11-28", env, fetcher: async () => ({ ok: true, json: async () => rows }) })).length === 0, "unconfigured guide never reads");
ok((await fetchGuideEventLinks("florida-christmas-boat-parades-2026", { today: "2026-11-28", env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }, fetcher: async () => ({ ok: true, json: async () => rows }) })).length === 0, "missing credentials show nothing");

// The guide page renders the section on Wayfind links, and skips past guides.
const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
ok(/eventLinkCfg = past \? null : guideEventLinkConfig\(params\.slug\)/.test(page), "past guides do not read or render event links");
ok(page.includes("data-wf-guide-event-links") && page.includes("href={ev.href}"), "page renders the event link section");
ok(page.includes('ev.soldOut ? " · Sold out" : ""'), "a sold out parade says so");

// The hub description stays a real, short search snippet.
const guides = readFileSync(new URL("../lib/guidesChristmas2026.js", import.meta.url), "utf8");
const m = guides.match(/"florida-christmas-boat-parades-2026": \{[\s\S]*?description: "([^"]+)"/);
ok(m && m[1].length <= 155 && !/^Five /.test(m[1]), "boat parade hub description is under 155 characters and no longer says five");

if (fail.length) { console.error("test-guide-event-links: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-guide-event-links: OK - ${pass} assertions (boat parade hub links every live Wayfind parade page)`);
