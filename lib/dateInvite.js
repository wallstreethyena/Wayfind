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
export const ACTIVITIES = [
  { id: "dinner",   label: "Dinner out",      path: "/date-night",      link: "See where to eat" },
  { id: "tonight",  label: "Drinks tonight",  path: "/tonight",         link: "See what's open tonight" },
  { id: "bite",     label: "Something quick", path: "/quick-bite",      link: "Find a quick bite" },
  { id: "hidden",   label: "Somewhere new",   path: "/hidden-gems",     link: "See the hidden gems" },
  { id: "drive",    label: "A little trip",   path: "/worth-the-drive", link: "See what's worth the drive" },
  { id: "surprise", label: "Surprise me",     path: "/best-of",         link: "See the best of" },
];

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
  const note = cut(i.note, MAX.note); if (note) payload.n = note;
  const id = cut(i.id, 40); if (id) payload.i = id;
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
      note: cut(o.n, MAX.note), id: cut(o.i, 40), key: cut(o.k, 12),
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
export function activityHref(activity, city) {
  const a = activityFor(activity);
  const base = a ? a.path : "/best-of";
  const c = cut(city, MAX.city);
  return c ? base + "?city=" + encodeURIComponent(c) : base;
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

/** Where a share button points. Relative, so it works on any origin. */
export function invitePath(code) {
  const c = String(code == null ? "" : code);
  return c ? "/ask?d=" + encodeURIComponent(c) : "/ask";
}

/** The words beside the link in the message. Deliberately tiny: iMessage puts
 *  the preview under the text, and a long sentence pushes the card down and
 *  answers the question the card exists to ask. */
export function inviteShareText() { return "Open this"; }
