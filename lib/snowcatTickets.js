// What each Snowcat Ridge admission includes, from the park FAQ.
// Ticket prices change by date and time (a Sat Nov 14 evening slot and a
// Sun Nov 15 morning slot listed different amounts), so no tier has a price.
// The $3.95 line is included because snowcatridge.com's FAQ still states it
// (checked Nov 10, 2026). Copy has no dash characters and makes no "best"
// claim. The existing ticket button stays the only outbound ticket link.

export const SNOWCAT_EVENT_IDS = Object.freeze(["snowcat-ridge-2026"]);
export const SNOWCAT_SLUGS = Object.freeze([
  "snowcat-ridge-alpine-snow-park-2026",
  "snowcat-ridge-2026",
]);
// Google place for Snowcat Ridge in Dade City. Passed to the existing
// event map. It is not used to start a new Places request.
export const SNOWCAT_PLACE_ID = "ChIJF05ORfWpwogRI74PwJotNf4";

export const SNOWCAT_TICKET_TITLE = "Which ticket do you need?";
export const SNOWCAT_PRICE_NOTE = "Online general admission starts at $26.95. Prices vary by date and time, and tickets cost $6 more at the box office (official site, as of Nov 9, 2026).";
export const SNOWCAT_SERVICE_FEE = "Leap Events charges a $3.95 service fee on admission tickets and the photo package. It does not apply to ice skate rental or parking passes.";

export const SNOWCAT_TICKETS = Object.freeze([
  Object.freeze({
    name: "General Admission",
    includes: "One 2 hour snow tubing session on Snowy Slopes, plus all day access to the Arctic Igloo, Alpine Village, Santa's Christmas Lane and Crystal Ribbon until park closing.",
  }),
  Object.freeze({
    name: "General Admission + Unlimited Snow Tubing",
    includes: "Unlimited all day tubing, plus the same all day areas.",
  }),
  Object.freeze({
    name: "General Admission + VIP Fast Pass",
    includes: "A 2 hour tubing session plus VIP fast pass lanes (10 person tube VIP lane, single and tandem tube VIP lane, skate pickup VIP lane), plus the all day areas.",
  }),
  Object.freeze({
    name: "General Admission + VIP Fast Pass + Unlimited Snow Tubing",
    includes: "All day tubing plus all the VIP fast pass lanes.",
  }),
]);

export const SNOWCAT_ADDONS = Object.freeze([
  Object.freeze({ name: "Group of 20 or more, General Admission", price: "$32.95 each" }),
  Object.freeze({ name: "Ice Skate Rental", price: "$11.25" }),
  Object.freeze({ name: "Santa Photo Package", price: "$29.95" }),
]);

export const SNOWCAT_TICKET_NOTES = Object.freeze([
  "Ice skate rental is not included in any ticket.",
  "Children under 2 are free.",
]);

export function isSnowcatTicketPage(event) {
  if (!event || typeof event !== "object") return false;
  const id = String(event.event_id || event.id || "");
  const slug = String(event.slug || "");
  return SNOWCAT_EVENT_IDS.includes(id) || SNOWCAT_SLUGS.includes(slug) || SNOWCAT_SLUGS.includes(id);
}

export function snowcatExplainerLines() {
  return [
    SNOWCAT_TICKET_TITLE,
    SNOWCAT_PRICE_NOTE,
    SNOWCAT_SERVICE_FEE,
    ...SNOWCAT_TICKETS.flatMap((row) => [row.name, row.includes]),
    "Add ons",
    ...SNOWCAT_ADDONS.flatMap((row) => [row.name, row.price]),
    ...SNOWCAT_TICKET_NOTES,
  ];
}
