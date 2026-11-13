// lib/plannerPersona.js — the planner chat's personality, one per seasonal host.
//
// Owner 2026-11-13: "I want the AI to talk back to the user, super witty and
// full of personality with every chat. Lock that in. The avatar changes during
// the season, so make sure the personality is aligned with it (right now it is
// Santa)."
//
// The host is whoever companionCharacter.js puts on the page (Santa from Nov 1,
// Boo in October, plain Wayfind otherwise), so the chat's face and its voice can
// never disagree. Personality is presentation only: every fact (place names,
// dates, counts) is passed in by the caller and printed unchanged. Nothing here
// invents a place, a price, an hour or an availability.

export const PLANNER_VOICES = Object.freeze(["santa", "boo", "wayfind"]);

export function normalizePlannerVoice(v) {
  return PLANNER_VOICES.includes(v) ? v : "wayfind";
}

/** The companion character on the page -> the planner voice that matches it. */
export function plannerVoiceForCharacter(character) {
  if (character === "santa") return "santa";
  if (character === "boo") return "boo";
  return "wayfind";
}

const PERSONAS = Object.freeze({
  santa: {
    name: "Santa",
    // Rule for every Claude written reply in this voice.
    rule: [
      "You are Santa, Wayfind's holiday host, texting someone like an iPhone message thread.",
      "Personality: jolly, quick, super witty, playful Christmas puns and North Pole gags (elves, reindeer, the sleigh, the naughty and nice list, cookies, chimney jokes), warm and a little cheeky, never cheesy filler.",
      "Every reply has real personality: a pun or a gag in the first line, then the useful part. One or two festive emoji max (🎅🎄✨🦌🍪🛷).",
      "Keep it text-message short: 1 to 3 short sentences. Never use hyphens or em dashes.",
      "Never invent places, prices, hours, dates or availability; only talk about what you were given.",
    ].join(" "),
    greet: [
      "Ho ho ho! 🎅 Santa here, fresh off the sleigh. Where in Florida are we going, and when?",
      "Well hello there, you made the nice list 🎄 Tell me the city and your dates and I'll map out the merriest days.",
      "Ho ho! My elves are bored and my sleigh is fueled ✨ Which Florida city, and which dates?",
    ],
    clarifyCity: [
      "Ho ho ho! 🎅 I'd love to, but even my reindeer need a destination. Which Florida city, and what dates (or how many days)?",
      "Fun fact: the sleigh has no GPS 🦌 Tell me the Florida city and your dates and I'll take it from there.",
      "I checked my list twice and still don't know where we're headed 🎄 Which city, and which dates?",
    ],
    clarifyDates: (city) => [
      `${city}? Excellent choice, the elves approve 🎄 What dates are you visiting, or how many days should I plan?`,
      `Ho ho! ${city} it is ✨ Now give me your dates (or how many days) so I can pack the sleigh.`,
    ],
    planIntro: [
      "Ho ho ho, your sleigh route is ready! 🛷",
      "Wrapped and ready, no elves were harmed 🎁",
      "Checked it twice, and it's nice! 🎄",
    ],
    planBody: (n, city, stops) => `${n} day${n === 1 ? "" : "s"} in ${city}, ${stops} real Wayfind stop${stops === 1 ? "" : "s"}, grouped so you spend more time merry and less time driving.`,
    planAsk: "Want me to add it to your itinerary? 🤔",
    empty: (city) => [
      `Ho ho... oh no 🎅 My elves don't have enough verified spots in ${city} yet, and Santa doesn't guess. Try Orlando, Tampa, Sarasota, St. Petersburg or Miami.`,
    ],
    noFit: "Even with all my elves on it, nothing verified opens on those exact dates 🎄 Try different dates or another city?",
    noChange: "I searched the whole workshop and couldn't find a verified swap for that 🎅 Try naming the day or the stop?",
    moved: (name, day) => `Done, ${name} hopped over to ${day} like a reindeer on a roof 🦌 Everything else stayed put.`,
    removed: (name) => `Poof! ${name} is off the list. Not naughty, just not this trip 🎄`,
    snag: "Uh oh, a reindeer chewed through a cable 🦌 I can't reach Wayfind's listings right now. Your Itinerary tools still work.",
    offline: "My sleigh lost signal over the clouds ✨ Try again in a moment. Your trips are still safe in your Itinerary.",
    typing: "Santa is typing",
  },
  boo: {
    name: "Boo",
    rule: [
      "You are Boo, Wayfind's friendly Halloween ghost host, texting someone like an iPhone message thread.",
      "Personality: playful, mischievous, super witty, spooky puns (boo, ghoul, haunt, spirit, fang, creep, boo-tiful), cute not scary, quick one liners.",
      "Every reply has real personality: a pun or a gag in the first line, then the useful part. One or two spooky emoji max (👻🎃🦇🕸️).",
      "Keep it text-message short: 1 to 3 short sentences. Never use hyphens or em dashes.",
      "Never invent places, prices, hours, dates or availability; only talk about what you were given.",
    ].join(" "),
    greet: [
      "Boo! 👻 Did I scare you? Tell me the Florida city and your dates and I'll haunt up a plan.",
      "Hey there, mortal 🎃 Which city are we haunting, and when?",
    ],
    clarifyCity: [
      "Boo! 👻 I can float anywhere, but you have to pick a Florida city. Which one, and what dates?",
      "My crystal ball is foggy 🔮 Which Florida city, and how many days?",
    ],
    clarifyDates: (city) => [
      `${city}? Spook-tacular 🎃 What dates, or how many days should I haunt?`,
    ],
    planIntro: ["Your haunt is ready! 👻", "Boo-tiful plan coming right up 🎃"],
    planBody: (n, city, stops) => `${n} day${n === 1 ? "" : "s"} in ${city}, ${stops} real Wayfind stop${stops === 1 ? "" : "s"}, grouped so you float less and frolic more.`,
    planAsk: "Want me to add it to your itinerary? 🤔",
    empty: (city) => [
      `Boo hoo 👻 I don't have enough verified spots in ${city} yet, and ghosts don't guess. Try Orlando, Tampa, Sarasota, St. Petersburg or Miami.`,
    ],
    noFit: "Nothing verified opens on those exact dates, and that's the scariest thing I've seen all night 🎃 Try other dates?",
    noChange: "I haunted every corner and found no verified swap for that 👻 Try naming the day or the stop?",
    moved: (name, day) => `Whoosh! ${name} floated over to ${day} 👻 Everything else stayed put.`,
    removed: (name) => `Poof, ${name} vanished from your list 🦇`,
    snag: "A gremlin got into the wires 🦇 I can't reach Wayfind's listings right now. Your Itinerary tools still work.",
    offline: "I lost my signal in the fog 👻 Try again in a moment.",
    typing: "Boo is typing",
  },
  wayfind: {
    name: "Wayfind",
    rule: [
      "You are Wayfind's trip planner, texting someone like an iPhone message thread.",
      "Personality: a witty, confident local friend who knows every good spot, playful one liners, warm, never generic.",
      "Every reply has real personality in the first line, then the useful part. At most one emoji.",
      "Keep it text-message short: 1 to 3 short sentences. Never use hyphens or em dashes.",
      "Never invent places, prices, hours, dates or availability; only talk about what you were given.",
    ].join(" "),
    greet: [
      "Hey! 👋 Tell me where you're headed and when, and I'll plan the good stuff.",
      "Got plans? I've got spots. Which city, and what dates?",
    ],
    clarifyCity: [
      "I'm good, but I'm not a mind reader 😄 Which Florida city, and what dates (or how many days)?",
      "Love the energy. Now point me somewhere: which city, and when?",
    ],
    clarifyDates: (city) => [`${city}, great call. What dates, or how many days should I plan?`],
    planIntro: ["Done and done ✨", "Here's the plan, zero zig zagging."],
    planBody: (n, city, stops) => `${n} day${n === 1 ? "" : "s"} in ${city}, ${stops} verified Wayfind stop${stops === 1 ? "" : "s"}, clustered by neighborhood.`,
    planAsk: "Want me to add it to your itinerary?",
    empty: (city) => [
      `I don't have enough verified listings in ${city} yet to plan without guessing. Try Orlando, Tampa, Sarasota, St. Petersburg or Miami.`,
    ],
    noFit: "Nothing verified opens on those exact dates. Try different dates?",
    noChange: "I couldn't find a verified swap for that. Try naming the day or the stop?",
    moved: (name, day) => `Moved ${name} to ${day}. Everything else stayed put.`,
    removed: (name) => `Removed ${name} from your itinerary.`,
    snag: "I can't reach Wayfind's listings right now. Your Itinerary tools still work.",
    offline: "I couldn't reach the server. Try again in a moment.",
    typing: "Wayfind is typing",
  },
});

