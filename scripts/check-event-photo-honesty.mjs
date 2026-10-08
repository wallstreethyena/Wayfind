// scripts/check-event-photo-honesty.mjs
//
// OWNER, 2026-10-08: "For Harvest Fields and other events without verified
// photography, use a clearly designed category placeholder or initials. Do not
// display unrelated photography in a way that suggests it depicts the actual
// event. Keep venue photography distinguishable from event photography,
// including the Grande Lakes resort image."
//
// Before this: an event with no photo of its own wore category stock (a concert
// crowd, a smiling market shopper, lib/eventCategoryArt.js) on the Events tab,
// the home event rail and the city event pages, or a Pexels "scene" photo the
// events feed attached; and a venue photo looked exactly like an event photo.
//
// CALLED: eventPlaceholder, eventPhotoCredit, and the real RailCard rendered to
// markup through scripts/lib/jsxLoad.mjs. Syntactic (comments stripped): the
// four event surfaces no longer reach for stock.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eventPlaceholder } from "../lib/eventPlaceholder.js";
import { eventPhotoCredit, eventImageIsVenue } from "../lib/eventImageProvenance.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

// ── 1. the placeholder is a designed tile, chosen by what the event is ─────
ok(eventPlaceholder("community", { name: "Fields of Fright Haunted Hayride at Harvest Fields" }).label === "Halloween", "Harvest Fields' haunted hayride gets the Halloween tile");
ok(eventPlaceholder("community", { name: "Hunsader Farms Pumpkin Festival" }).label === "Fall event", "a pumpkin festival gets the fall tile");
ok(eventPlaceholder("concerts", { name: "Jazz Night" }).label === "Live music", "a concert without art gets the live music tile");
ok(eventPlaceholder("", { name: "Something" }).label === "Event", "an unknown bucket still gets a tile");
for (const b of ["concerts", "comedy", "theater", "sports", "community", "business", ""]) {
  const t = eventPlaceholder(b, { name: "x" });
  ok(t.icon && t.label && /gradient/.test(t.tint) && !/\.(jpe?g|png|webp|avif)\b|https?:/.test(JSON.stringify(t)), `the ${b || "fallback"} tile carries no photograph`);
}

// ── 2. venue photography says so ────────────────────────────────────────────
const grande = { hero_image: "https://mds-assets.marriott.com/x.jpg", hero_image_kind: "venue" };
ok(eventImageIsVenue(grande) && eventPhotoCredit(grande, grande.hero_image)?.label === "Venue photo", "the Grande Lakes resort image is labelled a venue photo");
const g = eventPhotoCredit({ venue: "Krush Brau Park", place_id: "ChIJx" }, "/api/photo?place=ChIJx&w=640");
ok(g && /^Venue photo · Google Maps$/.test(g.label), "a Google venue photo is labelled Venue photo · Google Maps");
ok(eventPhotoCredit({ photoAttr: "Organizer", hero_image_kind: "event" }, "https://img.evbuc.com/x")?.label === "Organizer", "an organizer event image keeps its own credit, no venue label");

// ── 3. the real card ─────────────────────────────────────────────────────────
const REPO = fileURLToPath(new URL("..", import.meta.url));
const RailCard = (await loadComponent(fileURLToPath(new URL("../app/components/RailCard.js", import.meta.url)), REPO)).default;
const render = (props) => renderToStaticMarkup(React.createElement(RailCard, { title: "Fields of Fright Haunted Hayride", ...props }));
const noPhoto = render({ photo: "", placeholder: eventPlaceholder("community", { name: "Fields of Fright Haunted Hayride" }) });
ok(/wf-event-placeholder/.test(noPhoto) && />Halloween</.test(noPhoto) && !/<img/.test(noPhoto), "an event with no verified photo renders the designed tile and no image");
const venueCard = render({ photo: grande.hero_image, visitFacts: { ...grande, start_date: "2026-10-11", end_date: "2026-10-11", venue: "Grande Lakes Orlando" } });
ok(/class="wf-place-card-photo-attr is-venue"/.test(venueCard) && />Venue</.test(venueCard), "a venue photo on an event card wears the Venue mark");
const eventCard = render({ photo: "https://img.evbuc.com/x", visitFacts: { hero_image: "https://img.evbuc.com/x", hero_image_kind: "event", photoAttr: "Organizer", start_date: "2026-10-31", end_date: "2026-10-31" } });
ok(/>©</.test(eventCard) && !/is-venue/.test(eventCard), "an organizer event photo keeps the plain credit chip");

// ── 4. no event surface reaches for stock ───────────────────────────────────
const code = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
for (const p of ["app/components/screens/Events.js", "app/home.js", "app/events/[city]/[slug]/page.js", "app/api/events/route.js"]) {
  const src = code(p);
  ok(!/eventCategoryArt|stockPhotoPool|\/api\/stock-photo/.test(src), `${p} attaches no stock photography to an event`);
}
ok(/placeholder=\{placeholder\}/.test(code("app/components/screens/Events.js")), "the Events tab card passes the designed tile");

if (fail.length) {
  console.error(`check-event-photo-honesty: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-event-photo-honesty: OK — ${pass} assertions; eventPlaceholder/eventPhotoCredit CALLED, the real RailCard rendered (designed tile with no <img>, Venue mark on a venue photo, plain chip on an event photo); 4 event surfaces scanned (comments stripped) for stock`);
