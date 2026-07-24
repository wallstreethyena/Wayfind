// scripts/test-deals-geo.mjs — locks the deal-rail GEO-GATE: a user far from a
// region never sees that region's deals (Orlando theme-park hotels must NOT show
// in South Carolina), and the rail hides when nothing's local.
import { readFileSync } from "fs";
import { geoFilterDeals, DEAL_COORDS } from "../lib/dealsData.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const GREENVILLE = [34.8526, -82.394];   // SC — ~350mi from Orlando
const ORLANDO = [28.42, -81.4];
const ANAHEIM = [33.812, -117.919];
const fl = [{ maps_to: "walt disney world" }, { maps_to: "orlando" }, { maps_to: "busch gardens tampa bay" }];

ok(geoFilterDeals(fl, GREENVILLE[0], GREENVILLE[1]).length === 0, "Greenville SC → NO Orlando/Tampa deals (rail hides)");
ok(geoFilterDeals(fl, ORLANDO[0], ORLANDO[1]).length >= 2, "Orlando → its local deals show");
ok(geoFilterDeals([{ maps_to: "disneyland" }], ANAHEIM[0], ANAHEIM[1]).length === 1, "Anaheim → the Disneyland (CA) deal shows");
ok(geoFilterDeals([{ maps_to: "disneyland" }], ORLANDO[0], ORLANDO[1]).length === 0, "Orlando → the California Disneyland deal is filtered out");
ok(geoFilterDeals(fl, NaN, NaN).length === 3, "no user location → keep all (server/no-geo callers unchanged)");
ok(geoFilterDeals([{ maps_to: "something we don't map" }], GREENVILLE[0], GREENVILLE[1]).length === 1, "a deal with unknown coords is kept (can't prove it's far)");
ok(DEAL_COORDS["walt disney world"] && DEAL_COORDS["disneyland"], "coords map covers WDW + Disneyland");

// wiring
const dd = read("lib/dealsData.js");
ok(/export async function serveDeals\(category, lat, lng\)/.test(dd) && /geoFilterDeals\(data, Number\(lat\), Number\(lng\)\)/.test(dd), "serveDeals geo-gates the rows by the user's location");
const route = read("app/api/deals/route.js");
ok(/serveDeals\(category, parseFloat\(sp\.get\("lat"\)\), parseFloat\(sp\.get\("lng"\)\)\)/.test(route), "the /api/deals route forwards lat/lng");
const home = read("app/home.js");
ok(/function UTDealsRail\(\{ category, onSave, lat, lng \}\)/.test(home) && /"&lat=" \+ lat\.toFixed\(3\)/.test(home), "UTDealsRail passes the user's location to /api/deals");
ok(/<UTDealsRail category="attractions" onSave=\{saveMonetizedItem\} lat=\{center\.lat\} lng=\{center\.lng\}/.test(home), "the attractions deal rail is geo-scoped");
ok(/<UTDealsRail category="stays" onSave=\{saveMonetizedItem\} lat=\{center\.lat\} lng=\{center\.lng\}/.test(home), "the Stays hotel deal rail is geo-scoped");

console.log(`test-deals-geo: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
