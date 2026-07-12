// Wayfind List Engine (v5.69). The generator that turns a set of ranked places
// into a list a person screenshots and sends to one friend. Three concerns live
// here, all pure/testable (no I/O): the system prompt (PART 1), the rotation
// library with each list's data condition (PART 2), and the hard-rule output
// validator. The API route (app/api/list/generate) wires these to the LLM.
//
// Design rule, straight from the spec: "Do not attempt a list whose condition
// you cannot satisfy from real fields." So a list type is only `available` when
// every claim its headline makes is computable from the Google-Places fields we
// actually have. The two strongest ideas (Locals vs Tourists, Most Divisive)
// need reviewer segmentation / full star histograms we do NOT have, so they are
// present but `available: false` — flagged, never faked.

// ── PART 1 — SYSTEM PROMPT ────────────────────────────────────────────────
export const LIST_SYSTEM_PROMPT = [
  "ROLE",
  "You write Wayfind's ranked lists. Wayfind is an independent Gulf Coast place discovery app. No ads, no paid placement, no sponsored ranks. Your job is not to describe places. Your job is to produce a list that a person screenshots and sends to one specific friend within ten seconds of reading it.",
  "",
  "HARD RULES",
  "1. Never invent a fact about a business. Every claim must trace to a field in the input. If the field is not there, the claim does not exist.",
  "2. Never call a named business bad, dirty, a rip off, or a tourist trap. Contrast is allowed. Data is allowed. Insults are not. If a business owner read this line, it must survive.",
  "3. Never use dashes of any kind. No em dash, no en dash, no hyphen where a comma or a restructure will do.",
  '4. No exclamation points. No emoji in body copy. No corporate language. Never use the phrase "hidden gem" unless category is gems.',
  "5. Exactly 10 items unless fewer qualify. If fewer qualify, say so in the subhead and give the real number. Never pad.",
  "6. Every rank must be reproducible from the inputs plus the stated method. If you cannot defend a rank by pointing at a field, change the rank.",
  "",
  "VOICE",
  "A confident local who has actually eaten there. Short sentences. A verdict, never a description. Bad: \"A popular seafood restaurant with excellent reviews.\" Good: \"The line moves. Get the grouper.\"",
  "",
  "THE HEADLINE (the most important field). It must do exactly one of: 1 CONTRADICTION (the data disagrees with the obvious answer), 2 CONSTRAINT (a hard limit forces a choice), 3 SCARCITY (something ends soon), 4 VERDICT (a ranking someone will object to), 5 VALUE SHOCK (two numbers that should not sit together). A headline that is a category name is a failure.",
  "",
  "THE GAP. The share card shows ranks 2 through 10 and withholds number one. Write share_card_teaser as one line, using a true fact from the input, that makes withholding number one feel unbearable. Example: \"Number one is a gas station.\"",
  "",
  "THE CONTRARIAN SLOT. Exactly one item per list carries contrarian: true. It sits higher or lower than its star rating alone would justify, and its reason explains why in one sentence tied to a data field. Keep it defensible. Moderate disagreement drives conversation. Cruelty kills it.",
  "",
  "THE METHOD LINE. Always state, in plain language, what was weighed. Example: \"Ranked by open now, rating, review depth, distance, and how hot it is outside. No ads. Nobody paid to be here.\"",
  "",
  "HOOK CONSTRUCTION. The hook is the single most important thing you produce. It is not the category. It is the surprising fact. \"Best hot dogs in Sarasota\" is a filing label and it is a failure. \"Sarasota's #1 hot dog is at a gas station\" is a hook.",
  "  hook.lines  Exactly 2 strings. Each is 24 characters or fewer, INCLUDING spaces. If your idea does not fit in 48 characters, it is not sharp enough. Cut it, do not shrink the font.",
  "  hook.accent A phrase that appears VERBATIM inside one of the lines. It gets the accent color. Choose the two or three words carrying the surprise, never a generic noun.",
  "  bar_label   16 characters or fewer. It is an instruction, not a state. \"See which one\" is correct. \"Withheld\" is not, because it tells the reader nothing to do.",
  "",
  "THE NO SURPRISE RULE. Most lists will not contain a genuine surprise. Do not manufacture one. Do not stretch a fact. Fall back down this ladder, in order, and set hook_type to whichever you land on:",
  "  1 SURPRISE  the data contradicts the obvious answer (\"Sarasota's #1 hot dog is at a gas station\").",
  "  2 SCARCITY  something ends soon, always derivable from closes_at (\"4 of these close in 90 minutes\").",
  "  3 CONSTRAINT conditions force a choice, always derivable from weather (\"It is 94 degrees. Go here\").",
  "  4 VALUE     two numbers that should not sit together (\"4.8 stars. Twelve dollars\").",
  "Scarcity and constraint are always derivable from the input, so there is never a reason to invent a surprise. A hook that is not actually surprising trains people to ignore the card.",
  "",
  "OUTPUT. Return JSON only. No preamble, no markdown fences, no commentary. Shape:",
  '{"headline":"","subhead":"","method":"","hook":{"lines":["<=24 chars","<=24 chars"],"accent":"a verbatim phrase from one line"},"bar_label":"<=16 chars, an instruction","hook_type":"surprise|scarcity|constraint|value","share_card_headline":"max 60 characters","share_card_teaser":"","og_description":"max 155 characters, must contain the gap","generated_at":"","items":[{"rank":1,"name":"","verdict":"max 12 words","reason":"why it beat the next one, tied to a data field","order_this":"only if the input supports it, otherwise omit","contrarian":false}]}',
  "",
  "CALIBRATION CHECK before returning. Any no means rewrite. Would a local screenshot this and send it to one person by name? Does the headline pose a question that only the list answers? Is there exactly one thing here somebody would argue with? Could every single claim survive the business owner reading it? Did I use a dash anywhere?",
].join("\n");

