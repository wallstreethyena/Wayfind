#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { pageOneRail } from "../lib/railPage.js";
import { windowRailAnswer } from "../lib/railResponse.js";
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const cards = Array.from({ length: 25 }, (_, i) => ({ id: `ghost-${i}`, kind: "event", name: `Ghost tour ${i}`, event_series_id: `series-${i}`, start_date: "2026-10-13", end_date: "2026-10-31", distMi: i }));
const ids = ["food", "farms", "theme-parks", "haunts", "family", "oktoberfest", "date-night", "festivals", "photos", "day-trips"];
const cached = { today: "2026-10-13", phase: "halloween", sourceFailures: 0, sourceCount: 25, rails: ids.map((id, i) => ({ id, cards: i === 3 ? cards.slice(0, 15) : i === 6 ? cards.slice(15) : [] })) };
const before = JSON.stringify(cached);
const source = readFileSync("app/api/events/fall/route.js", "utf8");
async function harness(code = source) {
  const imports = {
    "siteTime": { siteTodayStr: () => "2026-10-13" },
    "railFastCache": { geoCell: (v) => v, fastCachedRail: async () => ({ value: cached, state: "hit" }) },
    "halloweenIntentRails": { composeHalloweenRails },
    "railPage": { pageOneRail }, "railResponse": { windowRailAnswer },
    "fallStayDestinations": { fallStayDestinations: () => ["fall-stay"] },
  };
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const { instantiate } = await import("data:text/javascript;base64," + Buffer.from("export function instantiate(require, exports) {\n" + compiled + "\n}").toString("base64"));
  const exports = {};
  instantiate((id) => imports[id.split("/").pop().replace(/\.js$/, "")] || {}, exports);
  return async (query) => exports.GET(new Request("https://wayfind.test/api/events/fall?lat=27.95&lng=-82.46" + query));
}
const get = await harness();
const response = await get("&collection=halloween");
const bulk = await response.json();
ok(response.status === 200 && response.headers.get("x-wayfind-fast-cache") === "hit", "actual route uses warm cache");
ok(bulk.rails.length === 7 && bulk.collection === "halloween", "selector produces seven rails");
const ghost = bulk.rails.find((r) => r.id === "ghost-tours");
ok(ghost.cards.length === 12 && ghost.total === 25, "union regrouped before first window");
ok(!("stayDestinations" in bulk), "Fall stays absent from Halloween");
const page = await (await get("&collection=halloween&rail=ghost-tours&page=1&size=10")).json();
ok(page.total === 25 && page.cards.length === 10 && page.hasMore, "continuation sees complete union");
ok(page.cards.map((c) => c.id).join() === cards.slice(10, 20).map((c) => c.id).join(), "correct second page without skips");
const full = await (await get("&collection=halloween&full=1")).json();
ok(full.rails.find((r) => r.id === "ghost-tours").cards.length === 25, "full preserves every admitted card");
const fall = await (await get("")).json();
ok(fall.rails.length === 10 && fall.stayDestinations[0] === "fall-stay", "default Fall behavior preserved");
ok((await get("&collection=halloween&rail=missing")).status === 404, "unknown rail fails honestly");
ok(JSON.stringify(cached) === before, "Halloween never mutates shared cached answer");
const broken = source.replace('searchParams.get("collection") === "halloween"', 'false');
ok(broken !== source, "negative control applies selector mutation");
const brokenBulk = await (await (await harness(broken))("&collection=halloween")).json();
assert.throws(() => assert.equal(brokenBulk.rails.length, 7)); checks++;
console.log(`test-halloween-route: ${checks} runtime assertions passed`);
