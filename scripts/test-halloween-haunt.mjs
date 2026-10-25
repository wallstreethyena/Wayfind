#!/usr/bin/env node
// Locks the /halloween-in-florida ticket vault: dash-free visible copy,
// registry-built affiliate hrefs, organizer links for local haunts, and the
// Bo companion markup (video, speech, filters, Ask Bo, floating haunt).
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { eventTicketHref } from "../lib/eventTicketDeals.js";
import { RESERVED_GO_SLUGS, resolveGoSlug } from "../lib/goShortlinks.js";
import { seasonalSearchHub } from "../lib/seasonalSearch.js";
import {
  hauntCopyProblems,
  hauntsForFilter,
  halloweenHauntModel,
  halloweenHauntSchema,
} from "../lib/halloweenHauntVault.js";
import { boHauntFallback, parseBoReply, stripBoDashes, boPrompt } from "../lib/boHauntChat.js";

const root = process.cwd();
const DASH = /[-\u2013\u2014]/;
let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

const dashed = hauntCopyProblems({ lines: ["Howl-O-Scream starts at the gate."] });
ok(dashed.some((row) => row.startsWith("dash:")), "red-prove: a hyphen in Bo copy is a problem");
const banned = hauntCopyProblems({ lines: ["the best haunt right now"] });
ok(banned.some((row) => row.startsWith("best:")) && banned.some((row) => row.startsWith("right now:")), "red-prove: banned ranking phrases are problems");
ok(hauntCopyProblems({ lines: ["Howl O Scream starts at $45.99."] }).length === 0, "a clean savings line has no copy problem");

const model = halloweenHauntModel();
ok(model.lines.length >= 10, "Bo has at least 10 lines");
const required = [
  "I'm Boo, your ghost host! I died so I could haunt these Florida scares and save your wallet from gate prices.",
  "14 haunts so good it's spooky. Don't ghost me, tap a ticket link below and lock in your night before October 31.",
  "Sunglasses on, sunscreen energy, gate prices off. Howl O Scream starts at $45.99 when you book ahead.",
  "Paying box office prices is the real horror story here. Tap a haunt below and keep your soul and your cash.",
];
for (const line of required) ok(model.lines.includes(line), "required Bo line: " + line.slice(0, 42));
ok(hauntCopyProblems(model).length === 0, "the live model is dash free and phrase safe");

ok(model.haunts.length === 14, "fourteen haunts");
ok(hauntsForFilter(model, "all").length === 14, "All Haunts is the full vault");
const major = hauntsForFilter(model, "major").map((row) => row.id);
ok(major.includes("howlTampa") && major.includes("howlOrlando") && major.includes("hhn") && !major.includes("peppa"), "major scream parks are the three big nights");
ok(hauntsForFilter(model, "local").some((row) => row.name === "Scream A Geddon Horror Park"), "local trails include Scream A Geddon");
ok(hauntsForFilter(model, "family").some((row) => row.id === "mickey"), "family friendly includes Mickey");
ok(model.filters.map((item) => item.label).join("|") === "All Haunts|Major Scream Parks|Local Haunted Trails|Family Friendly", "filter labels");

