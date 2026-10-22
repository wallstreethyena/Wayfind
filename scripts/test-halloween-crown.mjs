#!/usr/bin/env node
// Sarasota Halloween Crown: corrected event facts, equal fan-vote cards, and
// the session campaign events. Calls the real functions and renders the page.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { withVerifiedFallVisitFacts } from "../lib/fallVisitFacts2026.js";
import { eventCostSummary, eventRestrictions } from "../lib/eventVisitFacts.js";
import { eventJsonLd, dateRangeLabel } from "../lib/curatedEvents.js";
import { addressLine } from "../lib/placeWhere.js";
import { findFallGuideEvent } from "../lib/floridaFallGuide2026.js";
import { GULF_COAST_FALL_2026_ROWS } from "../lib/gulfCoastFall2026.js";
import { SEASONAL_SEARCH_HUBS } from "../lib/seasonalSearch.js";
import { PHOTO_SURFACES } from "../lib/photoSurfaces.js";
import { captureOrQueue, sanitizeAnalyticsProperties } from "../lib/browserAnalytics.js";
import {
  CROWN_PATH, CROWN_PUBLISHED, CROWN_CREATIVE_ID, CROWN_CONTENDERS, CROWN_SESSION_KEY, CROWN_QA_KEY,
  saveCrownCampaign, readCrownCampaign, claimCrownPageView, crownPageViewedProps,
  contenderClickProps, contenderDestination, decorateCrownHref, crownClickId,
  isQaClick, outboundTicketEvent,
} from "../lib/crownCampaign.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIO = "?utm_source=instagram&utm_medium=social&utm_campaign=halloween_crown_srq&utm_content=crown_v1";
const BANNED = /every night|nightly|oct 1[–-]31|only ghost tour/i;
let checks = 0;
const ok = (cond, message) => { assert.equal(!!cond, true, message); checks++; };

function memory() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}
function bits(row) {
  return [row.schedule_note, row.card_hook, row.editorial_summary, row.why_go, row.end_date, dateRangeLabel(row)].filter(Boolean).join("\n");
}

const storage = memory();
const saved = saveCrownCampaign(BIO, storage);
ok(saved.creative_id === CROWN_CREATIVE_ID, "landing with the bio UTMs stores the fixed creative id");
ok(saved.utm_source === "instagram" && saved.utm_medium === "social", "bio utm_source and utm_medium are kept for the session");
ok(saved.utm_campaign === "halloween_crown_srq" && saved.utm_content === "crown_v1", "bio utm_campaign and utm_content are kept for the session");
ok(saveCrownCampaign("", storage).utm_campaign === "halloween_crown_srq", "a later URL with no UTMs keeps the session");
const dropped = memory();
ok(saveCrownCampaign("?utm_source=fan@example.com", dropped) == null, "an email-shaped campaign value is not stored");
ok(readCrownCampaign(dropped) == null, "a rejected landing does not write a session record");

const viewed = crownPageViewedProps("/sarasota-halloween-crown?utm_campaign=halloween_crown_srq", saved);
ok(viewed.path === CROWN_PATH && viewed.creative_id === CROWN_CREATIVE_ID && viewed.utm_content === "crown_v1", "crown_page_viewed carries the path and the session campaign fields");
ok(claimCrownPageView() === true && claimCrownPageView() === false, "a strict-mode double effect counts as one crown page view");

ok(CROWN_CONTENDERS.map((c) => c.slot).join() === "1,2,3", "the three contenders stay in the vote order");
for (const contender of CROWN_CONTENDERS) {
  const click = contenderClickProps(contender, storage);
  ok(click.contender_slot === contender.slot && click.contender_slug === contender.slug, "contender click names slot " + contender.slot);
  ok(click.destination_path === "/florida-events/" + contender.slug, "contender " + contender.slot + " opens its own event page");
  ok(click.creative_id === CROWN_CREATIVE_ID && click.utm_campaign === "halloween_crown_srq", "contender click carries the session campaign");
  ok(decorateCrownHref(contenderDestination(contender), saved).includes("utm_source=instagram&utm_medium=social&utm_campaign=halloween_crown_srq&utm_content=crown_v1"), "the followed link keeps the bio UTMs");
}

