// Deterministic topic chips for a guide card. Everything comes from data the
// guide already carries: its own title/keyword and its picks' flags. No model
// calls, no randomness, no clock. Order of RULES is the order chips appear.
const RULES = [
  ['Free', /\b(free|freebies?|no[- ]cost)\b/i],
  ['Birthday', /\bbirthday\b/i],
  ['Beaches', /\b(beach(?:es)?|shell(?:ing)?|sandbar|barrier island)\b/i],
  ['Parks', /\b(parks?|preserve|trails?|hik(?:e|ing)|kayak|paddle|springs?|nature|wildlife|manatees?)\b/i],
  ['Kids', /\b(kids?|family|families|children|toddlers?)\b/i],
  ['Date night', /\b(date night|romantic|couples?)\b/i],
  ['Fall', /\b(fall|autumn|halloween|pumpkin|haunt(?:ed)?|corn maze|lovebugs?)\b/i],
  ['Food', /\b(restaurants?|dinner|brunch|lunch|eat|eats|food|seafood|pizza|tacos?|coffee|bakery|michelin|dining)\b/i],
  ['Drinks', /\b(bars?|cocktails?|breweries|brewery|happy hour|nightlife)\b/i],
  ['Theme parks', /\b(theme parks?|disney|universal|seaworld|busch gardens|rides?)\b/i],
  ['Events', /\b(festivals?|concerts?|events?|tonight|weekend)\b/i],
  ['Shopping', /\b(shopping|markets?|boutiques?)\b/i],
  ['Day trips', /\b(day trips?|getaways?|road trips?)\b/i],
];
const FOOD_TYPES = /restaurant|steak_house|bakery|cafe|coffee|food|market|bar$/;

export function guideTopics(guide, max = 2) {
  const picks = Array.isArray(guide?.picks) ? guide.picks : [];
  const text = `${guide?.title || ''} ${guide?.keyword || ''}`;
  const out = [];
  const add = (label) => { if (label && !out.includes(label)) out.push(label); };
  for (const [label, rx] of RULES) if (rx.test(text)) add(label);
  if (picks.length && picks.every((p) => p.category === 'food' || FOOD_TYPES.test(String(p.primary_type || '')))) add('Food');
  if (picks.length && picks.every((p) => p.indoor === false)) add('Outdoors');
  else if (picks.length && picks.every((p) => p.indoor === true)) add('Indoors');
  else if (picks.length) add('Indoor and outdoor');
  return out.slice(0, max);
}
