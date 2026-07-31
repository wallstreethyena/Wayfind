// lib/dealSheet.js — the pure derivation behind "The Deal Sheet" (the coupons
// page). Owner mock: docs/mocks/coupons-deal-sheet-mock.html.
//
// WHY A MODULE AND NOT LOGIC IN THE SCREEN
// The work order's hard requirement is that both tiers are DERIVED from the
// existing coupon data and never hand-sorted, and that it must be impossible to
// render a deal that is not registered in lib/coupons.js / lib/clippOffers.js.
// Neither property is checkable if the sorting lives inside JSX: a guard can only
// grep it. Everything here is pure and exported, so scripts/check-deal-sheet.mjs
// drives the real functions against the real COUPONS array — "assert on the call,
// not on the string".
//
// THE REGISTRY PROPERTY, CONCRETELY
// dealTiers() takes the coupon list as input and only ever partitions it. It
// cannot mint a row: every output object is one of the inputs, carrying its
// original id. A deal absent from COUPONS therefore cannot appear on the page,
// and the guard proves it by asserting the union of both tiers is a subset of the
// input ids.
import { couponIsLive, couponEndsLabel } from "./coupons.js";
import { siteTodayStr } from "./siteTime.js";
import { CLIPP_MARKETS } from "./clippOffers.js";
import { METROS, nearestMetro } from "./orderInFeatured.js";

/* ── tier membership ──────────────────────────────────────────────────────── */

// A STANDING offer is one whose value repeats on a schedule — "every Monday",
// "Taco Tuesday", "second Sunday of the month". Those are the ledger. Everything
// else (affiliate deals, coded deals, priced deals, dated one-offs) is a poster
// card, which is exactly the split the mock draws.
//
// DELIBERATELY NOT MATCHING THE BARE WORD "weekly". The Clipp cards say
// "Inventory rotates weekly" — a sentence about churn, not a schedule a user can
// show up for. Matching it would drop the two affiliate cards into the free
// ledger, i.e. move the money off the money tier. The patterns below all require a
// named day or an explicit cadence.
const CADENCE = [
  /\b(?:every|each)\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)days\b/i,
  /\b(?:first|second|third|fourth|last)\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
  /\btaco tuesday\b/i,
  /\bhappy hour\b/i,
  /\bdaily\b/i,
  /\bweekdays\b/i,
];

/** Does this deal recur on a schedule the user can plan around? */
export function isStandingOffer(c) {
  const hay = [c && c.title, c && c.details].filter(Boolean).join(" ");
  return CADENCE.some((rx) => rx.test(hay));
}

/**
 * Does this deal carry a MONETARY value — a price or a discount you can put a
 * number on? "Free" deliberately does NOT count: a free community offer belongs in
 * the free tier, which is the tier literally named for it.
 */
export function hasMonetaryValue(c) {
  const seal = dealSeal(c);
  return !!(seal && seal.big !== "FREE");
}

/* ── locality: where a deal is good, and whether that is where the user is ─── */

// Deals carry a free-text `area`, never coordinates, so placing one means
// resolving that label to the metro vocabulary the app already uses (METROS in
// lib/orderInFeatured.js — the same list nearestMetro() resolves the USER to).
// One vocabulary for both sides is the whole point: the comparison is only
// meaningful if "Sarasota" means the same thing for a deal and for a viewer.
//
// Towns inside a covered metro that are not the metro's own label. Deliberately
// covers ONLY areas the registry actually uses: an unrecognised area must fail
// loudly in the guard rather than be guessed at, because guessing is how a deal
// gets promoted to "local" for a user it is useless to. See dealScope().
const METRO_TOWNS = Object.freeze({
  bradenton: "sarasota",
  "lakewood ranch": "sarasota",
  manatee: "sarasota",
});

// An area that is good anywhere in the country — a national partner code, not a
// place. NOT the same as "unknown": nationwide is genuinely usable by every
// viewer, so it outranks another metro's inventory.
const NATIONWIDE = /^(?:united states|usa|u\.s\.a?\.?|nationwide|online)$/i;