ok(crownClickId(true).startsWith("wf-qaverify-"), "a QA click id uses the wf-qaverify- prefix");
ok(crownClickId(false).startsWith("wf-") && !crownClickId(false).startsWith("wf-qaverify-"), "a live click id is not a QA id");
ok(crownClickId(true) !== crownClickId(true), "each click id is unique");
const qaStore = memory();
qaStore.setItem(CROWN_QA_KEY, "1");
ok(isQaClick(qaStore) === true && isQaClick(storage) === false, "QA mode is the session flag, not the campaign");

const eventbrite = outboundTicketEvent("https://www.eventbrite.com/e/halos", CROWN_CONTENDERS[2].slug, { storage, qa: true });
ok(eventbrite.event === "event_outbound_clicked" && eventbrite.properties.provider === "eventbrite", "an Eventbrite ticket tap is event_outbound_clicked");
ok(eventbrite.properties.event_slug === CROWN_CONTENDERS[2].slug && eventbrite.properties.destination_domain === "eventbrite.com", "the Eventbrite tap names the event and the destination domain");
ok(eventbrite.properties.click_id.startsWith("wf-qaverify-") && eventbrite.properties.utm_content === "crown_v1", "the ticket tap carries a QA click id and the campaign");
const vanwezel = outboundTicketEvent("https://www.vanwezel.org/events/detail/ghostbusters-in-concert", CROWN_CONTENDERS[1].slug, { storage });
ok(vanwezel.event === "event_outbound_clicked" && vanwezel.properties.provider === "vanwezel", "the Van Wezel hop is provider vanwezel");
const fever = outboundTicketEvent("https://feverup.com/en/sarasota/x", CROWN_CONTENDERS[0].slug, { storage });
ok(fever.properties.provider === "fever" && fever.event === "event_outbound_clicked", "a Fever hop is provider fever");
const operator = outboundTicketEvent("https://www.discoversarasotatours.com/all-tours/haunted-sarasota/", CROWN_CONTENDERS[0].slug, { storage });
ok(operator.event === "event_outbound_clicked" && operator.properties.destination_domain === "discoversarasotatours.com" && operator.properties.provider == null, "an unlisted ticket host still fires event_outbound_clicked without an invented provider");
const affiliate = outboundTicketEvent("/api/commerce/go?provider=tiqets&offer=1", CROWN_CONTENDERS[0].slug, { storage, kind: "affiliate" });
ok(affiliate.event === "commerce_cta_clicked" && affiliate.event !== "event_outbound_clicked", "an affiliate go link uses commerce_cta_clicked");
ok(affiliate.properties.provider === "tiqets" && affiliate.properties.event_slug === CROWN_CONTENDERS[0].slug && affiliate.properties.click_id.startsWith("wf-"), "the affiliate event keeps the slug, provider, and click id");
ok(affiliate.properties.creative_id === CROWN_CREATIVE_ID, "the affiliate event keeps the campaign fields");
ok(outboundTicketEvent("/florida-events/haunted-sarasota-trolley-tour-2026", CROWN_CONTENDERS[0].slug, { storage }) == null, "an in-site event link is not an outbound ticket tap");

const captured = [];
const win = {
  posthog: { capture: (event, properties) => { captured.push({ event, properties }); } },
  navigator: { userAgent: "Mozilla/5.0" },
  localStorage: { getItem: () => null },
};
ok(captureOrQueue(win, "crown_page_viewed", viewed) === "captured", "crown_page_viewed reaches the capture client");
ok(captureOrQueue(win, "crown_contender_clicked", contenderClickProps(CROWN_CONTENDERS[0], storage)) === "captured", "crown_contender_clicked reaches the capture client");
ok(captureOrQueue(win, eventbrite.event, eventbrite.properties) === "captured", "event_outbound_clicked reaches the capture client");
ok(captured.map((row) => row.event).join() === "crown_page_viewed,crown_contender_clicked,event_outbound_clicked", "the mock client received the three event names in order");
ok(captured[0].properties.path === CROWN_PATH && captured[1].properties.contender_slot === 1 && captured[2].properties.provider === "eventbrite", "the captured properties match the spec");

