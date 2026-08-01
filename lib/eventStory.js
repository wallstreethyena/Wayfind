const clean = (value, max = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

const CATEGORY_COPY = [
  [/comedy/i, {
    whyGo: "A live comedy night for people who want a shared laugh and a plan that feels more social than another dinner.",
    bestFor: "A low-pressure night out",
    expect: "A live comedy set; confirm the venue's show policies before you go.",
  }],
  [/concert|music|rock|pop|jazz|country|hip-hop|latin/i, {
    whyGo: "A live music plan when you want the room, the crowd, and the performance to be the point of the night.",
    bestFor: "Music-first plans",
    expect: "A live performance; check the official listing for doors and show details.",
  }],
  [/sport|baseball|basketball|football|hockey|soccer/i, {
    whyGo: "A live game gives the night a built-in rhythm, a crowd to join, and something everyone can react to together.",
    bestFor: "Groups and game-day energy",
    expect: "A live sporting event; confirm entry and venue policies before arrival.",
  }],
  [/family|children|kids/i, {
    whyGo: "A family outing with a clear centerpiece, useful when you want a plan that keeps different ages engaged together.",
    bestFor: "An easy family plan",
    expect: "A family-focused event; check the official listing for age guidance.",
  }],
  [/theatre|theater|arts|dance|ballet/i, {
    whyGo: "A performance-led night that gives you something specific to see, talk about, and remember beyond the usual routine.",
    bestFor: "A more intentional night out",
    expect: "A seated performance; confirm runtime and entry details with the venue.",
  }],
];

export function eventStoryEvidence(event = {}) {
  return {
    id: clean(event.id, 120),
    name: clean(event.name, 180),
    segment: clean(event.segment, 60),
    genre: clean(event.genre, 80),
    venue: clean(event.venue, 160),
    city: clean(event.city, 100),
    date: clean(event.date, 20),
    time: clean(event.time, 12),
    price: clean(event.price, 60),
    description: clean(event.description, 700),
    ticketed: !!event.ticketed,
  };
}

export function eventStoryFallback(event = {}) {
  const evidence = eventStoryEvidence(event);
  const category = `${evidence.segment} ${evidence.genre} ${evidence.name}`;
  const matched = CATEGORY_COPY.find(([pattern]) => pattern.test(category));
  const copy = matched ? matched[1] : {
    whyGo: "A time-specific local plan with a real place to be, useful when you want the night to feel chosen instead of improvised.",
    bestFor: "Making a real plan",
    expect: "Confirm the latest timing and entry details on the official listing.",
  };
  return {
    eyebrow: "Why go",
    whyGo: copy.whyGo,
    bestFor: copy.bestFor,
    expect: evidence.venue ? `${copy.expect} Venue: ${evidence.venue}.` : copy.expect,
  };
}

const words = (value) => clean(value).split(/\s+/).filter(Boolean).length;
const unsafe = /\b(best ever|world[- ]class|unforgettable|must[- ]see|guaranteed|everyone will|you will love|iconic)\b/i;

export function validateEventStory(value) {
  if (!value || typeof value !== "object") return null;
  const story = {
    eyebrow: clean(value.eyebrow, 40),
    whyGo: clean(value.whyGo, 320),
    bestFor: clean(value.bestFor, 100),
    expect: clean(value.expect, 180),
  };
  if (!story.eyebrow || !story.whyGo || !story.bestFor || !story.expect) return null;
  if (words(story.eyebrow) > 5 || words(story.whyGo) > 48 || words(story.bestFor) > 12 || words(story.expect) > 24) return null;
  if (unsafe.test(Object.values(story).join(" "))) return null;
  return story;
}
