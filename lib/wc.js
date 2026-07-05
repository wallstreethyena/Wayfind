// World Cup watch-list copy + badges. Two layers: hand-curated entries for
// venues with real evidence (confirmed watch setups from research), and a
// signal-driven generator for everything else. Rules enforced by fixtures:
// no two cards in a list get the same generated copy; the generator never
// claims "watch party" (that phrase requires curated evidence); banned
// generic phrases never appear; every line is differentiator-first, then
// who should pick or skip it.

function normName(s) {
  return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

function hash(s) {
  let h = 0; const t = String(s || "");
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h;
}

// Curated venues. Copy is evidence-based; badge is the one label that matters.
const CURATED = {
  sportsandsocial: { copy: "Orlando's marquee World Cup hub — the free Pointe Orlando festival shows all 104 matches, with smoke cannons when Brazil scores, live music, and giveaway freebies around the big games. Go for the biggest crowd in town; skip it if you want a quiet table.", badge: { icon: "\uD83D\uDCFA", label: "Big screen energy" } },
  tomswatchbar: { copy: "Wall-to-wall screens with match sound on, plus the rooftop Sky Bar. Best when you need guaranteed TVs for the big games; not the room for an intimate dinner.", badge: { icon: "\uD83D\uDCFA", label: "Big screen energy" } },
  stadiumclub: { copy: "Over 100 screens with 360-degree viewing inside Caribe Royale near Disney. Best for tracking multiple matches at once; skip it if you want a walkable bar strip.", badge: { icon: "\uD83D\uDCFA", label: "Big screen energy" } },
  cariberoyale: { copy: "Over 100 screens with 360-degree viewing inside Caribe Royale near Disney. Best for tracking multiple matches at once; skip it if you want a walkable bar strip.", badge: { icon: "\uD83D\uDCFA", label: "Big screen energy" } },
  americansocial: { copy: "Restaurant Row's soccer-first sports bar — 100-plus TVs and giant screens on Sand Lake. The strongest all-round pick on that side of town, and it will be packed for Brazil and Argentina.", badge: { icon: "\uD83C\uDF7A", label: "Sports bar vibe" } },
  thewharfatsunsetwalk: { copy: "Kissimmee's open-air setup — a giant outdoor video wall with matchday specials running through the final. Best family-friendly group option near Disney; skip it in heavy rain.", badge: { icon: "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67", label: "Family-friendly" } },
  promenadeatsunsetwalk: { copy: "Kissimmee's open-air setup — a giant outdoor video wall with matchday specials running through the final. Best family-friendly group option near Disney; skip it in heavy rain.", badge: { icon: "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67", label: "Family-friendly" } },
  yardhouse: { copy: "Big-screen, high-energy chain option near the parks. Best if you want beer, TVs, and a lively crowd without gambling on a random bar.", badge: { icon: "\uD83D\uDCFA", label: "Big screen energy" } },
  divinacarne: { copy: "Brazilian steakhouse first, match spot second. Best for Brazil fans who want rod\u00edzio before or during the game — pick it for the food and culture over pure sports-bar energy.", badge: { icon: "\uD83C\uDDE7\uD83C\uDDF7", label: "Best for Brazil fans" } },
  eskina: { copy: "Brazilian and Latin crowd energy with a louder dinner-watch vibe. Good pick for atmosphere; not the choice if you need guaranteed huge TVs.", badge: { icon: "\uD83C\uDDE7\uD83C\uDDF7", label: "Best for Brazil fans" } },
  adegagaucha: { copy: "Upscale Brazilian steakhouse. Best for a polished Brazil-match dinner; the wrong room for a rowdy crowd.", badge: { icon: "\uD83E\uDD69", label: "Upscale watch dinner" } },
};

export function curatedFor(name) {
  const n = normName(name);
  if (!n) return null;
  if (CURATED[n]) return CURATED[n];
  for (const k in CURATED) { if ((k.length >= 6 && n.startsWith(k)) || (n.length >= 8 && k.startsWith(n))) return CURATED[k]; }
  return null;
}

export function archetype(p) {
  const name = String((p && p.name) || "").toLowerCase();
  const types = (Array.isArray(p && p.types) ? p.types.join(" ") : "").toLowerCase();
  const hay = name + " " + types;
  if (/brazil|brasil|churrasc|ga\u00facho|gaucho|rodizio|rod\u00edzio|picanha/.test(hay)) return "brazil";
  if (/steakhouse|steak house/.test(hay)) return "steak";
  if (/latin|cantina|taqueria|arepa|colombia|venezuel|cuban|mexican|peruvian/.test(hay)) return "latin";
  if (/sports ?bar|watch bar|taproom|tap room|wing|draft house|drafthouse|ale house|alehouse|stadium|billiard|game day|gameday/.test(hay)) return "sportsbar";
  if (/\bpub\b|tavern|saloon|irish|british/.test(hay)) return "pub";
  if (/cafe|coffee|bakery|ice cream|icecream|dessert|donut|doughnut|juice|smoothie/.test(hay)) return "quiet";
  if (/\bbar\b|lounge|cocktail|brewery|brewing|beer garden|biergarten/.test(hay)) return "bar";
  return "restaurant";
}

// Variant banks. Differentiator first, then who should pick or skip. The word
// "watch party" is deliberately absent: that claim needs curated evidence.
export const BANKS = {
  sportsbar: [
    "Built for game day — screens everywhere and the sound usually on for the big matches. Pick it for guaranteed TVs; skip it for a quiet meal.",
    "A screens-first room where the match is the point, not background. Go with a group; skip it if you want conversation volume.",
    "High-energy sports-bar setup with wall coverage most restaurants can't touch. Best for the marquee games; overkill for a casual lunch.",
    "The safe TV bet — the kind of room that plans its day around kickoff. Pick it when you can't risk a bar that isn't showing it.",
    "Loud, screen-heavy, and group-friendly when a match matters. Skip it if you're after a slower dinner.",
    "Made for watching with a crowd — expect noise when goals go in. Not the one for a date-night pace.",
  ],
  pub: [
    "Pub setup that likely has the match on, with a crowd that cares. Pick it for atmosphere over screen count; call ahead about the sound.",
    "Neighborhood-pub energy, likely good for watching without the mega-bar chaos. Skip it if you need a giant screen.",
    "A proper pint-and-match room when it's showing the game. Better for regulars' energy than wall-to-wall TVs.",
    "Smaller-room pub feel — good if the big venues sound like too much. Confirm they're showing your match before you commit.",
  ],
  bar: [
    "Bar-first spot that likely has the game on, minus the sports-bar sprawl. Pick it for drinks and a looser crowd; skip it if TVs are the priority.",
    "Better for the pre-match or post-match round than the full 90 minutes. Go early or after; catch the big moments elsewhere.",
    "Drinks-forward room where the match shares billing with the scene. Fine for casual watching; not for die-hards.",
    "Likely good for watching if you care more about the crowd than the screen. Confirm the sound situation for your match.",
    "A looser hang with the game probably on in the background. Skip it for a knockout match you actually need to see.",
  ],
  brazil: [
    "Brazilian spot where match days bring the flags out. Best for Brazil fans who want the culture with the game; screens come second.",
    "Expect green and yellow when Brazil plays — the crowd is the draw here. Pick it for energy and the food, not a wall of TVs.",
    "Brazilian kitchen first, match atmosphere when the Sele\u00e7\u00e3o plays. Go for the meal and the crowd, not screen real estate.",
    "The kind of room that erupts for a Brazil goal. Best on Brazil match days; quieter for neutral fixtures.",
  ],
  latin: [
    "Latin spot with real match-day energy when the region's teams play. Pick it for the crowd and the food; confirm the screens.",
    "Expect a crowd that actually watches when Argentina or the Latin sides play. Better for atmosphere than guaranteed big TVs.",
    "Food and crowd carry it on match days. Go for the vibe; skip it if you need sound on every screen.",
  ],
  steak: [
    "A polished dinner room, not a screens-and-jerseys crowd. Best for a sit-down around the match; watch the game itself elsewhere.",
    "Upscale pace — book it for the pre-match or the celebration dinner. Wrong room for shouting at a penalty shootout.",
    "Steakhouse-first: quality over chaos. Pick it to eat well on a match day, not to watch the full 90.",
  ],
  restaurant: [
    "Food-first option near the action — the meal is the reason to come. Pair it with a proper screen spot for the match itself.",
    "Better plate than screen setup. Pick it for before or after the game; skip it as your main watch spot.",
    "Strong kitchen, unproven for match viewing. Eat here, watch nearby.",
    "A solid table on a match day, not a viewing destination. Go hungry; don't count on the sound being on.",
    "The food does the talking here. Best around the match, not during it.",
  ],
  quiet: [
    "Coffee-and-pastry pace — not a match spot. Good for the morning of, not the 90 minutes.",
    "A calm stop before or after, not a place to watch. Pick it for the reset, not the game.",
  ],
};

function rawCopy(p, used) {
  const cur = curatedFor(p && p.name);
  if (cur) return cur.copy;
  const bank = BANKS[archetype(p)] || BANKS.restaurant;
  const start = hash((p && (p.id || p.name)) || "x") % bank.length;
  for (let t = 0; t < bank.length; t++) {
    const c = bank[(start + t) % bank.length];
    if (!used || !used.has(c)) return c;
  }
  return bank[start];
}

// Copy for the card at rank i within list. Stateless: recomputes earlier
// cards' picks so the same-archetype variant never repeats within one list
// (until a bank is exhausted, which takes 5+ identical archetypes).
export function wcCopy(p, list, i) {
  const arr = Array.isArray(list) && list.length ? list : [p];
  const k = typeof i === "number" && i >= 0 ? Math.min(i, arr.length) : 0;
  const used = new Set();
  for (let j = 0; j < k; j++) { if (arr[j] && arr[j] !== p) used.add(rawCopy(arr[j], used)); }
  return rawCopy(p, used);
}

// One badge max per card, most decision-relevant first. Null is a valid answer.
export function wcBadge(p, list) {
  const cur = curatedFor(p && p.name);
  if (cur) return cur.badge;
  const a = archetype(p);
  if (a === "brazil") return { icon: "\uD83C\uDDE7\uD83C\uDDF7", label: "Best for Brazil fans" };
  if (a === "sportsbar") return { icon: "\uD83D\uDCFA", label: "Big screen energy" };
  if (a === "steak" && String((p && p.price) || "").length >= 3) return { icon: "\uD83E\uDD69", label: "Upscale watch dinner" };
  const labels = Array.isArray(p && p.labels) ? p.labels : [];
  if (labels.some((l) => /kid|child|family/i.test(String(l)))) return { icon: "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67", label: "Family-friendly" };
  if (a === "restaurant" && p && p.rating >= 4.6 && (p.reviews || 0) >= 300) return { icon: "\uD83C\uDF7D\uFE0F", label: "Best food-first pick" };
  if (a === "pub") return { icon: "\uD83C\uDF7A", label: "Sports bar vibe" };
  // Comparative: nearest venue among the strong-rated options in this list.
  if (Array.isArray(list) && p && p.distMi != null && p.rating >= 4.5 && (p.reviews || 0) >= 100) {
    let best = null;
    for (const q of list) { if (q && q.distMi != null && q.rating >= 4.5 && (q.reviews || 0) >= 100) { if (best == null || q.distMi < best) best = q.distMi; } }
    if (best != null && p.distMi <= best) return { icon: "\uD83D\uDCCD", label: "Closest strong option" };
  }
  return null;
}
