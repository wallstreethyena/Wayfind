// app/components/HolidayPromoSlot.js — one calm holiday offer card, or nothing.
//
// Server rendered. Reads lib/holidayPromos.js, which is EMPTY until a promo is
// verified on the partner's own page. With no live entry this returns null: no
// wrapper, no reserved height, so the page layout does not shift.
// Copy rules: plain words, no dashes, no countdowns or pressure.
import { HOLIDAY_PROMOS, activeHolidayPromos } from "../../lib/holidayPromos.js";
import { siteTodayStr } from "../../lib/siteTime.js";

const CARD = { margin: "0 0 28px", padding: "18px 16px", border: "1px solid #3a4a3f", borderRadius: 14, background: "#121c17", color: "#e9efe9" };
const EYEBROW = { margin: "0 0 6px", color: "#a8c3ae", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" };
const TITLE = { margin: "0 0 8px", color: "#fff", fontFamily: "Georgia,serif", fontSize: 20, lineHeight: 1.3 };
const BODY = { margin: "0 0 10px", color: "#cfd9d1", fontSize: 14, lineHeight: 1.55 };
const CLAIM = { margin: "0 0 12px", color: "#efd0a6", fontSize: 14, fontWeight: 700 };
const LINK = { display: "inline-block", color: "#efd0a6", fontSize: 14, fontWeight: 800, textDecoration: "none", minHeight: 44, lineHeight: "44px" };

export default function HolidayPromoSlot({ surface, today, promos = HOLIDAY_PROMOS }) {
  const live = activeHolidayPromos(surface, today || siteTodayStr(), { promos });
  if (!live.length) return null;
  const p = live[0];
  const outbound = p.href.startsWith("/api/");
  return <aside data-holiday-promo={p.id} aria-label={`Holiday offer from ${p.partner}`} style={CARD}>
    <p style={EYEBROW}>Holiday offer from {p.partner}</p>
    <h2 style={TITLE}>{p.title}</h2>
    <p style={BODY}>{p.body}</p>
    {p.claim ? <p style={CLAIM}>{p.claim}</p> : null}
    <a href={p.href} style={LINK} rel={outbound ? "sponsored nofollow" : undefined}>See the offer</a>
  </aside>;
}