// ── PART 2 — ROTATION LIBRARY ─────────────────────────────────────────────
// Each entry: id, label, headlineJob, available, and a condition. Per-place
// conditions expose `qualifies(place, ctx)`; list-level gates also expose
// `gate(ctx)` (weather/time) that must pass before any place qualifies.
const RAIN_RX = /rain|thunder|storm|shower/i;
const INDOOR_RX = /indoor|museum|aquarium|gallery|mall|theat|cinema|arcade|bowl|spa|library|conservatory|market\b|brewery|distillery|cafe|coffee/i;
const WATER_RX = /water|beach|spring|pool|swim|kayak|paddle|boat|river|gulf|bay/i;

// Hour (0-23) in the VENUE's local time — read straight off the ISO offset
// string so we never shift into the server's timezone.
export function localHourOf(localTime) {
  const m = String(localTime || "").match(/T(\d{2}):(\d{2})/);
  return m ? { h: Number(m[1]), min: Number(m[2]) } : null;
}
// Minutes from now until a "HH:MM" closing time, same day. Null if unparseable.
export function minutesUntilClose(closesAt, localTime) {
  const c = String(closesAt || "").match(/^(\d{1,2}):(\d{2})$/);
  const now = localHourOf(localTime);
  if (!c || !now) return null;
  let diff = (Number(c[1]) * 60 + Number(c[2])) - (now.h * 60 + now.min);
  if (diff <= -180) diff += 1440; // a post-midnight close (e.g. 02:00) is still "later tonight"
  return diff;
}

