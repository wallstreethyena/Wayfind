// Florida Halloween ticket vault for /halloween-in-florida.
//
// Affiliate clicks go through eventTicketHref() so the offer id, provider, and
// content id come from lib/eventTicketDeals.js. The partner URL never appears
// here. Local haunts with no exact affiliate product keep the organizer ticket
// URL already verified in the fall seed (not a new merchant guess).
//
// Visible copy is dash free on purpose: headings, prices, hours, Boo's lines,
// and button labels. Identifiers and URLs may keep their hyphens.
import { SITE_URL } from "./site.js";
import { eventTicketDeal, eventTicketHref, VIA_BY_PROVIDER } from "./eventTicketDeals.js";
import { floridaEventPhoto } from "./floridaEventPhotography.js";
import { FLORIDA_PARK_PHOTOS } from "./floridaPhotography.js";
import { MENU_PARTNER_OFFERS } from "./menuPartnerOffers.js";
import { landingOfferImage } from "./paidFloridaLanding.js";

export const HALLOWEEN_HAUNT_SURFACE = "halloween_haunts";
export const HALLOWEEN_CATALOG_VERSION = "2026.10.29.v1";
export const BO_REEL_SRC = "/videos/bo-halloween-reel.mp4";
export const BO_POSTER_SRC = "/images/bo-halloween-poster.jpg";

const DASH = /[-\u2013\u2014]/;
const SKIP_KEYS = new Set([
  "alternatives",
  "endsAt",
  "endsTz",
  "endsVerified",
  "endsSource",
  "bookable",
  "href",
  "src",
  "eventHref",
  "video",
  "poster",
  "id",
  "eventId",
  "rel",
  "kind",
  "filters",
  "costume",
  "animatronic",
  "shortlistIds",
  "filterId",
  "lastVerified",
  "catalogVersion",
]);
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

// Every row carries endsAt: the venue's LOCAL wall clock when the final operating
// night closes ("YYYY-MM-DDTHH:MM", a close after midnight is the next date),
// endsTz (all Florida venues here are America/New_York; none is in the Central
// zone Panhandle), endsVerified (true only when a seller or organizer page,
// or a cited schedule, gave the closing time) and endsSource. An unverified row
// uses 11:59 PM local of its last date. hauntIsLive() compares the current
// instant to that moment, never to the start of the final day.
export const HAUNT_TZ = "America/New_York";
function haunt(row) {
  if (!row.endsAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(row.endsAt)) throw new Error("halloween haunt " + row.id + " needs a local endsAt");
  return {
    lastVerified: "2026-10-29",
    endsTz: HAUNT_TZ,
    ...row,
  };
}

// Removed from the collection, with the reason (a test pins that they stay out).
export const HAUNT_REMOVED = Object.freeze({
  sideshowObscura: "2026-10-29: Sideshow Obscura is the HHN35 Tribute Store, a themed gift shop inside Universal Studios Florida (Universal merchandise, open during park hours, no HHN ticket needed to shop), not a haunt or a ticketed event. Its Book Now button sold a 3 day Universal pass. Wayfind's Halloween page has no shopping context, so the card is gone.",
});

// Boo's count line follows the live haunt list, never a typed number.
function hauntCountLine(n) {
  const lead = n === 1 ? "1 haunt" : n > 1 ? n + " haunts" : "These haunts";
  return lead + " so good it's spooky. Don't ghost me, tap a ticket link below and lock in your night before October 31.";
}

const LINES = [
  "I'm Boo, your ghost host! I died so I could haunt these Florida scares and save your wallet from gate prices.",
  null, // count line, built per request from the live haunts
  "Sunglasses on, sunscreen energy, gate prices off. Howl O Scream starts at $45.99 when you book ahead.",
  "Paying box office prices is the real horror story here. Tap a haunt below and keep your soul and your cash.",
  "Floated up 40ft. 0 steps taken! Leg day skipped, and your gate markup skipped too when you grab tickets online.",
  "Busch Gardens Howl O Scream at $49.99 gives you haunted houses plus coasters in the dark. Your wallet stays in its body.",
  "Halloween Horror Nights 35 is the giant movie studio nightmare. From $94.10 online instead of crying at the Universal gate.",
  "ZooTampa Creatures of the Night is $34.95 to $39.95. Glowing pathways, zero toddler tears, and a happy ghost budget.",
  "SeaWorld Spooktacular runs Oct 30, Oct 31 and Nov 1, included with SeaWorld admission. Sea creatures in costume energy, zero jump scares.",
  "Brick or Treat comes included with LEGOLAND park admission. Candy is the treat, a gate panic is the trick.",
  "Sir Henry's Haunted Trail sells online timed entry from $27 in Plant City. Show up without a slot and you are haunting the parking lot.",
  "Scream A Geddon in Dade City is $46.95 to $73.95 online for the last nights. Monster midway, woods trails, and cheaper than walk up prices.",
  "Peppa's Halloween Party runs 11:00 AM to 4:00 PM and comes with admission. Even a cool ghost loves a daytime fiesta.",
  "Clearwater Spookquarium is Friday Oct 30 from 3:00 PM to 7:00 PM, included with admission. The sharks already RSVP'd.",
];

const NUDGES = Object.freeze({
  howlTampa: "Online deal from $49.99. Skip the Tampa box office markup.",
  howlOrlando: "Online scream from $45.99. Lowest major Orlando haunt entry.",
  hhn: "Online from $94.10. Lock your night before popular dates vanish.",
  zooTampa: "Online $34.95 to $39.95. Easy family evening without late bedtime.",
  mickey: "Disney lists every 2026 party date as sold out. Our booking partners have no tickets.",
  spooktacular: "Included with daytime park admission. No separate event ticket needed.",
  brick: "Included with LEGOLAND ticket. Candy stations ride on park admission.",
  peppa: "Included with park admission. Built for toddlers and early naps.",
  spookquarium: "Included with aquarium admission for Friday Oct 30 afternoon.",
  screamageddon: "Online $46.95 to $73.95 for the last nights. Cheaper than buying at the woods gate.",
  sirHenry: "Online timed entry from $27. Advance slot required before arrival.",
  petrified: "Online $38 to $62. Three haunted forest trails in Altamonte Springs.",
  undead: "Haunted WWII cargo ship in Channelside. Online from $26.55.",
  channelside: "Halloween night concert at the Tampa arena. Seats on TicketNetwork.",
  frightfest: "Fairgrounds midway and haunts from 7:30 PM. Check organizer for passes.",
  seaLifePirates: "Included with SEA LIFE Orlando admission. Final weekend Oct 31 and Nov 1.",
  waxHeist: "Included with Madame Tussauds Orlando admission through Oct 31.",
});

