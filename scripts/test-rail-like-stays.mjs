#!/usr/bin/env node
// scripts/test-rail-like-stays.mjs — Like/Dislike stay on the rail.
//
// THE BUG (live 2026-08-20): Gabe tapped Like on an Amazon-rail card
// (Agave Bandido). IconicPlaceCard had no onLike, so the thumb was
// <a href="/p/{id}?action=like">. That forced list → /p/[id] → home with
// the detail sheet open. The circular hero Back could not restore the rail
// because an extra history.pushState ate the first Back.
//
// Locked by CALL, not by a comment:
//   1. stayOnRailReaction preventDefault / stopPropagation and does not
//      assign location.
//   2. Rendered IconicPlaceCard + RailCard like/dislike are <button>, never
//      <a href="/p/...?action=like"> — including when onLike is omitted.
//   3. placeRouteBackPlan: a ?action=like arrival with a same-origin
//      previous page leaves /p/{id}; without one it closes onto "/".
//   4. Red-prove: restoring the <a href="/p/${id}?action=like"> pattern
//      makes reactionSourceNavigates return true.
//   5. DaypartRail / home.js / GuidePlaceCard actually wire the handler.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  stayOnRailReaction,
  reactionSourceNavigates,
  reactionMarkupNavigates,
  placeRouteBackPlan,
} from "../lib/railReaction.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
let fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// ── 1. stayOnRailReaction CALLED ──────────────────────────────────────────
{
  const ev = {
    stopped: false,
    prevented: false,
    stopPropagation() { this.stopped = true; },
    preventDefault() { this.prevented = true; },
  };
  let loc = "https://www.gowayfind.com/";
  const assign = (u) => { loc = u; };
  let called = 0;
  stayOnRailReaction(ev, (e, place) => {
    called++;
    ok(e === ev, "handler receives the same event");
    ok(place && place.id === "ChIJ-agave", "handler receives the place, not a URL");
    assign("/p/" + place.id + "?action=like");
  }, { id: "ChIJ-agave", name: "Agave Bandido" });
  ok(ev.stopped && ev.prevented, "stayOnRailReaction preventDefault + stopPropagation — CALL, not a comment");
  ok(called === 1, "wired handler is invoked once");
  // The handler above deliberately assigned — proving the helper itself does
  // not. A missing handler must leave location untouched:
  loc = "https://www.gowayfind.com/";
  const ev2 = {
    stopped: false,
    prevented: false,
    stopPropagation() { this.stopped = true; },
    preventDefault() { this.prevented = true; },
  };
  stayOnRailReaction(ev2, null, { id: "ChIJ-agave" });
  ok(ev2.stopped && ev2.prevented, "unwired like still preventDefault — never falls through to card navigation");
  ok(loc === "https://www.gowayfind.com/", "unwired like does not set location to /p/...?action=like");
}

// ── 2. Red-prove: the old <a href> pattern fails the detector ─────────────
{
  const restored = '<a className="wf-place-card-like" href={`/p/${id}?action=like`} aria-label={"Like " + place.name}><ThumbIcon /></a>';
  const restoredDislike = '<a className="wf-place-card-dislike" href={`/p/${id}?action=dislike`}><ThumbIcon down /></a>';
  const restoredActionHref = '<a className="wf-place-card-like" href={actionHref("like")} title="Like this place"><ThumbIcon /></a>';
  ok(reactionSourceNavigates(restored) === true, "red-prove: restoring <a href={`/p/${id}?action=like`}> is detected");
  ok(reactionSourceNavigates(restoredDislike) === true, "red-prove: restoring <a href={`/p/${id}?action=dislike`}> is detected");
  ok(reactionSourceNavigates(restoredActionHref) === true, "red-prove: restoring href={actionHref(\"like\")} is detected");
  // Positive control: the detector finds a known-present string the same way
  // (AGENTS.md §4d) — stayOnRailReaction is in the live source.
  const iconic = read("app/components/IconicPlaceCard.js");
  ok(iconic.includes("stayOnRailReaction"), "PROBE: IconicPlaceCard still imports/calls stayOnRailReaction");
  ok(reactionSourceNavigates(iconic) === false, "live IconicPlaceCard source does not ship the navigate-away like href");
  ok(reactionSourceNavigates(read("app/components/RailCard.js")) === false, "live RailCard source does not ship the navigate-away like href");
  // A comment mentioning the old bug must not trip the detector.
  ok(reactionSourceNavigates("/* <a href=\"/p/${id}?action=like\"> */\nconst x = 1;") === false,
    "the detector strips comments — the 2026-08-01 writeup cannot fail a correct file");
}