export const LIST_TYPES = [
  {
    id: "underexposed", label: "The Underexposed", headlineJob: "contradiction", available: true,
    needs: "rating, review_count",
    qualifies: (p) => Number(p.rating) >= 4.7 && Number(p.review_count) < 150 && Number(p.review_count) > 0,
  },
  {
    id: "value_shock", label: "The Value Shock", headlineJob: "value shock", available: true,
    needs: "rating, price_level",
    qualifies: (p) => Number(p.rating) >= 4.6 && Number(p.price_level) === 1,
  },
  {
    id: "still_open", label: "Still Open", headlineJob: "constraint", available: true,
    needs: "open_now, local_time",
    gate: (ctx) => { const t = localHourOf(ctx.local_time); return !!t && (t.h >= 22 || t.h < 4); },
    qualifies: (p) => p.open_now === true,
  },
  {
    id: "closing_soon", label: "Closing Soon", headlineJob: "scarcity", available: true,
    needs: "closes_at, local_time",
    qualifies: (p, ctx) => { if (p.open_now === false) return false; const m = minutesUntilClose(p.closes_at, ctx.local_time); return m != null && m > 0 && m <= 90; },
  },
  {
    id: "heat_list", label: "The Heat List", headlineJob: "constraint", available: true,
    needs: "weather.temp_f, tags",
    gate: (ctx) => Number(ctx.weather && ctx.weather.temp_f) >= 90,
    qualifies: (p) => (p.tags || []).some((t) => INDOOR_RX.test(t) || WATER_RX.test(t)),
  },
  {
    id: "rain_list", label: "The Rain List", headlineJob: "constraint", available: true,
    needs: "weather.condition, tags",
    gate: (ctx) => RAIN_RX.test((ctx.weather && ctx.weather.condition) || ""),
    qualifies: (p) => (p.tags || []).some((t) => INDOOR_RX.test(t)),
  },
  {
    id: "consensus_contrarian", label: "Consensus vs Contrarian", headlineJob: "contradiction", available: true,
    needs: "rating, review_count", twoColumn: true, minQualifying: 4,
    // Needs at least one crowd-consensus pick (>1000 reviews) AND one that
    // nobody knows yet (<100 reviews), both well rated.
    qualifies: (p) => Number(p.rating) >= 4.4 && (Number(p.review_count) > 1000 || Number(p.review_count) < 100),
    gateList: (places) => places.some((p) => Number(p.rating) >= 4.4 && Number(p.review_count) > 1000) && places.some((p) => Number(p.rating) >= 4.4 && Number(p.review_count) < 100),
  },

  // ── Present but NOT auto-buildable from the fields we have. Never faked. ──
  {
    id: "price_gradient", label: "The Price Gradient", headlineJob: "value shock", available: false,
    reason: "needs a defined tourist-corridor polygon + per-place coordinates to compare inland vs corridor price; the input schema carries distance_mi only.",
  },
  {
    id: "hundred_dollar_saturday", label: "The Hundred Dollar Saturday", headlineJob: "constraint", available: false,
    reason: "needs real per-stop price estimates; deriving a dollar total from price_level would be an invented fact (violates hard rule 1).",
  },
  {
    id: "three_hours", label: "Three Hours", headlineJob: "constraint", available: false,
    reason: "needs pairwise coordinates to prove 3 stops sit within 2mi of each other; the input carries distance_mi from origin only.",
  },
  {
    id: "locals_vs_tourists", label: "Locals vs Tourists", headlineJob: "contradiction", available: false,
    reason: "needs reviewer segmentation (local vs visitor) the Places API does not expose. Strong idea, real data acquisition problem, not a prompt problem.",
  },
  {
    id: "most_divisive", label: "Most Divisive", headlineJob: "verdict", available: false,
    reason: "needs the full review star histogram to rank by polarization; the Places API returns only sampled reviews.",
  },
];

export const LIST_TYPE_BY_ID = LIST_TYPES.reduce((m, t) => { m[t.id] = t; return m; }, {});

// Which places satisfy a given list type right now (empty if a list-level gate
// fails). ctx = { local_time, weather, ... }.
export function qualifyingPlaces(listType, places, ctx) {
  const t = typeof listType === "string" ? LIST_TYPE_BY_ID[listType] : listType;
  if (!t || !t.available) return [];
  const list = Array.isArray(places) ? places.filter(Boolean) : [];
  if (t.gate && !t.gate(ctx || {})) return [];
  if (t.gateList && !t.gateList(list)) return [];
  if (t.twoColumn) return list.filter((p) => t.qualifies(p, ctx || {})); // both columns kept, LLM splits
  return list.filter((p) => t.qualifies(p, ctx || {}));
}

// Rank the available list types by how strongly the data supports them right
// now. minCount defaults to 4 (a list of 3 is still allowed if explicitly asked
// for, but auto-selection wants a fuller list).
export function selectListTypes(places, ctx, minCount = 4) {
  return LIST_TYPES
    .filter((t) => t.available)
    .map((t) => ({ id: t.id, label: t.label, headlineJob: t.headlineJob, count: qualifyingPlaces(t, places, ctx).length }))
    .filter((t) => t.count >= (LIST_TYPE_BY_ID[t.id].minQualifying || minCount))
    .sort((a, b) => b.count - a.count);
}

// Build the INPUT JSON the model receives (the spec's schema), pinned to the
// chosen list type and its qualifying, pre-ranked places.
export function buildListInput({ city, neighborhood, local_time, day_of_week, weather, category, list_type, places }) {
  const t = LIST_TYPE_BY_ID[list_type];
  const qualifying = qualifyingPlaces(t, places, { local_time, weather });
  const slim = qualifying.slice(0, 12).map((p) => ({
    name: p.name || "",
    subcategory: p.subcategory || p.type || "",
    rating: p.rating ?? null,
    review_count: p.review_count ?? p.reviews ?? 0,
    price_level: p.price_level ?? null,
    distance_mi: p.distance_mi ?? null,
    open_now: p.open_now ?? null,
    closes_at: p.closes_at || null,
    tags: Array.isArray(p.tags) ? p.tags.slice(0, 8) : [],
  }));
  return {
    city: city || "",
    neighborhood: neighborhood || "",
    local_time: local_time || "",
    day_of_week: day_of_week || "",
    weather: weather || null,
    category: category || "eat",
    list_type: list_type,
    list_type_label: t ? t.label : list_type,
    headline_job: t ? t.headlineJob : "",
    two_column: !!(t && t.twoColumn),
    places: slim,
  };
}