const PICKS = Object.freeze([
  {
    id: "terrify",
    label: "Terrify Me (Extreme Haunts)",
    hauntId: "hhn",
    filterId: "major",
    shortlistIds: ["hhn", "howlTampa", "screamageddon"],
    pitch: "Shortlist ready for extreme scares: Universal Halloween Horror Nights 35 from $94.10, Busch Gardens Howl O Scream Tampa from $49.99, and Scream A Geddon from $46.95 online. Compare dates and tap Get Tickets.",
  },
  {
    id: "value",
    label: "Value Scream Park",
    hauntId: "howlOrlando",
    filterId: "all",
    shortlistIds: ["howlOrlando", "sirHenry", "zooTampa"],
    pitch: "Shortlist ready for value under $50: SeaWorld Howl O Scream Orlando starts at $45.99, Sir Henry's Haunted Trail starts at $27 online timed entry, and ZooTampa Creatures of the Night runs $34.95 to $39.95.",
  },
  {
    id: "tampa",
    label: "Tampa Bay Tonight",
    hauntId: "howlTampa",
    filterId: "all",
    shortlistIds: ["howlTampa", "zooTampa", "spookquarium"],
    pitch: "Shortlist ready for Tampa Bay and the Gulf Coast: Busch Gardens Howl O Scream from $49.99 for thrills, ZooTampa Creatures of the Night at $34.95 to $39.95 for families, and Clearwater Spookquarium on Fri Oct 30.",
  },
  {
    id: "orlando",
    label: "Orlando Tonight",
    hauntId: "howlOrlando",
    filterId: "all",
    shortlistIds: ["howlOrlando", "hhn", "spooktacular"],
    pitch: "Shortlist ready for Orlando: SeaWorld Howl O Scream from $45.99, Universal Halloween Horror Nights 35 from $94.10, and SeaWorld Halloween Spooktacular on Oct 30, Oct 31 and Nov 1 for families, included with SeaWorld admission.",
  },
  {
    id: "kids",
    label: "Scares With Kids",
    hauntId: "spooktacular",
    filterId: "family",
    shortlistIds: ["spooktacular", "zooTampa", "seaLifePirates"],
    pitch: "Shortlist ready for families and kids: SeaWorld Halloween Spooktacular on Oct 30, Oct 31 and Nov 1, ZooTampa Creatures of the Night on Oct 30 and Oct 31 from 4:00 PM to 10:00 PM, and SEA LIFE Orlando pirates on Oct 31 and Nov 1.",
  },
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
    endsAt: "2026-10-31T23:59", endsVerified: false,
    endsSource: "Busch Gardens publishes gates 5:00 PM and scares 7:00 PM but no closing time we could read (buschgardens.com returned 403 to our fetch, Haunted Attraction Network lists none)",
    eventId: "howl-o-scream-tampa-2026",
    name: "Busch Gardens Howl O Scream Tampa Bay",
    where: "Tampa",
    city: "Tampa",
    vibe: "Haunted Houses & Coasters in the Dark",
    scareLevel: "Extreme Scare",
    costume: "hype",
    animatronic: "coaster",
    priceLabel: "From $49.99",
    price: { kind: "from", amount: 49.99 },
    timing: "Select nights through Oct 31, gates 5:00 PM, scares 7:00 PM",
    admissionNote: "Separate nighttime event ticket required",
    priceNote: "Starting online price before tax and fees. Varies by selected night.",
    ageNote: "Editorial rating: Intense scares intended for teens and adults",
    shortlistReason: "Tampa's major scream park combining haunted houses with dark coaster rides from $49.99.",
    tip: "Coasters in pitch dark plus full haunted houses from $49.99 online. The walk up gate price is the real jump scare.",
    roast: "Busch Gardens Howl O Scream starts at $49.99 with gates at 5:00 PM and scares at 7:00 PM. Buying online locks your date before higher walk up rates hit.",
    quips: [
      "Busch Gardens Howl O Scream starts at $49.99. Gates open at 5:00 PM so you can ride Iron Gwazi before the monsters clock in at 7:00 PM.",
      "Tampa, meet your ghost host! Book Howl O Scream online from $49.99 and save your cash for spooky snacks.",
    ],
    filters: ["major"],
    cta: affiliate("howl-o-scream-tampa-2026"),
    eventHref: "/florida-events/howl-o-scream-busch-gardens-tampa-2026",
  }),
  haunt({
    id: "howlOrlando",
    endsAt: "2026-10-31T23:59", endsVerified: false,
    endsSource: "SeaWorld publishes gates 6:30 PM and event 7:00 PM but no closing time we could read (seaworld.com returned 403 to our fetch)",
    eventId: "howl-o-scream-seaworld-2026",
    name: "SeaWorld Howl O Scream Orlando",
    where: "Orlando",
    city: "Orlando",
    vibe: "Waterfront Scream Zones & Night Coasters",
    scareLevel: "High Scare",
    costume: "springs",
    animatronic: "coaster",
    priceLabel: "From $45.99",
    price: { kind: "from", amount: 45.99 },
    timing: "Select nights through Oct 31, starts 7:00 PM",
    admissionNote: "Separate nighttime event ticket required",
    priceNote: "Starting online price before tax and fees. Varies by selected night.",
    ageNote: "Editorial rating: High scare nighttime event for teens and adults",
    shortlistReason: "Lowest starting price among Orlando's major after hours scream parks at $45.99.",
    tip: "Orlando's sharpest major scream park value from $45.99 online. Haunted houses, siren bars, and Mako after dark.",
    roast: "SeaWorld Howl O Scream starts at $45.99 on select nights through Oct 31. Note that this nighttime ticket is separate from daytime Spooktacular.",
    quips: [
      "SeaWorld Howl O Scream starts at $45.99 on select nights through Oct 31. Huge scares, waterfront fog, and your wallet survives.",
      "Exorcise the gate price! Orlando Howl O Scream starts at 7:00 PM and the online ticket starts at $45.99.",
    ],
    filters: ["major"],
    cta: affiliate("howl-o-scream-seaworld-2026"),
    eventHref: "/florida-events/howl-o-scream-seaworld-orlando-2026",
  }),
  haunt({
    id: "hhn",
    endsAt: "2026-11-02T02:00", endsVerified: true,
    endsSource: "Haunted Attraction Network HHN 2026 guide: event runs 6:30 PM to 2:00 AM on every event night including Nov 1 (third party; universalorlando.com not fetched)",
    eventId: "hhn-orlando-2026",
    name: "Universal Orlando Halloween Horror Nights 35",
    where: "Orlando",
    city: "Orlando",
    vibe: "10 Movie Quality Haunted Houses & Scare Zones",
    scareLevel: "Extreme Scare",
    costume: "pirate",
    animatronic: "cinema",
    priceLabel: "From $94.10",
    price: { kind: "from", amount: 94.1 },
    timing: "Select nights through Nov 1, starts 6:30 PM",
    admissionNote: "Separate nighttime event ticket required",
    priceNote: "Starting online price before tax and fees. Peak weekend dates cost more.",
    ageNote: "Editorial rating: Extreme horror. Universal does not recommend under age 13.",
    shortlistReason: "Ten studio grade haunted houses and five scare zones running select nights through Nov 1.",
    tip: "The heavyweight champion of Florida horror from $94.10 online. Ten cinematic houses that fill up fast every weekend.",
    roast: "Halloween Horror Nights 35 starts at $94.10 online. Popular October and November 1 nights can sell out ahead of the gate.",
    quips: [
      "Halloween Horror Nights 35 starts at $94.10. Ten studio grade haunted houses, fog everywhere, and zero mercy for walk up buyers.",
      "Select nights through Nov 1, screams from 6:30 PM. Lock the night online so you do not get ghosted at the gate.",
    ],
    filters: ["major"],
    cta: affiliate("hhn-orlando-2026"),
    eventHref: "/florida-events/halloween-horror-nights-orlando-2026",
  }),
  haunt({
    id: "zooTampa",
    endsAt: "2026-10-31T22:00", endsVerified: true,
    endsSource: "wf_events end_time 22:00 from zootampa.org events page; Tiqets listing start 16:00",
    eventId: "zootampa-creatures-2026",
    name: "ZooTampa Creatures of the Night",
    where: "Tampa",
    city: "Tampa",
    vibe: "Glowing Animal Realms & Family Spooky Fun",
    scareLevel: "Family & Kids",
    costume: "explorer",
    animatronic: "lantern",
    priceLabel: "$34.95 to $39.95",
    price: { kind: "range", low: 34.95, high: 39.95 },
    timing: "Oct 30 and Oct 31, 4:00 PM to 10:00 PM",
    admissionNote: "After hours event reservation ticket",
    priceNote: "Online event range before tax and fees on remaining event nights.",
    ageNote: "Editorial rating: Family friendly spooky realms with no gore",
    shortlistReason: "Tampa's top family evening haunt with 4:00 PM entry and no horror gore.",
    tip: "Tampa's favorite family Halloween night out at $34.95 to $39.95. Spooky storytelling, glowing zones, and no gore.",
    roast: "Creatures of the Night is $34.95 to $39.95 from 4:00 PM to 10:00 PM. Only Oct 30 and Oct 31 remain.",
    quips: [
      "Creatures of the Night is $34.95 to $39.95 from 4:00 PM to 10:00 PM. Spooky fun for kids, chill vibes for parents.",
      "Oct 30 and Oct 31 at ZooTampa after dark. Book online and glide right past the ticket window.",
    ],
    filters: ["family"],
    cta: affiliate("zootampa-creatures-2026"),
    eventHref: "/florida-events/zootampa-creatures-of-the-night-2026",
  }),
  // 2026-10-28 FIX MICKEY (owner approved): partner party tickets are gone
  // (Undercover Tourist page redirects to general Disney World, Viator 3805P8
  // has nothing bookable). 2026-10-29: Disney's own party page now states
  // "All 2026 event dates have sold out", so the card says sold out (organizer
  // evidence, one plain fetch), links to Disney's page, and points at family
  // picks that are still bookable. lib/eventTicketDeals.js NO_EXACT_AFFILIATE_PRODUCT holds the
  // shared decision for every other surface.
  haunt({
    id: "mickey",
    endsAt: "2026-11-01T00:00", endsVerified: true,
    endsSource: "disneyworld.disney.go.com party page, read 2026-10-29: 7:00 PM to midnight; Oct 31 is the last 2026 date",
    eventId: "mnsshp-2026",
    name: "Mickey's Not So Scary Halloween Party at Magic Kingdom",
    where: "Orlando",
    city: "Orlando",
    vibe: "Boo To You Parade, Fireworks & Trick or Treating",
    scareLevel: "Family & Kids",
    costume: "flamingo",
    animatronic: "lantern",
    priceLabel: "Sold out at Disney",
    price: { kind: "organizer" },
    timing: "Oct 29 and Oct 31, 7:00 PM to midnight",
    admissionNote: "Disney lists every 2026 party date as sold out",
    priceNote: "Disney's party page says all 2026 event dates have sold out (read Oct 29). Our booking partners have no tickets either.",
    ageNote: "Editorial rating: All ages Disney Halloween party",
    shortlistReason: "Magic Kingdom after hours party; Disney lists every 2026 date as sold out, so compare the family picks that can still be booked.",
    tip: "Disney lists every 2026 party date as sold out. SeaWorld Spooktacular, LEGOLAND Brick or Treat and SEA LIFE pirates can still be booked for this weekend.",
    roast: "Disney lists every 2026 Mickey's Not So Scary date as sold out. Grab a family pick below that you can still book.",
    quips: [
      "Mickey's party is sold out for every 2026 date on Disney's page. SeaWorld Spooktacular runs Oct 30, Oct 31 and Nov 1.",
      "No tickets left for Mickey's party, so skip the hunt. LEGOLAND Brick or Treat runs Oct 30 and Oct 31, included with admission.",
    ],
    filters: ["family"],
    bookable: false,
    alternatives: ["spooktacular", "brick", "seaLifePirates"],
    cta: { ...organizer("https://disneyworld.disney.go.com/events-tours/magic-kingdom/mickeys-not-so-scary-halloween-party/"), label: "See Disney Page", via: "Official Disney party page" },
    eventHref: "/florida-events/mickeys-not-so-scary-halloween-party-2026",
  }),
  haunt({
    id: "spooktacular",
    endsAt: "2026-11-01T23:59", endsVerified: false,
    endsSource: "daytime event; SeaWorld park close on Nov 1 not read",
    eventId: "seaworld-spooktacular-2026",
    name: "SeaWorld Orlando Halloween Spooktacular",
    where: "Orlando",
    city: "Orlando",
    vibe: "Daytime Trick or Treating & Sesame Street Parade",
    scareLevel: "Family & Kids",
    costume: "springs",
    animatronic: "lantern",
    priceLabel: "Included with park admission",
    price: { kind: "included" },
    timing: "Fri Oct 30, Sat Oct 31, Sun Nov 1 daytime",
    admissionNote: "Included with regular daytime park admission",
    priceNote: "No separate party ticket needed. Standard park admission taxes and fees apply.",
    ageNote: "Editorial rating: Daytime family trick or treating for kids",
    shortlistReason: "Daytime Orlando trick or treating included with standard SeaWorld park admission.",
    tip: "Included free with regular daytime SeaWorld admission. Trick or treat trails, Count von Count, and zero extra event fee.",
    roast: "Halloween Spooktacular is included with park admission on Fri Oct 30, Sat Oct 31, and Sun Nov 1 daytime. Separate from nighttime Howl O Scream.",
    quips: [
      "Halloween Spooktacular is included with park admission on Fri Oct 30, Sat Oct 31, and Sun Nov 1 daytime. Buy the park day, get the party.",
      "Daytime candy, marine life, and park rides in one ticket. Just do not confuse daytime Spooktacular with 7:00 PM Howl O Scream!",
    ],
    filters: ["family"],
    cta: affiliate("seaworld-spooktacular-2026"),
    eventHref: "/florida-events/seaworld-orlando-halloween-spooktacular-2026",
  }),
  haunt({
    id: "brick",
    endsAt: "2026-10-31T23:59", endsVerified: false,
    endsSource: "event included with park admission; LEGOLAND closing on Oct 31 not read",
    eventId: "brick-or-treat-2026",
    name: "LEGOLAND Florida Brick or Treat",
    where: "Winter Haven",
    city: "Winter Haven",
    vibe: "Monster Party Shows, LEGO Builds & Candy Zones",
    scareLevel: "Family & Kids",
    costume: "maracas",
    animatronic: "cauldron",
    priceLabel: "Included with park admission",
    price: { kind: "included" },
    timing: "Oct 30 and Oct 31",
    admissionNote: "Included with regular daytime park admission",
    priceNote: "No extra event fee beyond standard LEGOLAND park admission.",
    ageNote: "Editorial rating: Built for kids ages 2 to 12 and families",
    shortlistReason: "Included with LEGOLAND admission in Winter Haven on Oct 30 and Oct 31.",
    tip: "Included with LEGOLAND park admission in Winter Haven. Giant LEGO monster characters, drone shows, and candy stations.",
    roast: "Brick or Treat is included with LEGOLAND admission on Oct 30 and Oct 31. Booking park admission online beats gate rates.",
    quips: [
      "Brick or Treat is included with LEGOLAND admission on Oct 30 and Oct 31. Book the discounted park ticket and party all day.",
      "Winter Haven's ultimate kid Halloween playdate. Grab your park ticket online and every candy station is included.",
    ],
    filters: ["family"],
    cta: affiliate("brick-or-treat-2026"),
    eventHref: "/florida-events/legoland-florida-brick-or-treat-2026",
  }),
  haunt({
    id: "peppa",
    endsAt: "2026-10-31T16:00", endsVerified: true,
    endsSource: "wf_events from the organizer page: candy stations 11:00 AM to 4:00 PM on Oct 31",
    eventId: "peppas-halloween-party-2026",
    name: "Peppa's Halloween Party at Peppa Pig Theme Park",
    where: "Winter Haven",
    city: "Winter Haven",
    vibe: "Preschool Costume Party & Gentle Daytime Fun",
    scareLevel: "Little Kids",
    costume: "flamingo",
    animatronic: "cauldron",
    priceLabel: "Included with park admission",
    price: { kind: "included" },
    timing: "Sat Oct 31, 11:00 AM to 4:00 PM",
    admissionNote: "Included with regular daytime park admission",
    priceNote: "Included with standard Peppa Pig Theme Park admission.",
    ageNote: "Editorial rating: Gentle daytime party designed for preschoolers",
    shortlistReason: "Gentle 11:00 AM to 4:00 PM daytime Halloween party for toddlers on Oct 31.",
    tip: "Built specifically for toddlers and preschoolers from 11:00 AM to 4:00 PM, included with park admission.",
    roast: "Peppa's Halloween Party is included with admission on Sat Oct 31 from 11:00 AM to 4:00 PM. Home before dark, budget intact.",
    quips: [
      "Peppa's Halloween Party is included with admission on Sat Oct 31 from 11:00 AM to 4:00 PM. Zero jump scares, 100 percent cute.",
      "No separate party ticket needed. Book park admission online and your little piglets are set.",
    ],
    filters: ["family"],
    cta: affiliate("peppas-halloween-party-2026"),
    eventHref: "/florida-events/peppas-halloween-party-2026",
  }),
  haunt({
    id: "spookquarium",
    endsAt: "2026-10-30T19:00", endsVerified: true,
    endsSource: "cmaquarium.org event page via wf_events: 3:00 PM to 7:00 PM Fri Oct 30",
    eventId: "hw26-halloween-spookquarium-clearwater-2026",
    name: "Halloween Spookquarium at Clearwater Marine Aquarium",
    where: "Clearwater",
    city: "Clearwater",
    vibe: "Coastal Aquarium Trick or Treating & Sea Life",
    scareLevel: "Family & Kids",
    costume: "springs",
    animatronic: "nautical",
    priceLabel: "Included with admission",
    price: { kind: "included" },
    timing: "Fri Oct 30, 3:00 PM to 7:00 PM",
    admissionNote: "Included with regular aquarium admission",
    priceNote: "Included with standard Clearwater Marine Aquarium ticket on Fri Oct 30.",
    ageNote: "Editorial rating: All ages indoor and coastal family event",
    shortlistReason: "Gulf Coast family trick or treating among marine life on Friday Oct 30.",
    tip: "One special Friday afternoon in Clearwater from 3:00 PM to 7:00 PM, included with regular aquarium admission.",
    roast: "Halloween Spookquarium is included with admission on Fri Oct 30 from 3:00 PM to 7:00 PM. Single date afternoon event.",
    quips: [
      "Halloween Spookquarium is included with admission on Fri Oct 30 from 3:00 PM to 7:00 PM. Coastal views plus candy stations.",
      "One Friday in Clearwater! Book aquarium admission online and bring the kids for a breezy bayside Halloween.",
    ],
    filters: ["family"],
    cta: affiliate("hw26-halloween-spookquarium-clearwater-2026"),
    eventHref: "/florida-events/halloween-spookquarium-clearwater-2026",
  }),
  haunt({
    id: "screamageddon",
    endsAt: "2026-11-01T23:59", endsVerified: true,
    endsSource: "screamageddon.com/buy-tickets calendar read 2026-10-29: Nov 1 is 7:00 PM to 11:59 PM",
    eventId: null,
    name: "Scream A Geddon Horror Park",
    where: "Dade City",
    city: "Dade City",
    vibe: "6 Haunted Attractions, Monster Midway & Zombie Paintball",
    scareLevel: "Extreme Scare",
    costume: "pirate",
    animatronic: "woods",
    priceLabel: "$46.95 to $73.95 online",
    price: { kind: "range", low: 46.95, high: 73.95 },
    timing: "Oct 29 to Nov 1, 7:00 PM to 11:59 PM",
    admissionNote: "Direct organizer nighttime event ticket",
    priceNote: "Online starting price by date for the last nights (Oct 29 $46.95, Oct 30 $62.95, Oct 31 $73.95, Nov 1 $50.95), before tax and processing fees.",
    ageNote: "Editorial rating: Extreme independent horror park recommended for ages 13 and up",
    shortlistReason: "Six outdoor woods haunts and monster midway in Dade City from $46.95 online.",
    tip: "Wild independent horror park in the Dade City woods from $46.95 to $73.95 online for the last nights. Monsters can even mark you to enter.",
    roast: "Scream A Geddon in Dade City is $46.95 to $73.95 online from 7:00 PM to 11:59 PM for the last nights. Advance online tickets cost less than box office walk ups.",
    quips: [
      "Scream A Geddon in Dade City runs $46.95 to $73.95 online from 7:00 PM to 11:59 PM through Nov 1. Six intense attractions and a monster beer garden.",
      "The online price is the mercy. The walk up box office in the dark woods is the sequel nobody asked for.",
    ],
    filters: ["local"],
    // scripts/seed-fall-sarasota-2026.mjs official_ticket_url, verified 2026-09-03.
    cta: organizer("https://screamageddon.com/tickets/"),
    eventHref: "/florida-events/scream-a-geddon-dade-city-2026",
  }),
  haunt({
    id: "sirHenry",
    endsAt: "2026-11-01T23:59", endsVerified: false,
    endsSource: "HauntPay and Haunted Attraction Network give 7:30 PM start but no closing time for Nov 1",
    eventId: null,
    name: "Sir Henry's Haunted Trail",
    where: "Plant City",
    city: "Plant City",
    vibe: "Outdoor Dark Woods Haunted Trails & Hayride",
    scareLevel: "High Scare",
    costume: "navigator",
    animatronic: "woods",
    priceLabel: "From $27 online timed entry",
    price: { kind: "from", amount: 27 },
    timing: "Select nights through Nov 1, trails from 7:30 PM",
    admissionNote: "Mandatory advance online timed entry ticket",
    priceNote: "Starting online timed entry price before fees on HauntPay.",
    ageNote: "Editorial rating: High scare outdoor trail in dark woods",
    shortlistReason: "Central Florida cult favorite outdoor haunted trail starting at $27 with timed entry.",
    tip: "Cult favorite outdoor haunted trail between Tampa and Orlando from $27 online timed entry. Walk ups often cannot get in.",
    roast: "Sir Henry's Haunted Trail starts at $27 online with timed entry from 7:30 PM. Advance online reservation is required before driving out.",
    quips: [
      "Sir Henry's Haunted Trail starts at $27 online with timed entry from 7:30 PM. Original Florida legends lurking in real pitch black woods.",
      "Plant City does not play around with walk ups. Grab your timed entry slot online before the night sells out.",
    ],
    filters: ["local"],
    // Same seed file: HauntPay is the organizer's timed entry page.
    cta: organizer("https://app.hauntpay.com/events/sir-henry-s-haunted-trail-2026"),
    eventHref: "/florida-events/sir-henrys-haunted-trail-plant-city-2026",
  }),
  haunt({
    id: "petrified",
    endsAt: "2026-10-31T22:30", endsVerified: true,
    endsSource: "Ticketleap event schema read 2026-10-29: endDate 2026-10-31T22:30 -0400",
    eventId: null,
    name: "A Petrified Forest Scream Park",
    where: "Altamonte Springs",
    city: "Altamonte Springs",
    vibe: "3 Outdoor Forest Scare Trails & Live Music Midway",
    scareLevel: "High Scare",
    costume: "explorer",
    animatronic: "woods",
    priceLabel: "$38 to $62",
    price: { kind: "range", low: 38, high: 62 },
    timing: "Select nights through Oct 31, 7:00 PM to 10:30 PM",
    admissionNote: "Direct organizer nighttime trail pass",
    priceNote: "Tiered trail packages from $38 to $62 before ticket fees.",
    ageNote: "Editorial rating: High scare outdoor forest trails",
    shortlistReason: "North Orlando's three outdoor haunted forest trails running through Oct 31.",
    tip: "North Orlando's eerie forest scream park at $38 to $62. Three distinct outdoor trails under a real tree canopy.",
    roast: "A Petrified Forest in Altamonte Springs is $38 to $62 from 7:00 PM to 10:30 PM through Oct 31. Check package tiers on Ticketleap.",
    quips: [
      "A Petrified Forest in Altamonte Springs runs $38 to $62 from 7:00 PM to 10:30 PM. Real trees, real fog, and local food trucks.",
      "Pick your fear package online from $38 to $62 before the trees pick your wallet.",
    ],
    filters: ["local"],
    // data/fall-2026-additions-2026-10-06.json official_ticket_url.
    cta: organizer("https://events.ticketleap.com/tickets/a-petrified-forest/a-petrified-forest-scream-park-2026"),
    eventHref: "/florida-events/a-petrified-forest-scream-park-2026-altamonte-springs-2026",
  }),
  haunt({
    id: "undead",
    endsAt: "2026-10-31T22:00", endsVerified: true,
    endsSource: "Eventbrite listing by American Victory Ship and Museum read 2026-10-29: endDate 2026-10-31T22:00 America/New_York",
    eventId: null,
    name: "UNDead in the Water aboard American Victory Ship",
    where: "Tampa",
    city: "Tampa",
    vibe: "Haunted WWII Cargo Ship Deck & Dark Hold",
    scareLevel: "High Scare",
    costume: "pirate",
    animatronic: "nautical",
    priceLabel: "$26.55 to $31.81",
    price: { kind: "range", low: 26.55, high: 31.81 },
    timing: "Oct 29, Oct 30, and Oct 31",
    admissionNote: "Direct organizer ship boarding ticket",
    priceNote: "Organizer ticket range on Eventbrite before fees, in stock on Oct 29.",
    ageNote: "Editorial rating: High scare haunted ship with steep stairs and tight corridors",
    shortlistReason: "Authentic 1945 WWII cargo ship haunt in downtown Tampa Channelside on Oct 29 to Oct 31.",
    tip: "Climb aboard a real 1945 WWII cargo ship in downtown Tampa's Channelside district for three nights of claustrophobic scares.",
    roast: "UNDead in the Water boards the American Victory Ship on Oct 29, Oct 30, and Oct 31. Tickets are on the ship's official Eventbrite page.",
    quips: [
      "UNDead in the Water boards the American Victory Ship on Oct 29, Oct 30, and Oct 31. Tight steel corridors on the water in downtown Tampa.",
      "A real historic ship full of ghouls in Channelside. Tap Official Tickets to grab your boarding pass straight from the crew.",
    ],
    filters: ["local"],
    // The American Victory Ship and Museum's own Eventbrite listing (read 2026-10-29:
    // InStock, $26.55 to $31.81, last date ends 10:00 PM Oct 31).
    cta: organizer("https://www.eventbrite.com/e/undead-in-the-water-halloween-attraction-tickets-1996421695032"),
    eventHref: "/florida-events/undead-in-the-water-tampa-2026",
  }),
  // 2026-10-29 Halloween affiliate pass. Arena page benchmarkintlarena.com/
  // event/noc-2026/ read that day: Sat Oct 31, 7:00 PM show, doors 60 to 90
  // minutes before, Kodak Black, Meek Mill and DaBaby (lineup may change),
  // costumes allowed, prop weapons not. The arena prints no price, and
  // TicketNetwork is a resale market, so the card prints no price either.
  haunt({
    id: "channelside",
    lastVerified: "2026-10-29",
    // Show 7:00 PM Sat Oct 31 (arena page); the arena prints no end time, so the
    // close is UNVERIFIED and uses 11:59 PM local of the last date.
    endsAt: "2026-10-31T23:59", endsVerified: false,
    endsSource: "benchmarkintlarena.com event page lists the 7:00 PM show and doors but no end time",
    eventId: "nightmare-on-channelside-2026",
    name: "Nightmare on Channelside Halloween Concert",
    where: "Benchmark International Arena",
    city: "Tampa",
    vibe: "Kodak Black, Meek Mill and DaBaby on Halloween Night",
    scareLevel: "Halloween Concert",
    costume: "hype",
    animatronic: "cinema",
    priceLabel: "Concert tickets on TicketNetwork",
    price: { kind: "organizer" },
    timing: "Sat Oct 31, show 7:00 PM, doors 60 to 90 min before",
    admissionNote: "Concert seats sold on TicketNetwork",
    priceNote: "Resale seat prices change by section and date. Check TicketNetwork for the current price.",
    ageNote: "Editorial rating: Halloween concert night, costumes welcome, no prop weapons",
    shortlistReason: "Tampa's big Halloween night concert with Kodak Black, Meek Mill and DaBaby at the arena on Oct 31.",
    tip: "Kodak Black, Meek Mill and DaBaby take over the Channelside arena on Halloween night. Costumes are welcome, prop weapons stay home.",
    roast: "Nightmare on Channelside hits Benchmark International Arena Sat Oct 31 at 7:00 PM. The arena says the lineup can change, so check your seats before you go.",
    quips: [
      "Nightmare on Channelside is Halloween night at the Tampa arena. Kodak Black, Meek Mill and DaBaby, show at 7:00 PM.",
      "Costume on, mask off at security, and leave the plastic chainsaw at home. Grab seats before Halloween night.",
    ],
    filters: [],
    cta: affiliate("nightmare-on-channelside-2026"),
    eventHref: "/florida-events/nightmare-on-channelside-2026",
  }),
  haunt({
    id: "frightfest",
    endsAt: "2026-11-01T23:59", endsVerified: false,
    endsSource: "MySuncoast 2026-10-13: Thu close 10:30 PM, Fri and Sat close 11:30 PM; Sunday Nov 1 close not published",
    eventId: null,
    name: "Sarasota Frightfest",
    where: "Sarasota Fairgrounds",
    city: "Sarasota",
    vibe: "Haunted Fairgrounds, Rides & Spooky Midway",
    scareLevel: "High Scare",
    costume: "maracas",
    animatronic: "cauldron",
    priceLabel: "Price on the organizer page",
    price: { kind: "organizer" },
    timing: "Oct 29, 30, 31, and Nov 1 from 7:30 PM",
    admissionNote: "Direct organizer fairgrounds pass",
    priceNote: "Verified event nights. Check the official organizer page for admission and ride passes.",
    ageNote: "Editorial rating: Late night fairgrounds haunt starting at 7:30 PM",
    shortlistReason: "Sarasota Fairgrounds late night haunted house and midway running Oct 29 through Nov 1 from 7:30 PM.",
    tip: "Gulf Coast late night haunt and carnival midway at the Sarasota Fairgrounds starting at 7:30 PM.",
    roast: "Sarasota Frightfest runs Oct 29, Oct 30, Oct 31, and Nov 1 from 7:30 PM at the fairgrounds. Check the organizer site before heading out.",
    quips: [
      "Sarasota Frightfest takes over the Sarasota Fairgrounds from 7:30 PM on Oct 29, 30, 31, and Nov 1.",
      "Sarasota's late night haunt at the fairgrounds! Tap Official Tickets for the organizer's nightly pass info.",
    ],
    filters: ["local"],
    // Official site sarasotafrightfest.com redirects here (checked 2026-10-29): the organizer's ticket calendar.
    cta: organizer("https://sarasotafrightfest.fearticket.com/"),
    eventHref: "/florida-events/sarasota-frightfest-2026",
  }),
  // 2026-10-28 Halloween affiliate pass (lib/eventTicketDeals.js): organizer
  // page says "Weekends Now to November 1st" and "Included with Admission";
  // wf_events verified 2026-10-28, pirate meet and greets 10:30 AM to 6:00 PM.
  haunt({
    id: "seaLifePirates",
    endsAt: "2026-11-01T18:00", endsVerified: true,
    endsSource: "visitsealife.com event page via wf_events: pirate meet and greets 10:30 AM to 6:00 PM, Nov 1 is the last weekend",
    eventId: "hw26-pirates-of-the-haunted-seas-at-sea-life-orlando-2026",
    name: "Pirates of the Haunted Seas at SEA LIFE Orlando",
    where: "SEA LIFE Orlando Aquarium",
    city: "Orlando",
    vibe: "Pirate Ghost Hunt Among the Sharks & Rays",
    scareLevel: "Family & Kids",
    costume: "pirate",
    animatronic: "nautical",
    priceLabel: "Included with admission",
    price: { kind: "included" },
    timing: "Sat Oct 31 and Sun Nov 1, pirates 10:30 AM to 6:00 PM",
    admissionNote: "Included with regular aquarium admission",
    priceNote: "Included with a standard SEA LIFE Orlando entry ticket on event weekends.",
    ageNote: "Editorial rating: All ages, gentle pirate fun with no jump scares",
    shortlistReason: "Weekend pirate meet and greets inside SEA LIFE Orlando on I Drive, included with admission.",
    tip: "Ghostly pirates roam SEA LIFE Orlando on weekends through Nov 1, included with regular aquarium admission.",
    roast: "Pirates of the Haunted Seas is included with SEA LIFE Orlando admission on Sat Oct 31 and Sun Nov 1. Book entry online before you go.",
    quips: [
      "Pirates of the Haunted Seas runs Sat Oct 31 and Sun Nov 1 at SEA LIFE Orlando. Ghost pirates plus sharks, included with admission.",
      "Arr, a haunted aquarium! Tap Book Now and grab SEA LIFE Orlando entry for the final pirate weekend.",
    ],
    filters: ["family"],
    cta: affiliate("hw26-pirates-of-the-haunted-seas-at-sea-life-orlando-2026"),
    eventHref: "/florida-events/pirates-of-the-haunted-seas-at-sea-life-orlando-2026",
  }),
  // 2026-10-28 Halloween affiliate pass: organizer page says "October 1 to 31,
  // 2026" and "Included with admission, During daily operation".
  haunt({
    id: "waxHeist",
    endsAt: "2026-10-31T23:59", endsVerified: false,
    endsSource: "organizer says daily during operating hours through Oct 31; Madame Tussauds closing time not read",
    eventId: "hw26-the-great-wax-heist-at-madame-tussauds-orlando-2026",
    name: "The Great Wax Heist at Madame Tussauds Orlando",
    where: "Madame Tussauds Orlando",
    city: "Orlando",
    vibe: "Halloween Wax Mystery Hunt on I Drive",
    scareLevel: "Family & Kids",
    costume: "hype",
    animatronic: "cauldron",
    priceLabel: "Included with admission",
    price: { kind: "included" },
    timing: "Daily through Sat Oct 31 during regular hours",
    admissionNote: "Included with regular Madame Tussauds admission",
    priceNote: "Included with a standard Madame Tussauds Orlando entry ticket, no separate event ticket.",
    ageNote: "Editorial rating: All ages, playful mystery with no gore",
    shortlistReason: "Daily Halloween wax mystery on I Drive through Oct 31, included with admission.",
    tip: "A Halloween mystery runs through the wax figures every day through Oct 31, included with regular admission.",
    roast: "The Great Wax Heist is included with Madame Tussauds Orlando admission daily through Oct 31. Book entry online before you go.",
    quips: [
      "The Great Wax Heist runs daily through Oct 31 at Madame Tussauds Orlando, included with admission.",
      "Someone stole the wax! Tap Book Now for Madame Tussauds Orlando entry and crack the case.",
    ],
    filters: ["family"],
    cta: affiliate("hw26-the-great-wax-heist-at-madame-tussauds-orlando-2026"),
    eventHref: "/florida-events/the-great-wax-heist-at-madame-tussauds-orlando-2026",
  }),
  // sideshowObscura removed 2026-10-29, see HAUNT_REMOVED.
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