const areaNorm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Where is this deal good?
 *   { kind: "metro", metro }  — a specific covered metro
 *   { kind: "everywhere" }    — national inventory, usable by any viewer
 *   { kind: "unplaced" }      — no area, or one we cannot resolve
 *
 * UNPLACED IS NEVER TREATED AS LOCAL. A deal we cannot place must not outrank a
 * deal we can, in either direction — that is the failure mode this exists to
 * stop, and scripts/check-deal-sheet.mjs asserts the live registry has none.
 */
export function dealScope(c) {
  const raw = String((c && c.area) || "").trim();
  if (!raw) return { kind: "unplaced" };
  if (NATIONWIDE.test(raw)) return { kind: "everywhere" };
  const a = areaNorm(raw);
  // Hyphenated/compound areas ("Sarasota-Manatee") resolve on any of their parts.
  const parts = a.split(" ").filter(Boolean);
  for (const key of Object.keys(METROS)) {
    const label = areaNorm(METROS[key].label);
    if (a === label || parts.includes(label) || label.split(" ").every((t) => parts.includes(t))) {
      return { kind: "metro", metro: key };
    }
  }
  if (METRO_TOWNS[a]) return { kind: "metro", metro: METRO_TOWNS[a] };
  for (const town of Object.keys(METRO_TOWNS)) {
    const t = town.split(" ");
    if (t.every((tok) => parts.includes(tok))) return { kind: "metro", metro: METRO_TOWNS[town] };
  }
  return { kind: "unplaced" };
}

/**
 * The FIRST sort key. Lower ranks first.
 *   0 — good where the viewer actually is
 *   1 — good everywhere, so still usable here
 *   2 — another metro's inventory, or a deal we cannot place
 *
 * WHY THIS OUTRANKS EXPIRY. Ordering by soonest-expiry alone is honest but
 * editorially wrong for a local-discovery app: it opened the money rail with a
 * national Klook code above Clipp Sarasota purely because the code expired first.
 * A deal for somewhere the user is not costs more than the empty slot would — it
 * earns nothing and spends the user's trust in the rail.
 *
 * WHEN THE VIEWER'S METRO IS UNKNOWN (no center, or >75mi from every covered
 * metro) we cannot claim any deal is "here", so we do not pretend to. It degrades
 * to the owner's rule as stated — any placed local-area deal ahead of national
 * inventory — which is the pre-existing behaviour plus the local/national split.
 */
export function dealLocalityRank(c, viewerMetro) {
  const s = dealScope(c);
  if (s.kind === "unplaced") return 2;
  if (s.kind === "everywhere") return 1;
  if (!viewerMetro) return 0; // unknown viewer: placed beats national, nothing more claimed
  return s.metro === viewerMetro ? 0 : 2;
}

/**
 * Partition live coupons into the two tiers.
 *   featured — "Worth money tonight": the poster rail
 *   ledger   — "Free & local, standing offers": the dotted-leader rows
 *
 * THE RULE IS THE OWNER'S, AND IT IS THE TIER NAMES. A card earns the money rail
 * by being an affiliate deal or by carrying a monetary value (a price, a % off).
 * Everything else — free admission, community offers, standing weekly specials —
 * is the ledger.
 *
 * An earlier version keyed on recurring CADENCE instead, and it put the Marauders
 * and Gecko's 19th Hole on the money rail: both are free local offers whose copy
 * simply lacked a "every Tuesday"-shaped phrase. Cadence describes WHEN a deal
 * runs; it does not describe whether it is worth money. Deriving the tier from the
 * value is what makes the two headings honest.
 *
 * Pure: returns references to the INPUT objects, never new deals — so a deal that
 * is not registered has no path onto the page.
 */