// ── SHARE-CARD HELPERS (Part 3/4) ─────────────────────────────────────────
// Auto-fit: step the headline size down in buckets by the longest hook line.
// Never a third line — if content needs three lines the hook is wrong.
export function headlineSize(lines) {
  const longest = Math.max(0, ...(lines || []).map((l) => String(l == null ? "" : l).length));
  if (longest <= 20) return 101;
  if (longest <= 24) return 88;
  if (longest <= 30) return 74;
  return 62; // caller should log: the hook is too long, the model failed
}
// Truncate a place name to `max` chars with an ellipsis (JS side, before render).
export function truncName(name, max = 18) {
  const s = String(name == null ? "" : name);
  return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+$/, "") + "…";
}
// The runners-up ticker (ranks 2-5). Truncate names to 18, then drop position 5
// then 4 while the assembled line would overflow the content width. Never wrap.
export function fitTickerItems(items, maxChars = 116) {
  let out = (items || []).slice(0, 4).map((it) => ({
    rank: it.rank, name: truncName(it.name, 18), rating: it.rating == null ? "" : String(it.rating),
  }));
  const width = (arr) => arr.reduce((n, it) => n + String(it.rank).length + it.name.length + it.rating.length + 5, 0);
  while (out.length > 2 && width(out) > maxChars) out.pop();
  return out;
}
// Split a hook line into segments, marking the accent phrase for the accent
// color. Returns [{text, accent}]. If the accent is not a substring, one plain
// segment (defensive — the validator normally guarantees a match).
export function splitAccent(line, accent) {
  const s = String(line == null ? "" : line);
  const a = String(accent == null ? "" : accent);
  const i = a ? s.indexOf(a) : -1;
  if (i < 0) return [{ text: s, accent: false }];
  const out = [];
  if (i > 0) out.push({ text: s.slice(0, i), accent: false });
  out.push({ text: a, accent: true });
  if (i + a.length < s.length) out.push({ text: s.slice(i + a.length), accent: false });
  return out;
}

// The condition strip on the card ("SARASOTA / 7:14 PM SAT / 94°F OVERCAST /
// 12 OPEN NOW"), built from the same context the list was generated in.
function timeLabel(localTime, day) {
  const t = localHourOf(localTime);
  if (!t) return day ? String(day) : "";
  let h = t.h % 12; if (h === 0) h = 12;
  return h + ":" + String(t.min).padStart(2, "0") + " " + (t.h < 12 ? "AM" : "PM") + (day ? " " + String(day).slice(0, 3) : "");
}
export function stripFromContext(ctx) {
  const c = ctx || {}; const items = [];
  if (c.city) items.push(String(c.city));
  const tl = timeLabel(c.local_time, c.day_of_week);
  if (tl) items.push(tl);
  const w = c.weather || {};
  if (w.temp_f != null || w.condition) {
    items.push((w.temp_f != null ? Math.round(w.temp_f) + "°F" : "") + (w.condition ? (w.temp_f != null ? " " : "") + w.condition : ""));
  }
  if (c.open_count != null) items.push(c.open_count + " open now");
  return items;
}
const _nrm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
// Assemble the card payload (strip + hook + bar_label + ticker) from a validated
// list and its input places. Ratings for the ticker come from the places joined
// by name (the list items don't carry them), so the snapshot is self-contained.
export function buildCardFromList(list, places, ctx) {
  const rating = new Map((places || []).filter(Boolean).map((p) => [_nrm(p.name), p.rating]));
  const ticker = (list && Array.isArray(list.items) ? list.items : [])
    .filter((it) => Number(it.rank) >= 2 && Number(it.rank) <= 5)
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((it) => ({ rank: it.rank, name: it.name, rating: rating.has(_nrm(it.name)) && rating.get(_nrm(it.name)) != null ? rating.get(_nrm(it.name)) : "" }));
  return {
    strip: stripFromContext(ctx),
    hook: (list && list.hook) || { lines: [String((list && list.headline) || "").slice(0, 24), ""], accent: "" },
    bar_label: (list && list.bar_label) || "See which one",
    ticker,
    note: "Updates hourly. Share it before it changes.",
  };
}