export function halloweenHauntProductSchema(model) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Florida Haunted Houses and Scream Park Tickets",
    description: "Compare 2026 Florida haunted houses, theme park fright nights, and family Halloween tickets in one place with Boo your ghost host.",
    image: [SITE_URL + (model && model.poster ? model.poster : BO_POSTER_SRC)],
    sku: "wfFlHalloween2026",
    mpn: "wfFlHalloween2026",
    brand: {
      "@type": "Brand",
      name: "Wayfind",
    },
    offers: {
      "@type": "Offer",
      url: SITE_URL + "/halloween-in-florida",
      priceCurrency: "USD",
      price: "27.00",
      itemCondition: "https://schema.org/NewCondition",
      availability: "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: "Wayfind",
      },
    },
  };
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

// Photo per haunt, resolved on the server, never another venue's picture.
// 1) floridaEventPhoto: the owner's event photo, or the venue's own partner
//    photo for events mapped there (Howl O Scream Tampa).
// 2) VENUE_OFFER below: the haunt's own venue in MENU_PARTNER_OFFERS, with the
//    same caption and credit convention as floridaEventPhoto.
// 3) null: the card paints a dark placeholder, never another place's photo.
const VENUE_OFFER = Object.freeze({
  zooTampa: { offerId: "tampa-hook-zootampa", market: "Tampa", alt: "Animals at ZooTampa at Lowry Park" },
  peppa: { offerId: "winterhaven-hook-peppa-pig", market: "Winter Haven", alt: "Rainbow entrance to Peppa Pig Theme Park" },
});

