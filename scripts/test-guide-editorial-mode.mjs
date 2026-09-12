#!/usr/bin/env node
/**
 * test-guide-editorial-mode — a dated brief is not an evergreen guide.
 *
 * Tonight's Move opts into editorialMode. That flag, not a slug `if` in JSX,
 * is what suppresses generic commerce chrome. A normal Tampa guide must keep
 * that chrome. When origin/main is available, /tonight must stay byte-identical
 * to it. Hosted shallow checkouts may omit that remote ref, so that comparison
 * is skipped there and is verified directly in GitHub release evidence.
 *
 * Assert on the CALL: guideCommerceChrome() is invoked against live guide
 * objects, then the returned flags decide whether the competing headings
 * exist. A source grep for "Bookable highlights" would pass on the evergreen
 * path even if Tonight's Move still rendered it.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GUIDES } from "../lib/guides.js";
import { guideCommerceChrome, isEditorialGuide } from "../lib/guideEditorialMode.js";

const SLUG = "tonights-move-tampa-september-12-2026";
const TAMPA = "things-to-do-in-tampa-florida";
const TONIGHT_FILES = ["app/tonight/page.js", "app/tonight/client.js"];

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

function pageCode() {
  return readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
}

function chromeHeadings(guide, city) {
  const chrome = guideCommerceChrome(guide);
  return renderToStaticMarkup(createElement("div", null,
    chrome.chooseQuickly ? createElement("h2", null, "Choose quickly") : null,
    chrome.bookableHighlights ? createElement("span", null, `Bookable highlights near ${city}`) : null,
    chrome.liveDeals ? createElement("h2", null, `Live right now in ${city}`) : null,
    chrome.keepExploring ? createElement("h2", null, `Keep exploring near ${city}`) : null,
    createElement("h1", null, guide.title),
    createElement("p", null, guide.intro),
  ));
}

const brief = GUIDES[SLUG];
const tampa = GUIDES[TAMPA];
ok(brief && tampa, "both guides exist in the registry");
ok(isEditorialGuide(brief) === true, "Tonight's Move opts into editorialMode");
ok(isEditorialGuide(tampa) === false, "the Tampa evergreen guide is not editorial");
ok(brief.title === "Tonight's Move", "H1 title stays Tonight's Move");
ok(brief.editorialMode === true, "the flag is a guide property, not a CSS class");

const briefChrome = guideCommerceChrome(brief);
const tampaChrome = guideCommerceChrome(tampa);
for (const key of ["chooseQuickly", "exploreBridge", "bookableHighlights", "liveNow", "liveDeals", "keepExploring"]) {
  ok(briefChrome[key] === false, `Tonight's Move suppresses ${key}`);
  ok(tampaChrome[key] === true, `Tampa evergreen keeps ${key}`);
}

const briefHtml = chromeHeadings(brief, "Tampa");
const tampaHtml = chromeHeadings(tampa, "Tampa");
ok(!briefHtml.includes("Bookable highlights"), "Tonight's Move does not render Bookable highlights");
ok(!briefHtml.includes("Live right now in Tampa"), "Tonight's Move does not render Live right now deals");
ok(!briefHtml.includes("Choose quickly"), "Tonight's Move does not render Choose quickly");
ok(!briefHtml.includes("Keep exploring near Tampa"), "Tonight's Move does not render Keep exploring");
ok(/Tonight(?:'|&#x27;)s Move/.test(briefHtml) && briefHtml.includes("Tampa Bay has two rooms"), "the brief still renders its headline and opening line");
ok(tampaHtml.includes("Bookable highlights near Tampa"), "Tampa evergreen still renders Bookable highlights");
ok(tampaHtml.includes("Live right now in Tampa"), "Tampa evergreen still renders Live right now deals");
ok(tampaHtml.includes("Keep exploring near Tampa"), "Tampa evergreen still renders Keep exploring");

const unflagged = { ...brief };
delete unflagged.editorialMode;
ok(guideCommerceChrome(unflagged).bookableHighlights === true, "red-prove: dropping editorialMode restores Bookable highlights");
ok(chromeHeadings(unflagged, "Tampa").includes("Bookable highlights near Tampa"), "red-prove: the restored flag actually paints the heading");

const code = pageCode();
ok(/const chrome = guideCommerceChrome\(g\)/.test(code), "the page calls guideCommerceChrome(g) — one helper, not a slug if");
ok(!/params\.slug\s*===\s*["']tonights-move/.test(code), "the page has no Tonight's Move slug if/else");
ok(/chrome\.bookableHighlights && railIntent && bridgeCity/.test(code) && /<IntentPartnerPick/.test(code),
  "Bookable highlights / IntentPartnerPick is gated on the helper");
ok(/chrome\.liveDeals && dealCards\.length/.test(code) && /<GuideDealCards/.test(code),
  "GuideDealCards is gated on the helper");
ok(/chrome\.chooseQuickly && quickChoices\.length/.test(code), "Choose quickly is gated on the helper");
ok(/chrome\.liveNow && nowHeadline/.test(code), "the weather Right now block is gated on the helper");
ok(/chrome\.keepExploring \?/.test(code) && /<DiscoveryPaths/.test(code), "Keep exploring is gated on the helper");
ok(/next=\{chrome\.keepExploring \? continueTo : null\}/.test(code), "the continue card follows the same flag");
ok(/<IntentPartnerPick/.test(code) && /<GuideDealCards/.test(code),
  "evergreen commerce components remain on the guide template");

let hasOriginMain = false;
try {
  execFileSync("git", ["rev-parse", "--verify", "origin/main"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  hasOriginMain = true;
} catch {
  // Vercel's hosted shallow checkout may not include origin/main.
}

if (hasOriginMain) {
  for (const file of TONIGHT_FILES) {
    const main = execFileSync("git", ["rev-parse", `origin/main:${file}`], { encoding: "utf8" }).trim();
    const head = execFileSync("git", ["rev-parse", `HEAD:${file}`], { encoding: "utf8" }).trim();
    ok(main && head && main === head, `${file} stays byte-identical to origin/main`);
    ok(main.length === 40, `${file}: got a real blob SHA, not an empty string`);
  }
  const tonightDiff = execFileSync("git", ["diff", "--name-only", "origin/main", "--", "app/tonight"], { encoding: "utf8" }).trim();
  ok(tonightDiff === "", "no app/tonight path differs from origin/main");
}

console.log(`test-guide-editorial-mode: OK — ${checks} assertions; Tonight's Move is editorial; ${TAMPA} keeps commerce chrome; /tonight base comparison ${hasOriginMain ? "passed" : "deferred to GitHub release evidence"}`);
