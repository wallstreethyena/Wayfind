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

// ── 2. venue photography is known as venue photography ─────────────────────
// Owner, 2026-10-08 (second brief): "distinguish venue photos from event
// photos wherever confusion is likely. Use a small, readable Venue photo label
// that fits the existing design. Preserve required attribution separately."
// So the card wears a small "Venue photo" label (no caption bar), the credit
// chip stays its own control, and the event page keeps its fuller line.
const grande = { hero_image: "https://mds-assets.marriott.com/x.jpg", hero_image_kind: "venue" };
ok(eventImageIsVenue(grande) === true, "the Grande Lakes resort image (hero_image_kind venue) is known to be a venue photo");
ok(eventImageIsVenue({ hero_image: "https://img.evbuc.com/x", hero_image_kind: "event" }) === false, "an organizer event image is not called a venue photo");
ok(eventImageIsVenue({}, "/api/photo?place=ChIJx&w=640") === true, "a Google place photo is a venue photo");
const g = eventPhotoCredit({ venue: "Krush Brau Park", place_id: "ChIJx" }, "/api/photo?place=ChIJx&w=640");
ok(g && g.label === "Google Maps", "a Google venue photo keeps its Google Maps credit");
const page = readFileSync(new URL("../app/florida-events/[slug]/page.js", import.meta.url), "utf8");
ok(/eventImageIsVenue\(e, heroSrc\) \? <p style=\{S\.credit\}>Venue photo · \{e\.event_name\} is not pictured\./.test(page), "the event page says a venue photo is the venue and the event is not pictured");

// ── 3. the real card ─────────────────────────────────────────────────────────
const REPO = fileURLToPath(new URL("..", import.meta.url));
const RailCard = (await loadComponent(fileURLToPath(new URL("../app/components/RailCard.js", import.meta.url)), REPO)).default;
const render = (props) => renderToStaticMarkup(React.createElement(RailCard, { title: "Fields of Fright Haunted Hayride", ...props }));
const noPhoto = render({ photo: "", placeholder: eventPlaceholder("community", { name: "Fields of Fright Haunted Hayride" }) });
ok(/wf-event-placeholder/.test(noPhoto) && />Halloween</.test(noPhoto) && !/<img/.test(noPhoto), "an event with no verified photo renders the designed tile and no image");
const venueCard = render({ photo: grande.hero_image, visitFacts: { ...grande, start_date: "2026-10-11", end_date: "2026-10-11", venue: "Grande Lakes Orlando" } });
// Positive control for the no-image assertion above: the same card WITH a photo renders an <img>.
ok(/<img/.test(venueCard) && !/wf-event-placeholder/.test(venueCard), "positive control: a card with a photo renders the image, not the tile");
ok((venueCard.match(/class="wf-place-card-photo-kind">Venue photo</g) || []).length === 1 && !/not pictured|wf-event-photo-caption/.test(venueCard), "the Grande Lakes resort photo on a card wears one small Venue photo label, no caption bar");
const gCard = render({ photo: "/api/photo?place=ChIJx&w=640", visitFacts: { venue: "Krush Brau Park", place_id: "ChIJx", start_date: "2026-10-11", end_date: "2026-10-11" } });
ok(/>©</.test(gCard) && /Photo: Google Maps/.test(gCard) && />Venue photo</.test(gCard), "a Google venue photo on a card wears the Venue photo label AND keeps its separate (c) Google Maps credit chip");
const evCard = render({ photo: "https://img.evbuc.com/x", visitFacts: { hero_image: "https://img.evbuc.com/x", hero_image_kind: "event", photoAttr: "Organizer", start_date: "2026-10-31", end_date: "2026-10-31" } });
ok(/<img/.test(evCard) && !/Venue photo/.test(evCard), "an organizer's own event photo never wears the Venue photo label");

// ── 4. no event surface reaches for stock ───────────────────────────────────
const code = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
// Positive control: the stock probe finds the retired call shape.
ok(/eventCategoryArt|stockPhotoPool|\/api\/stock-photo/.test("image: eventCategoryArt(bucket, e)"), "positive control: the stock probe finds a stock lookup");
ok(/\.(jpe?g|png|webp|avif)\b|https?:/.test(JSON.stringify({ tint: "url(https://x/y.jpg)" })), "positive control: the photo probe finds a photo in a tile");
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
console.log(`check-event-photo-honesty: OK — ${pass} assertions; eventPlaceholder/eventPhotoCredit CALLED, the real RailCard rendered (designed tile with no <img>, Venue photo label on venue photos only, credit chip kept separate); venue photos known via hero_image_kind and captioned on the event page; 4 event surfaces scanned (comments stripped) for stock`);