function plainAlt(text) {
  return String(text || "").replace(/[-\u2013\u2014]/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function hauntPhoto(row) {
  const event = row.eventId ? floridaEventPhoto({ event_id: row.eventId, city: row.city }) : null;
  if (event && event.src) {
    return {
      src: event.src,
      width: event.width,
      height: event.height,
      alt: plainAlt(event.alt),
      caption: event.caption ? plainAlt(event.caption) : "",
      credit: event.credit || "",
    };
  }
  const ctx = Object.hasOwn(VENUE_OFFER, row.id) ? VENUE_OFFER[row.id] : null;
  if (!ctx) return null;
  const offer = MENU_PARTNER_OFFERS.find((item) => item.offerId === ctx.offerId && item.market === ctx.market);
  if (!offer || !offer.image) return null;
  const owned = FLORIDA_PARK_PHOTOS[offer.offerId];
  return {
    src: (owned && owned.src) || landingOfferImage(offer.image),
    width: (owned && owned.width) || 960,
    height: (owned && owned.height) || 600,
    alt: ctx.alt,
    caption: offer.title + " \u00b7 Venue photo. Seasonal event not pictured.",
    credit: "Photo via " + (offer.provider === "tiqets" ? "Tiqets" : offer.provider),
  };
}

// Wall clock to instant. Intl gives the zone's UTC offset at a moment; the
// local time is mapped back by trying the offset just before and just after it.
// A local time that happens twice (the fall back hour, 1:00 to 1:59 AM on
// Nov 1 2026) resolves to the FIRST pass (EDT), a time that never happens
// (spring forward gap) resolves to the instant after the gap.
function zoneOffsetMin(ms, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", // one-clock-ok: converts a venue wall clock time to an instant (a zone offset), never reads the current hour or a daypart
  }).formatToParts(new Date(ms));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(ms / 1000) * 1000) / 60000;
}
export function localWallToMs(wall, tz = HAUNT_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(wall || ""));
  if (!m) return NaN;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offs = [...new Set([zoneOffsetMin(naive - 86400000, tz), zoneOffsetMin(naive + 86400000, tz)])];
  const hits = offs.map((o) => naive - o * 60000).filter((ms) => zoneOffsetMin(ms, tz) === (naive - ms) / 60000).sort((a, b) => a - b);
  return hits.length ? hits[0] : naive - Math.min(...offs) * 60000;
}