// ── 3. RENDER the cards and CALL the markup detector ──────────────────────
const place = {
  id: "ChIJ7QsLgxQ5w4gRSLtMON-sOaI",
  name: "Agave Bandido",
  rating: 4.6,
  reviews: 210,
  types: ["mexican_restaurant", "restaurant"],
  primaryType: "FOOD",
  address: "1550 Lakefront Dr, Sarasota",
};
const iconicMod = await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
const Iconic = iconicMod.default;
const unwiredHtml = renderToStaticMarkup(createElement(Iconic, { place, rank: 1, href: "/p/" + place.id }));
ok(unwiredHtml.includes("wf-place-card-like"), "PROBE: like control rendered on the unwired card");
ok(!reactionMarkupNavigates(unwiredHtml), "unwired IconicPlaceCard like/dislike do not render <a href=/p/...?action=like>");
ok(/<button[^>]*class="[^"]*wf-place-card-like/.test(unwiredHtml), "unwired like is a <button>, not an <a>");
ok(/<button[^>]*class="[^"]*wf-place-card-dislike/.test(unwiredHtml), "unwired dislike is a <button>, not an <a>");
ok(!/<a[^>]*wf-place-card-like/.test(unwiredHtml) && !/<a[^>]*wf-place-card-dislike/.test(unwiredHtml),
  "unwired thumbs are never anchors — the fallback <a href> is gone");

let wiredCalls = 0;
const wiredHtml = renderToStaticMarkup(createElement(Iconic, {
  place, rank: 1, href: "/p/" + place.id,
  onLike: () => { wiredCalls++; },
  onDislike: () => { wiredCalls++; },
}));
ok(!reactionMarkupNavigates(wiredHtml), "wired IconicPlaceCard like/dislike do not navigate");
ok(/<button[^>]*class="[^"]*wf-place-card-like/.test(wiredHtml), "wired like is a <button>");

const railMod = await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT);
const Rail = railMod.default;
const railHtml = renderToStaticMarkup(createElement(Rail, { title: place.name, href: "/p/" + place.id, rank: 1 }));
ok(railHtml.includes("wf-place-card-like"), "PROBE: RailCard rendered a like control");
ok(!reactionMarkupNavigates(railHtml), "RailCard like/dislike do not render <a href=/p/...?action=like>");
ok(/<button[^>]*class="[^"]*wf-place-card-like/.test(railHtml), "RailCard like is a <button>");

// ── 4. placeRouteBackPlan CALLED ──────────────────────────────────────────
{
  const fromRail = placeRouteBackPlan({
    pathname: "/p/ChIJ7QsLgxQ5w4gRSLtMON-sOaI",
    search: "?action=like",
    referrer: "https://www.gowayfind.com/",
    origin: "https://www.gowayfind.com",
  });
  ok(fromRail.stripAction === true, "?action=like arrival strips the query — like is a signal, not a page");
  ok(fromRail.leavePlaceRoute === true, "same-origin previous page: Back leaves /p/{id} and restores the rail");
  ok(fromRail.replaceHomeOnClose === false, "same-origin previous page does not replace onto / (history.back restores the rail)");

  const oldShare = placeRouteBackPlan({
    pathname: "/p/ChIJ7QsLgxQ5w4gRSLtMON-sOaI",
    search: "?action=like",
    referrer: "",
    origin: "https://www.gowayfind.com",
  });
  ok(oldShare.stripAction === true, "old share still strips ?action=like");
  ok(oldShare.leavePlaceRoute === false, "no same-origin previous page: do not history.back() off the site");
  ok(oldShare.replaceHomeOnClose === true, "old ?action=like share closes onto / — the place route cannot trap");

  const dislikeShare = placeRouteBackPlan({
    pathname: "/p/ChIJ7QsLgxQ5w4gRSLtMON-sOaI",
    search: "?action=dislike",
    referrer: "https://www.gowayfind.com/best-of",
    origin: "https://www.gowayfind.com",
  });
  ok(dislikeShare.stripAction && dislikeShare.leavePlaceRoute, "dislike uses the same back plan as like");

  const homepage = placeRouteBackPlan({
    pathname: "/",
    search: "",
    referrer: "",
    origin: "https://www.gowayfind.com",
  });
  ok(!homepage.stripAction && !homepage.leavePlaceRoute && !homepage.replaceHomeOnClose,
    "homepage is not a place-route trap");
}