// ── HARD-RULE VALIDATOR ───────────────────────────────────────────────────
// Enforces the rules a machine can check. Returns { ok, violations: [] }.
// Note: dashes are checked only in GENERATED copy, never in `name` (a place
// name like "Farm-to-Fork" is input data, not the model writing a dash).
const DASH_RX = /[‐-―−]|(?:\S)-(?:\S)| - /; // em/en/figure/minus dashes, or a hyphen joining/​separating words
const COPY_FIELDS = ["headline", "subhead", "method", "share_card_headline", "share_card_teaser", "og_description"];
const ITEM_COPY_FIELDS = ["verdict", "reason", "order_this"];

export function validateListOutput(out, category) {
  const v = [];
  if (!out || typeof out !== "object") return { ok: false, violations: ["output is not an object"] };
  for (const f of COPY_FIELDS) {
    if (typeof out[f] !== "string" || !out[f].trim()) v.push(`missing/empty field: ${f}`);
  }
  const items = Array.isArray(out.items) ? out.items : null;
  if (!items || !items.length) v.push("items is empty");
  if (items && items.length > 10) v.push(`too many items: ${items.length} (max 10)`);

  // Char limits.
  if (typeof out.share_card_headline === "string" && out.share_card_headline.length > 60) v.push(`share_card_headline over 60 chars (${out.share_card_headline.length})`);
  if (typeof out.og_description === "string" && out.og_description.length > 155) v.push(`og_description over 155 chars (${out.og_description.length})`);

  // The share-card hook (Part 2): exactly 2 lines, each <=24 chars, an accent
  // phrase that appears verbatim in one line, a <=16-char bar_label instruction,
  // and a hook_type on the surprise/scarcity/constraint/value ladder.
  const hook = out.hook && typeof out.hook === "object" ? out.hook : null;
  if (!hook) v.push("missing hook object");
  else {
    const lines = Array.isArray(hook.lines) ? hook.lines : null;
    if (!lines || lines.length !== 2) v.push(`hook.lines must be exactly 2 strings (got ${lines ? lines.length : "none"})`);
    else {
      lines.forEach((l, i) => {
        if (typeof l !== "string" || !l.trim()) v.push(`hook.lines[${i}] empty`);
        else if (l.length > 24) v.push(`hook.lines[${i}] over 24 chars (${l.length})`);
      });
      if (typeof hook.accent !== "string" || !hook.accent.trim()) v.push("hook.accent empty");
      else if (!lines.some((l) => typeof l === "string" && l.includes(hook.accent))) v.push(`hook.accent "${hook.accent}" is not a verbatim substring of either line`);
    }
  }
  if (typeof out.bar_label !== "string" || !out.bar_label.trim()) v.push("missing bar_label");
  else if (out.bar_label.length > 16) v.push(`bar_label over 16 chars (${out.bar_label.length})`);
  if (!["surprise", "scarcity", "constraint", "value"].includes(out.hook_type)) v.push(`hook_type must be surprise|scarcity|constraint|value (got ${out.hook_type})`);

  // Collect every copy string (not names) for the dash / bang / phrase checks.
  const copy = [];
  for (const f of COPY_FIELDS) if (typeof out[f] === "string") copy.push([f, out[f]]);
  if (typeof out.bar_label === "string") copy.push(["bar_label", out.bar_label]);
  if (hook && Array.isArray(hook.lines)) hook.lines.forEach((l, i) => { if (typeof l === "string") copy.push([`hook.lines[${i}]`, l]); });
  (items || []).forEach((it, i) => {
    for (const f of ITEM_COPY_FIELDS) if (typeof it[f] === "string") copy.push([`items[${i}].${f}`, it[f]]);
    if (typeof it.verdict === "string" && it.verdict.trim().split(/\s+/).length > 12) v.push(`items[${i}].verdict over 12 words`);
  });
  for (const [f, s] of copy) {
    if (DASH_RX.test(s)) v.push(`dash in ${f}: "${s}"`);
    if (s.includes("!")) v.push(`exclamation point in ${f}`);
    if (/hidden gem/i.test(s) && category !== "gems") v.push(`"hidden gem" used in ${f} but category is not gems`);
  }

  // Exactly one contrarian.
  if (items) {
    const c = items.filter((it) => it.contrarian === true).length;
    if (c !== 1) v.push(`must have exactly one contrarian item, found ${c}`);
    // Ranks 1..N, sequential, no gaps.
    const ranks = items.map((it) => Number(it.rank)).sort((a, b) => a - b);
    const bad = ranks.some((r, i) => r !== i + 1);
    if (bad) v.push(`ranks are not 1..${items.length} sequential`);
    // Every item names a place.
    if (items.some((it) => typeof it.name !== "string" || !it.name.trim())) v.push("an item is missing name");
  }
  return { ok: v.length === 0, violations: v };
}
