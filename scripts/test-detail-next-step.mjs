#!/usr/bin/env node
// The place detail ends with one closer: a guide that names the place,
// else one similar spot that is not already on the sheet, else a guide
// for the place's own city, else the guides index. A missing guide list
// stays an error. A loaded list with no match is not an error.
import { readFileSync } from "node:fs";
import {
  chooseDetailNextStep,
  missingGuidesStep,
  placeCityToken,
  NEXT_STEP_COPY,
  DETAIL_NEXT_STEP_SHOWN,
  DETAIL_NEXT_STEP_OPEN,
} from "../lib/detailNextStep.js";

let pass = 0;
const fail = (m) => { console.error("test-detail-next-step: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const place = { id: "ChIJplace", name: "Siesta Cafe", locality: "Sarasota", lat: 27.27, lng: -82.55 };
const guides = [
  { slug: "newer-orlando", title: "Newer Orlando", region: "Orlando", updated: "2026-11-01", placeIds: ["ChIJother"], teaser: "Orlando hours and prices.", mins: 6 },
  { slug: "sarasota-eats", title: "Sarasota eats", region: "Sarasota", updated: "2026-10-01", placeIds: ["ChIJplace", "ChIJsecond"], teaser: "The cafe is on this list.", mins: 8 },
  { slug: "older-sarasota", title: "Older Sarasota", region: "Sarasota", updated: "2026-09-01", placeIds: ["ChIJplace"], teaser: "Also names the cafe.", mins: 5 },
];
const gelato = { id: "ChIJgelato", name: "Gelato Lab" };
const museum = { id: "ChIJmuseum", name: "City Museum" };

ok(placeCityToken("Sarasota, FL") === "sarasota" && placeCityToken("St. Petersburg") === "st petersburg",
  "a city token keeps the city and drops the state");
ok(placeCityToken("FL") === "", "a two letter token is not a city");

const related = chooseDetailNextStep({
  place,
  guides,
  similar: [gelato],
  similarReady: true,
  cityNames: ["Sarasota"],
});
ok(related.kind === "guide" && related.match === "place_in_guide" && related.target === "sarasota-eats",
  "a guide that names this place wins, and the first such guide in the given order wins");
ok(related.href === "/guides/sarasota-eats" && related.kicker === NEXT_STEP_COPY.related && related.title === "Sarasota eats",
  "the related closer is one link to that guide, with the guide's own title");
ok(!related.place, "a related guide does not also attach a place card");

const waiting = chooseDetailNextStep({
  place: { id: "ChIJlonely", name: "Lonely Spot", locality: "Orlando" },
  guides,
  similar: [],
  similarReady: false,
  cityNames: ["Orlando"],
});
ok(waiting === null, "while the similar pool is still loading, and no guide names the place, the closer stays unpainted");

const lonely = { id: "ChIJlonely", name: "Lonely Spot", locality: "Orlando" };
const similar = chooseDetailNextStep({
  place: lonely,
  guides,
  similar: [lonely, gelato, gelato, museum],
  excludeIds: ["ChIJgelato"],
  similarReady: true,
  cityNames: ["Orlando"],
});
ok(similar.kind === "place" && similar.target === "ChIJmuseum" && similar.place === museum,
  "the similar closer is the first unused spot, never the open place and never a spot already on the sheet");
ok(similar.kicker === NEXT_STEP_COPY.similar && similar.reason === NEXT_STEP_COPY.similarReason && similar.href == null,
  "the similar closer names one spot and does not invent a second href");

const wrongCity = chooseDetailNextStep({
  place: { id: "ChIJlonely", name: "Lonely Spot", locality: "Sarasota" },
  guides: [guides[0]],
  similar: [],
  similarReady: true,
  cityNames: ["Sarasota, FL"],
});
ok(wrongCity.kind === "guides" && wrongCity.href === "/guides" && wrongCity.match === "guides_index",
  "an Orlando guide is not offered for a Sarasota place that it does not name");

const sameCity = chooseDetailNextStep({
  place: { id: "ChIJlonely", name: "Lonely Spot", locality: "Sarasota" },
  guides,
  similar: [{ id: "ChIJshown", name: "Already shown" }],
  excludeIds: ["ChIJshown"],
  similarReady: true,
  cityNames: ["Sarasota, FL", "Siesta Key"],
});
ok(sameCity.kind === "guide" && sameCity.match === "region_guide" && sameCity.target === "sarasota-eats" && sameCity.kicker === "Guide for Sarasota",
  "with no unused similar spot, the closer is one guide whose region is the place city");

const beachCity = chooseDetailNextStep({
  place: { id: "ChIJbeach", name: "Key Cafe" },
  guides,
  similar: [],
  similarReady: true,
  cityNames: ["Siesta Key"],
});
ok(beachCity.match === "guides_index" && beachCity.kicker === NEXT_STEP_COPY.guides && beachCity.title === NEXT_STEP_COPY.guidesTitle,
  "a nearby town name does not borrow a different city's guide");

const emptyList = chooseDetailNextStep({ place, guides: [], similar: [], similarReady: true, cityNames: [] });
ok(emptyList.match === "guides_index" && emptyList.kind !== "error",
  "a loaded guide list with no match still ends on the guides index");

for (const missing of [undefined, null, { slug: "nope" }]) {
  const step = chooseDetailNextStep({ place, guides: missing, similar: [gelato], similarReady: true, cityNames: ["Sarasota"] });
  ok(step.kind === "error" && step.code === "detailGuides" && step.match === "guides_unconfigured" && step.kicker === NEXT_STEP_COPY.missing && step.href === "/guides",
    "a missing guide list is named, and it is not dressed up as a related guide");
}
ok(missingGuidesStep().title === NEXT_STEP_COPY.missingLink, "the error still has one real link");

ok(chooseDetailNextStep({ place: { _event: true, id: "evt" }, guides, similarReady: true }) === null, "an event sheet is out of scope");
ok(chooseDetailNextStep({ guides, similarReady: true }) === null, "no place means no closer");

const untitled = chooseDetailNextStep({
  place,
  guides: [{ slug: "blank", title: "  ", region: "Sarasota", placeIds: ["ChIJplace"] }, guides[1]],
  similarReady: false,
});
ok(untitled.target === "sarasota-eats", "a guide with no title cannot be the closer");

const src = read("lib/detailNextStep.js");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(!/\bbest\b/i.test(code) && !/real time|right now|—|–/.test(code), "closer copy has no banned wording");
ok(code.includes("placeIds") && !/haversine|LOCAL_EDIT_RADIUS/.test(code), "city match is the region string, not a mile radius");

const ui = read("app/components/sheets/Detail.js");
const home = read("app/home.js");
ok(ui.includes("chooseDetailNextStep(") && ui.includes("data-detail-next-step"), "the detail sheet renders the closer");
ok(ui.indexOf("Worth comparing nearby") < ui.indexOf("data-detail-next-step"), "the closer is after the existing comparison rail");
ok(DETAIL_NEXT_STEP_SHOWN === "detail_next_step_shown" && DETAIL_NEXT_STEP_OPEN === "detail_next_step_open", "the event names stay stable");
ok(ui.includes("DETAIL_NEXT_STEP_SHOWN") && ui.includes("DETAIL_NEXT_STEP_OPEN"), "shown and open are both recorded");
ok((ui.match(/<FallbackImg src=\{railPhotoSrc\(p\)\}/g) || []).length === 3, "the closer does not add a fourth photo row");
ok(/data-detail-next-step[\s\S]{0,900}WhereToGoNextRow[\s\S]{0,400}partner=\{null\}/.test(ui),
  "a similar closer reuses WhereToGoNextRow with no second ticket button");
ok(home.includes("detailGuides: railMenu && Array.isArray(railMenu.guides) ? railMenu.guides : null"),
  "the sheet receives the guide index the shell already loaded, or null when that index is absent");
ok(!/className=["'][^"']*wf-place-card/.test(ui.slice(ui.indexOf("data-detail-next-step"))),
  "the closer does not mount a new place card root");

console.log("test-detail-next-step: OK — " + pass + " assertions");