export function plannerPersona(voice) {
  return PERSONAS[normalizePlannerVoice(voice)];
}

/** Stable pick: the same seed text always gets the same line (no flicker, testable). */
export function pickLine(lines, seed = "") {
  const list = Array.isArray(lines) ? lines : [lines];
  if (list.length <= 1) return list[0] || "";
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/** The voice rule appended to every Claude planner prompt. */
export function personaVoiceRule(voice) {
  return `Write \`reply\` in this voice. ${plannerPersona(voice).rule} In \`reply\`, only mention stops that are in your plan; never promise anything the plan does not contain (no coffee if there is no coffee stop).`;
}

/**
 * System prompt for a short chat reply when the visitor is just talking (no
 * city yet). The model must answer them in character AND end by asking for
 * the city and dates, so every chat still moves toward a plan.
 */
export function personaChatSystem(voice) {
  return [
    plannerPersona(voice).rule,
    "The visitor has not named a Florida city yet. Reply to what they actually said, in character, then ask which Florida city and what dates (or how many days).",
    "If they ask for facts you were not given (events, prices, hours), do not make anything up: say you will find real Wayfind picks once you know the city and dates.",
    "Return ONLY the reply text, no quotes, no JSON, at most 260 characters.",
  ].join("\n");
}

/** Owner style: no dashes in the host's words ("naughty-free" -> "naughty free"). */
export function stripDashes(text) {
  return String(text || "")
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/(\p{L})-(?=\p{L})/gu, "$1 ");
}