/** The instant a haunt's final operating night closes, in epoch ms (NaN when the row has no endsAt). */
export function hauntEndMs(row) {
  return localWallToMs(row && row.endsAt, (row && row.endsTz) || HAUNT_TZ);
}

function nowMs(now) {
  if (now === undefined || now === null) return Date.now();
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number") return now;
  const t = Date.parse(String(now));
  if (!Number.isFinite(t) || !/T\d{2}:\d{2}/.test(String(now))) throw new Error("hauntIsLive needs an instant (ISO with time and offset), got " + now);
  return t;
}

// A haunt is live until the instant its final night closes (venue local time).
// One that has closed never renders: no card, no schema entry. `now` is the
// current instant (Date, epoch ms, or ISO string with an offset).
// UNVERIFIED closing times are a placeholder (11:59 PM), and a haunt may run
// past midnight. Removing a card while the gates are still open is the worse
// error, so an unverified end keeps the card up to 2:15 AM local (HHN, the
// latest verified Florida close, shuts at 2:00 AM). Verified ends are exact.
export const UNVERIFIED_END_GRACE_MS = 135 * 60000;

export function hauntIsLive(row, now) {
  const end = hauntEndMs(row);
  if (!Number.isFinite(end)) return false;
  const grace = row && row.endsVerified === true ? 0 : UNVERIFIED_END_GRACE_MS;
  return nowMs(now) < end + grace;
}

