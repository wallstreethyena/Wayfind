#!/usr/bin/env node
/**
 * test-guide-bundle: the "Make it a full day" bundle on guide pages
 * (lib/guideBundle.js, app/guides/[slug]/GuideBundle.js).
 *
 * Asserts on the CALL (guideBundleItems), not on source text:
 *   - [] with 0 or 1 qualifying items; 2 or 3 otherwise, never more than 3
 *   - one item per pick or deal, one of each kind preferred (activity, show, food)
 *   - skips non-affiliate tickets, non-primary offers, non-dining and non-commerce deals
 *   - keeps the guide's own order within a kind (never sorted by anything else)
 *   - no "$" and no digit-star rating in any item copy
 * And on the page (comments stripped): GuideBundle is imported and rendered
 * exactly once, gated on chrome.bookableHighlights.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const { guideBundleItems, copyIsClean } = await import("../lib/guideBundle.js");
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const offer = (id, extra = {}) => ({ provider: "viator", role: "primary", offerId: id, city: "Sarasota", title: "Guided tour " + id, ...extra });
const entry = (pickId, offers) => ({ pickId, offers, official: null });
const tkt = (n) => ({ href: "/api/ticketmaster/go?url=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2F" + n, label: "Check tickets", affiliate: true });
const deal = (id, extra = {}) => ({ id, business: "Cafe " + id, title: "Free dessert with dinner", cta: "Get the deal", category: "dining", url: "/api/commerce/go?provider=clipp&offer=" + id + "&surface=coupons&content=" + id, commerce: { provider: "clipp" }, ...extra });
const P = (key, extra = {}) => ({ key, name: "Pick " + key, pickId: "p" + key, ticket: null, offerEntry: null, ...extra });
const call = (picks, deals) => guideBundleItems({ slug: "demo-guide", picks, deals });

// below the floor
ok(call([], []).length === 0, "0 qualifying returns []");
ok(call([P(1, { offerEntry: entry("p1", [offer("A1")]) })], []).length === 0, "1 qualifying returns []");
ok(call([P(1, { ticket: { href: "/x", label: "Tickets", affiliate: false } })], [deal("d1", { commerce: null })]).length === 0, "nothing qualifying returns []");
ok(call(undefined, undefined).length === 0 && guideBundleItems().length === 0, "missing input returns []");

// full set: one of each kind, order activity, show, food
const full = call(
  [P(1, { offerEntry: entry("p1", [offer("A1")]) }), P(2, { ticket: tkt(2) }), P(3)],
  [deal("d1")],
);
ok(full.length === 3, "activity + show + food gives 3");
ok(full.map((i) => i.kind).join() === "activity,show,food", "kinds ordered activity, show, food");
ok(full.map((i) => i.kindLabel).join() === "Activity,Show,Food", "kind labels");
ok(full[0].name === "Pick 1" && full[1].name === "Pick 2" && full[2].name === "Cafe d1", "names come from the pick or the deal business");
ok(full[0].detail === "Guided tour A1" && full[2].detail === "Free dessert with dinner", "detail is the offer or deal title");
ok(full[0].ctaLabel === "Check dates and price" && full[1].ctaLabel === "Check tickets" && full[2].ctaLabel === "Get the deal", "button copy from existing data");
ok(full[0].href.startsWith("/api/commerce/go?") && /surface=guide_bundle/.test(full[0].href) && /provider=viator/.test(full[0].href) && /offer=A1/.test(full[0].href) && /content=demo-guide%3Ap1/.test(full[0].href), "activity href is the tracked redirect on surface guide_bundle");
ok(full[0].owned === true && full[1].owned === false && full[2].owned === false, "only the activity row is owned by the component for clicks");
ok(/surface=guide_bundle/.test(full[2].href) && full[2].ctx.surface === "guide_bundle", "deal redirect re-surfaced to guide_bundle");
ok(full[1].href.startsWith("/api/ticketmaster/go?"), "ticket keeps its existing tracked redirect");

// a custom button label is used, and the default when absent
ok(call([P(1, { offerEntry: entry("p1", [offer("A1", { buttonLabel: "See the tour" })]) }), P(2, { ticket: tkt(2) })])[0].ctaLabel === "See the tour", "offer buttonLabel wins");

// cap at 3 with plenty of candidates, one item per pick or deal
const many = call(
  [1, 2, 3, 4, 5].map((n) => P(n, { offerEntry: entry("p" + n, [offer("A" + n)]), ticket: tkt(n) })),
  [deal("d1"), deal("d2")],
);
ok(many.length === 3, "caps at 3");
ok(new Set(many.map((i) => i.name)).size === many.length, "one item per pick or deal");
ok(many.map((i) => i.name).join() === "Pick 1,Pick 2,Cafe d1", "guide order kept: first pick for activity, next pick for show, first deal for food");

// the same pick cannot fill two kinds when another pick can
const same = call([P(1, { offerEntry: entry("p1", [offer("A1")]), ticket: tkt(1) }), P(2, { offerEntry: entry("p2", [offer("A2")]) })]);
ok(same.length === 2 && new Set(same.map((i) => i.name)).size === 2, "a pick that has an offer and a ticket still counts once");
ok(same[0].kind === "activity" && same[0].name === "Pick 2" && same[1].kind === "show" && same[1].name === "Pick 1", "re-assigns so two picks fill two kinds");
ok(call([P(1, { offerEntry: entry("p1", [offer("A1")]), ticket: tkt(1) })]).length === 0, "one pick with both kinds is still one item, so []");

// skips
const alt = call([P(1, { offerEntry: entry("p1", [offer("A1", { role: "alternative" })]) }), P(2, { ticket: tkt(2) })]);
ok(alt.length === 0, "alternative-only offer is skipped");
ok(call([P(1, { offerEntry: entry("p1", [offer("A0", { role: "alternative" }), offer("A1")]) }), P(2, { ticket: tkt(2) })])[0].href.includes("offer=A1"), "uses the primary offer, not the alternative before it");
ok(call([P(1, { ticket: { href: "https://www.tampatheatre.org/", label: "Official site (not an affiliate link)", affiliate: false } }), P(2, { offerEntry: entry("p2", [offer("A2")]) })]).length === 0, "non-affiliate ticket is skipped");
ok(call([P(1, { offerEntry: entry("p1", [offer("A1")]) })], [deal("d1", { category: "drinks" })]).length === 0, "non-dining deal is skipped");
ok(call([P(1, { offerEntry: entry("p1", [offer("A1")]) })], [deal("d1", { commerce: null })]).length === 0, "deal without commerce is skipped");
ok(call([P(1, { offerEntry: entry("p1", [offer("A1")]) })], [deal("d1", { url: "https://example.com/deal" })]).length === 0, "deal that is not our /api/commerce/go redirect is skipped");

// copy: no dollar signs, no star ratings
const dirty = call(
  [P(1, { offerEntry: entry("p1", [offer("A1", { title: "Kayak tour from $59" })]) }), P(2, { ticket: { ...tkt(2), label: "Tickets from $25" } }), P(3, { ticket: tkt(3) })],
  [deal("d1", { title: "$10 off dinner", cta: "Save $10" })],
);
const blob = JSON.stringify(dirty.map(({ kind, kindLabel, name, detail, ctaLabel }) => ({ kind, kindLabel, name, detail, ctaLabel })));
ok(dirty.length >= 2, "dirty copy still bundles on the clean items");
ok(!blob.includes("$") && !/\d\s*(?:-|\s)?stars?|★/i.test(blob), "no $ and no digit-star rating in copy");
ok(dirty.find((i) => i.kind === "activity").detail === "", "an offer title with a price is dropped, not rewritten");
ok(!dirty.some((i) => i.ctaLabel === "Tickets from $25"), "a priced ticket label is never shown");
ok(copyIsClean("Check dates and price") && !copyIsClean("$5") && !copyIsClean("4.8 stars") && !copyIsClean("5-star") && !copyIsClean("★★★★"), "copy probe has positive and negative controls");
ok(!/—|–/.test(blob + JSON.stringify(full.map((i) => [i.kindLabel, i.ctaLabel]))), "no em or en dash in item copy");

// page wiring: comments stripped, then count the real thing
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const page = strip(readFileSync(path.join(REPO, "app/guides/[slug]/page.js"), "utf8"));
ok((page.match(/<GuideBundle[\s/>]/g) || []).length === 1, "page.js renders <GuideBundle exactly once");
ok(/import GuideBundle from "\.\/GuideBundle";/.test(page), "page.js imports GuideBundle");
ok(/import \{ guideBundleItems \} from "\.\.\/\.\.\/\.\.\/lib\/guideBundle";/.test(page), "page.js imports guideBundleItems");
ok(/chrome\.bookableHighlights \? \(\s*<GuideBundle/.test(page), "the bundle is gated on chrome.bookableHighlights (editorial guides render nothing)");
ok(page.indexOf("<GuideBundle") > page.indexOf('className="wf-guide-disclosure"') && page.indexOf("<GuideBundle") < page.indexOf("shippingPicks.map(({ pick, index: i }"), "bundle sits after the disclosure line and before the picks loop");
const comp = strip(readFileSync(path.join(REPO, "app/guides/[slug]/GuideBundle.js"), "utf8"));
ok(!/position:\s*["']?(?:sticky|fixed)/i.test(comp), "no sticky or fixed positioning");
ok(/data-commerce-owner=/.test(comp) && /rel="sponsored noopener nofollow"/.test(comp) && /target="_blank"/.test(comp), "owned anchors and partner rel/target");
ok((comp.match(/<GuideCommissionLine/g) || []).length === 1, "commission line rendered once");

// rendered markup (server render, no JS): real anchors, one commission line, empty below 2
{
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const C = (await loadComponent(path.join(REPO, "app/guides/[slug]/GuideBundle.js"), REPO)).default;
  const html = renderToStaticMarkup(createElement(C, { items: full, slug: "demo-guide" }));
  ok(html.includes("Make it a full day") && html.includes("Pick any that fit your plans. They pair well with this guide."), "heading and one-line intro render");
  ok((html.match(/<a /g) || []).length === 3 && (html.match(/href="\/api\/(?:commerce|ticketmaster)\/go\?/g) || []).length === 3, "three real anchors on our tracked redirects");
  ok((html.match(/rel="sponsored noopener nofollow"/g) || []).length === 3 && (html.match(/target="_blank"/g) || []).length === 3, "every anchor is sponsored, nofollow, new tab");
  ok((html.match(/data-commerce-owner="GuideBundle"/g) || []).length === 1, "only the activity anchor is owned");
  ok((html.match(/wf-guide-commission/g) || []).length === 1, "commission line once");
  ok(/min-height:44px/.test(html) && !/position:(?:sticky|fixed)/.test(html), "44px buttons, nothing sticky or fixed");
  ok(!html.includes("$") && !/\u2014|\u2013/.test(html), "rendered copy has no $ and no em or en dash");
  ok(renderToStaticMarkup(createElement(C, { items: [], slug: "demo-guide" })) === "" && renderToStaticMarkup(createElement(C, { items: full.slice(0, 1), slug: "demo-guide" })) === "", "renders nothing below 2 items");
}

if (fail.length) { console.error("FAIL test-guide-bundle (" + fail.length + "):\n  - " + fail.join("\n  - ")); process.exit(1); }
console.log("PASS test-guide-bundle: " + pass + " assertions (calls guideBundleItems; page.js scanned with comments stripped)");
