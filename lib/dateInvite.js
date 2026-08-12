// lib/dateInvite.js — "help them say yes" (v7.27).
//
// Owner: when someone shares a place, ask whether they are inviting somebody
// out. If they are, the text they send should not answer the question — it
// should make the other person open it — and the link lands on a page of ours
// that asks for the yes and then builds the date together.
//
// The flow is the owner's, from his reference frames:
//   1. "Will you go out with me?"  YES / No — and every time they press No,
//      the YES button gets BIGGER and the plea under it escalates.
//   2. "YAY! I'm so glad u said yes."
//   3. "What would you like to do?" — six activities.
//   4. "Pick a date."
//   5. "It's a date." — the plan, and then the ranked places for it.
//
// Step 3 is the part that pays for itself. The recipient chooses the activity,
// which means by the time Wayfind shows them anywhere, two people have already
// agreed on a night and a kind of evening — the highest-intent moment on the
// site. The ranking (and the booking rungs under it) belongs THERE, after the
// yes, never before it.
//
// STATELESS ON PURPOSE. The whole invite rides in the URL as base64url JSON,
// exactly like the coupon share (?d=) already does:
//   • no account, no login, no invite table, no expiry job;
//   • nothing about either person is stored on a server we would then have to
//     protect — the only copy of "Gabe asked Sam out" is in their own text
//     thread, which is where it belongs;
//   • a yes needs no notification infrastructure. They tap Yes and we hand them
//     a written reply for the thread the invite arrived in. They are already in
//     that conversation; sending them somewhere else to answer loses the yes.
//
// JSX-free and dependency-free: the edge OG route, the page and the guard all
// import this same file.

const MAX = { place: 60, city: 32, when: 28, from: 24, to: 24, note: 90, reply: 120 };

// ══ ONE LINK PER PERSON ═════════════════════════════════════════════════════
// Owner: "when the user confirms the date I don't know who confirmed it if I
// sent it to multiple people."
//
// There is a worse version of that problem underneath the one he noticed. With
// a single link sent to three people, all three can open it, all three can press
// YES, and all three now believe they have a date on Friday. That is not an
// analytics gap, it is an embarrassment we would have built on purpose.
//
// So every share mints its own key. Two invites to the same place on the same
// night are different URLs, which means the sender can tell them apart, and it
// means an accepted invite belongs to exactly one person.
//
// The alphabet drops the characters people misread when a link is read aloud or
// retyped: i, l, o, 0, 1.
const KEY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newInviteKey(rand) {
  const r = typeof rand === "function" ? rand : Math.random;
  let out = "";
  for (let i = 0; i < 7; i++) out += KEY_ALPHABET[Math.floor(r() * KEY_ALPHABET.length)];
  return out;
}
const cut = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

