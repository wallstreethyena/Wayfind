// A Halloween view of the complete, already trusted and geo-admitted Fall
// answer. Never fetch or widen admission here; paging happens after regrouping.
import { chronologicalCards, hasUpcomingFallOccurrence, nextFallOccurrence } from "./fallIntentRails.js";
import { collapseRailBrands } from "./placeDedupe.js";
import { eventFranchiseKey } from "./fallSkin.js";
import { siteTodayStr } from "./siteTime.js";

export const HALLOWEEN_INTENT_RAIL_DEFS = Object.freeze([
  { id: "decorated-bars", title: "Decorated Bars & Themed Dining", deck: "Immersive Halloween rooms for drinks and dinner." },
  { id: "themed-food", title: "Halloween Treats & Themed Drinks", deck: "Halloween menus, themed treats, and spooky sips." },
  { id: "haunts", title: "Haunted Houses & Fright Nights", deck: "Scary houses, trails, and Halloween park nights." },
  { id: "farms", title: "Pumpkin Patches & Fall Farms", deck: "Pumpkins, hayrides, and real fall farms." },
  { id: "corn-mazes", title: "Corn Mazes", deck: "Find your way through the stalks." },
  { id: "family", title: "Halloween With the Kids", deck: "Halloween fun and trick or treating." },
  { id: "festivals", title: "Halloween Festivals & Parties", deck: "Costumes, festivals, and Halloween nights out." },
  { id: "ghost-tours", title: "Ghost Tours & Haunted History", deck: "Local ghost stories and guided haunted walks." },
  { id: "last-minute", title: "Last Minute Halloween Plans", deck: "Confirmed plans this week, through Halloween." },
]);

export function halloweenCardRail(card) {
  // Statewide photo discovery is an additional Fall intent, not permission
  // to widen any Halloween shelf. Its original geo-admitted card still files.
  if (card?.fallPhotoProjection) return null;
  const tags = (card?.tags || []).map((tag) => String(tag).toLowerCase());
  const text = [card?.name, card?.event_name, card?.title, card?.subcategory, ...tags,
    card?.hook, card?.take, card?.card_hook, card?.editorial_summary].filter(Boolean).join(" ").toLowerCase();
  const subtype = String(card?.subcategory || "").toLowerCase();
  if (/tribute store/.test(text)) return null;
  // Editorial hospitality metadata is assigned only from verified offering
  // evidence upstream. These are intents, never new admission or date rules.
  const hospitality = String(card?.halloweenRail || card?.halloween_rail || "");
  if (hospitality === "decorated-bars" || hospitality === "themed-food") return hospitality;
  const party = /halloween[ -]party|costume[ -]party|street[ -]party/.test(subtype + " " + tags.join(" "));
  const halloween = /halloween|trick[ -]or[ -]treat|trunk[ -]or[ -]treat|spooktacular|boo[ -]bash|brick[ -]or[ -]treat|ghosts.{0,8}goblins/.test(text);
  const hospitalityText = [text, card?.category, ...(card?.types || [])].filter(Boolean).join(" ");
  const diningVenue = /themed[ -]bar|\bbar\b|\bpub\b|restaurant|bistro|tavern|lounge|cafe/.test(hospitalityText);
  // A haunted-history claim is not proof of decorations. Require an actual
  // themed environment, not simply a bar's ghost story or seasonal keyword.
  const decorated = /(?:halloween|horror|spooky)[ -]themed[ -](?:bar|pub|restaurant|lounge)/.test(text)
    || /(?:immersive[ -]halloween|halloween[ -]takeover|fully[ -]transformed.{0,40}halloween|halloween.{0,40}fully[ -]transformed)/.test(text);
  const seasonalMenu = /seasonal[ -]menu|halloween[ -]menu|themed[ -]food/.test(subtype)
    || tags.some((tag) => /^(?:halloween-menu|themed-food|seasonal-drinks)$/.test(tag))
    || /halloween[ -](?:menu|donuts?|doughnuts?|desserts?|treats?|bites?)\b/.test(text);
  const dogOnly = tags.includes("dog-friendly")
    && !/kids?|children|trick[ -]or[ -]treat|trunk[ -]or[ -]treat/.test(text)
    && !(card?.audience || []).some((a) => /^(kids|children)$/.test(a));
  const family = !dogOnly && (tags.includes("family") || /brick[ -]or[ -]treat|spooktacular|family[ -]halloween|kid[ -]friendly|family[ -]friendly|not[ -]so[ -]scary|no[ -]scares|non[ -]scary|trick[ -]or[ -]treat|trunk[ -]or[ -]treat/.test(text)
    || (card?.audience || []).some((a) => /^(families|kids|children)$/.test(a)));
  if (/ghost[ -](?:tour|walk)|haunted[ -]history|cemetery[ -]tour|paranormal[ -](?:tour|investigation|experience)/.test(text)) return "ghost-tours";
  if (/\b(?:bar|pub)[ -]crawl/.test(text)) return halloween ? "festivals" : null;
  if (tags.includes("scary")) return "haunts";
  if (party && halloween) return "festivals";
  // An attraction with a snack stand or cocktail bar keeps its actual
  // identity. Hospitality heuristics never turn the haunt into a menu.
  if (!family && (/haunted[ -](?:house|trail|maze|hayride|attraction)|horror nights|howl[ -]o[ -]scream|scare[ -]zone/.test(text)
    || (!diningVenue && /\bhaunts?\b/.test(text)))) return "haunts";
  if (diningVenue && decorated) return "decorated-bars";
  if (halloween && seasonalMenu && !/party|festival|(?:trick|trunk|brick)[ -]or[ -]treat/.test(text)) return "themed-food";
  // A community family program can offer hayrides without becoming a farm.
  if (family && halloween && /^family[ -]halloween$/.test(subtype)) return "family";
  if (/corn[ -]maze/.test(text) && !/inflatable[ -]corn[ -]maze/.test(text)) return "corn-mazes";
  // Pumpkins on their own can mean an indoor children's activity or a latte.
  if (/pumpkin[ -](?:patch|picking|festival)|hayrides?/.test(text)
    || (/\bfarm\b|\bfarms\b/.test(text) && /fall|harvest|pumpkin/.test(text))) return "farms";
  if (family && halloween) return "family";
  if (halloween || /costume[ -](?:party|festival|parade)|spooky[ -]date/.test(text)) return "festivals";
  return null;
}