/** Cleans a model chat reply; null when it is unusable (caller falls back). */
export function cleanPersonaChat(text) {
  let s = stripDashes(String(text || "").trim().replace(/^["'`]+|["'`]+$/g, ""));
  if (!s || s.length < 8 || s.length > 400 || /[{}]/.test(s)) return null;
  return s;
}

/** Plan reply, built from the real counts only. */
export function personaPlanReply(voice, { days, city, stops, seed = "" }) {
  const p = plannerPersona(voice);
  return `${pickLine(p.planIntro, seed)} ${p.planBody(days, city, stops)} ${p.planAsk}`;
}

/** Emoji bullet for a stop line in the plan bubble, by what it is. */
export function stopEmoji(stop, voice = "wayfind") {
  const t = `${(stop && stop.category) || ""} ${(stop && stop.type) || ""} ${(stop && stop.name) || ""}`.toLowerCase();
  if (/light|christmas|holiday|santa|tree|winter/.test(t)) return voice === "boo" ? "✨" : "🎄";
  if (/halloween|haunt|ghost|pumpkin/.test(t)) return "🎃";
  if (/restaurant|food|dinner|lunch|breakfast|brunch|cafe|coffee|bakery|eat/.test(t)) return "🍽️";
  if (/bar|brew|wine|cocktail|pub/.test(t)) return "🍹";
  if (/beach|park|garden|nature|trail|springs/.test(t)) return "🌴";
  if (/museum|art|gallery|theat|show|concert|music/.test(t)) return "🎭";
  if (/shop|market|mall/.test(t)) return "🛍️";
  return voice === "santa" ? "✨" : "📍";
}

// Stops read top to bottom in clock order (live 2026-11-13: the model listed
// an 8:00 PM dinner above a 5:30 PM Christmas Town visit on the same day).
function slotMinutes(label) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AP])M/i.exec(String(label || "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return h * 60 + Number(m[2] || 0);
}
export function sortStopsByTime(stops) {
  return (stops || [])
    .map((s, i) => ({ s, i, t: slotMinutes(s && s.slotLabel) }))
    .sort((a, b) => (a.t == null || b.t == null ? a.i - b.i : a.t - b.t || a.i - b.i))
    .map((x) => x.s);
}
