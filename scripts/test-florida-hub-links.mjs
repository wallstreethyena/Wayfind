#!/usr/bin/env node
// scripts/test-florida-hub-links.mjs — every Florida hub link in the site
// footer (lib/floridaHubLinks.js) points at a real, Florida, indexable route,
// and the footer renders the list. Calls the data, not a grep of hrefs.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { FLORIDA_HUB_LINKS } from "../lib/floridaHubLinks.js";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { TOWN_HUBS } from "../lib/cultureHubs.js";

let n = 0;
const ok = (label, f) => { try { f(); n++; } catch (e) { console.error("test-florida-hub-links: FAIL - " + label + "\n  " + e.message); process.exit(1); } };
const towns = new Set(Object.values(TOWN_HUBS));

ok("probe: the list is non-empty and starts on the Gulf Coast", () => { assert.ok(FLORIDA_HUB_LINKS.length >= 5); assert.equal(FLORIDA_HUB_LINKS[0].href, "/things-to-do/sarasota"); });
for (const { href, label } of FLORIDA_HUB_LINKS) {
  ok("resolves: " + href, () => {
    assert.ok(label && label.trim(), "empty label for " + href);
    let m;
    if ((m = /^\/things-to-do\/([a-z-]+)$/.exec(href))) { assert.ok(LANDING_CITIES[m[1]], "not a landing city: " + m[1]); assert.equal(LANDING_CITIES[m[1]].state, "FL", "not Florida: " + m[1]); }
    else if ((m = /^\/florida\/([a-z-]+)$/.exec(href))) assert.ok(towns.has(m[1]), "not a town hub: " + m[1]);
    else if (href === "/florida-events") assert.ok(existsSync(new URL("../app/florida-events/page.js", import.meta.url)));
    else assert.fail("unknown route shape: " + href);
  });
}
ok("the footer renders FLORIDA_HUB_LINKS", () => {
  const lay = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  assert.match(lay, /import \{ FLORIDA_HUB_LINKS \} from "\.\.\/lib\/floridaHubLinks\.js"/);
  assert.match(lay, /\{FLORIDA_HUB_LINKS\.map\(\(l\) => \(/);
});
console.log("test-florida-hub-links: OK - " + n + " checks; " + FLORIDA_HUB_LINKS.length + " footer links resolve to real Florida routes");
