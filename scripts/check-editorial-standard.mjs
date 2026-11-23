#!/usr/bin/env node
// Guides, blogs, and /florida-events pages share one frame: the UTC Holidays
// page (docs/GUIDE_BLOG_STANDARD.md). This guard renders that frame and fails
// when a route skips it or a fixture is missing a required section.
//
// The broken fixture is scripts/fixtures/editorial-standard-broken.html.
// editorialStandardGaps() must report it, and must stay quiet on the real frame.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { editorialStandardGaps, guideEditorialFacts, NOT_STATED } from "../lib/editorialStandard.js";
import { GUIDES } from "../lib/guides.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const ROUTES = [
  "app/florida-events/[slug]/page.js",
  "app/guides/[slug]/page.js",
  "app/components/GuideStandardShell.js",
];
for (const rel of ROUTES) {
  const src = strip(read(rel));
  ok(/<EditorialStandard[\s>]/.test(src), `${rel} renders <EditorialStandard>`);
}
ok(/<EventDetailShell[\s>]/.test(strip(read("app/florida-events/[slug]/page.js"))), "the Florida event page still fills the shared frame with EventDetailShell");
ok(/<EventWhere[\s>]/.test(strip(read("app/florida-events/[slug]/page.js"))), "the Florida event page still passes EventWhere into the frame");
ok(/<EventWhere[\s>]/.test(strip(read("app/guides/[slug]/page.js"))), "the guide template still passes EventWhere into the frame");

const whereSrc = read("app/components/EventWhere.js");
ok(whereSrc.includes("Where it is"), "EventWhere renders the Where it is heading");
ok(whereSrc.includes("Plan your drive"), "EventWhere renders Plan your drive");
ok(read("lib/eventOuting.js").includes("Before and after"), "before and after copy still lives on the outing rail the UTC page uses");
ok(strip(read("app/guides/[slug]/page.js")).includes("Before and after"), "the guide template renders a Before and after section");
ok(strip(read("app/components/GuideStandardShell.js")).includes("Before and after"), "dedicated guide routes render a Before and after section through the shell");

const guidesDir = path.join(ROOT, "app/guides");
const dedicated = readdirSync(guidesDir).filter((name) => {
  const full = path.join(guidesDir, name);
  return name !== "[slug]" && statSync(full).isDirectory() && existsSync(path.join(full, "page.js"));
});
ok(dedicated.length >= 3, "positive control: dedicated guide routes exist");
for (const name of dedicated) {
  if (name === "past") continue;
  const src = strip(read(`app/guides/${name}/page.js`));
  ok(/<GuideStandardShell[\s>]/.test(src), `app/guides/${name}/page.js renders through GuideStandardShell`);
}
ok(!existsSync(path.join(ROOT, "app/blog")), "no parallel app/blog route; guides are the blog articles in this repo");

for (const rel of ["app/components/EditorialStandard.js", "app/guides/[slug]/page.js", "app/components/GuideStandardShell.js"]) {
  const src = strip(read(rel));
  ok(!/href=["']\/date-night(?:[?"']|$)/.test(src), `${rel} does not link /date-night`);
  ok(!/Photo unavailable/i.test(src), `${rel} does not render a Photo unavailable placeholder`);
}
ok(!/href=["']\/date-night(?:[?"']|$)/.test(strip(read("lib/editorialStandard.js"))), "lib/editorialStandard.js does not link /date-night");

const chrome = [NOT_STATED, "No separate nearby picks are listed on this page.", "Nearby picks are on the map above.", "Before and after", "All guides"];
ok(chrome.every((line) => !/[—–]| - /.test(line)), "new chrome copy has no dashes");
ok(/[—–]/.test("a — b"), "positive control: the dash probe catches an em dash");

const tampa = guideEditorialFacts(GUIDES["tampa-restaurants"]);
ok(tampa.map((f) => f.label).join("|") === "When|Where|Cost|Who it is for", "tampa-restaurants gets the four fact rows");
ok(tampa.find((f) => f.label === "Where").value === "Tampa", "tampa-restaurants Where is the guide's own region");
ok(tampa.find((f) => f.label === "Cost").value === NOT_STATED, "tampa-restaurants does not invent a price");
const river = guideEditorialFacts(GUIDES["river-of-lights-tampa-2026"]);
ok(/November 21, 2026/.test(river.find((f) => f.label === "When").value), "river of lights When copies the pick's own date line");
ok(/ticket price is not posted/.test(river.find((f) => f.label === "Cost").value), "river of lights Cost copies the pick's own price note");

const Mod = await loadComponent(path.join(ROOT, "app/components/EditorialStandard.js"), ROOT);
const EditorialStandard = Mod.default;
const good = renderToStaticMarkup(React.createElement(EditorialStandard, {
  title: "Fixture guide",
  heroSrc: "/guides/fixture.jpg",
  facts: [
    { label: "When", value: "November 21, 2026 to January 3, 2027" },
    { label: "Where", value: "Tampa" },
    { label: "Cost", value: "A ticket price is not posted." },
    { label: "Who it is for", value: "Families" },
  ],
  story: React.createElement("p", { "data-editorial-summary": "" }, "A short summary of the fixture."),
  note: "Confirm hours on the official listing before you go.",
  media: React.createElement("div", { className: "wf-event-photo", "data-editorial-hero": "" },
    React.createElement("img", { src: "/guides/fixture.jpg", alt: "Fixture" })),
  credit: React.createElement("p", { "data-editorial-credit": "" }, "Photo: Fixture Source"),
  where: React.createElement("section", null,
    React.createElement("p", null, "Where it is"),
    React.createElement("a", { href: "#event-route" }, "Plan your drive")),
  afterWhere: React.createElement("section", { "data-editorial-nearby": "" },
    React.createElement("h2", null, "Before and after")),
}));
const goodGaps = editorialStandardGaps(good);
ok(goodGaps.length === 0, "the shared frame renders every UTC section (gaps: " + goodGaps.join("; ") + ")");
ok(good.includes("Fixture guide") && good.includes("A short summary"), "the frame renders the title and the summary");

const broken = read("scripts/fixtures/editorial-standard-broken.html");
const brokenGaps = editorialStandardGaps(broken);
ok(brokenGaps.length >= 6, "the non-conforming fixture fails the standard (" + brokenGaps.join("; ") + ")");
ok(editorialStandardGaps(good.replace("Plan your drive", "Go there")).includes("missing Plan your drive"), "red-prove: dropping Plan your drive is a gap");
ok(!editorialStandardGaps(good).includes("missing Plan your drive"), "red-prove control: the intact frame still has Plan your drive");

let threw = false;
try {
  renderToStaticMarkup(React.createElement(EditorialStandard, { title: "No where block" }));
} catch (e) {
  threw = /Where it is/.test(String(e && e.message));
}
ok(threw, "a frame with no Where it is block throws");

if (fail.length) {
  console.error("check-editorial-standard: FAIL");
  for (const item of fail) console.error("  - " + item);
  process.exit(1);
}
console.log(`check-editorial-standard: OK — ${pass} assertions; shared frame matches the UTC page; broken fixture gaps: ${brokenGaps.join("; ")}`);