const previousSession = globalThis.sessionStorage;
globalThis.sessionStorage = storage;
const merged = sanitizeAnalyticsProperties({ value: 42 });
ok(merged.creative_id === CROWN_CREATIVE_ID && merged.utm_campaign === "halloween_crown_srq" && merged.value === 42, "later pageviews pick up the saved campaign fields");
globalThis.sessionStorage = { getItem: () => null };
ok(!("creative_id" in sanitizeAnalyticsProperties({ value: 42 })) && !("utm_campaign" in sanitizeAnalyticsProperties({ value: 42 })), "a session without the Crown record adds no campaign keys");
globalThis.sessionStorage = previousSession;

const rawHaunted = {
  event_id: "haunted-sarasota-trolley-2026",
  slug: "haunted-sarasota-trolley-tour-2026",
  event_name: "Haunted Sarasota Ghost Tour",
  event_status: "scheduled",
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  venue: "Discover Sarasota Tours",
  address: "1826 4th St",
  city: "Sarasota",
  state: "FL",
  county: "Sarasota",
  price_min: 62.99,
  schedule_note: "not every night through Oct 31",
  card_hook: "nightly in October",
  editorial_summary: "rolls nightly through October",
  why_go: "The only ghost tour in Sarasota that runs every night of October, and it is air-conditioned.",
};
ok(BANNED.test(rawHaunted.why_go) && BANNED.test(rawHaunted.card_hook), "the probe finds the old trolley claims before correction");
const haunted = withVerifiedFallVisitFacts(rawHaunted);
ok(haunted.end_date === "2026-10-30" && haunted.price_min === 62.99 && haunted.venue === "Discover Sarasota Tours", "the trolley ends October 30, keeps $62.99, and keeps its venue");
ok(dateRangeLabel(haunted) === "Oct 1–30", "the trolley date line is Oct 1–30");
ok(/select October nights/i.test(haunted.schedule_note) && !BANNED.test(bits(haunted)), "the trolley schedule says select October nights and drops the old claims");
ok(eventJsonLd(haunted).endDate === "2026-10-30", "trolley JSON-LD endDate is October 30");

const guideHaunted = findFallGuideEvent("haunted-sarasota-trolley-2026");
ok(guideHaunted.end_date === "2026-10-30" && !BANNED.test(guideHaunted.schedule_note), "the fall guide repeats the corrected trolley dates");

const rawHalos = {
  event_id: "hw26-halos-and-horns-halloween-bash-at-perspective-roofto-sarasota-2026",
  slug: "halos-and-horns-halloween-bash-at-perspective-roofto-sarasota-2026",
  event_name: "Halos & Horns Halloween Bash",
  event_status: "scheduled",
  start_date: "2026-10-31",
  end_date: "2026-10-31",
  start_time: "21:00:00",
  end_time: "01:30:00",
  minimum_age: 21,
  venue: "Perspective Rooftop Pool Bar",
  address: "1255 North Palm Avenue, Sarasota, FL 34236",
  city: "Sarasota",
  state: "FL",
  county: "Sarasota",
};
const halos = withVerifiedFallVisitFacts(rawHalos);
const halosLd = eventJsonLd(halos);
ok(halos.end_date === "2026-11-01" && halos.minimum_age === 21, "Halos runs through 1:30 AM on November 1 and stays 21+");
ok(halosLd.startDate.startsWith("2026-10-31T21:00:00") && halosLd.endDate.startsWith("2026-11-01T01:30:00-04:00"), "Halos JSON-LD ends November 1 at 1:30 AM Eastern, still EDT");
ok(String(halosLd.location.address.streetAddress).includes("8th Floor"), "Halos JSON-LD address includes 8th Floor");
ok(addressLine(halos).includes("8th Floor"), "the Halos address line includes 8th Floor");
ok(eventRestrictions(halos).includes("Ages 21+"), "Halos entry rules include Ages 21+");