const expectedHref = {
  howlTampa: "/api/commerce/go?provider=undercover_tourist&offer=20&surface=halloween_haunts&content=howl-o-scream-tampa-2026",
  howlOrlando: "/api/commerce/go?provider=undercover_tourist&offer=21&surface=halloween_haunts&content=howl-o-scream-seaworld-2026",
  hhn: "/api/commerce/go?provider=undercover_tourist&offer=19&surface=halloween_haunts&content=hhn-orlando-2026",
  zooTampa: "/api/commerce/go?provider=tiqets&offer=tampa-event-zootampa-creatures-of-the-night&surface=halloween_haunts&content=zootampa-creatures-2026",
  mickey: "/api/commerce/go?provider=undercover_tourist&offer=8&surface=halloween_haunts&content=mnsshp-2026",
  spooktacular: "/api/commerce/go?provider=undercover_tourist&offer=7&surface=halloween_haunts&content=seaworld-spooktacular-2026",
  brick: "/api/commerce/go?provider=undercover_tourist&offer=16&surface=halloween_haunts&content=brick-or-treat-2026",
  peppa: "/api/commerce/go?provider=undercover_tourist&offer=18&surface=halloween_haunts&content=peppas-halloween-party-2026",
  spookquarium: "/api/commerce/go?provider=tiqets&offer=tampa-drive-clearwater-aquarium&surface=halloween_haunts&content=hw26-halloween-spookquarium-clearwater-2026",
};
const expectedEvent = {
  howlTampa: "/florida-events/howl-o-scream-busch-gardens-tampa-2026",
  howlOrlando: "/florida-events/howl-o-scream-seaworld-orlando-2026",
  hhn: "/florida-events/halloween-horror-nights-orlando-2026",
  zooTampa: "/florida-events/zootampa-creatures-of-the-night-2026",
  mickey: "/florida-events/mickeys-not-so-scary-halloween-party-2026",
  spooktacular: "/florida-events/seaworld-orlando-halloween-spooktacular-2026",
  brick: "/florida-events/legoland-florida-brick-or-treat-2026",
  peppa: "/florida-events/peppas-halloween-party-2026",
  spookquarium: "/florida-events/halloween-spookquarium-clearwater-2026",
  screamageddon: "/florida-events/scream-a-geddon-dade-city-2026",
  sirHenry: "/florida-events/sir-henrys-haunted-trail-plant-city-2026",
  petrified: "/florida-events/a-petrified-forest-scream-park-2026-altamonte-springs-2026",
  undead: "/florida-events/undead-in-the-water-tampa-2026",
  frightfest: "/florida-events/sarasota-frightfest-2026",
};
const organizerHref = {
  screamageddon: "https://screamageddon.com/tickets/",
  sirHenry: "https://app.hauntpay.com/events/sir-henry-s-haunted-trail-2026",
  petrified: "https://events.ticketleap.com/tickets/a-petrified-forest/a-petrified-forest-scream-park-2026",
  undead: "https://www.undeadinthewater.com/",
  frightfest: "https://www.sarasotafrightfest.com/",
};
const parkAdmission = new Set(["spooktacular", "brick", "peppa", "spookquarium"]);

for (const row of model.haunts) {
  ok(expectedEvent[row.id] === row.eventHref, row.id + " event page");
  ok(!DASH.test(row.name + row.where + row.priceLabel + row.timing + row.tip + row.roast), row.id + " card copy is dash free");
  if (expectedHref[row.id]) {
    const built = eventTicketHref(row.eventId, { surface: "halloween_haunts" });
    ok(row.cta.href === built && row.cta.href === expectedHref[row.id], row.id + " affiliate href");
    ok(row.cta.kind === "affiliate" && row.cta.rel === "sponsored nofollow noopener", row.id + " sponsored rel");
    if (parkAdmission.has(row.id)) {
      ok(row.cta.label === "Book Now & Save" && row.cta.via.startsWith("Park tickets at "), row.id + " is park admission");
    } else {
      ok(row.cta.label === "Get Tickets" && row.cta.via.startsWith("Event tickets at "), row.id + " is an event ticket");
    }
  } else {
    ok(row.cta.kind === "organizer" && row.cta.href === organizerHref[row.id], row.id + " organizer href");
    ok(row.cta.label === "Official Tickets" && !/sponsored/.test(row.cta.rel), row.id + " organizer is not sponsored");
  }
}

ok(existsSync("public/videos/bo-halloween-reel.mp4") && statSync("public/videos/bo-halloween-reel.mp4").size > 100000, "Bo reel is in public/videos");
ok(existsSync("public/images/bo-halloween-poster.jpg") && statSync("public/images/bo-halloween-poster.jpg").size > 1000, "Bo poster is in public/images");
ok(model.video === "/videos/bo-halloween-reel.mp4" && model.poster === "/images/bo-halloween-poster.jpg", "model points at the local reel");

ok(RESERVED_GO_SLUGS.includes("halloween-tickets"), "halloween-tickets is a reserved go slug");
ok(resolveGoSlug("halloween-tickets").kind === "not-found", "the reserved slug is not an event shortlink");
ok(resolveGoSlug("howl-o-scream").kind === "shortlink" && resolveGoSlug("howl-o-scream").eventId === "howl-o-scream-tampa-2026", "howl-o-scream shortlink still resolves");
ok(resolveGoSlug("florida").kind === "not-found", "florida reservation still fails closed");