// Owner, 2026-10-30: "show the most popular first, least popular last."
// Popularity = the Google review count of the haunt's venue (wf_inventory
// signals.reviews, read 2026-10-30 for the place ids in
// lib/halloweenHauntPhotos.js). Two haunts at one venue share its count and
// keep their editorial order. A haunt with no known count sorts last; we never
// guess one.
export const HAUNT_VENUE_REVIEWS_2026_10_30 = Object.freeze({
  mickey: 251824, // Magic Kingdom Park
  hhn: 191748, // Universal Orlando Resort
  howlOrlando: 114777, // SeaWorld Orlando
  spooktacular: 114777, // SeaWorld Orlando
  howlTampa: 98769, // Busch Gardens Tampa Bay
  brick: 30687, // LEGOLAND Florida Resort
  zooTampa: 28317, // ZooTampa at Lowry Park
  spookquarium: 20242, // Clearwater Marine Aquarium
  seaLifePirates: 13323, // SEA LIFE Orlando Aquarium
  waxHeist: 7878, // Madame Tussauds Orlando
  peppa: 2079, // PEPPA PIG Theme Park Florida
  undead: 1755, // American Victory Ship & Museum
  frightfest: 1236, // Sarasota Fairgrounds
  petrified: 1124, // A Petrified Forest Scare Trail
});

