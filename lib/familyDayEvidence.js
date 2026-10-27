// Small, first-party-verified overlays for family-day filters that Google
// place metadata cannot prove. An entry never creates inventory: callers must
// still start with an eligible wf_inventory place and join by exact Place ID.

const VERIFIED_AT = "2026-09-10";
// Admission, reservation, and access policies are dynamic. Re-check monthly.
// 2026-10-27: entries re-verified against the operator's live page carry their
// own verifiedAt/expiresAt below; everything still on these defaults is
// EXPIRED on purpose (facts fall back to unknown) until it is re-checked —
// never renew this constant without re-reading every page that relies on it.
const EXPIRES_AT = "2026-10-10";

const AGE_VALUES = new Set(["baby", "toddler", "kid", "tween", "teen", "all-ages"]);
const WEATHER_VALUES = new Set(["indoor", "outdoor", "heat-friendly", "shaded"]);
const COST_VALUES = new Set(["free", "ticketed"]);
const DURATION_VALUES = new Set(["quick", "half-day", "full-day"]);
const RAIL_VALUES = new Set(["beach", "attractions", "water", "animals", "outdoors", "indoor", "space", "active", "culture", "food"]);
const STYLE_VALUES = new Set(["hands-on", "educational", "animal-focused", "nature", "show", "active"]);
const COMPOSITION_VALUES = new Set(["mixed-ages", "young-children", "older-kids"]);

const fact = (values) => Object.freeze({
  verifiedAt: VERIFIED_AT,
  expiresAt: EXPIRES_AT,
  ...values,
  sources: Object.freeze(values.sources),
  ...(values.ages ? { ages: Object.freeze(values.ages) } : {}),
  ...(values.weather_fit ? { weather_fit: Object.freeze(values.weather_fit) } : {}),
  ...(values.rail_types ? { rail_types: Object.freeze(values.rail_types) } : {}),
  ...(values.style ? { style: Object.freeze(values.style) } : {}),
  ...(values.composition ? { composition: Object.freeze(values.composition) } : {}),
});

