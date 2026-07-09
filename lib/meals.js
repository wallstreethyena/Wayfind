// v4.61 — Meal-period eligibility. The Top-10 composites label places by
// meal slot (Breakfast / Lunch / Dinner / Quick bite / Late-night eats), and
// a slot label is a promise: a place may only sit under "Breakfast" if it
// verifiably serves that period. Hours evidence wins; when hours are missing
// we fall back to type/name signals; and for breakfast specifically we stay
// STRICT — no evidence means no slot, because one Italian restaurant that
// opens at 11 sitting under Breakfast costs more trust than a shorter list.

// Earliest daily open and latest daily close, in minutes-of-day, from the
// structured Google periods (p.oh.periods). Overnight closes (2 AM) count as
// 24h+ so late-night maths work. Returns null when hours are unknown.
export function hoursSpan(p) {
  try {
    const per = p && p.oh && p.oh.periods;
    if (!per || !per.length) return null;
    let eo = Infinity, lc = -1;
    for (const x of per) {
      const o = x.open; if (!o) continue;
      const c = x.close;
      if (!c) return { eo: 0, lc: 1440 * 2, always: true }; // 24/7
      const om = (o.hour || 0) * 60 + (o.minute || 0);
      let cm = (c.hour || 0) * 60 + (c.minute || 0);
      if (c.day !== o.day || cm <= om) cm += 1440; // crosses midnight
      eo = Math.min(eo, om);
      lc = Math.max(lc, cm);
    }
    if (!isFinite(eo)) return null;
    return { eo, lc };
  } catch (e) { return null; }
}

const BREAKFAST_SIG = /breakfast|brunch|pancake|waffle|diner\b|cafe|caf\u00e9|coffee|bagel|donut|doughnut|bakery|baker\b|juice|crepe|smoothie/;
const FOODISH = /restaurant|food|meal|pizza|taco|burger|deli|diner|sandwich|bbq|barbecue|wing|noodle|ramen|grill/;

// slotLabel matches the composite slot labels exactly.
export function mealEligible(slotLabel, p) {
  const t = (((p && p.types) || []).join(" ") + " " + ((p && p.name) || "") + " " + ((p && p.cuisine) || "")).toLowerCase();
  const span = hoursSpan(p);
  switch (slotLabel) {
    case "Breakfast": {
      if (span) {
        if (span.eo <= 10 * 60) return true;            // provably open by 10 AM
        if (span.eo >= 10 * 60 + 30) return false;      // provably opens 10:30+ (the iDalia case)
      }
      return BREAKFAST_SIG.test(t);                     // no/ambiguous hours: demand a breakfast signal
    }
    case "Lunch": {
      if (span && !span.always && span.eo >= 16 * 60) return false;  // dinner-only rooms
      if (/night_club/.test(t) && !FOODISH.test(t)) return false;
      return true;
    }
    case "Dinner": {
      if (span && !span.always && span.lc <= 16 * 60) return false;  // breakfast/lunch-only spots
      return true;
    }
    case "Quick bite": {
      if (/night_club|\bbar\b/.test(t) && !FOODISH.test(t)) return false;
      return true;
    }
    case "Late-night eats": {
      if (span && !span.always && span.lc < 22 * 60) return false;   // closes before 10 PM
      return FOODISH.test(t) || BREAKFAST_SIG.test(t) || span != null;
    }
    default:
      return true;
  }
}
