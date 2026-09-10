import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FAMILY_DAY_RAILS } from "../lib/familyDayTaxonomy.js";

// Compile and render the actual component. Only its framework/UI dependencies
// are stubbed; the rail definitions come from the production taxonomy module.
const repo = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = path.join(repo, "app/components/FamilyDayPage.js");
const sourceBytes = fs.readFileSync(sourcePath);
const sourceHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
const require = createRequire(path.join(repo, "package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const generated = path.join(repo, `.family-day-presentation-${process.pid}.mjs`);
const source = sourceBytes.toString("utf8").replace(/^import .*;\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const prefix = `
import { createRequire } from "node:module";
import { FAMILY_DAY_RAILS, matchesFamilyFilters } from "./lib/familyDayTaxonomy.js";
const require = createRequire(${JSON.stringify(path.join(repo, "package.json"))});
const React = require("react");
const { useCallback, useEffect, useMemo, useRef, useState } = React;
const useSearchParams = () => new URLSearchParams(globalThis.__familyDayPresentationQuery || "");
const RankedExperiencePage = ({ children }) => React.createElement("main", null, children);
const IconicPlaceCard = () => null;
const usePagedRail = () => ({ items: [], sentinelIndex: 0, sentinelRef() {} });
const BackControl = () => null;
const ScoreDisclosure = () => null;
const familyFilterFacts = () => null;
const resolveLocationContext = ({ urlCity, urlLat, urlLng }) => ({ city: urlCity, lat: Number(urlLat), lng: Number(urlLng) });
const milesBetween = () => 0;
const nowContext = () => ({ outdoorOK: true });
const canonicalShareUrl = (url) => url;
const track = () => {};
`;

const count = (html, needle) => html.split(needle).length - 1;
const sectionFor = (html, id) => {
  const match = html.match(new RegExp(`<section[^>]*aria-labelledby="family-${id}-title"[^>]*>([\\s\\S]*?)<\\/section>`));
  assert.ok(match, `${id} renders an actual FamilyRail section`);
  return match[1];
};
const cleanup = () => fs.rmSync(generated, { force: true });
process.once("exit", cleanup);

try {
  fs.writeFileSync(generated, prefix + compiled + "\nexport { FamilyEventCard };\n");
  const { default: FamilyDayPage, FamilyEventCard } = await import(generated + `?v=${Date.now()}`);
  const props = { center: { lat: 27.3364, lng: -82.5307 }, city: "Sarasota" };

  assert.equal(FAMILY_DAY_RAILS.length, 9, "the rendered component consumes the nine production rail definitions");
  globalThis.__familyDayPresentationQuery = "";
  const embedded = renderToStaticMarkup(React.createElement(FamilyDayPage, { ...props, embedded: true }));
  assert.equal(count(embedded, '<section class="wf-family-filters"'), 0, "the embedded homepage drop has no planning filters");
  assert.equal(count(embedded, '<div class="wf-family-distance"'), 0, "the embedded homepage drop has no distance control");
  assert.equal(count(embedded, '<section class="wf-family-section"'), 9, "the embedded drop renders all nine category headings");
  for (const rail of FAMILY_DAY_RAILS) {
    const section = sectionFor(embedded, rail.id);
    const radius = ["water", "animals"].includes(rail.id) ? 50 : 25;
    assert.ok(section.includes(`Within ${radius} miles.`), `${rail.id} uses the requested embedded ${radius}-mile radius`);
  }
  assert.equal(count(embedded, '<h2 id="family-indoor-title">Museums, Indoor Play &amp; Discovery</h2>'), 1, "the combined discovery heading renders once");
  assert.equal(count(embedded, ">Space &amp; Big Learning</h2>"), 0, "the former space heading does not render separately");

  globalThis.__familyDayPresentationQuery = "radiusMi=10";
  const standalone = renderToStaticMarkup(React.createElement(FamilyDayPage, props));
  assert.equal(count(standalone, '<section class="wf-family-filters"'), 1, "standalone keeps its planning filters");
  assert.equal(count(standalone, '<div class="wf-family-distance"'), 1, "standalone keeps its distance control");
  assert.equal(count(standalone, "Within 10 miles."), 9, "standalone preserves an explicit supported 10-mile radius for every rail");

  const linkedEvent = {
    id: "family-event-image", name: "Moonlight Science Night", href: "/florida-events/moonlight-science-night",
    image: "/events/verified-family.webp", imageAlt: "Families exploring a science exhibit",
    whenFact: "Friday · 6:00 PM", venue: "Discovery Hall", distMi: 4.2,
  };
  const withImage = renderToStaticMarkup(React.createElement(FamilyEventCard, { event: linkedEvent }));
  assert.match(withImage, /<div class="wf-family-event-media"><img[^>]*src="\/events\/verified-family\.webp"[^>]*><span class="wf-family-event-kicker">Family event<\/span><\/div>/,
    "the media header renders a verified event image and its family-event kicker");
  assert.equal(count(withImage, 'href="/florida-events/moonlight-science-night"'), 2, "the event title and details CTA link to the real event page");
  assert.ok(withImage.includes("Moonlight Science Night") && withImage.includes("Event details"), "the linked title and details label are visible");
  assert.doesNotMatch(withImage, /wayfind score|book tickets?|buy tickets?|ticketed/i, "the compact card invents no score or ticket claim");

  const withoutImage = renderToStaticMarkup(React.createElement(FamilyEventCard, { event: {
    id: "family-event-placeholder", name: "Library Family Hour", whenFact: "Saturday · 10:00 AM", venue: "Main Library",
  } }));
  assert.ok(withoutImage.includes('<span class="wf-family-event-placeholder">Photo unavailable</span>'), "a missing verified image renders the honest placeholder");
  assert.equal(count(withoutImage, "Event details"), 0, "an event without a destination gets no details link");
  assert.doesNotMatch(withoutImage, /wayfind score|book tickets?|buy tickets?|ticketed/i, "the unlinked card invents no score or ticket claim");

  assert.ok(embedded.includes(".wf-family-event-card{flex:0 0 200px"), "event cards use the shared compact 200px width");
  assert.ok(embedded.includes(".wf-family-event-media{position:relative;height:86px"), "event media uses the shared compact 86px header");
  console.log(`test-family-day-presentation: PASS source=${sourcePath} sha256=${sourceHash} rails=9 embedded=25/50 standalone=10 event=verified/fallback`);
} finally {
  delete globalThis.__familyDayPresentationQuery;
  cleanup();
}
