// Empty Viator rails switch partners on their own.
// Viator product in hand stays Viator. ledger_denied, zero results, and errors
// An empty rail offers GetYourGuide when its pid is set, then Tiqets when that
// program is live. Neither live keeps today's empty rail. Ranking never reads a payout, and the button names
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
ok(denied.partner === "getyourguide" && denied.label === "GetYourGuide", "an empty Viator rail offers GetYourGuide when its pid is set");
const gygInstead = railFallbackHref({ partner: denied.partner, query: "Tampa", contentId: "events-tours" });
ok(typeof gygInstead === "string" && gygInstead.startsWith("/api/commerce/go?") && gygInstead.includes("provider=getyourguide") && gygInstead.includes("offer=q-tampa"), "the GetYourGuide button goes through /api/commerce/go");
ok(!/getyourguide\.com|partner_id|TESTPID/i.test(gygInstead), "the GetYourGuide href never carries the partner URL or pid to the client");

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
ok(higherFirst.partner === "getyourguide", "a rate comparison never reorders the ladder: GetYourGuide stays first by product fit");

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

const fallbackSrc = readFileSync(new URL("../lib/viatorRailFallback.js", import.meta.url), "utf8");
ok(/process\.env\.NEXT_PUBLIC_GYG_PID/.test(fallbackSrc), "the pid is read as a literal process.env access, so Next inlines it into the browser bundle");

const railSrc = readFileSync(new URL("../app/components/ViatorRail.js", import.meta.url), "utf8");
ok(railSrc.includes("Book from $") && railSrc.includes("Book now"), "Viator product buttons still say Book from or Book now");
ok(!/earn a commission/i.test(railSrc), "the rail adds no commission line");

process.env.NEXT_PUBLIC_GYG_PID = "TESTPID";
const Rail = (await loadComponent(new URL("../app/components/ViatorRail.js", import.meta.url).pathname, process.cwd())).default;
const gygHtml = renderToStaticMarkup(createElement(Rail, { title: "Top-rated experiences", items: [], query: "Tampa", providerState: "ledger_denied" }));
ok(gygHtml.includes(">GetYourGuide<") && !gygHtml.includes(">Tiqets<") && !gygHtml.includes("Book now") && !/earn a commission|affiliate disclosure/i.test(gygHtml), "a set GetYourGuide pid renders a GetYourGuide button on the empty rail");
ok(gygHtml.includes("/api/commerce/go?") && gygHtml.includes("provider=getyourguide") && !gygHtml.includes("getyourguide.com"), "the rendered GetYourGuide button uses the commerce route, never a raw partner URL");

delete process.env.NEXT_PUBLIC_GYG_PID;
const tiqetsHtml = renderToStaticMarkup(createElement(Rail, { title: "Top-rated experiences", items: [], query: "Tampa", providerState: "ledger_denied" }));
ok(tiqetsHtml.includes(">Tiqets<") && !tiqetsHtml.includes(">GetYourGuide<"), "with the pid unset the rendered button names Tiqets");

const healthy = renderToStaticMarkup(createElement(Rail, { title: "Top-rated experiences", items: product, query: "Tampa", providerState: "success" }));
ok(healthy.includes("Book from $49") && healthy.includes("Sunset sail") && !healthy.includes(">GetYourGuide<") && !healthy.includes(">Tiqets<"), "a healthy Viator rail still renders its own products");
ok(renderToStaticMarkup(createElement(Rail, { title: "T", items: [] })) === "", "an empty rail with no city still renders nothing");

console.log(`test-viator-rail-fallback: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
