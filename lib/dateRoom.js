// lib/dateRoom.js — THE DATE-NIGHT IDENTITY, and there is now exactly one.
//
// v8.82 (owner, 2026-08-28, screenshot of the Date Night sheet leading with
// the SUNSHINE SKYWAY BRIDGE, wearing a "🌹 Date Night" chip): "a bridge for
// date night is ridiculous."
//
// He is right, and the bridge got there honestly — because nothing on that
// surface ever asked what a date night IS. Three surfaces make the date-night
// claim and until now only one of them had a rule:
//
//   1. the `datenight` RAIL (lib/railSelect.js) — had `isDateRoom`, correct;
//   2. the `datenight` EXPERIENCE sheet (app/home.js EXPERIENCES) — its whole
//      membership test was `rating >= 4.3 && !fast_food`. That is a QUALITY
//      bar, not an identity, and it is the exact failure lib/railSelect.js's
//      own header describes: "wherever an identity is missing the score
//      quietly answers a different question". The Skyway Bridge is 4.8 over
//      2,336 reviews, so it sailed through — and one of that sheet's evening
//      queries literally searches `attractions` for "scenic sunset spot",
//      which is the best possible description of that bridge;
//   3. the place-card CHIP (app/components/IconicPlaceCard.js) — has its own
//      correctly-gated rule and was never the leak.
//
// The rule lived as a `const` inside railSelect.js, which is SERVER ONLY (it
// pulls in seasons, creatorBoost and ranking). app/home.js is a client
// component and could not import it without dragging all of that into the
// bundle — so the sheet had no way to reuse the right answer even in
// principle. That is why this is its own module: the same cure lib/breakfast,
// lib/quickService, lib/mealPlace and lib/familyPlace already are, for exactly
// the same reason.
//
// THE RULE, unchanged from the rail's, plus the one thing the rail never
// needed. Four conditions:
//   1. a MEAL (lib/mealPlace.js) — a dessert counter is not dinner;
//   2. not COUNTER SERVICE (lib/quickService.js) — a room you sit in is the
//      whole difference between this and `eat`;
//   3. not a DAYTIME-only room — a brunch spot is a real meal in a real room
//      and is shut before date night starts. Primary type is the claim
//      (v8.30.1): a dinner house that also serves brunch carries
//      `brunch_restaurant` as a secondary token and survives;
//   4. …OR it is one of the sit-down DRINKS rooms the sheet's own copy
//      promises. Its lead says "candlelit dinners, WINE BARS, sunset views and
//      after-dark charm", and a wine bar is not a meal place, so the rail's
//      three-part rule alone would have deleted the thing the tile advertises.
//      A sports bar is not on this list and is not supposed to be.
import { isMealPlace } from "./mealPlace.js";
import { isQuickService } from "./quickService.js";

const DAYTIME_ONLY_PRIMARY = new Set([
  "breakfast_restaurant", "brunch_restaurant", "bagel_shop", "cafe", "coffee_shop",
]);

// Rooms you sit in and talk in. Deliberately NOT `bar`, `sports_bar`,
// `pub`, `irish_pub` or `night_club` — those are Tonight's Move, and the two
// rails exist precisely because they are different evenings.
const DRINKS_ROOM_PRIMARY = new Set([
  "wine_bar", "cocktail_bar", "lounge_bar", "piano_bar", "speakeasy",
]);

const primaryOf = (p) => String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();

/** Is this a room you would take someone to for the evening? */
export function isDateRoom(p) {
  if (!p) return false;
  const primary = primaryOf(p);
  if (DRINKS_ROOM_PRIMARY.has(primary)) return true;
  return isMealPlace(p) && !isQuickService(p) && !DAYTIME_ONLY_PRIMARY.has(primary);
}

export { DAYTIME_ONLY_PRIMARY, DRINKS_ROOM_PRIMARY };