for (const file of ["app/halloween-tickets/page.js", "app/go/halloween-tickets/page.js"]) {
  const source = readFileSync(file, "utf8");
  ok(source.includes('permanentRedirect("/halloween-in-florida")'), file + " redirects");
  ok(/index:\s*false/.test(source), file + " is noindex");
}
const page = readFileSync("app/halloween-in-florida/page.js", "utf8");
ok(!page.includes("<SeasonalSearchHub"), "the editorial hub is not rendered on the ticket page");
ok(page.includes("<ShareButton") && page.includes('pageShareUrl("/halloween-in-florida")'), "the page shares its own route");
ok(page.includes('canonical: SITE_URL + "/halloween-in-florida"'), "canonical stays on the real page");
ok(!DASH.test("Florida Haunted Houses and Scream Park Tickets | Wayfind"), "page title is dash free");

const hub = seasonalSearchHub("halloween-in-florida");
ok(hub.accent === "#F97316", "halloween hub accent is neon orange");
const hubStrings = [hub.title, hub.description, hub.intro, hub.label, ...hub.checklist];
for (const section of hub.sections) {
  hubStrings.push(section.title, section.text);
  for (const link of section.links) hubStrings.push(link.label);
}
for (const text of hubStrings) ok(!DASH.test(text), "hub copy is dash free: " + text.slice(0, 60));

const schema = halloweenHauntSchema(model);
ok(schema.numberOfItems === 14 && schema.itemListElement.length === 14, "schema lists 14 events");
const schemaBlob = JSON.stringify(schema);
ok(!schemaBlob.includes("/api/commerce/go"), "schema does not embed the redirect");
for (const entry of schema.itemListElement) {
  ok(!DASH.test(entry.item.name + " " + entry.item.description), "schema copy dash free: " + entry.item.name);
  ok(entry.item.url.startsWith("https://www.gowayfind.com/florida-events/"), "schema url is the event page");
}

