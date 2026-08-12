// lib/shareCardCopy.js — what each share surface is ALLOWED to say (v7.26).
//
// One builder per surface. Every one of them is a LADDER: it claims the
// strongest thing it can actually prove from the params it was given, and steps
// down when a param is missing. Nothing here invents a number, a superlative or
// a scarcity line — the card is a promise the page has to keep, and the fastest
// way to lose a first-time visitor is to open a link that does not match the
// text it arrived in.
//
// JSX-free so scripts/check-share-card.mjs can call every ladder with fixtures
// and assert on the SENTENCE, not on the presence of a template literal.
import { buildCard, eyebrowFrom, footFrom, commas, money, textWidth, CARD } from "./shareCard.js";

const s = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 90);
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

// "good through 2026-08-31" is a database field wearing a coupon. Both coupon
// callers pass their expiry differently (one already formatted, one raw ISO
// from the query string), so the formatting lands HERE rather than in either
// route — otherwise the same coupon reads two ways depending on which surface
// shared it. Verified against a real render before this existed.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function humanDate(x) {
  const raw = s(x, 24);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  const mo = MONTHS[Number(m[2]) - 1];
  return mo ? mo + " " + Number(m[3]) : raw;
}

// ══ ONE PLACE ═══════════════════════════════════════════════════════════════
export function placeModel(p) {
  const q = p || {};
  const name = s(q.name, 60) || "A spot worth your time";
  const sc = s(q.sc, 5), mi = s(q.mi, 6), r = s(q.r, 4);
  const rev = commas(q.rev), cat = s(q.cat, 34), city = s(q.city, 32), hook = s(q.hook, 110);

  let headline, accent;
  if (sc && mi) { headline = name + " is a " + sc + ", and it's " + mi + " miles from you"; accent = sc; }
  else if (sc) { headline = name + " is a " + sc + " out of 10"; accent = sc; }
  else if (hook) { headline = hook; accent = name; }
  else if (r && rev) { headline = name + " holds " + r + " stars across " + rev + " reviews"; accent = r; }
  else { headline = name + " is worth your time"; accent = name; }

  // No star GLYPH anywhere. The Archivo Latin subset has no U+2605, so the old
  // card rendered a tofu box next to every rating — visible in production.
  const proof = sc ? footFrom(["Wayfind score", r && rev ? r + " from " + rev + " reviews" : cat || city])
                   : footFrom([cat, city, r && rev ? r + " from " + rev + " reviews" : ""]);
  return buildCard({
    eyebrow: eyebrowFrom([city, mi ? mi + " mi" : ""]),
    headline, accent, foot: proof, cta: q.cta, ctaFallback: "SEE THE SPOT",
  });
}

// ══ A LIST / A PAGE ═════════════════════════════════════════════════════════
export function listModel(p) {
  const q = p || {};
  const title = s(q.title, 120) || "Find great places near you";
  const loc = s(q.loc, 40), count = n(q.n);
  // Accent the number if the sentence has one — a numeral is the single most
  // scannable thing in a thumbnail. Otherwise accent the place name.
  const m = title.match(/\b\d[\d,]*\b/);
  return buildCard({
    eyebrow: eyebrowFrom([loc, count ? count + " spots" : ""]),
    headline: title,
    accent: m ? m[0] : loc,
    foot: footFrom([q.foot || "Ranked by Wayfind", q.foot ? "" : "never paid placement"]),
    cta: q.cta, ctaFallback: "SEE THE LIST",
  });
}

// ══ AN EXPERIENCE CARD (card=<key> in lib/shareCards.js) ════════════════════
export function experienceModel(card, p) {
  const c = card || {}, q = p || {};
  const line = s(c.shareLine, 120) || s(c.title, 90) || "Find great places near you";
  return buildCard({
    eyebrow: eyebrowFrom([s(q.loc, 32), s(c.eyebrow, 26)]),
    headline: line,
    accent: s(c.title, 40),
    foot: footFrom(["Ranked by Wayfind", "never paid placement"]),
    cta: c.cta, ctaFallback: "SEE THE LIST",
  });
}

// ══ WEATHER ═════════════════════════════════════════════════════════════════
export function weatherModel(p) {
  const q = p || {};
  const temp = s(q.temp, 4), cond = s(q.cond, 30), loc = s(q.loc, 32), take = s(q.take, 110);
  let headline, accent;
  if (temp && loc) { headline = "It's " + temp + "° in " + loc + " — here's what's good right now"; accent = temp + "°"; }
  else if (temp) { headline = "It's " + temp + "° — here's what's good right now"; accent = temp + "°"; }
  else { headline = "Here's what's good right now"; accent = "good"; }
  return buildCard({
    eyebrow: eyebrowFrom([loc, cond]),
    headline, accent,
    foot: footFrom([take || "Wayfind reads the weather, then ranks"]),
    cta: q.cta, ctaFallback: "WHAT'S GOOD NOW",
  });
}

