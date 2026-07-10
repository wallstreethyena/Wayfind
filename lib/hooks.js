// v5.09 — Hero-card hook bank + rotation (the persuasion engine).
// Every home-screen hero card rotates through a bank of curiosity hooks so
// the page feels alive on every visit. THE ONE RULE: every hook must be TRUE
// and the tap must DELIVER — no fake scarcity, no invented counts, no
// bait-and-switch. Lines from the founder's bank that asserted specifics we
// cannot guarantee per-market (a 4.9★ rating, "12 minutes away") were
// adapted to stay honest everywhere; social-proof numbers only ever come
// from live data via tokens.
//
// Rotation: random without immediate repeat, remembered per card in
// localStorage, so a returning user never sees the same line twice in a row
// (variable reward — the reason to reopen). Instrumentation: the picker
// returns { text, variant } so impressions and taps can carry the exact
// variant to PostHog for promote-the-winner testing.
export const HOOK_BANK = {
  // HIDDEN GEMS
  gem: [
    "The places locals love and quietly hope you never find.",
    "Everyone's favorite spot that nobody posts about.",
    "Hiding in plain sight — go before it isn't a secret.",
    "Locals know. Tourists walk right past. Now you know too.",
    "The spot you'll swear you discovered first.",
    "Quietly incredible. Barely known. Not for long.",
    "The best places here don't advertise — they don't have to.",
    "What locals order when they don't want a crowd.",
    "Under the radar, over-delivering. Tap before the secret's out.",
    "The gems the algorithms miss and the regulars protect.",
  ],
  // WHERE TO EAT
  bestof: [
    "The meal you'll still be talking about tomorrow.",
    "Where “let's just grab something” becomes the best night this week.",
    "The plate that ruins other restaurants for you.",
    "Skip the guessing — this is where locals actually eat.",
    "The bite you'll plan your next visit around.",
    "Hungry now? Here's the answer, before you waste 20 minutes finding it.",
    "The meal that becomes the reason you come back.",
    "Where the food finally lives up to the reviews.",
    "Your next favorite restaurant is closer than you think.",
    "Good enough to cancel your other plans.",
  ],
  // FAMILY DAY OUT
  family: [
    "The kind of day the kids won't stop talking about.",
    "Where “I'm bored” becomes “can we go back?”",
    "The day out that tires them out — in the best way.",
    "Real fun for them, actually enjoyable for you.",
    "Their favorite memory of the summer is one tap away.",
    "Where the whole family agrees, for once.",
    "Big smiles, zero meltdowns — we found the spots.",
    "The outing they'll beg to repeat.",
    "Make today the one they remember.",
    "Worn-out kids, happy parents, one great day.",
  ],
  // CAN'T-MISS ATTRACTIONS
  entertainment: [
    "Turn a normal afternoon into the story you'll tell for years.",
    "The stops that make people jealous they weren't there.",
    "The can't-miss it'd be a crime to skip.",
    "Where “what should we do?” finally has an answer.",
    "The reason today won't feel like every other day.",
  ],
  // WHERE TO STAY
  stays: [
    "Wake up in the middle of everything you came for.",
    "The stay that makes the trip, not just the sleep.",
    "Where you'll actually want to spend the morning.",
    "Close to everything, better than the rest.",
    "The room worth coming back for.",
  ],
  // LIVE TONIGHT
  shows: [
    "The shows worth planning the whole night around.",
    "What's live tonight that you'll regret missing.",
    "Tonight only — then it's gone.",
    "The night a ticket turns into a memory.",
    "Don't find out tomorrow what you missed tonight.",
  ],
  // BIG FUN, SMALL SPEND
  budget: [
    "Nights you'll remember that your wallet won't.",
    "Big fun that goes easy on the bank account.",
    "Who says a great night has to cost one?",
    "Free, cheap, and secretly the best options in town.",
    "Proof the best things nearby are practically free.",
  ],
  // NIGHT OUT (used wherever a nightlife hero renders)
  nightlife: [
    "Where the night actually gets good.",
    "The spot people leave already planning to come back.",
    "Skip the dead bar — this is where tonight happens.",
    "The night you'll be retelling on Monday.",
    "Where locals go when they want the night to mean something.",
    "Don't waste a good night on a bad bar.",
    "The kind of night that doesn't need an occasion.",
    "Where “one drink” becomes the best story of the month.",
  ],
  // BEACH DAY
  beach: [
    "Sun, sand, and the spots the crowds haven't found yet.",
    "The beach the locals keep to themselves.",
    "Skip the packed sand — this one's still yours.",
    "Golden hour, no crowd, your spot.",
    "The beach day you'll wish you'd found sooner.",
    "Where the postcard photos actually come from.",
    "Quiet sand, warm water, zero regrets.",
    "The coast the guidebooks skipped and the locals didn't.",
  ],
  // LOCAL LEGENDS
  localfav: [
    "The spots people here name first — every time.",
    "The places that made this town worth talking about.",
    "If a local recommends one thing, it's this.",
    "The institutions locals are quietly proud of.",
    "Around for years for a reason. Find out why.",
  ],
  // BEST MOVE RIGHT NOW (dynamic — [temp] and [time] resolve from live data)
  moment: [
    "It's [temp]° and [time] — here's where to be.",
    "Right now, this second, this is your move.",
    "Perfect weather, perfect timing — don't waste it.",
    "The one place that fits this exact moment.",
    "A few free hours? Here's the play.",
    "Stop scrolling. This is the move.",
    "Made for right now: [temp]°, [time], one great idea.",
  ],
};

// Random without immediate repeat, remembered per card key across visits.
// ctx = { temp, time } fills the dynamic tokens; token lines are skipped when
// their live value is missing so a hook never renders "[temp]°" literally.
export function pickHook(key, ctx) {
  const bank = HOOK_BANK[key];
  if (!bank || !bank.length) return null;
  const usable = bank.filter((t) => (!/\[temp\]/.test(t) || (ctx && ctx.temp != null)) && (!/\[time\]/.test(t) || (ctx && ctx.time)));
  if (!usable.length) return null;
  let last = -1;
  try { last = (JSON.parse(localStorage.getItem("wf_hook_last") || "{}") || {})[key]; } catch (e) {}
  let i = Math.floor(Math.random() * usable.length);
  if (usable.length > 1 && bank.indexOf(usable[i]) === last) i = (i + 1) % usable.length;
  const variant = bank.indexOf(usable[i]);
  try { const m = JSON.parse(localStorage.getItem("wf_hook_last") || "{}") || {}; m[key] = variant; localStorage.setItem("wf_hook_last", JSON.stringify(m)); } catch (e) {}
  let text = usable[i];
  if (ctx) { text = text.replace(/\[temp\]/g, String(ctx.temp)).replace(/\[time\]/g, String(ctx.time || "")); }
  return { text, variant };
}