export function dealTiers(coupons, todayIso, viewerCenter) {
  let live = (Array.isArray(coupons) ? coupons : []).filter((c) => couponIsLive(c, todayIso));
  // The viewer's metro, resolved with the SAME haversine the Order In rails use
  // (~75mi, true great-circle). null when the user is outside every covered metro.
  // There are two candidate default centers in this app and picking one here would
  // silently make one of them "local" for everybody.
  const viewerKnown = viewerCenter && isFinite(viewerCenter.lat) && isFinite(viewerCenter.lng);
  const viewerMetro = viewerKnown ? nearestMetro(viewerCenter.lat, viewerCenter.lng) : null;

  // GEO-GATE (owner directive, 2026-07-31): a city-scoped deal is only renderable
  // when the viewer is in the matching metro. An Orlando visitor must NEVER see a
  // Sarasota/Bradenton card — wrong-city monetized inventory is worse than no card.
  //
  // BOTH FAIL-OPEN BRANCHES CLOSED, 2026-08-01, to match the rule lib/dealsData.js
  // already holds for the Undercover Tourist rail (#510). Two surfaces disagreeing
  // about what "near you" means is how one of them quietly becomes wrong.
  //
  //   1. UNPLACED IS NO LONGER KEPT. The old rule kept it "because we cannot prove
  //      it is far away". That is the wrong test — the same one that let a
  //      placeless ski deal render in Florida. The card claims a deal is NEAR YOU,
  //      so the burden is to prove NEAR, and an unresolvable area must fail closed.
  //      `everywhere` is how a deal that is genuinely valid anywhere says so.
  //
  //   2. NO VIEWER LOCATION NO LONGER KEEPS EVERYTHING. It used to return all
  //      inventory — the same fail-open one level up: with no idea where the user
  //      is, every city-scoped card is an unproven proximity claim. Not
  //      hypothetical: `center` is null on first paint before location resolves,
  //      so the old behaviour flashed EVERY metro's cards and then contracted.
  //      National-only also flashes, but never with wrong-city inventory, which is
  //      the failure that actually costs trust.
  live = live.filter((c) => {
    const s = dealScope(c);
    if (s.kind === "everywhere") return true; // valid anywhere, always renderable
    if (s.kind === "unplaced") return false;  // cannot prove NEAR -> not shown
    return viewerKnown && s.metro === viewerMetro;
  });

  const featured = [];
  const ledger = [];
  for (const c of live) {
    const earns = !!dealNetwork(c) || hasMonetaryValue(c);
    (earns ? featured : ledger).push(c);
  }

  // TWO KEYS, both derived from the data — no hand-sort can creep into either.
  //   1. locality: deals good where the viewer is, then national, then unplaced
  //   2. expiry:   soonest-ending first WITHIN each locality group, open-ended last
  // Key 2 alone was the shipped behaviour and it put a national code above local
  // inventory; key 1 is the durable fix. See dealLocalityRank.
  const byExpiry = (a, b) => String(a.expires || "9999-12-31").localeCompare(String(b.expires || "9999-12-31"));
  const order = (a, b) =>
    (dealLocalityRank(a, viewerMetro) - dealLocalityRank(b, viewerMetro)) || byExpiry(a, b);
  featured.sort(order);
  ledger.sort(order);
  return { featured, ledger };
}

/* ── the gold seal ────────────────────────────────────────────────────────── */

