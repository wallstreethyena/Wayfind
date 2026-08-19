#!/usr/bin/env node
// test-earning-handoff.mjs — founder P0: dead money handoffs (2026-08-19).
//
// A Book/commerce click must: navigate SAME-TAB through a go route, carry the
// same click_id on the client event and the go URL, and never put a raw
// partner URL (www.viator.com, booking.com, ticketmaster.evyy.net) in an
// earning button href. Ranking is not for sale. Crystal River × Viator is
// the proof loop — product honesty stays.
//
// This guard CALLS the resolver and the stamp helpers, then scans the live
// HIGH + Book-pipe sources. A source-only grep would pass the moment a
// forbidden name appeared in a comment (CLAUDE.md role-vs-substring).
// Set affiliate placeholders BEFORE any lib import. affiliates.js reads
// NEXT_PUBLIC_VIATOR_PID at module load; a static import would hoist past this.
process.env.NEXT_PUBLIC_VIATOR_PID = "P_TEST_000000";
process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "e2e-placeholder-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const { bookingTargets } = await import("../lib/bookingResolve.js");
const { viatorProductGoUrl, ticketmasterGoUrl, hotelUrl, experienceGoUrl } = await import("../lib/affiliates.js");
const { commerceHref } = await import("../lib/commerce.js");
const { withClickId, isEarningGoHref } = await import("../lib/hubConversion.js");

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-earning-handoff: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(join(REPO, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1 ");

const bookingCta = read("app/components/BookingCTA.js");
const bookingCtaCode = strip(bookingCta);
const bookingResolve = strip(read("lib/bookingResolve.js"));
const ticketBtn = strip(read("app/events/[city]/[slug]/TicketButton.js"));
const guideConvRaw = read("app/guides/[slug]/GuideConversion.js");
const guideConv = strip(guideConvRaw);

// Positive control (AGENTS.md §4d): the probe can find a known string.
ok(bookingCtaCode.includes("commerceHref"), "positive control — BookingCTA still calls commerceHref (probe is not blind)");

// ── CALL: bookingTargets earning href is a go route, never a partner URL ──
{
  const museum = {
    id: "ChIJ_handoff",
    name: "Crystal River State Park",
    address: "1 Main St, Crystal River, FL",
    types: ["museum", "tourist_attraction"],
  };
  const top = { url: "https://www.viator.com/tours/Crystal-River/Manatee/d5600-1", code: "d5600-1" };
  const t = bookingTargets(museum, "museum", top, "Crystal River, FL", { placeEvidence: { resolved: true, verifiedCount: 1 } });
  ok(typeof t.verifiedUrl === "string" && t.verifiedUrl.startsWith("/api/viator/go"),
    `bookingTargets verifiedUrl must be /api/viator/go (got ${t.verifiedUrl})`);
  ok(!/^https?:\/\/(?:www\.)?viator\.com/i.test(t.verifiedUrl),
    "verifiedUrl must not BE a raw viator.com href (the product= query may name the host)");
  ok(t.tu === t.verifiedUrl || (typeof t.tu === "string" && (t.tu.startsWith("/api/viator/go") || t.tu.startsWith("/api/commerce/go"))),
    "primary tu must be a go route");

  const search = bookingTargets(museum, "museum", null, "Crystal River, FL");
  ok(typeof search.goFallback === "string" && search.goFallback.startsWith("/api/viator/go"),
    "honest search fallback is experienceGoUrl (/api/viator/go), not a guessed product");
  ok(!/^https?:\/\/(?:www\.)?viator\.com/i.test(search.goFallback), "goFallback must not BE a raw viator.com href");
}

// bookingTargets must not assign viatorDirectUrl as the earning href.
ok(!/verifiedUrl\s*=\s*[^\n]*viatorDirectUrl\s*\(/.test(bookingResolve),
  "bookingTargets must not assign viatorDirectUrl as verifiedUrl");
ok(/viatorProductGoUrl\s*\(/.test(bookingResolve),
  "bookingTargets verifiedUrl must be built with viatorProductGoUrl");

// Hotel Stay22 / booking.com: fail-closed. hotelUrl still EXISTS (Stay22
// LinkSwap elsewhere) but must not be the earning tu.
{
  const hotel = { id: "hotel_1", name: "Test Inn", address: "1 Main, Orlando, FL", types: ["lodging", "hotel"] };
  const t = bookingTargets(hotel, "hotels", null, "Orlando, FL");
  const rawHotel = hotelUrl(hotel);
  ok(rawHotel && /booking\.com/i.test(rawHotel),
    "positive control — hotelUrl still builds a booking.com search (we are not deleting the builder)");
  ok(!t.tu || !/booking\.com/i.test(String(t.tu)),
    `bookingTargets must not return a booking.com earning href (got ${t.tu})`);
  ok(!/hotelUrl\s*\(/.test(bookingResolve),
    "bookingTargets must not call hotelUrl — that is the raw booking.com earning href");
}

// Guide hotel CTA belt: no booking.com earning href.
ok(/booking\\\.com/i.test(read("lib/guideCta.js")),
  "guide hotel CTA rejects a leftover booking.com earning href (fail-closed belt)");

// ── CALL: stamp helpers work on RELATIVE and absolutized go URLs ──────────
{
  const rel = "/api/commerce/go?provider=viator&offer=abc";
  const abs = "https://www.gowayfind.com/api/commerce/go?provider=viator&offer=abc";
  ok(isEarningGoHref(rel) === true, "isEarningGoHref accepts a relative go path");
  ok(isEarningGoHref(abs) === true, "isEarningGoHref accepts a browser-absolutized go URL — the currentTarget.href bug");
  ok(isEarningGoHref("https://www.viator.com/tours/x") === false, "isEarningGoHref rejects a raw partner URL");
  const stampedRel = withClickId(rel, "click-test-1");
  const stampedAbs = withClickId(abs, "click-test-1");
  ok(/[?&]click_id=click-test-1/.test(stampedRel), "withClickId stamps a relative go path");
  ok(/[?&]click_id=click-test-1/.test(stampedAbs), "withClickId stamps an absolutized go URL (never startsWith('/api/') on currentTarget.href)");
  ok(commerceHref({ provider: "viator", offerId: "abc", clickId: "click-test-1" }).includes("click_id=click-test-1"),
    "commerceHref({ clickId }) is the other legal stamp — on the relative path");
}

// ── BookingCTA primary live href is a go route ────────────────────────────
ok(/commerceHref\(\s*\{[\s\S]*?provider:\s*["']viator["'][\s\S]*?surface:\s*["']detail_primary["']/.test(bookingCtaCode),
  "BookingCTA primary verified href is commerceHref ( /api/commerce/go )");
ok(/primaryBase|primaryHref/.test(bookingCtaCode) && /withClickId\(/.test(bookingCtaCode),
  "BookingCTA primary stamps click_id via withClickId / commerceHref clickId on the relative path");

// RENDER the primary variant and parse the href (call, not string).
{
  const { default: BookingCTA } = await loadComponent(join(REPO, "app/components/BookingCTA.js"), REPO);
  ok(typeof BookingCTA === "function", "BookingCTA default export loads");
  const html = renderToStaticMarkup(createElement(BookingCTA, {
    variant: "primary",
    detail: { id: "ChIJ_handoff", name: "Crystal River State Park", address: "1 Main St, Crystal River, FL", types: ["museum", "tourist_attraction"] },
    kind: "museum",
    viaTours: { ChIJ_handoff: { loading: false, items: [{ url: "https://www.viator.com/tours/Crystal-River/Manatee/d5600-1", code: "d5600-1", title: "Manatee swim" }] } },
    locName: "Crystal River, FL",
    logEvent: () => {},
    addReservation: () => {},
    openExternal: () => { throw new Error("openExternal must not run for earning go routes"); },
  }));
  ok(html.includes("<a"), "primary variant rendered an anchor (not a hole)");
  const href = (html.match(/href="([^"]+)"/) || [])[1] || "";
  const path = href.startsWith("http") ? (() => { try { return new URL(href).pathname; } catch { return ""; } })() : href.split("?")[0];
  ok(path === "/api/commerce/go" || path === "/api/viator/go" || href.startsWith("/api/commerce/go") || href.startsWith("/api/viator/go"),
    `BookingCTA primary live href must start /api/commerce/go or /api/viator/go (got ${href})`);
  ok(!/^https?:\/\/(?:www\.)?(?:viator|booking)\.com/i.test(href),
    `BookingCTA primary href must not BE a raw partner URL (got ${href})`);
}

// Earning click must NOT preventDefault + openExternal / window.open.
ok(!/preventDefault\s*\(/.test(bookingCtaCode),
  "BookingCTA earning click must not preventDefault — native same-tab leave (founder P0)");
ok(!/\bopenExternal\s*\(/.test(bookingCtaCode),
  "BookingCTA must not call openExternal on earning go routes (founder P0; same-tab banned still applies to openExternal itself)");
ok(!/\bwindow\.open\s*\(/.test(bookingCtaCode),
  "BookingCTA must not window.open");

// List row without product code: no viator.com in href.
ok(!/viatorDirectUrl\s*\(/.test(bookingCtaCode),
  "BookingCTA list row must not call viatorDirectUrl");
ok(/viatorProductGoUrl\s*\(|experienceGoUrl\s*\(/.test(bookingCtaCode),
  "list row without a product code uses viatorProductGoUrl or experienceGoUrl");
{
  const listHtml = renderToStaticMarkup(createElement((await loadComponent(join(REPO, "app/components/BookingCTA.js"), REPO)).default, {
    variant: "list",
    detail: { id: "ChIJ_list", name: "A place", address: "1 Main St, Crystal River, FL", types: ["museum", "tourist_attraction"] },
    kind: "museum",
    viaTours: { ChIJ_list: { loading: false, items: [{ url: "https://www.viator.com/tours/Crystal-River/Manatee/d5600-1", title: "Manatee swim" }] } },
    locName: "Crystal River, FL",
    logEvent: () => {},
    addReservation: () => {},
    openExternal: () => {},
  }));
  ok(/href="\/api\/viator\/go\?/.test(listHtml) || /href="\/api\/commerce\/go\?/.test(listHtml),
    `list row without product code must href /api/viator/go or /api/commerce/go (got ${listHtml.slice(0, 240)})`);
  ok(!/href="https?:\/\/(?:www\.)?viator\.com/i.test(listHtml),
    "list row without product code must not href a raw viator.com URL");
}

// TicketButton href is /api/ticketmaster/go.
ok(/ticketmasterGoUrl\s*\(/.test(ticketBtn), "TicketButton builds href through ticketmasterGoUrl");
ok(!/\bwindow\.open\s*\(/.test(ticketBtn) && !/preventDefault\s*\(/.test(ticketBtn),
  "TicketButton is a native same-tab go anchor — no window.open / preventDefault");
{
  const dest = ticketmasterGoUrl("https://www.ticketmaster.com/event/abc", { surface: "event_detail", offerId: "e1" });
  ok(typeof dest === "string" && dest.startsWith("/api/ticketmaster/go"),
    `ticketmasterGoUrl returns /api/ticketmaster/go (got ${dest})`);
  const { default: TicketButton } = await loadComponent(join(REPO, "app/events/[city]/[slug]/TicketButton.js"), REPO);
  const html = renderToStaticMarkup(createElement(TicketButton, {
    url: "https://www.ticketmaster.com/event/abc",
    label: "Get tickets",
    eventId: "e1",
    provider: "ticketmaster",
  }));
  const href = (html.match(/href="([^"]+)"/) || [])[1] || "";
  ok(href.startsWith("/api/ticketmaster/go"),
    `TicketButton href must be /api/ticketmaster/go (got ${href})`);
  ok(!/^https?:\/\/(?:ticketmaster\.evyy\.net|www\.ticketmaster\.com)/i.test(href),
    "TicketButton href must not BE a raw Impact / Ticketmaster URL (the url= query may name the host)");
}

// startsWith("/api/") stamp on currentTarget.href must not be the only stamp.
{
  const stampOnAbsoluted = /currentTarget\.href[\s\S]{0,220}startsWith\(\s*["']\/api\//;
  const liveStarts = /live\s*&&\s*live\.startsWith\(\s*["']\/api\//;
  ok(!stampOnAbsoluted.test(bookingCtaCode) && !liveStarts.test(bookingCtaCode),
    "BookingCTA must not stamp click_id by startsWith('/api/') on currentTarget.href / live — that skips the stamp on an absolutized href");
  ok(!stampOnAbsoluted.test(guideConv) && !liveStarts.test(guideConv),
    "GuideConversion must not use the currentTarget.href startsWith('/api/') stamp");
  ok(!stampOnAbsoluted.test(ticketBtn) && !liveStarts.test(ticketBtn),
    "TicketButton must not use the currentTarget.href startsWith('/api/') stamp");
  ok(/withClickId\(/.test(bookingCtaCode) && /withClickId\(/.test(guideConv) && /withClickId\(/.test(ticketBtn),
    "the Book pipe stamps via withClickId (HubConversion) — not a third tracker");
}

// GuideConversion Book reuses HubConversion stamp + emitCommerce.
ok(/emitCommerce\(\s*["']commerce_cta_clicked["']/.test(guideConvRaw),
  "GuideConversion fires commerce_cta_clicked through emitCommerce so click_id survives the whitelist");
ok(/withClickId\(/.test(guideConvRaw), "GuideConversion stamps the go href with withClickId");

// Experience go builder (call) — list fallback / search stay ours.
ok(String(experienceGoUrl("Manatee swim", "Crystal River", "museum", "p1")).startsWith("/api/viator/go"),
  "experienceGoUrl is /api/viator/go");
ok(String(viatorProductGoUrl("https://viator.com/tours/Crystal-River/x/d1-2", "Crystal River", "museum", "detail")).startsWith("/api/viator/go"),
  "viatorProductGoUrl accepts apex and still returns /api/viator/go");

// ── CoS HIGH (same PR): Tripadvisor rating, VRBO alt, BookItLink ──────────
{
  const detailRaw = read("app/components/sheets/Detail.js");
  const detailCode = strip(detailRaw);
  ok(/_ta\.rating/.test(detailCode) && /on Tripadvisor/.test(detailCode),
    "positive control — Tripadvisor rating text is still rendered");
  ok(!/href=\{_ta\.url/.test(detailCode),
    "Tripadvisor rating must not use _ta.url as an href");
  ok(!/<a[\s\S]{0,240}tripadvisor\.com/i.test(detailCode) && !/tripadvisor\.com[\s\S]{0,240}<a/i.test(detailCode),
    "Detail Tripadvisor rating must not be an <a href> containing tripadvisor.com");
  ok(!/https:\/\/www\.tripadvisor\.com/.test(detailCode),
    "no raw tripadvisor.com fallback href in Detail");
  if (/ta_out/.test(detailCode)) {
    ok(!/ta_out[\s\S]{0,200}openExternal/.test(detailCode) && !/openExternal[\s\S]{0,200}ta_out/.test(detailCode),
      "ta_out may remain only if it cannot fire a leave");
  }

  ok(/vrboUrl/.test(detailCode), "positive control — Detail still consults vrboUrl");
  ok(/isEarningGoHref\s*\(\s*_vu/.test(detailCode),
    "VRBO alt must gate on isEarningGoHref so a later template cannot render a raw partner href");
  ok(!/href=["'][^"']*vrbo\.com/i.test(detailCode),
    "Detail VRBO alt must not be an <a href> containing vrbo.com");
}

{
  const bookItRaw = read("app/components/BookItLink.js");
  const bookIt = strip(bookItRaw);
  ok(/commerceHref\(/.test(bookIt), "positive control — BookItLink offer still uses commerceHref");
  ok(!/preventDefault\s*\(/.test(bookIt),
    "BookItLink offer must not preventDefault — native same-tab leave");
  ok(!/\bwindow\.open\s*\(/.test(bookIt) && !/\bopenExternal\s*\(/.test(bookIt),
    "BookItLink offer must not openExternal / window.open");
  ok(!/tpDeepLink\s*\(/.test(bookIt),
    "BookItLink search kind must not render tpDeepLink / a raw partner URL");
  ok(/kind\s*!==\s*["']offer["']/.test(bookIt),
    "BookItLink fail-closes anything that is not kind offer");
  ok(/commerceHref\([\s\S]{0,400}clickId/.test(bookItRaw) || /withClickId\(/.test(bookIt),
    "BookItLink offer href /api/commerce/go must carry click_id (commerceHref clickId or withClickId)");
}

console.log(`test-earning-handoff: OK — ${pass} assertions (go-route hrefs, same-tab native leave, click_id stamp on the relative path, no raw viator.com / booking.com / Impact / tripadvisor / vrbo URL on earning Book)`);
