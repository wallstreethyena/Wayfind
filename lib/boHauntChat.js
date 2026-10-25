// Bo's live ticket chat. The model call lives in app/api/bo-haunt/route.js and
// must go through lib/paidAi.js. This module is the grounded catalog, the
// dash scrub, and the instant fallback used when the key, the gate, or the
// provider is unavailable.
import { UNDERSTAND_MODEL } from "./searchUnderstand.js";

export const BO_MODEL = UNDERSTAND_MODEL;
export const BO_MAX_TOKENS = 280;

const DASH = /[-\u2013\u2014]/;
const BANNED = [
  /\bno ads\b/i,
  /\bno paid placements\b/i,
  /\bbest\b/i,
  /#1/,
  /\bright now\b/i,
  /\breal[\s-]*time\b/i,
];

export function stripBoDashes(text) {
  return String(text || "").replace(/[-\u2013\u2014]/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function boReplyProblems(text) {
  const clean = String(text || "");
  const problems = [];
  if (DASH.test(clean)) problems.push("dash");
  for (const re of BANNED) if (re.test(clean)) problems.push(String(re));
  return problems;
}

function byId(model, id) {
  return model.haunts.find((row) => row.id === id) || null;
}

export function boHauntFallback(message, model) {
  const q = String(message || "").toLowerCase();
  let ids = ["howlOrlando"];
  let reply = "SeaWorld Howl O Scream starts at $45.99. Tap Get Tickets before the gate writes a scarier price.";
  if (/kid|child|family|peppa|mickey/.test(q)) {
    ids = ["mickey", "zooTampa"];
    reply = "For kids, lock Mickey's Not So Scary from $119 to $229, or ZooTampa at $34.95 to $39.95. Tap Get Tickets on the one that fits the bedtime.";
  } else if (/tampa/.test(q)) {
    ids = ["howlTampa", "zooTampa"];
    reply = "Busch Gardens Howl O Scream Tampa Bay starts at $49.99. ZooTampa after dark is $34.95 to $39.95 on Oct 25, Oct 30, and Oct 31. Tap Get Tickets.";
  } else if (/orlando|under \$50|45\.99/.test(q)) {
    ids = ["howlOrlando"];
    reply = "SeaWorld Howl O Scream Orlando is the Orlando scream from $45.99. Tap Get Tickets.";
  } else if (/roast|gate|box office|full price/.test(q)) {
    ids = ["howlOrlando", "howlTampa"];
    reply = "Paying the gate is the horror story. Howl O Scream Orlando starts at $45.99 and Tampa at $49.99. Tap Get Tickets.";
  } else if (/extreme|terrify|horror nights|universal/.test(q)) {
    ids = ["hhn"];
    reply = "Universal Orlando Halloween Horror Nights 35 starts at $94.10. Tap Get Tickets and skip the box office sequel.";
  }
  const recommendedIds = ids.filter((id) => byId(model, id)).slice(0, 3);
  return { reply: stripBoDashes(reply), recommendedIds };
}

export function parseBoReply(text, model) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let json;
  try { json = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  const known = new Set(model.haunts.map((row) => row.id));
  const recommendedIds = (Array.isArray(json.recommendedIds) ? json.recommendedIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => known.has(id))
    .slice(0, 3);
  const reply = stripBoDashes(json.reply);
  if (!reply || !recommendedIds.length) return null;
  if (boReplyProblems(reply).length) return null;
  return { reply, recommendedIds };
}

export function boPrompt(model, message) {
  const catalog = model.haunts.map((row) => [
    row.id,
    row.name,
    row.city,
    row.priceLabel,
    row.timing,
    row.cta.label,
  ].join(" | ")).join("\n");
  const system = [
    "You are Boo, Wayfind's ghost host for BOO'S VIP TOUR. You are a cute white ghost in oversized black sunglasses, one eye winking, rosy cheeks, waving a neon orange TOUR flag. Upbeat, cool, beach loving, pun cracking, and obsessed with skipping full box office prices.",
    "Introduce yourself as Boo. Use ghost puns and sunglasses swagger. Never claim to be a person in a nightgown, a priest, or anyone named Bo.",
    "Use only the catalog. Never invent a price, a date, a city, or a haunt.",
    "Return one JSON object and nothing else, with keys reply and recommendedIds.",
    "recommendedIds is 1 to 3 ids copied from the catalog id column.",
    "reply is the sentence the visitor reads. It must contain no hyphen, no en dash, and no em dash.",
    "Do not use these phrases in reply: best, right now, real time, no ads, no paid placements, or a hash with the digit 1.",
    "Name the catalog button to tap: Get Tickets, Book Now & Save, or Official Tickets.",
    "Keep reply under 50 words.",
  ].join(" ");
  const user = "Catalog, columns are id, name, city, price, timing, button:\n" + catalog + "\n\nVisitor: " + String(message || "").trim().slice(0, 400);
  return { system, user, model: BO_MODEL, maxTokens: BO_MAX_TOKENS };
}