// Seal text derives from the deal, in the mock's four shapes:
//   "50% OFF"  · "$16 / REG $19"  · "5% OFF"  · "FREE"
// Returns { big, small } or null when nothing honest can be derived — a card with
// no derivable value renders with no seal rather than an invented one.
export function dealSeal(c) {
  if (!c) return null;
  const hay = [c.title, c.details].filter(Boolean).join(" ");

  // A price with its regular price beside it: "$16 (reg. $19)".
  const priced = /\$(\d[\d,.]*)\s*\(reg\.?\s*\$(\d[\d,.]*)\)/i.exec(hay);
  if (priced) return { big: "$" + priced[1], small: "REG $" + priced[2] };

  // A percentage off, from the title first so "20% off any city tour" wins over a
  // stray number in the fine print.
  const pct = /(\d{1,2})\s*%\s*off/i.exec(c.title || "") || /(\d{1,2})\s*%\s*off/i.exec(hay);
  if (pct) return { big: pct[1] + "%", small: "OFF" };

  // Half-price is a percentage stated in words.
  if (/\bhalf[- ]price\b/i.test(hay)) return { big: "50%", small: "OFF" };

  // Free admission / free entry. The sub-line names WHO qualifies when the deal
  // is conditional, because "FREE" alone on a military-only offer overpromises.
  if (/\bfree\b/i.test(hay)) {
    if (/military|active[- ]duty/i.test(hay) && /teacher|government|hero/i.test(hay)) return { big: "FREE", small: "HEROES" };
    if (/military|active[- ]duty/i.test(hay)) return { big: "FREE", small: "MILITARY" };
    return { big: "FREE", small: "ENTRY" };
  }
  return null;
}

/* ── the dotted-leader meta line ──────────────────────────────────────────── */

/** Left side: the real expiry, never invented. Falls back to honest open-endedness. */
export function dealEndsLabel(c) {
  return couponEndsLabel(c) || (c && c.expires ? null : "No end date given");
}

/**
 * Right side: an honest proof point. Only facts already present in the data are
 * used — a verified market's offer count, the presence of a real code, or the
 * source having been checked. Never a rating or a saving we do not hold.
 */
export function dealProofPoint(c, deps = {}) {
  if (!c) return null;
  // The registry is imported HERE, not passed in by the screen: the view must not
  // need to know which partners exist. deps.markets stays as a test seam.
  const markets = deps.markets || CLIPP_MARKETS;
  if (c.commerce && c.commerce.offerId) {
    const m = markets.find((x) => x.offerId === c.commerce.offerId);
    const seen = m && m.verified && Number(m.verified.dealsSeen);
    if (seen > 0) return seen + " offers live";
  }
  const priced = /\$(\d[\d,.]*)\s*\(reg\.?\s*\$(\d[\d,.]*)\)/i.exec([c.title, c.details].filter(Boolean).join(" "));
  if (priced) {
    const save = Number(priced[2].replace(/,/g, "")) - Number(priced[1].replace(/,/g, ""));
    if (save > 0) return "Save $" + save;
  }
  if (c.code) return "Code verified";
  return "Verified at source";
}

/* ── the schedule italic (ledger right-hand column) ───────────────────────── */

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The next Nth <weekday> of a month, at or after todayIso, as "next: Aug 9".
 * Exported so the guard can pin it to a fixed date instead of "whatever today is".
 */
export function nextNthWeekday(nth, weekday, todayIso) {
  const t = String(todayIso || siteTodayStr()).slice(0, 10);
  const [ty, tm, td] = t.split("-").map(Number);
  if (!ty || !tm || !td) return null;
  for (let add = 0; add < 14; add++) {          // this month, then the next
    const y = ty + Math.floor((tm - 1 + add) / 12);
    const m = (tm - 1 + add) % 12;
    // Day-of-week of the 1st, then step to the nth occurrence.
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    if (day > dim) continue;
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (iso >= t) return "next: " + MON[m] + " " + day;
  }
  return null;
}

/**
 * The italic gold schedule for a ledger row, derived from the deal's own words.
 * Order matters: the most specific reading wins, and an unparseable schedule
 * falls back to the expiry label rather than a guess.
 */