function b64urlEncode(str) {
  const b = btoa(unescape(encodeURIComponent(str)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(raw) {
  const s = String(raw).replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(s + "===".slice((s.length + 3) % 4))));
}

// ══ WHAT THEY CAN CHOOSE ════════════════════════════════════════════════════
// Six, because the reference has six and because a grid of six is the largest
// set a person reads as "pick one" rather than "read this list". Each one maps
// to a Wayfind surface that already exists and already ranks — a cute button
// that lands on an empty page is worse than no button.
// EVERY ONE OF THESE IS A PAGE THAT EXISTS AND RANKS. Owner: "make sure we're
// offering things we actually have at gowayfind."
//
// The first pass had "Movie night" and "Picnic" because they were on the
// reference art. Wayfind ranks neither: movie night pointed at /tonight, which
// is bars and late kitchens, and picnic pointed at /nearby, which is everything.
// Two people who have just agreed on a night, tap "Movie night" and land on a
// cocktail list have been lied to by a cute button — the worst possible first
// impression to make on somebody else's date.
//
// `link` is written per activity rather than glued together from the label:
// "See the best movie night in Tampa" is not a sentence, and the last line of a
// page this warm is the worst place on the site to sound like a template.
// NO TIME OF DAY IN A LABEL. Owner, 2026-08-12: "why are you including the time
// of the day??" — and he is right twice over. The recipient picks WHAT and then
// picks a NIGHT, so "Drinks tonight" followed by a calendar landing on Saturday
// contradicts itself on the same screen, and the reply that goes back to the
// sender read "Yes! Drinks tonight on Saturday." The route still points at
// /tonight; only the word the two of them read is time-free.
export const ACTIVITIES = [
  { id: "dinner",   label: "Dinner",          path: "/date-night",      link: "See where to eat" },
  { id: "tonight",  label: "Drinks",          path: "/tonight",         link: "See what's open" },
  { id: "bite",     label: "Something quick", path: "/quick-bite",      link: "Find a quick bite" },
  { id: "hidden",   label: "Somewhere new",   path: "/hidden-gems",     link: "See the hidden gems" },
  { id: "drive",    label: "A little trip",   path: "/worth-the-drive", link: "See what's worth the drive" },
  { id: "surprise", label: "Surprise me",     path: "/best-of",         link: "See the best of" },
];

// ══ WHAT KIND OF PLACE DID THEY SUGGEST? ════════════════════════════════════
// Owner, looking at a real invite: "Drinks tonight and the place card is a
// fucking breakfast place."
//
// He is right and it was worse than a cosmetic mismatch. The sender picked a
// place, the recipient picked a KIND of evening, and the two were never
// reconciled — so the final card could confidently pair "Drinks tonight" with
// Keke's Breakfast Cafe and call it a plan. Two people would have shown up to a
// closed cafe at 9pm holding a screenshot from us.
//
// The place is classified at share time into the same six-word vocabulary the
// recipient chooses from, and it rides in the payload. Then two things follow:
// the matching option is shown FIRST and marked as the sender's idea, and the
// place is only printed on the final card when the plan still fits it.
//
// Classification is deliberately coarse and name-first. The share sites carry
// wildly different place shapes — some have Google type arrays, some have almost
// nothing — and a name is the one field that is always there. "Cafe" in a name
// is a stronger signal about what a place is FOR than a types array that lists
// both `restaurant` and `bar`.
// A PLACE CAN BE MORE THAN ONE THING, and the first pass could not say so. It
// returned a single winner, so "O'Leary's Tiki Bar & Grill" became drinks-only
// and dinner there would have been treated as a clash — and worse, "Perq Coffee
// Bar" came back as DRINKS TONIGHT, because the bar rule happened to run before
// the cafe rule. An audit over 735 real place names from the repo found that;
// seven names I picked myself never would have.
//
// So every rule that matches contributes, and the fit check accepts any of them.
// Order still matters for the LABEL and for which option leads the grid — most
// specific first.
const KIND_RULES = [
  ["bite",    /\b(caf[eé]s?|coffee|espresso|bakery|bakeries|bagels?|donuts?|doughnuts?|deli|breakfast|brunch|diner|creamery|ice cream|gelato|juice|smoothie|taqueria|pizzeria|sandwich(es)?|sweets)\b/i],
  ["tonight", /\b(bars?|pubs?|tavern|lounge|cocktails?|brewery|brewing|taproom|speakeasy|nightclub|night club|distillery|beer|wine)\b/i],
  ["dinner",  /\b(restaurants?|steak ?house|grill(e|house)?|kitchen|bistro|trattoria|osteria|ristorante|sushi|seafood|chophouse|supper|dining)\b/i],
  ["hidden",  /\b(museums?|galler(y|ies)|gardens?|parks?|preserve|trails?|zoo|aquarium|theat(er|re)|observatory|historic|springs?|island|sanctuary|lighthouse)\b/i],
];
const TYPE_RULES = [
  ["bite",    /\b(cafe|coffee_shop|bakery|breakfast_restaurant|brunch_restaurant|ice_cream_shop|sandwich_shop|donut_shop|juice_shop|fast_food|meal_takeaway)\b/i],
  ["tonight", /\b(bar|night_club|brewery|liquor_store|wine_bar|pub)\b/i],
  ["dinner",  /\b(restaurant|fine_dining|steak_house|seafood_restaurant|italian_restaurant|sushi_restaurant|meal_delivery)\b/i],
  ["hidden",  /\b(museum|art_gallery|park|tourist_attraction|zoo|aquarium|garden|hiking_area|beach|national_park)\b/i],
];

/** EVERY identity a place has, most specific first. Empty when we cannot tell. */
export function kindsForPlace(place) {
  const p = place || {};
  const name = cut(typeof p === "string" ? p : (p.name || p.title || ""), 80);
  const out = [];
  // NAME FIRST. A place called "Keke's Breakfast Cafe" is a breakfast place
  // whatever Google's type array says, and half the callers have no type array.
  for (const [id, rx] of KIND_RULES) if (rx.test(name) && out.indexOf(id) < 0) out.push(id);
  if (out.length) return out.slice(0, 3);
  const types = []
    .concat(Array.isArray(p.types) ? p.types : [])
    .concat([p.type, p.primaryType, p.primary_type, p.category, p.primaryCategory])
    .filter(Boolean).join(" ");
  if (types) for (const [id, rx] of TYPE_RULES) if (rx.test(types) && out.indexOf(id) < 0) out.push(id);
  return out.slice(0, 3);
}

/** The single best identity — used to label and to lead the grid. */
export function activityForPlace(place) {
  const k = kindsForPlace(place);
  return k.length ? k[0] : "";
}

/**
 * EVERY identity, in the shape the payload wants.
 *
 * The share buttons all called activityForPlace() and put its ONE id in the
 * payload, which quietly re-opened the bug the multi-identity classifier was
 * written to close. kindsForPlace("O'Leary's Tiki Bar & Grill") is
 * ["tonight","dinner"]; the payload carried ["tonight"]; the recipient picked
 * Dinner; planFitsPlace said no; and the final card told two people
 * "not O'Leary's then" about a place that serves dinner. Measured across the
 * repo's own place names: 27 of 27 dual-identity places lost an identity on the
 * production path.
 *
 * The audit that gates the build could not see it — it called
 * encodeInvite({place}) with no kind, so it exercised the classifier directly
 * and never the path the app actually takes. Correct about the unit, silent
 * about the pipeline.
 */
export function placeKinds(place) {
  return kindsForPlace(place).join(",");
}

/**
 * Does the plan they built still fit the place the sender suggested?
 *
 * Unknown is treated as COMPATIBLE. When we could not classify the place we do
 * not know that it clashes, and silently deleting somebody's suggestion because
 * our regex did not recognise "Ulele" would be a worse failure than showing it.
 */
export function planFitsPlace(inv, activity) {
  if (!inv || !activity) return true;
  // THE PAYLOAD IS AN OPTIMISATION, NOT THE SOURCE OF TRUTH.
  //
  // Owner, on a live invite, after this was supposedly fixed: "Keke is being
  // offered for dinner out." He was right, and the reason is the rule directly
  // below this one. Kinds are baked in at share time, so every link created
  // BEFORE that existed carries none — and "no kinds" meant "nothing to clash
  // with", so a breakfast cafe sailed under "Dinner out" exactly as before.
  // Any share path that forgets to pass the place object would do the same.
  //
  // The place NAME is always in the payload. Classify from it when the payload
  // says nothing, and every old link heals itself and every future caller is
  // safe by default. "Unknown" now means only what it should: the name genuinely
  // tells us nothing.
  const carried = (inv.kinds && inv.kinds.length) ? inv.kinds : (inv.kind ? [inv.kind] : []);
  const kinds = carried.length ? carried : kindsForPlace({ name: inv.place });
  if (!kinds.length) return true;
  if (kinds.indexOf(activity) >= 0) return true;
  // "Surprise me" is an explicit request to be taken anywhere — it fits anything.
  if (activity === "surprise") return true;
  return false;
}

/** What we believe the sender's place is, however the invite reached us. */
export function inviteKinds(inv) {
  if (!inv) return [];
  const carried = (inv.kinds && inv.kinds.length) ? inv.kinds : (inv.kind ? [inv.kind] : []);
  return carried.length ? carried : kindsForPlace({ name: inv.place });
}

/** The last line on the page, written so it reads as help rather than an ad. */
export function activityLinkLabel(id, city) {
  const a = activityFor(id);
  const base = a ? a.link : "See the best of";
  const c = cut(city, MAX.city);
  if (!c) return base === "See the best of" ? "See the best places near you" : base + " near you";
  return base + " in " + c;
}
export function activityFor(id) {
  const k = cut(id, 12).toLowerCase();
  return ACTIVITIES.find((a) => a.id === k) || null;
}

// ══ THE PLEAS ═══════════════════════════════════════════════════════════════
// Owner's ladder, in his words. It has to run out rather than loop: a taunt
// that repeats forever stops being a joke and starts being a wall, and the No
// button must stay pressable at the end so the answer is still really theirs.
export const PLEAS = [
  "Don't do this",
  "Babe please :((",
  "Better say yes!",
  "Heart broken :(",
  "Okay, last chance…",
];
// Owner: "the little character gets sadder and sadder and does something unique
// every time the user says no." One rung per press, each a different DRAWING
// with its own motion (app/ask/pixel.js), and the last rung HOLDS — a character
// that escalates forever stops being sweet and starts being manipulative.
export const MOOD_LADDER = ["hopeful", "worried", "teary", "crying", "heartbroken", "curled"];
export function moodAt(noCount) {
  const n = Math.max(0, Math.floor(Number(noCount) || 0));
  return MOOD_LADDER[Math.min(n, MOOD_LADDER.length - 1)];
}

export function pleaAt(noCount) {
  const i = Math.max(0, Math.floor(Number(noCount) || 0) - 1);
  return i < PLEAS.length ? PLEAS[i] : PLEAS[PLEAS.length - 1];
}

// Every No makes YES bigger and No smaller. Both are clamped: unbounded growth
// pushes the button off a phone screen, and a No that shrinks to nothing has
// quietly taken the answer away from them.
export const SCALE = { yesMin: 1, yesMax: 2.2, noMin: 0.55, step: 0.24, noStep: 0.09 };
export function yesScale(noCount) {
  const n = Math.max(0, Math.floor(Number(noCount) || 0));
  return Math.min(SCALE.yesMax, SCALE.yesMin + n * SCALE.step);
}
export function noScale(noCount) {
  const n = Math.max(0, Math.floor(Number(noCount) || 0));
  return Math.max(SCALE.noMin, 1 - n * SCALE.noStep);
}

// ══ PACKING ═════════════════════════════════════════════════════════════════
/** Pack an invite. Returns "" with no place — a link with nothing to reveal is
 *  worse than no link at all. */
export function encodeInvite(input) {
  const i = input || {};
  const place = cut(i.place, MAX.place);
  if (!place) return "";
  const payload = { p: place };
  const city = cut(i.city, MAX.city); if (city) payload.c = city;
  const when = cut(i.when, MAX.when); if (when) payload.w = when;
  const from = cut(i.from, MAX.from); if (from) payload.f = from;
  // WHO IT IS FOR. Optional, and the flow works without it — but when it is
  // there the page opens with their name on it, which is the difference between
  // a link and an invitation.
  const to = cut(i.to, MAX.to); if (to) payload.t = to;
  // What KIND of place it is, decided at share time where the full place object
  // still exists. The /ask page only ever receives a name.
  const kinds = i.kind
    ? String(i.kind).split(",").map((x) => cut(x, 12)).filter(Boolean)
    : kindsForPlace(i.place && typeof i.place === "object" ? i.place : { name: place });
  if (kinds.length) payload.a = kinds.slice(0, 3).join(",");
  const note = cut(i.note, MAX.note); if (note) payload.n = note;
  const id = cut(i.id, 40); if (id) payload.i = id;
  // WHERE. Without this the recipient's "see the spots" link is decorative.
  // activityHref could only emit ?city=, and the ranked pages resolve their
  // centre from ?lat/?lng and then from the visitor's own localStorage — which
  // a person who has just been texted a link has never had. So lat and lng came
  // back NaN, every ranked page returned zero rows, and the last tap of the
  // whole flow landed on "Nothing near you clears the bar for this list right
  // now." That is the exact cute-button-into-an-empty-page failure this file's
  // header says it exists to prevent, and it fired for EVERY recipient.
  const geo = geoPoint(i.geo);
  if (geo) payload.g = geo;
  // The key is minted here rather than by the caller so it can never be
  // forgotten — a link without one is a link that can be accepted twice.
  payload.k = cut(i.key, 12) || newInviteKey(i.rand);
  try { return b64urlEncode(JSON.stringify(payload)); } catch (e) { return ""; }
}

/** Unpack an invite, clamped. Never throws; null when unreadable. */
export function decodeInvite(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(b64urlDecode(raw));
    if (!o || typeof o !== "object") return null;
    const place = cut(o.p, MAX.place);
    if (!place) return null;
    return {
      place, city: cut(o.c, MAX.city), when: cut(o.w, MAX.when),
      from: cut(o.f, MAX.from), to: cut(o.t, MAX.to),
      kinds: cut(o.a, 40).split(",").filter(Boolean),
      kind: cut(o.a, 40).split(",").filter(Boolean)[0] || "",
      note: cut(o.n, MAX.note), id: cut(o.i, 40), key: cut(o.k, 12),
      geo: geoPoint(o.g),
    };
  } catch (e) { return null; }
}