const rawGhost = {
  event_id: "ghostbusters-in-concert-van-wezel-2026",
  slug: "ghostbusters-in-concert-van-wezel-2026",
  event_name: "Ghostbusters in Concert",
  event_status: "scheduled",
  start_date: "2026-10-29",
  end_date: "2026-10-29",
  start_time: "19:00:00",
  price_min: 46,
  price_max: 91,
  admission_offer: null,
  venue: "Van Wezel Performing Arts Hall",
  city: "Sarasota",
  state: "FL",
  county: "Sarasota",
};
ok(/check fees/i.test(eventCostSummary(rawGhost)), "without the fee flag the shared cost line still says check fees");
const ghost = withVerifiedFallVisitFacts(rawGhost);
ok(eventCostSummary(ghost) === "$46 to $91 · Prices shown include fees.", "Van Wezel shows the all-in range with the exact fee sentence");
ok(!/check fees|plus fees/i.test(eventCostSummary(ghost)), "the Van Wezel cost line does not say check fees or plus fees");
const ghostLd = eventJsonLd(ghost);
ok(ghostLd.offers.price === "46" && ghostLd.startDate.startsWith("2026-10-29T19:00:00"), "Ghostbusters JSON-LD is October 29 at 7 PM from $46");
const gulfGhost = GULF_COAST_FALL_2026_ROWS.find((row) => row.event_id === "ghostbusters-in-concert-van-wezel-2026");
ok(gulfGhost.schedule_note.includes("Prices shown include fees.") && !/check fees|plus fees/i.test(gulfGhost.schedule_note), "the gulf copy uses the exact fee sentence");

