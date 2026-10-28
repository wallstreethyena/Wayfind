// Boo's reaction lines: what he says when the visitor actually does something
// (scrolls fast, hits the bottom, hovers a ticket, saves a place, goes quiet,
// comes back to the tab, lands on a new page). Plain module on purpose: the
// companion imports it and scripts/check-boo-companion.mjs calls it directly.
// Rules: Halloween witty, at most 12 words, no dashes anywhere.

export const REACT_LINES = {
  scrollFast: [
    "Whoa, slow down! I get motion sick.",
    "Easy, speed demon. My sheet is flapping.",
    "Zoom zoom! Wait for me!",
  ],
  bottom: [
    "You found the bottom. Brave little mortal.",
    "End of the page. Spooky, right?",
    "Nothing down here but me and the footer.",
  ],
  backTop: [
    "Back to the top? A second look is smart.",
    "Round two! I love a careful planner.",
  ],
  hoverTicket: [
    "Ooh, tickets! Good taste, mortal.",
    "Those sell out. Just saying.",
    "Click it. Future you says thanks.",
  ],
  hoverPlace: [
    "That one? Bold choice. I approve.",
    "Ooh, peek inside. I already did.",
    "Good vibes on that one. Ghost verified.",
  ],
  peekTicket: [
    "Psst. These tickets glow for a reason.",
    "Tap the tickets. I made them sparkle.",
  ],
  ticket: [
    "Great pick! Tell them Boo sent you.",
    "Screams booked! Bring a friend to hold.",
    "Yes! Your weekend just got spooky.",
  ],
  save: [
    "Saved! I will haunt it for you.",
    "Into the vault it goes. Spooky smart.",
  ],
  like: [
    "A like! My heart would race, if I had one.",
    "Love that. Me too, honestly.",
  ],
  nope: [
    "Fair. Not every haunt is your haunt.",
    "Noted. I will never speak of it again.",
  ],
  share: [
    "Share the scare! Group screams are the best screams.",
    "Sending it to friends? Ghost approved.",
  ],
  search: [
    "Ooh, what are we hunting?",
    "Type away. I will float along.",
    "Searching? I know every cold spot.",
  ],
  idle: [
    "Still there? Blink twice if spooked.",
    "Hello? Did I scare you off?",
    "I will just float here. Dramatically.",
  ],
  welcomeBack: [
    "You came back! I knew you would.",
    "There you are! I kept your spot cold.",
  ],
  copy: [
    "Copying notes? I will allow it.",
    "Taking notes? Teacher's pet. Love it.",
  ],
  cursor: [
    "Psst. Click me, I do not bite.",
    "Got me! Click and we can chat.",
  ],
  returning: [
    "You again! I saved your favorite cold spot.",
    "Welcome back, mortal. I missed you. Ghostly.",
  ],
};

// Extra timed gags by the visitor's own clock.
export const TIME_LINES = {
  late: ["Up past midnight? Prime haunting hours.", "Late night plans? Now we are talking."],
  morning: ["Morning! Ghosts need coffee too.", "Early riser? Plan tonight's fright now."],
  evening: ["Sun is down. My shift just started.", "Golden hour is over. Ghost hour begins."],
};

// First thing he says on a new page (after the first page). Longest prefix wins.
export const ROUTE_LINES = [
  ["/", "Home again! What are we haunting next?"],
  ["/halloween", "Home sweet haunt! Tickets right this way."],
  ["/events", "Events! My favorite word after boo."],
  ["/map", "A map! I usually just float wherever."],
  ["/favorites", "Your favorites. I only haunt them a little."],
  ["/coupons", "Coupons? Smart. Ghosts love a good deal."],
  ["/itinerary", "Planning ahead? I love an organized mortal."],
  ["/guides", "Guides by people who went. I floated."],
  ["/p/", "Good pick. Peek at the photos, I will wait."],
  ["/restaurants", "Food first, frights later. Smart order."],
  ["/fall-in-florida", "Fall in Florida. So, slightly less hot. Love it."],
  ["/christmas", "Christmas already? I am still in my costume."],
  ["/creators", "Creators take photos. I just photobomb them."],
  ["/trending", "Trending? I haunted it before it was cool."],
  ["/things-to-do", "So much to do. So little afterlife."],
];

export function routeLine(path) {
  const p = String(path || "/");
  let best = null, len = -1;
  for (const [pre, line] of ROUTE_LINES) {
    const hit = pre === "/" ? p === "/" : p.startsWith(pre);
    if (hit && pre.length > len) { best = line; len = pre.length; }
  }
  return best;
}

export function timeLines(hour) {
  const h = Number(hour);
  if (!isFinite(h)) return [];
  if (h >= 23 || h < 4) return TIME_LINES.late;
  if (h >= 5 && h < 10) return TIME_LINES.morning;
  if (h >= 19) return TIME_LINES.evening;
  return [];
}

// A line for a reaction kind that has not been said yet this page, else null.
export function pickLine(kind, used, rnd = Math.random) {
  const pool = (REACT_LINES[kind] || []).filter((t) => !used || !used.has(t));
  if (!pool.length) return null;
  const t = pool[Math.floor(rnd() * pool.length) % pool.length];
  if (used) used.add(t);
  return t;
}