export function dealSchedule(c, todayIso) {
  if (!c) return null;
  const hay = [c.title, c.details].filter(Boolean).join(" ");

  // "second Sunday of every month" → a computed real date.
  const nth = /\b(first|second|third|fourth|last)\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b/i.exec(hay);
  if (nth) {
    const idx = { first: 1, second: 2, third: 3, fourth: 4, last: 5 }[nth[1].toLowerCase()];
    const wd = DAY.findIndex((d) => d.toLowerCase().startsWith(nth[2].toLowerCase()));
    const label = nextNthWeekday(idx, wd, todayIso);
    if (label) return label;
  }
  // An explicit list of dates in the data wins over any cadence phrasing.
  if (Array.isArray(c.dates) && c.dates.length) {
    const t = String(todayIso || siteTodayStr()).slice(0, 10);
    // Repeated months are dropped, as the mock does: "Aug 6 · 20 · Sep 3".
    let lastMonth = null;
    const up = c.dates.filter((d) => String(d).slice(0, 10) >= t).slice(0, 3)
      .map((d) => {
        const [, m, dd] = String(d).slice(0, 10).split("-").map(Number);
        const label = m === lastMonth ? String(dd) : MON[m - 1] + " " + dd;
        lastMonth = m;
        return label;
      });
    if (up.length) return up.join(" · ");
  }
  if (/\bhappy hour\b/i.test(hay)) {
    const window = /(\d{1,2}(?::\d{2})?)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i.exec(hay);
    return window ? "daily " + window[1] + "–" + window[2] : "happy hour";
  }
  if (/\bdaily\b/i.test(hay)) return "daily";
  if (/\bweekdays\b/i.test(hay)) return "weekdays";

  const every = /\b(?:every|each)\s+(mon|tues|wednes|thurs|fri|satur|sun)day\b/i.exec(hay);
  const plural = /\b(mon|tues|wednes|thurs|fri|satur|sun)days\b/i.exec(hay);
  const taco = /\btaco tuesday\b/i.test(hay) ? "Tues" : null;
  const stem = (every && every[1]) || (plural && plural[1]) || taco;
  if (stem) {
    const full = DAY.find((d) => d.toLowerCase().startsWith(stem.toLowerCase())) || stem + "day";
    // A recurring offer that also expires says both, so a user knows the window.
    const ends = couponEndsLabel(c);
    return ends ? full + "s thru " + ends.replace(/^Ends /, "") : "every " + full;
  }
  // An open-ended offer with no cadence still needs its column filled — the ledger
  // reads as broken with a gap. "standing offer" is the honest label: it is what
  // the tier is called, and it claims nothing the data does not say.
  return couponEndsLabel(c) || (c.expires ? null : "standing offer");
}

/* ── the disclosure line ──────────────────────────────────────────────────── */