// ══ A COUPON, PRICED ════════════════════════════════════════════════════════
// The pay/get pair is the strongest thing Wayfind can put in a text message, so
// it leads. Both numbers come from lib/couponValue.js — the same source the
// on-screen card reads, so the text and the page can never disagree.
export function couponModel(p) {
  const q = p || {};
  const pay = n(q.pay), get = n(q.get), pct = n(q.pct);
  const biz = s(q.biz, 46), what = s(q.what, 30), exp = humanDate(q.exp), area = s(q.area, 30);
  if (pay != null && get != null && get > pay && biz) {
    const save = Math.round((get - pay) * 100) / 100;
    return buildCard({
      eyebrow: eyebrowFrom([area, pct ? pct + "% off" : "save " + money(save)]),
      headline: "Get " + money(get) + (what ? " of " + what : "") + " for " + money(pay) + " at " + biz,
      accent: money(pay),
      foot: footFrom(["Verified local savings", exp ? "good through " + exp : ""]),
      cta: q.cta, ctaFallback: "GRAB THE DEAL",
    });
  }
  // The ?d= path: a described deal rather than a priced one.
  const deal = s(q.deal, 100);
  return buildCard({
    eyebrow: eyebrowFrom([biz, area]),
    headline: deal || (biz ? "A deal at " + biz : "A Wayfind deal near you"),
    accent: biz,
    foot: footFrom([q.code ? "Code " + s(q.code, 20) : "Verified local savings", exp ? "good through " + exp : ""]),
    cta: q.cta, ctaFallback: "CLAIM IT",
  });
}

// ══ AN INTENT PAGE ══════════════════════════════════════════════════════════
export function intentModel(def, p) {
  const d = def || {}, q = p || {};
  const city = s(q.city, 32);
  const line = s(d.line1, 90) || "Places worth your time";
  return buildCard({
    eyebrow: eyebrowFrom([city, s(d.eyebrow, 26)]),
    headline: city ? line + " in " + city : line,
    accent: city || s(d.eyebrow, 26),
    foot: footFrom([s(d.promise, 96)]),
    cta: q.cta, ctaFallback: "SEE THE RANKING",
  });
}

// ══ THE BEACH RANKING ═══════════════════════════════════════════════════════
export function beachesModel(p) {
  const q = p || {};
  const label = s(q.label, 34), count = n(q.n), reviews = n(q.reviews);
  const rv = reviews ? (reviews >= 1000 ? Math.round(reviews / 1000) + ",000+" : commas(reviews)) : "";
  return buildCard({
    eyebrow: eyebrowFrom([label, "beach ranking"]),
    headline: "One beach beat them all",
    accent: "beat them all",
    // The proof line and the promise line do not both fit beside the CTA, and a
    // foot ellipsised mid-word ("no ads, no v…") reads as a bug. When there are
    // real numbers, the numbers ARE the proof and the slogan is redundant.
    foot: footFrom(count && rv
      ? [count + " beaches ranked by " + rv + " real reviews"]
      : ["Ranked by real reviews", "no ads, no votes bought"]),
    cta: q.cta, ctaFallback: "SEE THE WINNER",
  });
}

// ══ A GENERATED LIST SNAPSHOT (/api/og/list, /api/og/<slug>) ════════════════
// The old snapshot card carried a runners-up ticker in 22px type. At the size a
// link preview is actually seen that row was one grey smear, so it is not
// carried over — the runners-up are on the page, one tap away. What the ticker
// was really buying was credibility, and the note line buys that more cheaply.
export function snapshotModel(card) {
  const c = card || {};
  const lines = Array.isArray(c.hook && c.hook.lines) ? c.hook.lines.map((l) => s(l, 70)).filter(Boolean) : [];
  const strip = Array.isArray(c.strip) ? c.strip.slice(0, 3) : [];
  return buildCard({
    eyebrow: eyebrowFrom(strip),
    headline: lines.join(" ") || "The ranking, updated hourly",
    accent: s(c.hook && c.hook.accent, 40),
    foot: footFrom([s(c.note, 80) || "Updates hourly"]),
    cta: c.bar_label, ctaFallback: "SEE WHICH ONE",
  });
}

// The site-wide default, used when a share arrives with nothing to say.
export function defaultModel() {
  return buildCard({
    eyebrow: eyebrowFrom(["Florida"]),
    headline: "The best places near you, ranked before you ask",
    accent: "ranked",
    foot: footFrom(["Ranked by Wayfind", "never paid placement"]),
    ctaFallback: "OPEN WAYFIND",
  });
}

// Exposed so a guard can prove the foot never reaches the CTA.
export const FOOT_LIMIT = CARD.footMaxWidth;
export function footFits(foot) { return textWidth(foot, 23, 600) <= CARD.footMaxWidth + 0.5; }
