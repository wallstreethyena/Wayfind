// Snowcat Ridge ticket explainer: what each admission includes, one starting
// price, and the FAQ service fee. Rendered with no dash characters and no
// "best" claim. The existing ticket button and the shared event map stay.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { isSnowcatTicketPage, SNOWCAT_PLACE_ID, snowcatExplainerLines } from "../lib/snowcatTickets.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

ok(isSnowcatTicketPage({ event_id: "snowcat-ridge-2026" }), "the event id is the Snowcat page");
ok(isSnowcatTicketPage({ slug: "snowcat-ridge-alpine-snow-park-2026" }), "the public slug is the Snowcat page");
ok(!isSnowcatTicketPage({ event_id: "christmas-town-2026", slug: "christmas-town" }), "another Christmas event does not get this explainer");

const lines = snowcatExplainerLines();
const pinnedTierPrices = ["$36.95", "$54.95", "$73.95", "$91.95"];
for (const price of ["$32.95", "$11.25", "$29.95"]) {
  ok(lines.some((line) => line.includes(price)), "the add on facts include " + price);
}
ok(lines.some((line) => line === "Online general admission starts at $26.95. Prices vary by date and time, and tickets cost $6 more at the box office (official site, as of Nov 9, 2026)."), "one dated starting price, and box office is $6 more");
ok(lines.some((line) => line.includes("$3.95 service fee") && line.includes("photo package") && line.includes("ice skate rental")), "the FAQ service fee is named, including what it skips");
ok(!lines.some((line) => pinnedTierPrices.some((price) => line.includes(price))), "no admission tier has a hardcoded price");
ok(lines.some((line) => line === "Ice skate rental is not included in any ticket."), "skate rental is called out as not included");
ok(lines.some((line) => line === "Children under 2 are free."), "children under 2 are free");
ok(lines.every((line) => !/[–—-]/.test(line) && !/\bbest\b/i.test(line)), "explainer facts have no dashes and no best claim");

const Explainer = (await loadComponent(new URL("../app/components/SnowcatTicketExplainer.js", import.meta.url).pathname, process.cwd())).default;
const html = renderToStaticMarkup(createElement(Explainer));
const text = visible(html);
ok(html.includes('data-snowcat-tickets=""') || html.includes("data-snowcat-tickets"), "the explainer renders");
ok(text.includes("Which ticket do you need?"), "the heading renders");
ok(text.includes("General Admission + Unlimited Snow Tubing") && text.includes("Unlimited all day tubing"), "the unlimited tubing option renders");
ok(text.includes("Online general admission starts at $26.95") && text.includes("$3.95 service fee") && !pinnedTierPrices.some((price) => text.includes(price)), "the page shows one starting price and the service fee, with no pinned tier price");
ok(text.includes("skate pickup VIP lane"), "the VIP lanes render");
ok(!/[–—-]/.test(text), "the rendered explainer contains no dashes");
ok(!/\bbest\b/i.test(text), "the rendered explainer makes no best claim");
ok(!/commission|affiliate|we may earn/i.test(text), "the explainer adds no disclosure");

const page = read("app/florida-events/[slug]/page.js");
ok(page.includes("<SnowcatTicketExplainer />"), "the event page renders the explainer");
ok(page.includes("eventDetailTicketAction(e"), "the existing ticket button is still the registry action");
ok(page.includes("placeId={isSnowcatTicketPage({ event_id: e.event_id, slug: params.slug }) ? SNOWCAT_PLACE_ID : \"\"}"), "Snowcat passes its Google place id into the existing event map");
ok(SNOWCAT_PLACE_ID === "ChIJF05ORfWpwogRI74PwJotNf4", "the place id is the Dade City Snowcat Ridge place");
const where = read("app/components/EventWhere.js");
ok(where.includes("EventVenueMapLoader") && where.includes("id: placeId || undefined"), "the map card is the existing EventWhere Apple map, with no new Places request");

console.log(`test-snowcat-tickets: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