export const FAMILY_DAY_EVIDENCE = Object.freeze({
  // Ticketed is a planning fact, not an affiliate flag. These exact venues
  // disappeared when a family selected Ticketed despite selling admission.
  // Verified against the operators on 2026-09-11; no age/indoor claims inferred.
  ...Object.fromEntries([
    "ChIJvRBCrN9-54gRGZuuaCLGrQE",
    "ChIJdd8VlMN-54gRoaU0d_zYhfk",
    "ChIJvRBCrN9-54gR84ltVW4FZBM",
    "ChIJa7bjTAB_54gR-M-m-KIOCP0",
  ].map((id) => [id, fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed",
    sources: ["https://media.universalparksusa.com/press-releases/universal-orlando-resort-launches-new-multi-day-tickets-for-visits-in-2026-that-give-guests-the-option-to-access-every-theme-park-including-universal-epic-universe/"],
  })])),
  "ChIJCXAq5_DEwogRjTPE2xlsZtE": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed",
    rail_types: ["animals"],
    sources: ["https://www.flaquarium.org/visit/tickets-pricing/tickets/"],
  }),
  // 2026-10-27 re-audit: "inside the attraction" and "2 and under free" are
  // not "indoor"/"all-ages" statements, so both are withdrawn; the FAQ's
  // "3-4 hours" is what half-day encodes.
  "ChIJ73yw37J954gRDwQad4ih7Wk": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed",
    duration_recommendation: "half-day", parking: true, reservation_required: false,
    parking_tip: "Free parking is available at The Florida Mall.",
    stroller: true,
    stroller_note: "Strollers are permitted within the published size limit; pull wagons are not.",
    rail_types: ["attractions", "indoor"], style: ["hands-on"], composition: ["mixed-ages"],
    sources: [
      "https://www.crayolaexperience.com/orlando/plan-your-visit/faqs",
      "https://www.crayolaexperience.com/orlando/plan-your-visit/special-offers/two-and-under-free",
    ],
  }),
  "ChIJ-6lKAInEwogRVnf5NBtjZss": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed", parking: true, parking_tip: "The adjacent William F. Poe Garage is the closest option.", stroller_parking: true,
    rail_types: ["indoor"],
    sources: ["https://glazermuseum.org/visit/"],
  }),
  "ChIJoVWX_Rm02YgRllHsIZGN16c": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", ages: ["all-ages"], weather_fit: ["indoor"], cost: "ticketed",
    duration_recommendation: "half-day", parking: true,
    parking_tip: "A Miami Parking Authority lot is next to the museum.",
    rail_types: ["indoor"], style: ["hands-on", "educational"], composition: ["mixed-ages", "young-children"],
    sources: ["https://www.miamichildrensmuseum.org/plan-your-visit"],
  }),
  "ChIJ2f1pZPkA2YgRw01q-hlXoTQ": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed", parking: true, parking_tip: "City-operated garages and street parking surround the museum.",
    rail_types: ["indoor", "space"], style: ["educational"],
    sources: ["https://mods.org/visitor-info/", "https://mods.org/tickets/"],
  }),
  // 2026-10-27 re-audit: the page's "two parking spots for... a valid baby
  // stroller permit" is car parking for permit holders, not stroller parking;
  // the stroller_parking claim is withdrawn.
  "ChIJab3yr6C22YgRdh8TY4oVu_w": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed", parking: true, parking_tip: "Paid onsite museum-garage parking is available but limited.",
    rail_types: ["animals", "indoor", "space"], style: ["educational", "animal-focused"],
    sources: ["https://www.frostscience.org/plan-your-day/"],
  }),
  // 2026-10-27 real-browser re-check (osc.org/visit): admission prices, the
  // paid first-come garage and the stroller checkout/size rule are stated;
  // "indoor" is not, so weather_fit is withdrawn until the page says it.
  "ChIJo2bql5B654gR_ITN9PGhBbU": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed", parking: true, parking_tip: "Paid parking is available in the Science Center garage on a first-come basis.", stroller: true,
    stroller_note: "Strollers are available for checkout; strollers and wagons over 31 inches wide or 52 inches long are not recommended.",
    rail_types: ["indoor", "space"], style: ["hands-on", "educational"],
    sources: ["https://www.osc.org/visit/"],
  }),
  "ChIJRdxzRk1-54gRJvqlZQbtpE4": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", ages: ["all-ages"], weather_fit: ["indoor"], cost: "ticketed",
    duration_recommendation: "half-day", parking: true,
    parking_tip: "Parking is available in the Pointe Orlando garage.",
    height_restrictions: true,
    height_note: "Several rides publish minimum heights; the interactive exhibits themselves are described as all-ages.",
    rail_types: ["attractions", "indoor", "active"], style: ["hands-on", "active"], composition: ["mixed-ages"],
    sources: [
      "https://www.wonderworksonline.com/orlando/contact-wonderworks-orlando/frequently-asked-questions/",
      "https://www.wonderworksonline.com/orlando/contact-wonderworks-orlando/ticket-prices/",
    ],
  }),
  "ChIJiTHKxDOu4IgRgAU6btoqIsU": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed",
    rail_types: ["attractions", "space"], style: ["educational"],
    sources: ["https://www.kennedyspacecenter.com/info/plan-your-visit/"],
  }),
  "ChIJFY7wCsjD2YgRn8R_2IMRjtw": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed",
    rail_types: ["animals", "outdoors"], style: ["animal-focused", "nature"],
    sources: ["https://shop.zoomiami.org/mainstore"],
  }),
  "ChIJ5UOOwKux5YgRAmO1YNbhTc0": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed", reservation_required: true,
    rail_types: ["animals", "outdoors"], style: ["animal-focused", "nature"],
    sources: ["https://www.jacksonvillezoo.org/plan-your-visit"],
  }),
  "ChIJ9RHZGx6H3YgRnWVYIWsHNPM": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed", parking: true, parking_tip: "The venue states that parking is free and ample.", reservation_required: false,
    rail_types: ["attractions", "water", "animals", "outdoors"], style: ["animal-focused", "nature"],
    sources: ["https://www.gatorland.com/tickets/"],
  }),
  "ChIJmToCpQ4J3YgRof6hhxcoTIM": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", cost: "ticketed", weather_fit: ["outdoor"],
    rail_types: ["outdoors", "culture"], style: ["nature", "educational"],
    sources: ["https://boktowergardens.org/admission/"],
  }),
  "ChIJh8tXh-FBw4gR9kFzfZN_g60": fact({
    // 2026-10-27 re-audit: the county page says "950 free parking spaces" (not
    // "more than"), and it lists changing rooms, so changing_facilities: false
    // was wrong and is withdrawn, as is "shaded" (shelters are not shade the
    // page claims).
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", weather_fit: ["outdoor"], parking: true, parking_tip: "The county lists 950 free parking spaces.",
    rail_types: ["beach", "outdoors", "active"], style: ["nature", "active"],
    sources: ["https://www.sarasotacountyparks.com/parks-and-facilities/discover-a-park/destination-parks/siesta-beach"],
  }),
  // PopStroke Orlando: the venue page said "Opening Q4 2026" on 2026-10-27, so
  // this entry is left EXPIRED on purpose until the venue is confirmed open.
  "ChIJ1WjNap1n54gRqNPBblOe5Pk": fact({
    rail_types: ["active", "food"], style: ["active"],
    sources: ["https://popstroke.com/venues/orlando/"],
  }),
  "ChIJpQ0d6taD3YgRkthjcpuq-x8": fact({
    verifiedAt: "2026-10-27", expiresAt: "2026-11-27", ages: ["all-ages"], cost: "ticketed",
    parking: true,
    parking_tip: "The Orlando castle offers free onsite parking.",
    rail_types: ["culture", "food"], style: ["show"], composition: ["mixed-ages"],
    sources: [
      "https://www.medievaltimes.com/orlando",
      "https://www.medievaltimes.com/experience/faq",
      "https://www.medievaltimes.com/orlando/what-to-expect",
    ],
  }),
});

