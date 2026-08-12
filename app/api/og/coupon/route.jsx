import { shareCardResponse } from "../card.jsx";
import { couponModel } from "../../../../lib/shareCardCopy.js";

export const runtime = "edge";

// Per-coupon share image. The recipient gets this in a text message, so it has
// to say on its own WHO it is for, HOW MUCH they save and WHEN it expires.
// Coupon data rides in ?d= (base64url JSON) so the image is generated per
// coupon and is never a generic banner.
//
// Rendering is ../card.jsx like every other surface. What this route owns is
// the decode and the date format.
function decode(raw) {
  if (!raw) return null;
  try {
    const s = String(raw);
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const c = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const c = decode(searchParams.get("d")) || {};
  return shareCardResponse(couponModel({
    // The priced shape (pay/get) wins when it is present: two numbers in a text
    // message outsell any adjective. Otherwise the described deal leads.
    pay: c.p, get: c.g, pct: c.pct,
    biz: c.b, what: c.w, area: c.a, code: c.c,
    // The expiry is formatted by humanDate() in lib/shareCardCopy.js so this
    // route and /api/og?kind=coupon cannot print the same date two ways.
    deal: c.t, exp: c.x,
  }));
}
