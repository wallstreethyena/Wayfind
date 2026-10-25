// Florida Halloween ticket vault for /halloween-in-florida.
//
// Affiliate clicks go through eventTicketHref() so the offer id, provider, and
// content id come from lib/eventTicketDeals.js. The partner URL never appears
// here. Local haunts with no exact affiliate product keep the organizer ticket
// URL already verified in the fall seed (not a new merchant guess).
//
// Visible copy is dash free on purpose: headings, prices, hours, Bo's lines,
// and button labels. Identifiers and URLs may keep their hyphens.
import { SITE_URL } from "./site.js";
import { eventTicketDeal, eventTicketHref, VIA_BY_PROVIDER } from "./eventTicketDeals.js";

export const HALLOWEEN_HAUNT_SURFACE = "halloween_haunts";
export const BO_REEL_SRC = "/videos/bo-halloween-reel.mp4";
export const BO_POSTER_SRC = "/images/bo-halloween-poster.jpg";

const DASH = /[-\u2013\u2014]/;
const SKIP_KEYS = new Set(["href", "eventHref", "video", "poster", "id", "eventId", "rel", "kind", "filters"]);
const BANNED = [
  [/\bno ads\b/i, "no ads"],
  [/\bno paid placements\b/i, "no paid placements"],
  [/\bbest\b/i, "best"],
  [/#1/, "#1"],
  [/\bright now\b/i, "right now"],
  [/\breal[\s-]*time\b/i, "real time"],
];

function affiliate(eventId) {
  const entry = eventTicketDeal(eventId);
  const href = eventTicketHref(eventId, { surface: HALLOWEEN_HAUNT_SURFACE });
  if (!entry || !href) throw new Error("halloween haunt missing a ticket href for " + eventId);
  const merchant = VIA_BY_PROVIDER[entry.provider];
  if (!merchant) throw new Error("halloween haunt missing a merchant for " + eventId);
  const park = entry.product === "park-admission";
  return {
    href,
    label: park ? "Book Now & Save" : "Get Tickets",
    rel: "sponsored nofollow noopener",
    kind: "affiliate",
    via: (park ? "Park tickets at " : "Event tickets at ") + merchant,
  };
}

function organizer(href) {
  return {
    href,
    label: "Official Tickets",
    rel: "noopener nofollow",
    kind: "organizer",
    via: "Official organizer tickets",
  };
}

function haunt(row) {
  return row;
}

const LINES = [
  "I'm Boo, your ghost host! I died so I could haunt these Florida scares and save your wallet from gate prices.",
  "14 haunts so good it's spooky. Don't ghost me, tap a ticket link below and lock in your night before October 31.",
  "Sunglasses on, sunscreen energy, gate prices off. Howl O Scream starts at $45.99 when you book ahead.",
  "Paying box office prices is the real horror story here. Tap a haunt below and keep your soul and your cash.",
  "I floated through the gate once. Never again. The online ticket is the only blessing that sticks.",
  "Busch Gardens Howl O Scream at $49.99. Your wallet can stay in its body.",
  "Halloween Horror Nights is the long scream. From $94.10 if you book the night instead of begging the box office.",
  "ZooTampa after dark is $34.95 to $39.95. A creature feature your budget can survive.",
  "Mickey's party is the gentle haunt. $119 to $229 still beats a last minute panic buy.",
  "Brick or Treat comes with park admission. Candy is the treat. A gate panic is the trick.",
  "Sir Henry sells timed entry from $27. Show up empty handed and the trail shows you the woods.",
  "Scream A Geddon online is $30.95 to $55.95. The box office adds a scare this ghost did not approve.",
  "Peppa's party is included with admission from 11:00 AM to 4:00 PM. Even a ghoul can do daytime.",
  "Clearwater Spookquarium is one Friday from 3:00 PM to 7:00 PM, included with admission. The sharks already bought in.",
];

const NUDGES = Object.freeze({
  howlTampa: "Tap Get Tickets. $49.99 online beats the Tampa gate.",
  howlOrlando: "Tap Get Tickets. $45.99 is the online scream, not the box office.",
  hhn: "Tap Get Tickets. From $94.10 if you lock the night before the box office does.",
  zooTampa: "Tap Get Tickets. $34.95 to $39.95 for the late zoo.",
  mickey: "Tap Get Tickets. $119 to $229 before the party sells through.",
  spooktacular: "Tap Book Now & Save. The scare is included with park admission.",
  brick: "Tap Book Now & Save. Brick or Treat rides on the park ticket.",
  peppa: "Tap Book Now & Save. Peppa's party is included with admission.",
  spookquarium: "Tap Book Now & Save. Friday stations come with admission.",
  screamageddon: "Tap Official Tickets. $30.95 to $55.95 online, not the box office.",
  sirHenry: "Tap Official Tickets. Timed entry from $27 before the trail fills.",
  petrified: "Tap Official Tickets. $38 to $62 if you buy before the trees do.",
  undead: "Tap Official Tickets. Three ship nights, fare on the organizer page.",
  frightfest: "Tap Official Tickets. Fairgrounds from 8:00 PM, fare on the organizer page.",
});

const PICKS = Object.freeze([
  { id: "terrify", label: "Terrify Me (Extreme Haunts)", hauntId: "hhn", pitch: "Halloween Horror Nights 35 starts at $94.10 on select nights through Nov 1, screams from 6:30 PM. Tap Get Tickets before the box office writes the ending." },
  { id: "value", label: "Value Scream Park", hauntId: "howlOrlando", pitch: "SeaWorld Howl O Scream starts at $45.99. That is the scream park price that lets your wallet keep its soul. Tap Get Tickets." },
  { id: "tampa", label: "Tampa Bay Tonight", hauntId: "zooTampa", pitch: "Tampa's dated haunt is ZooTampa Creatures of the Night: Oct 25, Oct 30, and Oct 31, 4:00 PM to 10:00 PM, $34.95 to $39.95. Tap Get Tickets." },
  { id: "orlando", label: "Orlando Tonight", hauntId: "howlOrlando", pitch: "Orlando Howl O Scream starts at $45.99 on select nights through Oct 31, from 7:00 PM. Tap Get Tickets and lock the night before the gate does." },
  { id: "kids", label: "Scares With Kids", hauntId: "mickey", pitch: "Mickey's Not So Scary is the kid night, $119 to $229, 7:00 PM to midnight on select nights through Oct 31. Tap Get Tickets before the party clock runs out." },
]);

const PROMPTS = Object.freeze([
  "Scariest haunt in Tampa?",
  "Orlando deal under $50?",
  "Where can I take kids?",
  "Roast full gate prices",
]);

const HAUNTS = [
  haunt({
    id: "howlTampa",
    eventId: "howl-o-scream-tampa-2026",
    name: "Busch Gardens Howl O Scream Tampa Bay",
    where: "Tampa",
    city: "Tampa",
    priceLabel: "From $49.99",
    price: { kind: "from", amount: 49.99 },
    timing: "Select nights through Oct 31, gates 5:00 PM, scares 7:00 PM",
    tip: "Book the $49.99 night before the gate possesses the difference.",
    roast: "Busch Gardens Howl O Scream starts at $49.99. Gates at 5:00 PM, scares at 7:00 PM. The box office is the jump scare.",
    quips: [
      "Busch Gardens Howl O Scream starts at $49.99. Gates at 5:00 PM, scares at 7:00 PM. The box office is the jump scare.",
      "Tampa, meet your ghost host. Book Howl O Scream ahead and save the sunscreen for the coasters.",
    ],
    filters: ["major"],
    cta: affiliate("howl-o-scream-tampa-2026"),
    eventHref: "/florida-events/howl-o-scream-busch-gardens-tampa-2026",
  }),
  haunt({
    id: "howlOrlando",
    eventId: "howl-o-scream-seaworld-2026",
    name: "SeaWorld Howl O Scream Orlando",
    where: "Orlando",
    city: "Orlando",
    priceLabel: "From $45.99",
    price: { kind: "from", amount: 45.99 },
    timing: "Select nights through Oct 31, starts 7:00 PM",
    tip: "From $45.99 if you book ahead. The gate is the real monster.",
    roast: "SeaWorld Howl O Scream starts at $45.99 on select nights through Oct 31. The sharks are not the ones eating your budget.",
    quips: [
      "SeaWorld Howl O Scream starts at $45.99 on select nights through Oct 31. The sharks are not the ones eating your budget.",
      "Exorcise the gate price. Orlando Howl O Scream starts at 7:00 PM and the online ticket starts at $45.99.",
    ],
    filters: ["major"],
    cta: affiliate("howl-o-scream-seaworld-2026"),
    eventHref: "/florida-events/howl-o-scream-seaworld-orlando-2026",
  }),
  haunt({
    id: "hhn",
    eventId: "hhn-orlando-2026",
    name: "Universal Orlando Halloween Horror Nights 35",
    where: "Orlando",
    city: "Orlando",
    priceLabel: "From $94.10",
    price: { kind: "from", amount: 94.1 },
    timing: "Select nights through Nov 1, starts 6:30 PM",
    tip: "From $94.10 online. Box office prices are the house that never ends.",
    roast: "Halloween Horror Nights 35 starts at $94.10. That is still kinder than letting the box office pick your pocket.",
    quips: [
      "Halloween Horror Nights 35 starts at $94.10. That is still kinder than letting the box office pick your pocket.",
      "Select nights through Nov 1, screams from 6:30 PM. Book the night. Do not donate your wallet to the gate.",
    ],
    filters: ["major"],
    cta: affiliate("hhn-orlando-2026"),
    eventHref: "/florida-events/halloween-horror-nights-orlando-2026",
  }),
  haunt({
    id: "zooTampa",
    eventId: "zootampa-creatures-2026",
    name: "ZooTampa Creatures of the Night",
    where: "Tampa",
    city: "Tampa",
    priceLabel: "$34.95 to $39.95",
    price: { kind: "range", low: 34.95, high: 39.95 },
    timing: "Oct 25, Oct 30, and Oct 31, 4:00 PM to 10:00 PM",
    tip: "$34.95 to $39.95 for the late zoo. Cheaper than a head spin at the gate.",
    roast: "Creatures of the Night is $34.95 to $39.95, from 4:00 PM to 10:00 PM. Even a ghost on tour has a budget.",
    quips: [
      "Creatures of the Night is $34.95 to $39.95, from 4:00 PM to 10:00 PM. Even a ghost on tour has a budget.",
      "Oct 25, Oct 30, and Oct 31. ZooTampa after dark, and the online price does not bite.",
    ],
    filters: ["family"],
    cta: affiliate("zootampa-creatures-2026"),
    eventHref: "/florida-events/zootampa-creatures-of-the-night-2026",
  }),
  haunt({
    id: "mickey",
    eventId: "mnsshp-2026",
    name: "Mickey's Not So Scary Halloween Party at Magic Kingdom",
    where: "Orlando",
    city: "Orlando",
    priceLabel: "$119 to $229",
    price: { kind: "range", low: 119, high: 229 },
    timing: "Select nights through Oct 31, 7:00 PM to midnight",
    tip: "$119 to $229 for the party night. Lock it before the clock hits midnight.",
    roast: "Mickey's Not So Scary is $119 to $229, from 7:00 PM to midnight. Gentle on the kids, rough on a walk up price.",
    quips: [
      "Mickey's Not So Scary is $119 to $229, from 7:00 PM to midnight. Gentle on the kids, rough on a walk up price.",
      "The party is the treat. Paying the gate without a ticket is the trick. Book the night.",
    ],
    filters: ["family"],
    cta: affiliate("mnsshp-2026"),
    eventHref: "/florida-events/mickeys-not-so-scary-halloween-party-2026",
  }),
  haunt({
    id: "spooktacular",
    eventId: "seaworld-spooktacular-2026",
    name: "SeaWorld Orlando Halloween Spooktacular",
    where: "Orlando",
    city: "Orlando",
    priceLabel: "Included with park admission",
    price: { kind: "included" },
    timing: "Fri Oct 30, Sat Oct 31, Sun Nov 1 daytime",
    tip: "Included with park admission. Buy the park ticket, keep the candy.",
    roast: "Halloween Spooktacular is included with park admission on Fri Oct 30, Sat Oct 31, and Sun Nov 1, daytime. No separate scare fee.",
    quips: [
      "Halloween Spooktacular is included with park admission on Fri Oct 30, Sat Oct 31, and Sun Nov 1, daytime. No separate scare fee.",
      "Daytime candy, park ticket, done. Howl O Scream is the other SeaWorld night. Do not mix them up or I will spin my head.",
    ],
    filters: ["family"],
    cta: affiliate("seaworld-spooktacular-2026"),
    eventHref: "/florida-events/seaworld-orlando-halloween-spooktacular-2026",
  }),
  haunt({
    id: "brick",
    eventId: "brick-or-treat-2026",
    name: "LEGOLAND Florida Brick or Treat",
    where: "Winter Haven",
    city: "Winter Haven",
    priceLabel: "Included with park admission",
    price: { kind: "included" },
    timing: "Oct 25, Oct 30, and Oct 31",
    tip: "Included with park admission. The bricks come with the park ticket.",
    roast: "Brick or Treat is included with LEGOLAND admission on Oct 25, Oct 30, and Oct 31. The bricks are sweet. The gate markup is not.",
    quips: [
      "Brick or Treat is included with LEGOLAND admission on Oct 25, Oct 30, and Oct 31. The bricks are sweet. The gate markup is not.",
      "Winter Haven in the daytime. Book the park ticket and the candy stations come along.",
    ],
    filters: ["family"],
    cta: affiliate("brick-or-treat-2026"),
    eventHref: "/florida-events/legoland-florida-brick-or-treat-2026",
  }),
  haunt({
    id: "peppa",
    eventId: "peppas-halloween-party-2026",
    name: "Peppa's Halloween Party at Peppa Pig Theme Park",
    where: "Winter Haven",
    city: "Winter Haven",
    priceLabel: "Included with park admission",
    price: { kind: "included" },
    timing: "Oct 25 and Oct 31, 11:00 AM to 4:00 PM",
    tip: "Included with park admission. Daytime, short, and kind to a budget.",
    roast: "Peppa's Halloween Party is included with admission, Oct 25 and Oct 31, 11:00 AM to 4:00 PM. A ghoul can do lunch.",
    quips: [
      "Peppa's Halloween Party is included with admission, Oct 25 and Oct 31, 11:00 AM to 4:00 PM. A ghoul can do lunch.",
      "No separate party ticket. Park admission is the way in. Your wallet stays in this realm.",
    ],
    filters: ["family"],
    cta: affiliate("peppas-halloween-party-2026"),
    eventHref: "/florida-events/peppas-halloween-party-2026",
  }),
  haunt({
    id: "spookquarium",
    eventId: "hw26-halloween-spookquarium-clearwater-2026",
    name: "Halloween Spookquarium at Clearwater Marine Aquarium",
    where: "Clearwater",
    city: "Clearwater",
    priceLabel: "Included with admission",
    price: { kind: "included" },
    timing: "Fri Oct 30, 3:00 PM to 7:00 PM",
    tip: "Included with admission for one Friday. The fish do not charge extra.",
    roast: "Halloween Spookquarium is included with admission, Fri Oct 30, 3:00 PM to 7:00 PM. The sharks already have tickets.",
    quips: [
      "Halloween Spookquarium is included with admission, Fri Oct 30, 3:00 PM to 7:00 PM. The sharks already have tickets.",
      "One Friday in Clearwater. Book aquarium admission and the stations are on the trail.",
    ],
    filters: ["family"],
    cta: affiliate("hw26-halloween-spookquarium-clearwater-2026"),
    eventHref: "/florida-events/halloween-spookquarium-clearwater-2026",
  }),
  haunt({
    id: "screamageddon",
    eventId: null,
    name: "Scream A Geddon Horror Park",
    where: "Dade City",
    city: "Dade City",
    priceLabel: "$30.95 to $55.95 online",
    price: { kind: "range", low: 30.95, high: 55.95 },
    timing: "Select nights through Nov 1, 7:00 PM to midnight",
    tip: "$30.95 to $55.95 online. The box office adds its own scare.",
    roast: "Scream A Geddon in Dade City is $30.95 to $55.95 online, 7:00 PM to midnight on select nights through Nov 1.",
    quips: [
      "Scream A Geddon in Dade City is $30.95 to $55.95 online, 7:00 PM to midnight on select nights through Nov 1.",
      "The online price is the mercy. The box office is the sequel nobody asked for.",
    ],
    filters: ["local"],
    // scripts/seed-fall-sarasota-2026.mjs official_ticket_url, verified 2026-09-03.
    cta: organizer("https://screamageddon.com/tickets/"),
    eventHref: "/florida-events/scream-a-geddon-dade-city-2026",
  }),
  haunt({
    id: "sirHenry",
    eventId: null,
    name: "Sir Henry's Haunted Trail",
    where: "Plant City",
    city: "Plant City",
    priceLabel: "From $27 online timed entry",
    price: { kind: "from", amount: 27 },
    timing: "Select nights through Nov 1, trails from 7:30 PM",
    tip: "From $27 online timed entry. The trail does not sell mercy at the gate.",
    roast: "Sir Henry's Haunted Trail starts at $27 online, timed entry, trails from 7:30 PM. No ticket, no trail.",
    quips: [
      "Sir Henry's Haunted Trail starts at $27 online, timed entry, trails from 7:30 PM. No ticket, no trail.",
      "Plant City does not do walk ups for this one. Buy the timed slot before the spirits sell it.",
    ],
    filters: ["local"],
    // Same seed file: HauntPay is the organizer's timed entry page.
    cta: organizer("https://app.hauntpay.com/events/sir-henry-s-haunted-trail-2026"),
    eventHref: "/florida-events/sir-henrys-haunted-trail-plant-city-2026",
  }),
  haunt({
    id: "petrified",
    eventId: null,
    name: "A Petrified Forest Scream Park",
    where: "Altamonte Springs",
    city: "Altamonte Springs",
    priceLabel: "$38 to $62",
    price: { kind: "range", low: 38, high: 62 },
    timing: "Select nights through Oct 31, 7:00 PM to 10:30 PM",
    tip: "$38 to $62. Pick your fear level before the night picks your price.",
    roast: "A Petrified Forest in Altamonte Springs is $38 to $62, 7:00 PM to 10:30 PM on select nights through Oct 31.",
    quips: [
      "A Petrified Forest in Altamonte Springs is $38 to $62, 7:00 PM to 10:30 PM on select nights through Oct 31.",
      "Pick a ticket online before the trees pick your wallet.",
    ],
    filters: ["local"],
    // data/fall-2026-additions-2026-10-06.json official_ticket_url.
    cta: organizer("https://events.ticketleap.com/tickets/a-petrified-forest/a-petrified-forest-scream-park-2026"),
    eventHref: "/florida-events/a-petrified-forest-scream-park-2026-altamonte-springs-2026",
  }),
  haunt({
    id: "undead",
    eventId: null,
    name: "UNDead in the Water aboard American Victory Ship",
    where: "Tampa",
    city: "Tampa",
    priceLabel: "Price on the organizer page",
    price: { kind: "organizer" },
    timing: "Oct 29, Oct 30, and Oct 31",
    tip: "Three nights on the ship. The organizer sets the fare.",
    roast: "UNDead in the Water boards the American Victory Ship on Oct 29, Oct 30, and Oct 31. The price lives on the organizer page.",
    quips: [
      "UNDead in the Water boards the American Victory Ship on Oct 29, Oct 30, and Oct 31. The price lives on the organizer page.",
      "Tampa by night, a ship full of ghouls. I do not invent a fare. The organizer does.",
    ],
    filters: ["local"],
    // Organizer site from scripts/fixtures/fall-sarasota-publication-2026-09-10.json.
    // A verified ticket price was not retrievable, so the button stays on the organizer.
    cta: organizer("https://www.undeadinthewater.com/"),
    eventHref: "/florida-events/undead-in-the-water-tampa-2026",
  }),
  haunt({
    id: "frightfest",
    eventId: null,
    name: "Sarasota Frightfest",
    where: "Sarasota Fairgrounds",
    city: "Sarasota",
    priceLabel: "Price on the organizer page",
    price: { kind: "organizer" },
    timing: "Oct 25, 29, 30, 31, and Nov 1 from 8:00 PM",
    tip: "Fairgrounds after 8:00 PM. Tickets live on the organizer site.",
    roast: "Sarasota Frightfest runs Oct 25, Oct 29, Oct 30, Oct 31, and Nov 1 from 8:00 PM at the fairgrounds.",
    quips: [
      "Sarasota Frightfest runs Oct 25, Oct 29, Oct 30, Oct 31, and Nov 1 from 8:00 PM at the fairgrounds.",
      "The fairgrounds after dark. Tickets are on the organizer site. I only haunt people who pay the gate out of spite.",
    ],
    filters: ["local"],
    // docs/curation/instagram-2026-10-13.md official site.
    cta: organizer("https://www.sarasotafrightfest.com/"),
    eventHref: "/florida-events/sarasota-frightfest-2026",
  }),
];

export function visibleHauntStrings(model) {
  const out = [];
  const walk = (value, key) => {
    if (SKIP_KEYS.has(key)) return;
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => walk(v, k));
  };
  walk(model, "");
  return out;
}