const copyAllowedArray = (value, allowed) => Array.isArray(value)
  ? value.filter((item) => allowed.has(item))
  : [];

// Returns only known enum values and only while the first-party verification
// is current. Omitted facts remain unknown; callers must never infer them.
export function familyFilterFacts(placeId, { now = Date.now() } = {}) {
  const raw = FAMILY_DAY_EVIDENCE[String(placeId || "")];
  if (!raw || !Number.isFinite(now)) return null;
  const verifiedMs = Date.parse(raw.verifiedAt);
  const expiresMs = Date.parse(raw.expiresAt);
  const safeSources = Array.isArray(raw.sources)
    ? raw.sources.filter((source) => typeof source === "string" && /^https:\/\/[^\s]+$/.test(source))
    : [];
  if (!Number.isFinite(verifiedMs) || !Number.isFinite(expiresMs)) return null;
  if (verifiedMs > now || expiresMs <= verifiedMs || expiresMs <= now || !safeSources.length) return null;

  const result = {
    verifiedAt: raw.verifiedAt,
    expiresAt: raw.expiresAt,
    sources: safeSources,
  };
  const ages = copyAllowedArray(raw.ages, AGE_VALUES);
  const weather = copyAllowedArray(raw.weather_fit, WEATHER_VALUES);
  const rails = copyAllowedArray(raw.rail_types, RAIL_VALUES);
  const style = copyAllowedArray(raw.style, STYLE_VALUES);
  const composition = copyAllowedArray(raw.composition, COMPOSITION_VALUES);
  if (ages.length) result.ages = ages;
  if (weather.length) result.weather_fit = weather;
  if (COST_VALUES.has(raw.cost)) result.cost = raw.cost;
  if (DURATION_VALUES.has(raw.duration_recommendation)) result.duration_recommendation = raw.duration_recommendation;
  if (raw.parking === true || raw.parking === false) result.parking = raw.parking;
  if (typeof raw.parking_tip === "string" && raw.parking_tip.trim()) result.parking_tip = raw.parking_tip.trim();
  if (raw.reservation_required === true || raw.reservation_required === false) result.reservation_required = raw.reservation_required;
  if (raw.stroller === true || raw.stroller === false) result.stroller = raw.stroller;
  if (raw.stroller_parking === true || raw.stroller_parking === false) result.stroller_parking = raw.stroller_parking;
  if (raw.changing_facilities === true || raw.changing_facilities === false) result.changing_facilities = raw.changing_facilities;
  if (raw.height_restrictions === true || raw.height_restrictions === false) result.height_restrictions = raw.height_restrictions;
  for (const key of ["stroller_note", "height_note"]) {
    if (typeof raw[key] === "string" && raw[key].trim()) result[key] = raw[key].trim();
  }
  if (rails.length) result.rail_types = rails;
  if (style.length) result.style = style;
  if (composition.length) result.composition = composition;
  return result;
}