const { default: BoHalloweenHaunt } = await loadComponent(path.join(root, "app/components/BoHalloweenHaunt.js"), root);
const html = renderToStaticMarkup(createElement(BoHalloweenHaunt, { model }));
ok(html.includes("<svg"), "Boo is an SVG sprite");
ok(html.includes(">TOUR<") && html.includes(">GO<"), "Boo holds the TOUR flag and points GO");
ok(html.includes("BOO&#x27;S VIP TOUR") || html.includes("BOO'S VIP TOUR"), "VIP tour badge");
ok(html.includes('data-boo-fly=""'), "flying companion is in the page");
ok(html.includes('href="/"'), "home links render");
ok(html.includes("Wayfind Home") && html.includes("Explore Wayfind Main Page"), "home labels");
ok(html.includes("Ask Boo which haunt to book..."), "live chat prompt");
ok(html.includes("Scariest haunt in Tampa?") && html.includes("Where can I take kids?"), "prompt chips");
ok(html.includes("Let Boo Pick Your Scare") && html.includes("Tampa Bay Tonight") && html.includes("Value Scream Park"), "scare picker");
for (const label of ["Next Gag", "Roast This Price", "Spin a Spooky Deal", "Let Boo Haunt My Scroll", "Ask Boo", "Hide Boo", "All Haunts", "Major Scream Parks", "Local Haunted Trails", "Family Friendly", "Book Now &amp; Save"]) {
  ok(html.includes(label), "renders " + label);
}
ok(html.includes("Wayfind may earn a commission when you book through partner links."), "affiliate disclosure");
ok(html.includes("Rankings are never for sale."), "rankings line");
ok(html.includes("on merit"), "merit line");
for (const row of model.haunts) {
  ok(html.includes(row.name.replace(/'/g, "&#x27;")) || html.includes(row.name), "renders " + row.name);
  ok(html.includes(row.priceLabel), "renders " + row.priceLabel);
  ok(html.includes(row.timing), "renders " + row.timing);
  const href = row.cta.href.replace(/&/g, "&amp;");
  ok(html.includes('href="' + href + '"'), "renders href " + row.id);
  if (row.cta.kind === "affiliate") ok(html.includes('rel="sponsored nofollow noopener"'), row.id + " rel in markup");
}
ok(html.includes('data-boo-bubble="hero"') && html.includes('data-boo-bubble="float"'), "hero and float speech bubbles");
ok(!html.includes("wf-place-card"), "ticket rows are not place cards");

function visibleText(markup) {
  const stripped = markup.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ");
  const attrs = [...stripped.matchAll(/\b(?:aria-label|alt|title)="([^"]*)"/g)].map((match) => match[1]);
  const text = stripped.replace(/<[^>]+>/g, " ");
  return (text + " " + attrs.join(" "))
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
const visible = visibleText(html);
const dashHit = visible.match(/[^\n]{0,40}[-\u2013\u2014][^\n]{0,40}/);
ok(!DASH.test(visible), "rendered visible copy has no dash" + (dashHit ? ": " + dashHit[0] : ""));

const componentSource = readFileSync("app/components/BoHalloweenHaunt.js", "utf8");
ok(!/purple|violet|rebeccapurple|#d8b4fe|#a855f7|#7c3aed|#6d28d9|#8b5cf6/i.test(componentSource), "companion CSS has no purple");
ok(/#0A0A0B/.test(componentSource) && /#121216/.test(componentSource) && /#F97316/.test(componentSource) && /#FFFFFF/.test(componentSource), "brand colors are in the companion");
ok(/var\(--wf-sans\)/.test(componentSource), "companion uses the Inter font variable");
ok(!/\bBo\b/.test(visible), "visible copy says Boo, not Bo");
ok(!/ANTHROPIC_API_KEY|LLM_API_KEY|api\.anthropic\.com/.test(componentSource), "the companion does not hold the model key or the provider host");
ok(componentSource.includes('fetch("/api/bo-haunt"'), "chat posts to the Boo route");
ok(!/useEffect\([\s\S]{0,400}fetch\("\/api\/bo-haunt"/.test(componentSource), "the model is not called while the page renders");

const dashedReply = stripBoDashes("Howl-O-Scream – gate price — $45.99");
ok(!DASH.test(dashedReply) && dashedReply.includes("Howl O Scream"), "red-prove: dashes are scrubbed out of a Boo reply");
ok(stripBoDashes("Howl O Scream") === "Howl O Scream", "a clean reply stays clean");
for (const prompt of model.prompts) {
  const fallback = boHauntFallback(prompt, model);
  ok(fallback.recommendedIds.length > 0 && !DASH.test(fallback.reply), "fallback for " + prompt);
  ok(fallback.recommendedIds.every((id) => model.haunts.some((row) => row.id === id)), "fallback ids are real haunts");
}
const parsed = parseBoReply('{"reply":"Tap Get Tickets for Howl-O-Scream.","recommendedIds":["howlOrlando","nope"]}', model);
ok(parsed && parsed.recommendedIds.length === 1 && parsed.recommendedIds[0] === "howlOrlando" && !DASH.test(parsed.reply), "parser keeps known ids and strips dashes");
ok(parseBoReply('{"reply":"the best haunt right now","recommendedIds":["hhn"]}', model) === null, "parser drops a banned phrase");
const prompt = boPrompt(model, "Scariest haunt in Tampa?");
ok(prompt.model === "claude-haiku-4-5" && prompt.system.includes("BOO'S VIP TOUR") && prompt.user.includes("howlTampa"), "Claude prompt is Boo plus the grounded catalog");
ok(!prompt.user.includes("/api/commerce/go"), "the prompt does not hand Claude a redirect URL to paste");

const { POST } = await loadComponent(path.join(root, "app/api/bo-haunt/route.js"), root);
const live = await POST(new Request("https://wayfind.test/api/bo-haunt", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message: "Where can I take kids?" }),
}));
const payload = await live.json();
ok(live.status === 200 && payload.source === "fallback" && payload.recommendedIds.includes("mickey") && !DASH.test(payload.reply), "missing key returns Boo's grounded fallback");

console.log("test-halloween-haunt: " + checks + " assertions passed");
