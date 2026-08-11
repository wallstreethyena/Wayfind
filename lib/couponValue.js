// lib/couponValue.js — parse the verified "$X for $Y of Z" certificate title
// into the numbers a card can LEAD with. Owner (2026-08-11): "the user needs
// to easily see how much they are going to get… direct and to the point."
//
// PURE, and shared by three surfaces — the coupon card, the share text, and
// the /api/og coupon share-card — so the number a user sees, the number they
// text a friend, and the number on the card image can never disagree.
//
// HONESTY: every number here is derived from the already-verified certificate
// title (the registry's own claim); nothing is invented. A title that is not
// the certificate shape returns null and the caller keeps the original title
// (free-admission programs, CityPASS bundles, event promos).
export function parseCouponValue(title) {
  const m = /^\$(\d+(?:\.\d{1,2})?) for \$(\d+(?:\.\d{1,2})?)(?: of (.+))?$/.exec(String(title || "").trim());
  if (!m) return null;
  const pay = Number(m[1]);
  const get = Number(m[2]);
  if (!(pay > 0) || !(get > pay)) return null; // "pay more than you get" is never a deal we render as one
  const save = Math.round((get - pay) * 100) / 100;
  const pct = Math.round((save / get) * 100);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return {
    pay, get, save, pct,
    what: m[3] || null,
    payLabel: "$" + fmt(pay),
    getLabel: "$" + fmt(get),
    saveLabel: "$" + fmt(save),
  };
}
