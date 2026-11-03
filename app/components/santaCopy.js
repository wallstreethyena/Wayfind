// Everything Santa says. Plain module on purpose: BooCompanion imports it and
// scripts/test-santa-companion.mjs calls it directly.
// Rules: Christmas witty, plain words, no dashes of any kind, no Halloween
// wording, at most 12 words a line, options rather than one pick, and tickets
// are the point. Boo's own lines live in BooCompanion, booOpeners and
// booReactions and are not touched by this file.
import { metroFromCenter } from "./booOpeners.js";

export const SANTA = {
  name: "Santa",
  subtitle: "Wayfind's Christmas guide",
  greeting: "Ho ho hello! Looking for lights, a cozy night, or something free? Ask me anything.",
  ariaChat: "Chat with Santa",
  ariaInput: "Your question for Santa",
  hide: "Hide Santa",
  placeholder: "Ask Santa anything",
  pending: "Santa is checking his list...",
  fallbackLine: "My sleigh hit a snowdrift. The full Christmas list is one tap away.",
  fallbackLink: "See the Christmas list",
  wrapLink: "Open the full Christmas list",
  searchPlaceholder: "Search a light show or city...",
  jumped: "! Sleighed you over. Your picks are loading.",
};

// Off the Christmas page Santa finds anything on Wayfind (/api/santa).
export const SANTA_FINDER_CHIPS = ["Christmas lights near me?", "Brunch this weekend?", "Things to do with kids?"];
export const SANTA_CHIPS = ["Best Christmas lights near Tampa?", "Kid friendly this weekend?", "Free holiday events?"];

export const SANTA_GAGS = [
  "Ho ho hold on. These lights sell out fast.",
  "I checked this list twice. Every date is real.",
  "Naughty or nice, you still need a ticket.",
  "My sleigh skips traffic. Your car will not.",
  "Cocoa first, lights second. North Pole law.",
  "Elves did the research. I take the credit.",
  "Florida Christmas: shorts and a sweater. Trust me.",
  "Tap me. I am jolly, not ticklish. Mostly.",
  "Sleigh bells are optional. Tickets are not.",
  "Tell me your budget. Elves are cheap too.",
  "A night out beats another ugly sweater party.",
  "Reindeer on strike till the 24th. You drive.",
  "Up all night checking dates. Beard did not survive.",
  "Snow in Florida? I bring my own. Fog machine.",
  "Rudolph wanted a brighter nose. Light show it is.",
  "I know every chimney in Florida. Most are fake.",
  "Mrs. Claus picked three of these. Not saying which.",
  "Yule be sorry if you skip the boat parades.",
  "My elves rated the cocoa. Marshmallows broke the tie.",
  "Dasher found a drive thru light show. Obsessed.",
  "Big guy tip: weeknights have shorter lines.",
  "Keep scrolling. I hid the good stuff everywhere.",
];

export const SANTA_ZAP_LINES = [
  "Zapped! Still jolly though.",
  "That bulb is on the naughty list.",
  "Ho ho OW. Who wired these?",
  "I lit up like a tree. Fitting.",
  "Elves said do not touch. Elves were right.",
  "My beard is standing on end.",
];