const page = await loadComponent(path.join(ROOT, "app/sarasota-halloween-crown/page.js"), ROOT);
const html = renderToStaticMarkup(React.createElement(page.default));
const cards = html.match(/class="wf-place-card /g) || [];
ok(cards.length === 3, "the Crown page renders three shared place cards");
ok(!html.includes('class="wf-place-card-score"') && !html.includes('class="wf-place-card-rank"'), "the Crown cards have no score badge and no rank chip");
ok(html.includes("Fan vote, not a Wayfind Score."), "the Crown page shows the exact fan-vote line");
let cursor = 0;
for (const contender of CROWN_CONTENDERS) {
  const at = html.indexOf(contender.title.replace(/&/g, "&amp;"), cursor);
  ok(at > cursor, "card " + contender.slot + " is present in vote order");
  cursor = at + contender.title.length;
}
ok(!/no ads|no paid placement|never sponsored/i.test(html), "the Crown page does not make a no-ads or no-paid-placement claim");
ok(!html.includes("/api/commerce/go") && !/\bfeatured\b/i.test(html) && !/\bsponsored\b/i.test(html), "the Crown page adds no affiliate link and no featured or sponsored treatment");
const cardsSource = readFileSync(path.join(ROOT, "app/sarasota-halloween-crown/CrownCards.js"), "utf8");
ok(!html.includes("utm_") && cardsSource.includes("href={destination}") && cardsSource.includes("decorateCrownHref(destination, fields)"), "the server render has no campaign query, and the click decorates the plain event path");
ok(html.includes("s=card") && html.includes("fmt=json") && !/<img[^>]*g=2/.test(html), "card photos use the credited card request, not a raw uncredited image");

const eventPage = readFileSync(path.join(ROOT, "app/florida-events/[slug]/page.js"), "utf8");
const disclosureAt = eventPage.indexOf('ticket.kind === "affiliate" ? <p');
ok(disclosureAt > 0 && eventPage.slice(disclosureAt, disclosureAt + 220).includes("We may earn a commission when you book through partner links. It never changes our rankings."), "an affiliate ticket still renders the visible disclosure under the link");
ok(eventPage.includes("data-wf-ticket-kind") && eventPage.includes("<CrownOutbound"), "only the Crown contender pages mark ticket hops");
ok(!SEASONAL_SEARCH_HUBS.some((hub) => hub.slug === "sarasota-halloween-crown"), "the Crown page is not added to seasonal navigation");
const surface = PHOTO_SURFACES.find((item) => item.id === "sarasota-halloween-crown");
ok(surface && surface.components.includes("app/sarasota-halloween-crown/CrownCards.js"), "the Crown cards are a registered photo surface");
ok(surface.static().map((item) => item.placeId).join() === CROWN_CONTENDERS.map((item) => item.placeId).join(), "the photo surface names the same three places");
const analyticsSource = readFileSync(path.join(ROOT, "lib/browserAnalytics.js"), "utf8");
ok(analyticsSource.includes(CROWN_SESSION_KEY) && !/from\s+["']\.\/crownCampaign\.js["']/.test(analyticsSource), "analytics reads the Crown session without a relative import the data-url test cannot resolve");
const provider = readFileSync(path.join(ROOT, "app/components/PostHogProvider.js"), "utf8");
ok(/register_for_session/.test(provider) && /sanitize_properties:\s*sanitizeAnalyticsProperties/.test(provider), "PostHog registers the Crown session and still sanitizes every payload");
// The owner took this route down at Vercel on October 20. The archived
// component above still has to render correctly; that does not publish it.
ok(CROWN_PUBLISHED === false, "the owner-requested Crown takedown remains in force");
ok(page.metadata.robots.index === false, "the held Crown page is noindex even without the edge rule");
const realFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  const sitemap = await loadComponent(path.join(ROOT, "app/sitemap.js"), ROOT);
  const urls = (await sitemap.default()).map((row) => new URL(row.url).pathname);
  ok(urls.includes("/guides") && urls.includes("/restaurants/sarasota"), "the real sitemap still lists published guide and Sarasota controls");
  ok(!urls.some((url) => url === CROWN_PATH || url.startsWith(CROWN_PATH + "/")), "the real sitemap never advertises the taken-down Crown route or subpaths");
} finally { globalThis.fetch = realFetch; }

let measured = null;
try {
  let chromium = null;
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("@playwright/test")); } catch {} }
  let executable = null;
  if (chromium) {
    try { const candidate = chromium.executablePath(); if (candidate && existsSync(candidate)) executable = candidate; } catch {}
    if (!executable && existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")) executable = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    if (!executable && existsSync("/usr/local/bin/google-chrome")) executable = "/usr/local/bin/google-chrome";
  }
  if (chromium && executable) {
    const browser = await chromium.launch({ executablePath: executable });
    const page390 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page390.setContent("<!doctype html><html><body style=\"margin:0;background:#040810\">" + html + "</body></html>", { waitUntil: "domcontentloaded" });
    measured = await page390.evaluate(() => {
      const cards = [...document.querySelectorAll(".wf-place-card")].map((el) => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
      return { innerWidth: window.innerWidth, note: document.querySelector("[data-crown-note]")?.textContent || "", cards };
    });
    await browser.close();
  }
} catch (error) {
  measured = { error: error.message };
}
if (measured && measured.cards) {
  ok(measured.innerWidth === 390, "the phone check read back innerWidth 390");
  ok(measured.note === "Fan vote, not a Wayfind Score.", "the fan-vote line is visible in the 390px document");
  ok(measured.cards.length === 3 && new Set(measured.cards.map((card) => card.width)).size === 1, "the three cards are the same width at 390px");
  ok(measured.cards.every((card) => card.height === 268 && card.width > 0 && card.width <= 440), "each card is the shared 268px height and within the 440px cap");
  console.log("test-halloween-crown: 390px measured " + JSON.stringify(measured));
} else {
  console.log("test-halloween-crown: 390px measurement NOT RUN" + (measured && measured.error ? " — " + measured.error : " — Chromium unavailable"));
}

await new Promise((resolve) => setTimeout(resolve, 90));
ok(claimCrownPageView() === true, "a later real visit still counts as its own crown page view");

console.log("test-halloween-crown: OK — " + checks + " assertions");
