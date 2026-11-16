// Empty Viator rails switch partners on their own.
// Viator product in hand stays Viator. ledger_denied, zero results, and errors
// try GetYourGuide when NEXT_PUBLIC_GYG_PID is set, then Tiqets. Neither live
// keeps today's empty rail. Ranking never reads a payout, and the button names
// the partner company only.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { resolveOffer } from "../lib/commerceProviders.js";
import { railFallbackHref, viatorRailFallback } from "../lib/viatorRailFallback.js";
import { readFileSync } from "node:fs";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const product = [{ code: "38620P1", title: "Sunset sail", fromPrice: 49 }];

const viatorOk = viatorRailFallback({ items: product, providerState: "success", env: { NEXT_PUBLIC_GYG_PID: "TESTPID" }, commission: 40 });
ok(viatorOk.partner === "viator" && viatorOk.label === "Viator", "a Viator rail with products stays on Viator");
ok(railFallbackHref({ partner: viatorOk.partner, query: "Tampa" }) == null, "a healthy Viator rail does not build a fallback link");

const denied = viatorRailFallback({ items: [], providerState: "ledger_denied", env: { NEXT_PUBLIC_GYG_PID: "TESTPID" }, commission: 1 });
ok(denied.partner === "getyourguide" && denied.label === "GetYourGuide", "ledger_denied switches to GetYourGuide when its pid is set");
const gygHref = railFallbackHref({ partner: denied.partner, query: "Tampa", contentId: "events-tours" });
ok(typeof gygHref === "string" && gygHref.startsWith("/api/commerce/go?") && gygHref.includes("provider=getyourguide") && gygHref.includes("offer=q-tampa"), "the GetYourGuide button routes through /api/commerce/go");
ok(!/getyourguide\.com|partner_id|commission|earn/i.test(gygHref), "the button href is our route, not a partner URL or a disclosure");

const noPid = viatorRailFallback({ items: [], providerState: "ledger_denied", env: {}, commission: 99 });
ok(noPid.partner === "tiqets" && noPid.label === "Tiqets", "an unset GetYourGuide pid switches to Tiqets");
const tiqetsHref = railFallbackHref({ partner: noPid.partner, query: "Tampa" });
ok(typeof tiqetsHref === "string" && tiqetsHref.startsWith("/api/commerce/go?") && tiqetsHref.includes("provider=tiqets") && tiqetsHref.includes("offer=q-tampa"), "the Tiqets button routes through /api/commerce/go");
ok(!/tiqets\.com|tp\.media|commission/i.test(tiqetsHref), "the Tiqets href stays on our commerce route");

const none = viatorRailFallback({ items: [], providerState: "upstream_error", env: {}, tiqetsLive: false });
ok(none.partner == null && none.label === "", "no live partner keeps the empty rail");
ok(railFallbackHref({ partner: none.partner, query: "Tampa" }) == null, "an empty ladder builds no link");
ok(viatorRailFallback({ items: [], providerState: "zero_candidates", env: {}, tiqetsLive: false }).partner == null, "zero results with no partner stays empty");

const higherFirst = viatorRailFallback({ items: [], providerState: "zero_candidates", env: { NEXT_PUBLIC_GYG_PID: "TESTPID" }, tiqetsRate: 40, gygRate: 8 });
ok(higherFirst.partner === "getyourguide", "a higher Tiqets rate does not jump the line");

const gyg = await resolveOffer("getyourguide", "q-tampa", { env: { NEXT_PUBLIC_GYG_PID: "TESTPID" } });
ok(gyg.dest && new URL(gyg.dest).hostname.endsWith("getyourguide.com") && new URL(gyg.dest).searchParams.get("partner_id") === "TESTPID", "GetYourGuide resolve adds the publisher id on our side");
ok((await resolveOffer("getyourguide", "https://evil.example/phish", { env: { NEXT_PUBLIC_GYG_PID: "TESTPID" } })).error === "offer-not-found", "a caller URL is not a GetYourGuide offer");
ok((await resolveOffer("getyourguide", "q-tampa", { env: {} })).error === "offer-not-found", "GetYourGuide resolve fails closed when the pid is unset");

const tiqets = await resolveOffer("tiqets", "q-tampa", { env: {} });
ok(tiqets.dest && new URL(tiqets.dest).hostname === "tp.media", "Tiqets search is wrapped by the live Travelpayouts link");
ok(new URL(tiqets.dest).searchParams.get("u")?.includes("tiqets.com"), "the wrapped Tiqets destination is the city search");
ok((await resolveOffer("tiqets", "https://evil.example/phish", {})).error === "offer-not-found", "a caller URL is not a Tiqets offer");

const affiliates = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");
ok(!/getyourguide\.com\/s\//.test(affiliates), "the removed GetYourGuide builder stays out of lib/affiliates.js");

const railSrc = readFileSync(new URL("../app/components/ViatorRail.js", import.meta.url), "utf8");
ok(railSrc.includes("Book from $") && railSrc.includes("Book now"), "Viator product buttons still say Book from or Book now");
ok(!/earn a commission/i.test(railSrc), "the rail adds no commission line");

process.env.NEXT_PUBLIC_GYG_PID = "TESTPID";
const Rail = (await loadComponent(new URL("../app/components/ViatorRail.js", import.meta.url).pathname, process.cwd())).default;
const gygHtml = renderToStaticMarkup(createElement(Rail, { title: "Top-rated experiences", items: [], query: "Tampa", providerState: "ledger_denied" }));
ok(gygHtml.includes(">GetYourGuide<") && !gygHtml.includes("Book now") && !/earn a commission|affiliate disclosure/i.test(gygHtml), "the fallback button names GetYourGuide and adds no disclosure words");
ok(gygHtml.includes("/api/commerce/go?") && gygHtml.includes("provider=getyourguide"), "the rendered GetYourGuide button uses the commerce route");

delete process.env.NEXT_PUBLIC_GYG_PID;
const tiqetsHtml = renderToStaticMarkup(createElement(Rail, { title: "Top-rated experiences", items: [], query: "Tampa", providerState: "ledger_denied" }));
ok(tiqetsHtml.includes(">Tiqets<") && !tiqetsHtml.includes(">GetYourGuide<"), "with the pid unset the rendered button names Tiqets");

const healthy = renderToStaticMarkup(createElement(Rail, { title: "Top-rated experiences", items: product, query: "Tampa", providerState: "success" }));
ok(healthy.includes("Book from $49") && healthy.includes("Sunset sail") && !healthy.includes(">GetYourGuide<") && !healthy.includes(">Tiqets<"), "a healthy Viator rail still renders its own products");
ok(renderToStaticMarkup(createElement(Rail, { title: "T", items: [] })) === "", "an empty rail with no city still renders nothing");

console.log(`test-viator-rail-fallback: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
