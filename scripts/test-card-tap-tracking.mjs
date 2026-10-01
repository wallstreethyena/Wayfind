#!/usr/bin/env node
/**
 * test-card-tap-tracking — a tap on a home-feed place card is recorded ONCE,
 * names the place (stable place_id) and the place page it opens.
 *
 * THE BUG (found verifying #1560 in production, 2026-10-01). The home feed's
 * place cards are IconicPlaceCard, whose root is an <li data-card-opens-detail>
 * with its own onClick. lib/browserAnalytics.clickProperties only recognised
 * a / button / [role=button], so a tap on the card BODY — the commonest way to
 * open a place — produced no element_click at all, and taps on the card's own
 * buttons carried no place_id because the card had no data-place-id. Measured
 * live: 47 cards on the Orlando home feed at 390px, 0 with a place id.
 *
 * Every assertion runs real code:
 *   1. the REAL IconicPlaceCard is rendered (scripts/lib/jsxLoad.mjs) and its
 *      root must carry data-card-opens-detail AND data-place-id = place.id;
 *   2. the REAL clickProperties is called on an element modelled from that
 *      rendered markup (attributes + the card's own /p/ link), for a body tap
 *      and for a tap on one of the card's buttons;
 *   3. the REAL page-visit tracker's document click listener is invoked once
 *      for one tap, and must emit exactly ONE element_click.
 *
 * --red-prove: re-runs check 2 against the real browserAnalytics source with
 * the [data-card-opens-detail] selector removed (in memory) and requires it to FAIL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const PLACE_ID = "ChIJ96XKNOZ-3YgRoPEc0B85Hqc";
const ORIGIN = { origin: "https://gowayfind.com" };

// 1. render the real card
const mod = await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
const Card = mod.default || mod;
const html = renderToStaticMarkup(React.createElement(Card, {
  place: { id: PLACE_ID, name: "Walt Disney World Resort", rating: 4.7, reviews: 269400, types: ["amusement_park"], lat: 28.38, lng: -81.56 },
  rank: 1, href: "/p/" + PLACE_ID,
}));
const li = /<li\b[^>]*data-card-opens-detail[^>]*>/.exec(html)?.[0] || "";
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : (new RegExp(`\\s${name}(?=[\\s>])`).test(tag) ? "" : null); };
ok(li && attr(li, "data-place-id") === PLACE_ID, `render: the card root carries data-card-opens-detail and data-place-id="${PLACE_ID}" (got ${JSON.stringify(li.slice(0, 160))})`);
const placeHref = (/<a\b[^>]*class="wf-place-card-name"[^>]*href="([^"]+)"/.exec(html) || /<a\b[^>]*href="(\/p\/[^"]+)"/.exec(html) || [])[1] || null;
ok(placeHref === "/p/" + PLACE_ID, `render: the card's own place link is /p/<id> (got ${placeHref})`);

// 2. model the rendered DOM and call the real clickProperties
function cardDom() {
  const cardAttrs = { "data-card-opens-detail": attr(li, "data-card-opens-detail"), "data-place-id": attr(li, "data-place-id"), "data-iconic-place-card": attr(li, "data-iconic-place-card") };
  const link = { tagName: "A", getAttribute: (n) => (n === "href" ? placeHref : null) };
  const card = {
    tagName: "LI", getAttribute: (n) => (cardAttrs[n] === undefined ? null : cardAttrs[n]),
    matches: (sel) => /\[data-card-opens-detail\]|\[data-place-id\]/.test(sel),
    querySelector: (sel) => (/a\[href/.test(sel) ? link : null),
  };
  card.closest = (sel) => (/\[data-card-opens-detail\]|\[data-place-id\]/.test(sel) ? card : null);
  const photo = { tagName: "IMG", getAttribute: () => null, closest: (sel) => (/^a,button|\[role='button'\]/.test(sel) && !/data-/.test(sel) ? null : card.closest(sel)) };
  const saveBtn = { tagName: "BUTTON", textContent: "Save", getAttribute: (n) => (n === "aria-label" ? "Save Walt Disney World Resort" : null) };
  saveBtn.closest = (sel) => (/^a,button/.test(sel) ? saveBtn : card.closest(sel));
  return { card, photo, saveBtn };
}
async function checkClicks(clickProperties) {
  const { photo, saveBtn } = cardDom();
  const body = clickProperties(photo, ORIGIN);
  ok(body && body.element_type === "card" && body.place_id === PLACE_ID && body.destination_type === "internal" && body.destination_path === "/p/" + PLACE_ID,
    `body tap: one card click naming the place and its page (got ${JSON.stringify(body)})`);
  const btn = clickProperties(saveBtn, ORIGIN);
  ok(btn && btn.element_type === "button" && btn.element_label === "Save" && btn.place_id === PLACE_ID, `button tap inside the card carries the place id (got ${JSON.stringify(btn)})`);
  ok(clickProperties({ tagName: "DIV", getAttribute: () => null, closest: () => null }, ORIGIN) === null, "control: a tap outside any control or card still records nothing");
}
const analyticsSrc = readFileSync(path.join(ROOT, "lib/browserAnalytics.js"), "utf8");
const analytics = await import("data:text/javascript;base64," + Buffer.from(analyticsSrc).toString("base64"));
await checkClicks(analytics.clickProperties);

// 3. one tap through the real tracker = one element_click
{
  const listeners = {};
  const doc = {
    visibilityState: "visible", hasFocus: () => true, referrer: "",
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); }, removeEventListener() {},
    querySelector: () => null, documentElement: { scrollHeight: 2000, clientHeight: 844 }, scrollingElement: { scrollHeight: 2000, clientHeight: 844, scrollTop: 0 },
  };
  const win = { location: { href: "https://gowayfind.com/", origin: "https://gowayfind.com" }, innerHeight: 844, scrollY: 0, addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {} };
  const captured = [];
  const tracker = analytics.createPageVisitTracker({ win, doc, capture: (e, p) => captured.push([e, p]), now: () => 1000, setIntervalFn: () => 1, clearIntervalFn() {} });
  const { photo } = cardDom();
  ok((listeners.click || []).length === 1, `tracker registers exactly one document click listener (got ${(listeners.click || []).length})`);
  for (const fn of listeners.click || []) fn({ target: photo });
  const clicks = captured.filter(([e]) => e === "element_click");
  ok(clicks.length === 1 && clicks[0][1].place_id === PLACE_ID && clicks[0][1].page_path === "/", `one tap → exactly one element_click with place_id and page_path (got ${clicks.length})`);
  tracker.stop({ emitExit: false });
}

if (process.argv.includes("--red-prove")) {
  const target = `target.closest("a,button,[role='button'],[data-card-opens-detail]")`;
  if (!analyticsSrc.includes(target)) { console.error("test-card-tap-tracking: red-prove target missing — update the mutation"); process.exit(1); }
  const mutated = await import("data:text/javascript;base64," + Buffer.from(analyticsSrc.replace(target, `target.closest("a,button,[role='button']")`)).toString("base64"));
  console.log("test-card-tap-tracking: mutation applied (card selector removed)");
  const before = fail.length;
  await checkClicks(mutated.clickProperties);
  if (fail.length === before) { console.error("test-card-tap-tracking: RED-PROVE FAILED — the mutated source still passed"); process.exit(1); }
  fail.length = before;
  console.log("test-card-tap-tracking: red-prove OK — without the card selector a card-body tap records nothing");
}

if (fail.length) { for (const m of fail) console.error("test-card-tap-tracking: FAIL — " + m); process.exit(1); }
console.log(`test-card-tap-tracking: OK — ${pass} assertions (real IconicPlaceCard markup carries place id; body + button taps name the place; one tap = one element_click)`);
