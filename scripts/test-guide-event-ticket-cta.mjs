#!/usr/bin/env node
/**
 * test-guide-event-ticket-cta — a guide that names an EVENT's own ticket
 * (`eventTicket`) must resolve to the pinned Undercover Tourist row through
 * /api/commerce/go, with the venue on the button, and an unmapped id must fall
 * through to the ordinary rungs instead of producing a link. Executes THE CALL
 * (guidePrimaryCta), not a grep.
 *
 * Why this exists: the primary guide CTA is the one earning link on an
 * indexable page. Before this rung, a fall-events guide about Halloween Horror
 * Nights could only offer a CityPASS bundle (a product that does not sell the
 * night the page is about). This proves the new rung sells THE THING the page
 * promises and nothing else. RED PROVEN: flipping the expected offer id to 6
 * (the 3-day park ticket) fails the deal assertion.
 */
import { GUIDES } from "../lib/guides.js";
import { guidePrimaryCta } from "../lib/guideCta.js";
import { EVENT_TICKET_DEALS } from "../lib/eventTicketDeals.js";
import { UT_EVENT_DEAL_IDS } from "../lib/deals.js";
import { readFileSync } from "node:fs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const SLUG = "fall-events-orlando-2026";
const g = GUIDES[SLUG];
ok(!!g, `${SLUG} is registered in GUIDES`);

if (g) {
  ok(g.eventTicket === "hhn-orlando-2026", "the fall guide names HHN's own ticket");
  const entry = EVENT_TICKET_DEALS[g.eventTicket];
  ok(entry && entry.product === "event-ticket", "the named event resolves to an EVENT-TICKET row, never park admission");
  ok(entry && UT_EVENT_DEAL_IDS[String(entry.deal)] === g.eventTicket, "the deal id is pinned to this exact event in lib/deals.js");

  const cta = guidePrimaryCta(g, "2026-09-08");
  ok(cta && cta.kind === "deal", `primary CTA is kind deal (got ${cta && cta.kind})`);
  ok(cta && cta.monetized === true && cta.sponsored === true && cta.exact === true, "the CTA is monetized, sponsored and exact");
  ok(typeof cta.href === "string" && cta.href.startsWith("/api/commerce/go?"), `href goes through the commerce redirect (got ${cta && cta.href})`);
  const q = new URL("https://x" + (cta.href || "/")).searchParams;
  ok(q.get("provider") === "undercover_tourist", "provider is undercover_tourist");
  ok(q.get("offer") === String(entry && entry.deal), `offer is deal ${entry && entry.deal} (got ${q.get("offer")})`);
  ok(q.get("surface") === "guide", "surface is guide (CJ sub-id)");
  ok(q.get("content") === g.eventTicket, "content id is the event id");
  ok(!/anrdoezrs|cj\.dotomi|undercovertourist\.com/i.test(cta.href), "no partner host in the href");
  ok(cta.label === "Halloween Horror Nights tickets", `button names the venue (got "${cta && cta.label}")`);
  ok(cta.label.length <= 44, "label fits the 390px button");

  // Every pick that hands off to an event page uses a real-looking slug.
  const slugs = (g.picks || []).filter((p) => p.eventSlug).map((p) => p.eventSlug);
  ok(slugs.length >= 10, `the guide deep-links into at least 10 event pages (got ${slugs.length})`);
  ok(slugs.every((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)), "every eventSlug is a bare slug, not a URL");
  ok(new Set(slugs).size === slugs.length, "no event page is linked twice");
  ok(slugs.includes(g.eventTicket.replace(/^hhn-orlando/, "halloween-horror-nights-orlando")), "the ticketed event is also one of the picks");
}

// Unmapped id: falls through, never a dead link.
{
  const ghost = { region: "Orlando", title: "Ghost guide", keyword: "ghost", eventTicket: "no-such-event-2099", picks: [{ name: "Nothing" }], faq: [] };
  const cta = guidePrimaryCta(ghost, "2026-09-08");
  ok(!cta || !(cta.href || "").includes("undercover_tourist"), "an unmapped eventTicket produces no UT link");
}

// The renderer hands off to the event page as a plain INTERNAL anchor.
{
  const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
  ok(page.includes('"/florida-events/" + encodeURIComponent(pick.eventSlug)'), "page renders pick.eventSlug as an internal /florida-events link");
  ok(/pick\.eventSlug \? <a href=\{"\/florida-events\/"[^>]*>Dates, tickets &amp; verdict<\/a>/.test(page), "the handoff button carries the exact label and no rel");
  ok(page.includes('"@type": "ItemList"'), "the guide emits ItemList schema");
  ok(!page.includes('"@type": "Event"'), "the roundup never emits Event schema (that belongs on the single-event page)");
}

if (fail.length) {
  console.error("test-guide-event-ticket-cta: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-guide-event-ticket-cta: OK — ${pass} assertions`);
