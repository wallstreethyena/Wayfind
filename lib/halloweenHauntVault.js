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

export const HALLOWEEN_HAUNT_SURFACE = "halloween_haunts";
export const HALLOWEEN_CATALOG_VERSION = "2026.10.26.v2";
export const BO_REEL_SRC = "/videos/bo-halloween-reel.mp4";
export const BO_POSTER_SRC = "/images/bo-halloween-poster.jpg";

const DASH = /[-\u2013\u2014]/;
const SKIP_KEYS = new Set([
  "href",
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
  "expiresAfter",
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

function haunt(row) {
  return {
    lastVerified: "2026-10-26",
    expiresAfter: "2026-11-02",
    ...row,
  };
}

const LINES = [
  "I'm Boo, your ghost host! I died so I could haunt these Florida scares and save your wallet from gate prices.",
  "14 haunts so good it's spooky. Don't ghost me, tap a ticket link below and lock in your night before October 31.",
  "Sunglasses on, sunscreen energy, gate prices off. Howl O Scream starts at $45.99 when you book ahead.",
  "Paying box office prices is the real horror story here. Tap a haunt below and keep your soul and your cash.",
  "Floated up 40ft. 0 steps taken! Leg day skipped, and your gate markup skipped too when you grab tickets online.",
  "Busch Gardens Howl O Scream at $49.99 gives you haunted houses plus coasters in the dark. Your wallet stays in its body.",
  "Halloween Horror Nights 35 is the giant movie studio nightmare. From $94.10 online instead of crying at the Universal gate.",
  "ZooTampa Creatures of the Night is $34.95 to $39.95. Glowing pathways, zero toddler tears, and a happy ghost budget.",
  "Mickey's Not So Scary runs 7:00 PM to midnight for $119 to $229. Rare characters, castle fireworks, and candy by the pound.",
  "Brick or Treat comes included with LEGOLAND park admission. Candy is the treat, a gate panic is the trick.",
  "Sir Henry's Haunted Trail sells online timed entry from $27 in Plant City. Show up without a slot and you are haunting the parking lot.",
  "Scream A Geddon in Dade City is $30.95 to $55.95 online. Monster midway, woods trails, and way cheaper than walk up prices.",
  "Peppa's Halloween Party runs 11:00 AM to 4:00 PM and comes with admission. Even a cool ghost loves a daytime fiesta.",
  "Clearwater Spookquarium is Friday Oct 30 from 3:00 PM to 7:00 PM, included with admission. The sharks already RSVP'd.",
];

const NUDGES = Object.freeze({
  howlTampa: "Online deal from $49.99. Skip the Tampa box office markup.",
  howlOrlando: "Online scream from $45.99. Lowest major Orlando haunt entry.",
  hhn: "Online from $94.10. Lock your night before popular dates vanish.",
  zooTampa: "Online $34.95 to $39.95. Easy family evening without late bedtime.",
  mickey: "Online $119 to $229. Select party nights sell out ahead of time.",
  spooktacular: "Included with daytime park admission. No separate event ticket needed.",
  brick: "Included with LEGOLAND ticket. Candy stations ride on park admission.",
  peppa: "Included with park admission. Built for toddlers and early naps.",
  spookquarium: "Included with aquarium admission for Friday Oct 30 afternoon.",
  screamageddon: "Online $30.95 to $55.95. Cheaper than buying at the woods gate.",
  sirHenry: "Online timed entry from $27. Advance slot required before arrival.",
  petrified: "Online $38 to $62. Three haunted forest trails in Altamonte Springs.",
  undead: "Haunted WWII cargo ship in Channelside. Check organizer for nightly boarding.",
  frightfest: "Fairgrounds midway and haunts from 8:00 PM. Check organizer for passes.",
});

const PICKS = Object.freeze([
  {
    id: "terrify",
    label: "Terrify Me (Extreme Haunts)",
    hauntId: "hhn",
    filterId: "major",
    shortlistIds: ["hhn", "howlTampa", "screamageddon"],
    pitch: "Shortlist ready for extreme scares: Universal Halloween Horror Nights 35 from $94.10, Busch Gardens Howl O Scream Tampa from $49.99, and Scream A Geddon from $30.95 online. Compare dates and tap Get Tickets.",
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
    shortlistIds: ["howlOrlando", "hhn", "mickey"],
    pitch: "Shortlist ready for Orlando: SeaWorld Howl O Scream from $45.99, Universal Halloween Horror Nights 35 from $94.10, and Mickey's Not So Scary at $119 to $229 for families.",
  },
  {
    id: "kids",
    label: "Scares With Kids",
    hauntId: "mickey",
    filterId: "family",
    shortlistIds: ["mickey", "zooTampa", "peppa"],
    pitch: "Shortlist ready for families and kids: Mickey's Not So Scary runs 7:00 PM to midnight, ZooTampa Creatures of the Night runs 4:00 PM to 10:00 PM, and Peppa's Halloween Party runs 11:00 AM to 4:00 PM for toddlers.",
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
    timing: "Oct 25, Oct 30, and Oct 31, 4:00 PM to 10:00 PM",
    admissionNote: "After hours event reservation ticket",
    priceNote: "Online event range before tax and fees on remaining event nights.",
    ageNote: "Editorial rating: Family friendly spooky realms with no gore",
    shortlistReason: "Tampa's top family evening haunt with 4:00 PM entry and no horror gore.",
    tip: "Tampa's favorite family Halloween night out at $34.95 to $39.95. Spooky storytelling, glowing zones, and no gore.",
    roast: "Creatures of the Night is $34.95 to $39.95 from 4:00 PM to 10:00 PM. Only Oct 30 and Oct 31 remain after Oct 25.",
    quips: [
      "Creatures of the Night is $34.95 to $39.95 from 4:00 PM to 10:00 PM. Spooky fun for kids, chill vibes for parents.",
      "Oct 25, Oct 30, and Oct 31 at ZooTampa after dark. Book online and glide right past the ticket window.",
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
    vibe: "Boo To You Parade, Fireworks & Trick or Treating",
    scareLevel: "Family & Kids",
    costume: "flamingo",
    animatronic: "lantern",
    priceLabel: "$119 to $229",
    price: { kind: "range", low: 119, high: 229 },
    timing: "Select nights through Oct 31, 7:00 PM to midnight",
    admissionNote: "Separate special event party ticket required",
    priceNote: "Date based party pricing from $119 to $229 before tax. Late October dates often sell out.",
    ageNote: "Editorial rating: All ages Disney Halloween party",
    shortlistReason: "Full Magic Kingdom after hours party with parade, fireworks, and trick or treat trails.",
    tip: "Magic Kingdom after hours from $119 to $229. Headless Horseman parade, Hocus Pocus stage show, and unlimited candy trails.",
    roast: "Mickey's Not So Scary is $119 to $229 from 7:00 PM to midnight. Check date availability early since final October nights sell out.",
    quips: [
      "Mickey's Not So Scary is $119 to $229 from 7:00 PM to midnight. Shorter ride waits, rare Disney villains, and bags of candy.",
      "The party is the treat. Waiting until the castle gates close on sold out nights is the trick. Lock your date early!",
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
    timing: "Oct 25, Oct 30, and Oct 31",
    admissionNote: "Included with regular daytime park admission",
    priceNote: "No extra event fee beyond standard LEGOLAND park admission.",
    ageNote: "Editorial rating: Built for kids ages 2 to 12 and families",
    shortlistReason: "Included with LEGOLAND admission in Winter Haven on Oct 30 and Oct 31.",
    tip: "Included with LEGOLAND park admission in Winter Haven. Giant LEGO monster characters, drone shows, and candy stations.",
    roast: "Brick or Treat is included with LEGOLAND admission on Oct 25, Oct 30, and Oct 31. Booking park admission online beats gate rates.",
    quips: [
      "Brick or Treat is included with LEGOLAND admission on Oct 25, Oct 30, and Oct 31. Book the discounted park ticket and party all day.",
      "Winter Haven's ultimate kid Halloween playdate. Grab your park ticket online and every candy station is included.",
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
    vibe: "Preschool Costume Party & Gentle Daytime Fun",
    scareLevel: "Little Kids",
    costume: "flamingo",
    animatronic: "cauldron",
    priceLabel: "Included with park admission",
    price: { kind: "included" },
    timing: "Oct 25 and Oct 31, 11:00 AM to 4:00 PM",
    admissionNote: "Included with regular daytime park admission",
    priceNote: "Included with standard Peppa Pig Theme Park admission.",
    ageNote: "Editorial rating: Gentle daytime party designed for preschoolers",
    shortlistReason: "Gentle 11:00 AM to 4:00 PM daytime Halloween party for toddlers on Oct 31.",
    tip: "Built specifically for toddlers and preschoolers from 11:00 AM to 4:00 PM, included with park admission.",
    roast: "Peppa's Halloween Party is included with admission on Oct 25 and Oct 31 from 11:00 AM to 4:00 PM. Home before dark, budget intact.",
    quips: [
      "Peppa's Halloween Party is included with admission on Oct 25 and Oct 31 from 11:00 AM to 4:00 PM. Zero jump scares, 100 percent cute.",
      "No separate party ticket needed. Book park admission online and your little piglets are set.",
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
    eventId: null,
    name: "Scream A Geddon Horror Park",
    where: "Dade City",
    city: "Dade City",
    vibe: "6 Haunted Attractions, Monster Midway & Zombie Paintball",
    scareLevel: "Extreme Scare",
    costume: "pirate",
    animatronic: "woods",
    priceLabel: "$30.95 to $55.95 online",
    price: { kind: "range", low: 30.95, high: 55.95 },
    timing: "Select nights through Nov 1, 7:00 PM to midnight",
    admissionNote: "Direct organizer nighttime event ticket",
    priceNote: "Online price range by date before tax and processing fees.",
    ageNote: "Editorial rating: Extreme independent horror park recommended for ages 13 and up",
    shortlistReason: "Six outdoor woods haunts and monster midway in Dade City from $30.95 online.",
    tip: "Wild independent horror park in the Dade City woods from $30.95 to $55.95 online. Monsters can even mark you to enter.",
    roast: "Scream A Geddon in Dade City is $30.95 to $55.95 online from 7:00 PM to midnight. Advance online tickets cost less than box office walk ups.",
    quips: [
      "Scream A Geddon in Dade City runs $30.95 to $55.95 online from 7:00 PM to midnight. Six intense attractions and a monster beer garden.",
      "The online price is the mercy. The walk up box office in the dark woods is the sequel nobody asked for.",
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
    eventId: null,
    name: "UNDead in the Water aboard American Victory Ship",
    where: "Tampa",
    city: "Tampa",
    vibe: "Haunted WWII Cargo Ship Deck & Dark Hold",
    scareLevel: "High Scare",
    costume: "pirate",
    animatronic: "nautical",
    priceLabel: "Price on the organizer page",
    price: { kind: "organizer" },
    timing: "Oct 29, Oct 30, and Oct 31",
    admissionNote: "Direct organizer ship boarding ticket",
    priceNote: "Verified event dates. Check the official organizer page for current boarding pass pricing.",
    ageNote: "Editorial rating: High scare haunted ship with steep stairs and tight corridors",
    shortlistReason: "Authentic 1945 WWII cargo ship haunt in downtown Tampa Channelside on Oct 29 to Oct 31.",
    tip: "Climb aboard a real 1945 WWII cargo ship in downtown Tampa's Channelside district for three nights of claustrophobic scares.",
    roast: "UNDead in the Water boards the American Victory Ship on Oct 29, Oct 30, and Oct 31. Check the official ship page for boarding passes.",
    quips: [
      "UNDead in the Water boards the American Victory Ship on Oct 29, Oct 30, and Oct 31. Tight steel corridors on the water in downtown Tampa.",
      "A real historic ship full of ghouls in Channelside. Tap Official Tickets to grab your boarding pass straight from the crew.",
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
    vibe: "Haunted Fairgrounds, Rides & Spooky Midway",
    scareLevel: "High Scare",
    costume: "maracas",
    animatronic: "cauldron",
    priceLabel: "Price on the organizer page",
    price: { kind: "organizer" },
    timing: "Oct 25, 29, 30, 31, and Nov 1 from 8:00 PM",
    admissionNote: "Direct organizer fairgrounds pass",
    priceNote: "Verified event nights. Check the official organizer page for admission and ride passes.",
    ageNote: "Editorial rating: Late night fairgrounds haunt starting at 8:00 PM",
    shortlistReason: "Sarasota Fairgrounds late night haunted house and midway running Oct 29 through Nov 1.",
    tip: "Gulf Coast late night haunt and carnival midway at the Sarasota Fairgrounds starting at 8:00 PM.",
    roast: "Sarasota Frightfest runs Oct 25, Oct 29, Oct 30, Oct 31, and Nov 1 from 8:00 PM at the fairgrounds. Check the organizer site before heading out.",
    quips: [
      "Sarasota Frightfest takes over the Sarasota Fairgrounds from 8:00 PM on Oct 25, 29, 30, 31, and Nov 1.",
      "Sarasota's late night haunt at the fairgrounds! Tap Official Tickets for the organizer's nightly pass info.",
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
    catalogVersion: HALLOWEEN_CATALOG_VERSION,
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
      thinking: "Boo is checking the verified vault",
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
  if (model.lines.length < 10) throw new Error("halloween haunt needs at least 10 lines from Boo");
  return model;
}
