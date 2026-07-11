// Moment/experience picks integrity, Phase 1/2 (MOMENT_PICKS_DIAGNOSIS.md).
// ONE definition per moment intent — its display+search radius and honest
// title — in a plain-JS module both the client (home.js) and the server
// (/api/moment/picks) import, so an intent-id drift becomes a caught error,
// not a silent empty. Radius is the real reason the chip path looked broken:
// mood intents fetched to 60mi but the view clamped the visible list to the
// app's 17mi default, hiding the museums/cafés a mood day is actually made
// of. Each intent now declares the scope a person will genuinely travel for.

export const MOMENT_INTENTS = {
  // Indoor/regional culture — people drive 30-45mi for a good museum day.
  cozyindoor: { radiusMi: 45, scope: "indoor spots (museums, cafés, aquariums, arcades)" },
  hiddengems: { radiusMi: 45, scope: "hidden-gem spots" },
  familyfun: { radiusMi: 45, scope: "family spots" },
  // Evening/out — regional but tighter than a full culture day.
  nightout: { radiusMi: 30, scope: "bars and nightlife" },
  datenight: { radiusMi: 30, scope: "date-night spots" },
  friends: { radiusMi: 30, scope: "group spots" },
  outdoors: { radiusMi: 30, scope: "the outdoors (beaches, parks, trails)" },
  entertainment: { radiusMi: 30, scope: "things to do" },
  // Food — genuinely local; keep it near.
  eatnow: { radiusMi: 20, scope: "places to eat" },
  brunch: { radiusMi: 20, scope: "brunch spots" },
  // Non-mood experience keys that still route through the Experience screen.
  romantic: { radiusMi: 30, scope: "date-night spots" },
  nature: { radiusMi: 30, scope: "the outdoors" },
  gem: { radiusMi: 45, scope: "hidden-gem spots" },
  bestof: { radiusMi: 30, scope: "top spots" },
  budget: { radiusMi: 30, scope: "budget-friendly spots" },
  family: { radiusMi: 45, scope: "family spots" },
};

// Default when an experience key isn't in the table above — mood views should
// never silently fall back to the 17mi app default that caused this bug.
export const DEFAULT_MOMENT_RADIUS_MI = 30;

export function intentRadiusMi(id) {
  const cfg = MOMENT_INTENTS[id];
  return cfg && cfg.radiusMi ? cfg.radiusMi : DEFAULT_MOMENT_RADIUS_MI;
}

export function intentScopeLabel(id) {
  const cfg = MOMENT_INTENTS[id];
  return (cfg && cfg.scope) || "spots";
}

// The set the /api/moment/picks contract validates against (Phase 2).
export const MOMENT_INTENT_IDS = Object.keys(MOMENT_INTENTS);

export function isKnownIntent(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(MOMENT_INTENTS, id);
}
