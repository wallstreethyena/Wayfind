// FALL AND HALLOWEEN MEANS THE THEME, NOT THE MONTH (2026-10-08).
//
// The Events tab's "Fall and Halloween" filter used isFallEvent, which also
// accepts a row whose only fall signal is a season tag ("fall") added because
// the event happens in autumn. That let Holiday Lights in Largo, a Dear Evan
// Hansen run, a collard greens festival and a plant sale into the seasonal
// view. The filter now needs a fall or Halloween THEME in the row's own name,
// subcategory or tags. The season tag alone, and any holiday (Christmas) row,
// does not qualify. isFallEvent is untouched: the home fall rail keeps its own
// broader "things to do this fall" meaning.

const THEME_TAGS = new Set([
  "halloween", "spooky", "haunted", "haunted-house", "haunted-attraction", "ghost-tour",
  "trick-or-treat", "trunk-or-treat", "costume", "halloween-party", "pumpkin", "pumpkins",
  "pumpkin-patch", "harvest", "harvest-festival", "corn-maze", "hayride", "oktoberfest",
  "fall-festival", "scarecrow", "day-of-the-dead", "dia-de-los-muertos",
]);

const THEME_RX = /\b(?:hallowe?en|spook\w*|haunt\w*|ghosts?|ghoul\w*|boo|trick[\s-]or[\s-]treat|trunk[\s-]or[\s-]treat|costumes?|monsters?|zombies?|witch\w*|vampires?|scare\w*|scary|fright\w*|horror|creep\w*|pumpkins?|harvest|corn\s?maze|hay\s?rides?|oktoberfest|octoberfest|fall\s+fest\w*|autumn|scarecrows?|d[ií]a\s+de\s+(?:los\s+)?muertos|day\s+of\s+the\s+dead|howl-?o-?ween|bark-?o-?ween|melloween)\b/i;

const HOLIDAY_RX = /\b(?:christmas|holiday lights|hanukkah|kwanzaa|new year|santa|winter wonderland|nights of lights)\b/i;

export function isFallThemedEvent(row) {
  if (!row) return false;
  const category = String(row.category || "").toLowerCase();
  const name = row.event_name || row.name || row.title || "";
  if (category === "holiday" || HOLIDAY_RX.test(name)) return false;
  const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t).toLowerCase()) : [];
  if (tags.some((t) => THEME_TAGS.has(t))) return true;
  const text = [name, row.short_title, row.subcategory].filter(Boolean).join(" ").replace(/-/g, " ");
  return THEME_RX.test(text);
}