// ── 5. Production call sites actually use the helper ──────────────────────
const home = read("app/home.js");
ok(/import \{ placeRouteBackPlan \} from ["']\.\.\/lib\/railReaction["']/.test(home),
  "home.js imports placeRouteBackPlan — a re-derived inline would drift");
ok(/placeRouteBackPlan\(\{/.test(home), "home.js CALLS placeRouteBackPlan on /p/{id} arrival");
ok(/placeRouteReturnRef\.current = backPlan\.leavePlaceRoute/.test(home),
  "home.js writes leavePlaceRoute onto the Back ref");
ok(/placeActionHomeRef\.current = backPlan\.replaceHomeOnClose/.test(home),
  "home.js writes replaceHomeOnClose onto the leftover-share ref");
ok(/_sp\.delete\("action"\)/.test(home), "home.js strips ?action= from /p/{id} so refresh cannot reopen the sheet as the only UI");

const rail = read("app/components/DaypartRail.js");
ok(/onLike = null/.test(rail) && /onDislike = null/.test(rail),
  "DaypartRail accepts onLike/onDislike (nullable for /v8)");
ok(/onLike=\{onLike \? \(e, pl\) => onLike\(e, pl\) : null\}/.test(rail),
  "DaypartRail forwards onLike onto IconicPlaceCard");
ok(/onDislike=\{onDislike \? \(e, pl\) => onDislike\(e, pl\) : null\}/.test(rail),
  "DaypartRail forwards onDislike onto IconicPlaceCard");
ok(/onLike=\{onLike \|\| undefined\}/.test(rail),
  "DaypartRail forwards onLike onto ExplodingNearby (trending drop)");

ok(/onLike=\{\(e, p\) => \{ try \{ toggleLike\(e, p\)/.test(home),
  "home.js passes toggleLike into DaypartRail — same tables, same localStorage keys");
ok(/onDislike=\{\(e, p\) => \{ try \{ toggleDislike\(e, p\)/.test(home),
  "home.js passes toggleDislike into DaypartRail");

const guide = read("app/components/GuidePlaceCard.js");
ok(/persistLike/.test(guide) && /persistDislike/.test(guide),
  "GuidePlaceCard records like/dislike through likeSignal — same keys as home.js");
ok(/onLike=\{onLike\}/.test(guide) && /onDislike=\{onDislike\}/.test(guide),
  "GuidePlaceCard passes onLike/onDislike into IconicPlaceCard");

const iconicSrc = read("app/components/IconicPlaceCard.js");
// v8.29.6 — RE-POINTED, NOT RELAXED. These pinned `stayOnRailReaction(e, onLike,
// place)` — the RAW prop. The prop is null on any surface that forgot to wire
// one, and stayOnRailReaction returns silently when the handler is missing, so
// the literal this asserted was also the literal that shipped a live button
// over a no-op. `doLike` is `onLike` when the caller wired one and
// lib/cardActions.js's shared store otherwise, so the contract this guard
// exists for — the tap never navigates — is unchanged, and the tap now also
// always does something. Both halves are asserted.
ok(/const doLike = onLike \|\| \(fb\.hydrated \?/.test(iconicSrc) && /const doDislike = onDislike \|\| \(fb\.hydrated \?/.test(iconicSrc),
  "IconicPlaceCard resolves doLike/doDislike from the prop with a hydrated fallback — the handler is never missing");
ok(/onClick=\{\(e\) => stayOnRailReaction\(e, doLike, place\)\}/.test(iconicSrc),
  "IconicPlaceCard like button CALLS stayOnRailReaction — a comment is not a handler");
ok(/onClick=\{\(e\) => stayOnRailReaction\(e, doDislike, place\)\}/.test(iconicSrc),
  "IconicPlaceCard dislike button CALLS stayOnRailReaction");

if (fail) {
  console.error(`test-rail-like-stays: ${fail} failed / ${pass} passed`);
  process.exit(1);
}
console.log(`test-rail-like-stays: OK — ${pass} assertions (stayOnRailReaction CALLED; cards RENDERED without ?action=like href; placeRouteBackPlan CALLED; red-prove of restored <a href=/p/\${id}?action=like>)`);