// Which network a deal earns through, derived from what the link actually is —
// never from a hand-set label. An affiliate claim has to be true.
export function dealNetwork(c) {
  if (!c) return null;
  if (c.commerce && c.commerce.provider) {
    return { clipp: "Clipp" }[c.commerce.provider] || c.commerce.provider;
  }
  const u = String(c.url || "");
  if (/[?&]aid=\d+/.test(u) && /klook\.com/i.test(u)) return "Klook";
  if (/[?&]pid=P\d+/i.test(u) && /viator\.com/i.test(u)) return "Viator";
  // CityPASS rides the CJ RAW-PATH form, so the destination is a path segment of
  // the anrdoezrs.net URL rather than a query param. Both halves are required:
  // the CJ publisher id proves the link is tracked (an untracked citypass.com
  // link earns nothing, and a card that claims a commission on it is lying), and
  // the citypass.com segment proves it is this advertiser and not another CJ
  // program that happens to share our PID.
  if (/anrdoezrs\.net\/links\/\d+\//i.test(u) && /citypass\.com/i.test(u)) return "CityPASS";
  return null;
}

/**
 * ONE quiet line, no pill. Affiliate deals name the network; everything else says
 * so plainly. `network` is returned separately so the view can italicise just
 * that word, as the mock does.
 */
export function dealDisclosure(c) {
  const net = dealNetwork(c);
  if (net) return { affiliate: true, network: net, before: "Wayfind earns a commission ", italic: "via " + net, after: " — your price is the same." };
  return { affiliate: false, network: null, before: "", italic: "Not an affiliate offer — just a good one.", after: "" };
}

/* ── artwork ──────────────────────────────────────────────────────────────── */

// Committed, ≥640px-wide assets, mapped by the deal's own primary intent. These
// are OUR files: nothing here hotlinks a merchant, and CJ banner creatives are
// deliberately absent — they are IAB ad units (320x50 … 300x600), the wrong shape
// and the wrong register for an editorial 3:2 band (see #474).
// REPOINTED 2026-08-01 onto the owner's curated dining photography. The previous
// map sent five of seven intents at generated art, which meant a FREE local offer
// — which has no curated photo of its own — was the most likely card to render a
// fake image. "Art is not a privilege of the cards that pay" cuts both ways: the
// fix is real photographs on the free cards, not removing art from them.
//
// The three attraction/outdoor intents are deliberately EMPTY. Every dining photo
// in the set is a restaurant scene, and a restaurant photo on an attraction-ticket
// card is the same category error as the ferris wheel — real, but about something
// else. They render with no band until attraction photography is supplied, which
// is the honest gap rather than a plausible-looking substitute.
const INTENT_ART = {
  eatnow: "/cards/coupon-dining-group-restaurant.jpeg",
  datenight: "/cards/date-night-dining-hero.jpg",
  nightout: "/cards/coupon-dining-dessert-couple.jpeg",
  // familyfun / outdoors / cozyindoor / hiddengems: DELIBERATELY EMPTY. Every photo
  // in the curated set is a restaurant scene, and cozyindoor covers museums and
  // indoor attractions — a café photograph there is the same category error as the
  // ferris wheel, real but about something else. These render with no band until
  // attraction photography is supplied. hidden-gems.jpg is 1200x630 like the rest
  // of the generated set, so it is not a substitute either.
};

// Assets that are GENERATED, not photographed, and may never reach a card.
//
// These are a matched set: 1200x630 with a neon map-pin graphic baked in and a
// dark right third sized for overlaid text. They are Open Graph SHARE images —
// which is also why they are 1.90:1 and were being cover-cropped into this 3:2
// band. The ratio is the tell: every generated asset is 1.90, every real
// photograph in /cards/ is 1.50.
//
// STRUCTURAL, NOT PER-CARD. Flagging the two cards that happen to use one today
// would leave the fallback free to serve generated art to the next deal carrying
// a matching intent. Filtering the LOOKUP means it cannot come back. The entries
// stay in INTENT_ART rather than being deleted so the intent->asset mapping stays
// legible, and so the guard can prove the exclusion is doing something rather
// than passing because the map happens to be empty.
const GENERATED_ART = new Set([
  "/cards/family-fun.jpg",
  "/cards/where-to-eat.jpg",
  "/cards/night-out.jpg",
  "/cards/outdoors.jpg",
  "/cards/cozy-indoor-v1.png",
]);
export const isGeneratedArt = (src) => GENERATED_ART.has(String(src || ""));

/**
 * The 3:2 artwork for a card, or null.
 *
 * NULL IS A REAL ANSWER. The work order is explicit: with no usable image the card
 * renders WITHOUT an artwork band — never a placeholder, never a stretched
 * thumbnail. A grey box that says "no image" is a worse card than a shorter one.
 */
export function dealArtwork(c) {
  if (!c) return null;
  // A deal's own committed image wins. Remote URLs are refused outright: an
  // artwork band is not worth handing a third party control of what renders
  // inside a Wayfind card (or leaking a referer on every view).
  // Generated art is refused even when set explicitly on the deal — otherwise the
  // rule holds only for the fallback path and a row could opt back in.
  if (typeof c.image === "string" && c.image.startsWith("/")) {
    return isGeneratedArt(c.image) ? null : c.image;
  }
  for (const key of Array.isArray(c.intents) ? c.intents : []) {
    const art = INTENT_ART[key];
    if (art && !isGeneratedArt(art)) return art;
  }
  return null;
}

export const DEAL_SHEET_INTERNALS = { CADENCE, INTENT_ART, GENERATED_ART };