// A stable number from the payload. Deterministic BY DESIGN: the share card is
// cached per URL, so choosing the line with Math.random() would show one person
// a different card on a refetch than the one their friend saw.
export function inviteSeed(inv) {
  const s = inv ? [inv.place, inv.city, inv.when, inv.from].join("|") : "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

// ══ THE TEXT-MESSAGE CARD ═══════════════════════════════════════════════════
// It withholds the answer, and that is the entire mechanism. A card reading
// "Dinner at Ulele Friday?" can be answered in the thread without ever opening
// the link — and a card that can be answered without opening is a card nobody
// opens. There is nothing here to react to except tapping.
//
// Every line is true (someone HAS picked a place) and none of them names it.
export const CURIOUS_LINES = [
  { head: "Someone has a question for you", accent: "a question" },
  { head: "You have been invited somewhere", accent: "invited" },
  { head: "There is a plan with your name on it", accent: "your name" },
  { head: "Somebody wants to take you out", accent: "take you out" },
];
export function curiousLine(inv) {
  const named = inv && inv.from
    ? [{ head: inv.from + " has a question for you", accent: "a question" },
       { head: inv.from + " wants to take you out", accent: "take you out" }]
    : [];
  const pool = named.concat(CURIOUS_LINES);
  return pool[inviteSeed(inv) % pool.length];
}
/** The line under the card. It never names the place. */
export function curiousFoot(inv) {
  return inv && inv.when ? "For " + inv.when + " · open it to answer" : "Open it to answer";
}

// ══ THE PAGE ════════════════════════════════════════════════════════════════
export function askHeadline(inv) {
  // Their name on the first screen, when we have it. "Sam, will you go out with
  // me?" is a different object from "Will you go out with me?" — one is
  // addressed to a person and the other is a link that could have gone to
  // anybody, which is exactly what it was before this.
  const to = inv && inv.to ? cut(inv.to, MAX.to) : "";
  return to ? to + ", will you go out with me?" : "Will you go out with me?";
}
export function yayLine(inv) {
  return inv && inv.from ? "I'm so glad u said yes" : "so glad u said yes";
}
export function planLine(activity, when) {
  const a = activityFor(activity);
  const bits = [];
  if (when) bits.push(cut(when, MAX.when));
  if (a) bits.push(a.label);
  return bits.join(" · ");
}

/** Where the plan sends them once it is set: the ranked page for that activity
 *  in their city. This is the only link on the page that leaves it, and it is
 *  deliberately the last thing that happens. */
/**
 * A "lat,lng" string, rounded and validated, or "" when there is nothing usable.
 * Four decimals is ~11m — plenty to seed a search radius, and short enough that
 * the payload stays inside a text message's preview.
 */
export function geoPoint(g) {
  if (!g) return "";
  let lat, lng;
  if (typeof g === "string") { const b = g.split(","); lat = parseFloat(b[0]); lng = parseFloat(b[1]); }
  else { lat = parseFloat(g.lat); lng = parseFloat(g.lng); }
  if (!isFinite(lat) || !isFinite(lng)) return "";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "";
  if (lat === 0 && lng === 0) return ""; // null island is a bug, not a place
  return lat.toFixed(4) + "," + lng.toFixed(4);
}

export function activityHref(activity, city, geo) {
  const a = activityFor(activity);
  const base = a ? a.path : "/best-of";
  const q = [];
  const c = cut(city, MAX.city); if (c) q.push("city=" + encodeURIComponent(c));
  // THE COORDINATES ARE THE LOAD-BEARING PART, not the city name. The ranked
  // pages key their search off lat/lng; ?city= only ever set the headline.
  const g = geoPoint(geo);
  if (g) { const b = g.split(","); q.push("lat=" + b[0], "lng=" + b[1]); }
  return q.length ? base + "?" + q.join("&") : base;
}

/** The reply handed back on a yes. It goes into the thread the invite arrived
 *  in, so it reads like a person, not a receipt. */
/**
 * The reply handed back on a yes.
 *
 * IT HAS TO SAY WHO IT IS FROM. The sender may have asked several people, and
 * a reply reading "Yes! Dinner out on Friday" tells them a date is happening
 * without telling them with whom. The name comes from whoever we can get it
 * from — the sender named them at share time, or they typed it on the last
 * screen — and if we have neither, the reply still works and just says less.
 *
 * `note` is their own line. Owner asked for it, and it is the part that makes
 * this read like a person rather than a receipt.
 */
export function yesText(inv, activity, when, opts) {
  const o = opts || {};
  const a = activityFor(activity);
  const who = cut(o.name, MAX.to) || (inv && inv.to ? cut(inv.to, MAX.to) : "");
  const note = cut(o.note, MAX.reply);
  const what = a ? a.label.toLowerCase() : "";
  const w = cut(when, MAX.when);
  const head = who ? "It's " + who + " — yes!" : "Yes!";
  const plan = (what ? " " + what.charAt(0).toUpperCase() + what.slice(1) : "") + (w ? " on " + w : "");
  return head + plan + (plan ? " — it's a date." : " It's a date.") + (note ? " " + note : "");
}
export function noText(inv, opts) {
  const o = opts || {};
  const who = cut(o.name, MAX.to) || (inv && inv.to ? cut(inv.to, MAX.to) : "");
  const note = cut(o.note, MAX.reply);
  return (who ? "It's " + who + " — I" : "I") + " want to, but not this time." + (note ? " " + note : "");
}

/** True when the recipient still has to tell us who they are. */
export function needsName(inv) { return !(inv && inv.to); }

/**
 * The saveable "It's a date" card for a finished plan.
 *
 * Deliberately NOT the invite card: that one may never name the place, because
 * curiosity is what gets it opened. This one is the opposite — the question is
 * answered, and the only reason it exists is to be worth showing someone.
 */
export function datedCardPath(activity, when, where) {
  const a = activityFor(activity);
  const q = [];
  const w = cut(when, MAX.when); if (w) q.push("when=" + encodeURIComponent(w));
  if (a) q.push("what=" + encodeURIComponent(a.label));
  const p = cut(where, MAX.place); if (p) q.push("where=" + encodeURIComponent(p));
  return "/api/og?kind=date" + (q.length ? "&" + q.join("&") : "");
}

/** Where a share button points. Relative, so it works on any origin. */
export function invitePath(code) {
  const c = String(code == null ? "" : code);
  return c ? "/ask?d=" + encodeURIComponent(c) : "/ask";
}

/**
 * The words beside the link in the message.
 *
 * Deliberately tiny: iMessage puts the preview under the text, and a long
 * sentence pushes the card down and answers the question the card exists to
 * ask. It was "Open this", which is not a thing a person types — owner:
 * "i need the message to be witty and cute and charming."
 *
 * Every line obeys the same rule as the card: it may flirt, it may not tell.
 * No place, no plan, and no time of day. Seeded off the invite so the sender
 * and the recipient never see it change under them.
 */
export const INVITE_TEXTS = [
  "I have a question for you, and I built a page to ask it",
  "Okay don’t make it weird — but open this",
  "Tap this. That’s the whole text.",
  "I made you something. It asks exactly one question.",
  "There’s a very nervous little cat in here waiting on you",
];
export function inviteShareText(inv, who) {
  const line = INVITE_TEXTS[inviteSeed(inv) % INVITE_TEXTS.length];
  const name = cut(who, MAX.to);
  return name ? name + " \u2014 " + line : line;
}

/**
 * A text message, already written.
 *
 * Owner, twice: "are we able to initiate a text message window where the user
 * can text right from our browser?" and then, looking at a toast, "it still
 * said invite copied instead of automatically sending the text." A clipboard
 * write is not a send — it is homework. This hands the OS a composed message
 * with the invite in it; the person picks who and hits send.
 *
 * `sms:?&body=` is the one spelling both iOS and Android accept ("sms:&body="
 * is iOS-only, "sms:?body=" Android-only). macOS registers the same scheme to
 * Messages, which is the case that started this.
 */
export function smsHref(url, text) {
  const body = (text ? text + " " : "") + String(url == null ? "" : url);
  return "sms:?&body=" + encodeURIComponent(body);
}