export function composeHalloweenRails(sourceRails, today = siteTodayStr()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today))) throw new Error("Halloween requires an Eastern calendar date");
  const through = `${today.slice(0, 4)}-10-31`;
  const weekEnd = new Date(`${today}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekThrough = [siteTodayStr(weekEnd), through].sort()[0];
  const ctx = { today, now: new Date(`${today}T16:00:00Z`) };
  const buckets = Object.fromEntries(HALLOWEEN_INTENT_RAIL_DEFS.map(({ id }) => [id, []]));
  const seen = new Set();
  const series = new Set();
  const candidates = (Array.isArray(sourceRails) ? sourceRails : []).flatMap((rail) => rail.cards || [])
    .slice().sort((a, b) => chronologicalCards(a, b, ctx));
  for (const card of candidates) {
    const id = card.id || card.event_id;
    const rail = halloweenCardRail(card);
    const start = card.start_date || card.seasonalStart;
    const end = card.end_date || card.seasonalThrough;
    const next = nextFallOccurrence(card, today);
    const franchise = card.kind === "event" ? card.event_series_id || eventFranchiseKey(card.name || card.event_name || card.title) : null;
    if (!rail || !id || seen.has(id) || (franchise && series.has(franchise)) || today > through
      || /^(cancelled|canceled|ended|past|postponed)$/i.test(card.event_status || "")
      || (start && start > through) || (end && end < today) || (next && next > through)
      || !hasUpcomingFallOccurrence(card, today)) continue;
    seen.add(id);
    if (franchise) series.add(franchise);
    buckets[rail].push(card);
    // A season envelope is not an operating calendar. Select-night events
    // need explicit occurrences before being advertised as a plan this week.
    if (next && next <= weekThrough && (!card.select_nights || card.occurrence_dates?.length)) buckets["last-minute"].push(card);
  }
  return HALLOWEEN_INTENT_RAIL_DEFS.map((def) => ({ ...def, cards: collapseRailBrands(buckets[def.id]), fallbackUsed: false }));
}