export function sortHauntsByPopularity(rows) {
  const count = (row) => {
    const n = HAUNT_VENUE_REVIEWS_2026_10_30[row.id];
    return Number.isFinite(n) ? n : -1;
  };
  return rows.map((row, i) => ({ row, i })).sort((a, b) => (count(b.row) - count(a.row)) || (a.i - b.i)).map((x) => x.row);
}

export function halloweenHauntModel(opts = {}) {
  const now = nowMs(opts && opts.now);
  const haunts = sortHauntsByPopularity(HAUNTS.filter((row) => hauntIsLive(row, now))).map((row) => {
    const nudge = NUDGES[row.id];
    if (!nudge) throw new Error("halloween haunt missing a nudge for " + row.id);
    const photo = hauntPhoto(row);
    // photos: the strip. Photo 1 is the owner/partner photo when there is one;
    // lib/halloweenHauntPhotos.js withHauntPhotos() appends Google photos.
    const photos = photo ? [{ src: photo.src, width: photo.width, height: photo.height, alt: photo.alt, credit: photo.credit || "", source: "owned" }] : [];
    return { ...row, nudge, photo, photos };
  });
  const liveBookableIds = new Set(haunts.filter((row) => row.bookable !== false).map((row) => row.id));
  const picks = PICKS.map((pick) => {
    const shortlistIds = pick.shortlistIds.filter((id) => liveBookableIds.has(id));
    if (shortlistIds.length === 0) return null;
    const hauntId = liveBookableIds.has(pick.hauntId) ? pick.hauntId : shortlistIds[0];
    return { ...pick, hauntId, shortlistIds };
  }).filter(Boolean);
  const model = {
    catalogVersion: HALLOWEEN_CATALOG_VERSION,
    video: BO_REEL_SRC,
    poster: BO_POSTER_SRC,
    lines: LINES.map((l) => (l === null ? hauntCountLine(haunts.length) : l)),
    picks,
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
      merit: "Listed on merit: most popular first, by how many Google reviews each venue has. Rankings are never for sale.",
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
      thinking: "Boo is checking the verified vault",
      chatTitle: "Talk To Boo",
      toursTitle: "Florida Ghost Tours",
      toursLede: "Haunted walks, pub crawls and paranormal investigations, most reviewed first.",
      toursJump: "Jump to ghost tours",
    },
    haunts,
  };
  const problems = hauntCopyProblems(model);
  if (problems.length) throw new Error("halloween haunt copy: " + problems[0]);
  const blob = visibleHauntStrings(model).join("\n");
  if (!/rankings are never for sale/i.test(blob)) throw new Error("halloween haunt copy lost the rankings line");
  if (!/on merit/i.test(blob)) throw new Error("halloween haunt copy lost the merit line");
  if (!blob.includes(model.chrome.disclosure)) throw new Error("halloween haunt copy lost the affiliate disclosure");
  if (model.lines.length < 10) throw new Error("halloween haunt needs at least 10 lines from Boo");
  return model;
}