export function hauntCopyProblems(model) {
  const strings = visibleHauntStrings(model);
  const problems = [];
  for (const text of strings) {
    if (DASH.test(text)) problems.push("dash: " + text);
    for (const [re, name] of BANNED) if (re.test(text)) problems.push(name + ": " + text);
  }
  return problems;
}

export function hauntsForFilter(model, filterId) {
  if (filterId === "all") return model.haunts;
  return model.haunts.filter((row) => row.filters.includes(filterId));
}

function offerFor(row) {
  const price = row.price;
  if (!price || price.kind === "organizer" || price.kind === "included") {
    if (price && price.kind === "included") {
      return { "@type": "Offer", priceCurrency: "USD", description: row.priceLabel };
    }
    return null;
  }
  if (price.kind === "range") {
    return { "@type": "AggregateOffer", lowPrice: price.low, highPrice: price.high, priceCurrency: "USD" };
  }
  return { "@type": "Offer", price: price.amount, priceCurrency: "USD" };
}

export function halloweenHauntSchema(model) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: model.chrome.title,
    numberOfItems: model.haunts.length,
    itemListElement: model.haunts.map((row, index) => {
      const item = {
        "@type": "Event",
        name: row.name,
        description: row.timing + ". " + row.priceLabel,
        url: SITE_URL + row.eventHref,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: row.where,
          address: {
            "@type": "PostalAddress",
            addressLocality: row.city,
            addressRegion: "FL",
            addressCountry: "US",
          },
        },
      };
      const offer = offerFor(row);
      if (offer) item.offers = offer;
      return { "@type": "ListItem", position: index + 1, item };
    }),
  };
}