export const SANTA_REACT_LINES = {
  scrollFast: [
    "Whoa, slow down! My sleigh gets dizzy.",
    "Easy there. My bells are jingling.",
    "Zoom zoom! Wait for me!",
  ],
  bottom: [
    "You found the bottom. Nice scrolling.",
    "End of the page. Time for cookies?",
    "Nothing down here but me and the footer.",
  ],
  backTop: [
    "Back to the top? A second look is smart.",
    "Round two! I love a careful planner.",
  ],
  hoverTicket: [
    "Ooh, tickets! Good taste.",
    "Those sell out. Just saying.",
    "Click it. Future you says thanks.",
  ],
  hoverPlace: [
    "That one? Merry choice. I approve.",
    "Ooh, peek inside. I already did.",
    "Good vibes on that one. Santa verified.",
  ],
  peekTicket: [
    "Psst. These tickets glow for a reason.",
    "Tap the tickets. I made them sparkle.",
  ],
  ticket: [
    "Great pick! Tell them Santa sent you.",
    "Tickets booked! Bring a friend for cocoa.",
    "Yes! Your weekend just got festive.",
  ],
  save: [
    "Saved! I will keep an eye on it.",
    "On the list it goes. Checked twice.",
  ],
  like: [
    "A like! My heart is two sizes bigger.",
    "Love that. Me too, honestly.",
  ],
  nope: [
    "Fair. Not every light show is your show.",
    "Noted. Back on the naughty shelf.",
  ],
  share: [
    "Share the cheer! Group trips are the best trips.",
    "Sending it to friends? Santa approved.",
  ],
  search: [
    "Ooh, what are we hunting?",
    "Type away. I will jingle along.",
    "Searching? I know every twinkle spot.",
  ],
  idle: [
    "Still there? Blink twice if you need cocoa.",
    "Hello? Did the elves lose you?",
    "I will just wait here. Jolly, as usual.",
  ],
  welcomeBack: [
    "You came back! I knew you would.",
    "There you are! I kept your seat warm.",
  ],
  copy: [
    "Copying notes? I will allow it.",
    "Making a list? Now that is my job.",
  ],
  cursor: [
    "Psst. Click me, I am friendly.",
    "Got me! Click and we can chat.",
  ],
  returning: [
    "You again! I saved you the good cookies.",
    "Welcome back! I missed you. Merrily.",
  ],
};

export const SANTA_TIME_LINES = {
  late: ["Up past midnight? Very elf of you.", "Late night list checking? Respect."],
  morning: ["Morning! Cocoa first, plans second.", "Early riser? Plan tonight's lights now."],
  evening: ["Sun is down. Lights look best now.", "Evening! Twinkle hour has started."],
};

export function santaTimeLines(hour) {
  const h = Number(hour);
  if (!isFinite(h)) return [];
  if (h >= 23 || h < 4) return SANTA_TIME_LINES.late;
  if (h >= 5 && h < 10) return SANTA_TIME_LINES.morning;
  if (h >= 19) return SANTA_TIME_LINES.evening;
  return [];
}

// First thing he says on a new page (after the first page). Longest prefix wins.
export const SANTA_ROUTE_LINES = [
  ["/christmas-in-florida", "Home sweet North Pole! Lights and tickets this way."],
];

export function santaRouteLine(path) {
  const p = String(path || "/");
  let best = null, len = -1;
  for (const [pre, line] of SANTA_ROUTE_LINES) {
    if (p.startsWith(pre) && pre.length > len) { best = line; len = pre.length; }
  }
  return best;
}

// Arrival lines, same shape as booOpeners: one per served metro, plus a few
// generic ones for anyone whose stored center is not near a metro.
export const SANTA_OPENERS_CITY = {
  tampa: "Tampa! Even Santa grabs a Cuban sandwich for the sleigh.",
  stpete: "St Pete? Sunshine City. My suit has never been this warm.",
  sarasota: "Sarasota? Fancy. Even my reindeer wear boat shoes.",
  bradenton: "Bradenton! Palm trees, string lights, zero snow shovels needed.",
  orlando: "Orlando! Mouse ears by day, twinkle lights by night.",
  miami: "Miami? Christmas with a cafecito. Santa approves.",
  fortlauderdale: "Fort Lauderdale! Boat parades and one very sunburnt Santa. Hi.",
  clearwater: "Clearwater! Sugar sand and sparkly sunsets. Ho ho hello.",
  lakeland: "Lakeland! Swan city. Even the swans get string lights.",
  naples: "Naples? Posh. Does my sleigh get valet?",
  fortmyers: "Fort Myers! Edison made the bulb. I just hang the lights.",
  jacksonville: "Jacksonville! Big river, bigger light shows. Ho ho hello.",
};

export const SANTA_OPENERS_GENERIC = [
  "Ho ho hello! What are we celebrating? Ask me anything.",
  "I am Santa, your Christmas guide. I check lists fast.",
  "Welcome! Christmas season is short. Plans should not be.",
  "Florida has lights, I have opinions. Want options?",
  "Cocoa weather in Florida? Almost. Let us plan anyway.",
  "New here? Perfect. I love fresh faces. And cookies.",
];

export function santaOpenerFor(raw, seed = 0) {
  const key = metroFromCenter(raw);
  if (key && SANTA_OPENERS_CITY[key]) return SANTA_OPENERS_CITY[key];
  return SANTA_OPENERS_GENERIC[Math.abs(Math.floor(seed)) % SANTA_OPENERS_GENERIC.length];
}
