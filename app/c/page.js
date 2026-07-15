// v6.23 — coupon share landing. Someone was texted a Wayfind coupon; this page
// gives the link a rich preview (the per-coupon image + who/how-much/when in the
// description) and then bounces into the app's Coupons tab. Coupon data rides in
// ?d= (base64url JSON) so the page is self-contained — no lookup needed.
import ShareRedirect from "../ShareRedirect";
import { SITE_URL } from "../../lib/site";

const SITE = SITE_URL;
const INK = "#0A0B0D", WHITE = "#FFFFFF", ORANGE = "#F98626", SOFT = "#C6CDD4", MUTE = "#8A929B";

function s(v) { return Array.isArray(v) ? v[0] || "" : v || ""; }
function decode(raw) {
  if (!raw) return null;
  try {
    const b64 = String(raw).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(raw).length + 3) % 4);
    const c = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}
function fmtExpires(x) {
  if (!x) return null;
  const m = String(x).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

export async function generateMetadata({ searchParams }) {
  const d = s(searchParams.d);
  const c = decode(d) || {};
  const business = String(c.b || "A local favorite");
  const deal = String(c.t || "A Wayfind deal");
  const expires = fmtExpires(c.x);
  const title = `${business}: ${deal} — Wayfind coupon`;
  const desc = `${deal} at ${business}${c.a ? " (" + c.a + ")" : ""}.` + (expires ? ` Valid through ${expires}.` : "") + " Open on Wayfind to claim.";
  const og = "/api/og/coupon?d=" + encodeURIComponent(d);
  return {
    robots: { index: false, follow: true },
    metadataBase: new URL(SITE),
    title: title.slice(0, 90) + " — Wayfind",
    description: desc,
    openGraph: { title, description: desc, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description: desc, images: [og] },
  };
}

export default function CouponSharePage({ searchParams }) {
  const d = s(searchParams.d);
  const c = decode(d) || {};
  const business = String(c.b || "A local favorite");
  const deal = String(c.t || "A Wayfind deal");
  const expires = fmtExpires(c.x);
  const to = "/coupons";
  return (
    <>
      <ShareRedirect to={to} />
      <div style={{ minHeight: "100vh", background: INK, color: WHITE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", padding: "24px" }}>
        <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>wayfind<span style={{ color: ORANGE }}>.</span></div>
          <div style={{ display: "inline-flex", marginTop: 20, background: ORANGE, color: INK, fontWeight: 800, fontSize: 14, padding: "8px 16px", borderRadius: 999 }}>🎟️ Coupon inside</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 22 }}>{business}</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8, lineHeight: 1.15 }}>{deal}</div>
          {expires ? <div style={{ fontSize: 14, color: SOFT, marginTop: 12 }}>Valid through {expires}</div> : null}
          <a href={to} style={{ display: "inline-block", marginTop: 26, background: ORANGE, color: INK, fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 14, textDecoration: "none" }}>Open on Wayfind →</a>
          <div style={{ fontSize: 12, color: MUTE, marginTop: 18 }}>Taking you to Wayfind…</div>
        </div>
      </div>
    </>
  );
}