export function halloweenHauntModel() {
  const haunts = HAUNTS.map((row) => {
    const nudge = NUDGES[row.id];
    if (!nudge) throw new Error("halloween haunt missing a nudge for " + row.id);
    return { ...row, nudge };
  });
  const model = {
    video: BO_REEL_SRC,
    poster: BO_POSTER_SRC,
    lines: LINES,
    picks: PICKS,
    prompts: PROMPTS,
    filters: [
      { id: "all", label: "All Haunts" },
      { id: "major", label: "Major Scream Parks" },
      { id: "local", label: "Local Haunted Trails" },
      { id: "family", label: "Family Friendly" },
    ],
    chrome: {
      eyebrow: "Ticket vault",
      title: "Florida Haunted Houses and Scream Parks",
      lede: "Prices, dates, and the night each haunt actually runs. Tap a ticket and Boo will heckle the gate price.",
      disclosure: "Wayfind may earn a commission when you book through partner links.",
      merit: "Haunts are listed on merit. Rankings are never for sale.",
      nextGag: "Next Gag",
      roast: "Roast This Price",
      spin: "Spin a Spooky Deal",
      hauntScroll: "Let Boo Haunt My Scroll",
      ask: "Ask Boo",
      eventPage: "Full event page",
      boSays: "Boo says",
      hide: "Hide Boo",
      show: "Show Boo",
      videoLabel: "Boo, your ghost host",
      floatLabel: "Boo haunting this scroll",
      empty: "No haunts in this set.",
      who: "Who Are You Bringing Tonight?",
      pick: "Let Boo Pick Your Scare",
      vip: "👻 BOO'S VIP TOUR",
      host: "Boo, Your Ghost Host",
      home: "Wayfind Home",
      homeBottom: "Explore Wayfind Main Page",
      askPlaceholder: "Ask Boo which haunt to book...",
      send: "Send To Boo",
      openChat: "Open Boo Chat",
      thinking: "Boo is thinking",
      chatTitle: "Talk To Boo",
    },
    haunts,
  };
  const problems = hauntCopyProblems(model);
  if (problems.length) throw new Error("halloween haunt copy: " + problems[0]);
  const blob = visibleHauntStrings(model).join("\n");
  if (!/rankings are never for sale/i.test(blob)) throw new Error("halloween haunt copy lost the rankings line");
  if (!/on merit/i.test(blob)) throw new Error("halloween haunt copy lost the merit line");
  if (!blob.includes(model.chrome.disclosure)) throw new Error("halloween haunt copy lost the affiliate disclosure");
  if (model.lines.length < 10) throw new Error("halloween haunt needs at least 10 lines from Bo");
  return model;
}
