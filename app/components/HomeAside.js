"use client";
// app/components/HomeAside.js — the DESKTOP SECOND COLUMN (v7.29).
//
// OWNER, 2026-08-12: "can we make the desktop version of wayfind fit nice."
//
// THE MEASUREMENT. On a 1512px viewport the home feed was one 1060px column
// with 226px of dead black on each side; on a 27" monitor it is ~600px a side.
// The page was a phone held up to a desk. The 2026-08-07 wide tier had already
// fixed the header alignment and the full-bleed top bar (see the WF_WIDE_BP
// note in css.js) — what it did NOT do is give the reclaimed width a job.
//
// THIS IS THAT JOB, AND IT IS NOT DECORATION. Every block here is a surface the
// phone layout has to bury and the desk does not:
//   1. WHAT THE WEATHER IS DOING TO THE RANKING. On a phone this lives behind
//      the topbar's weather dropdown, so almost nobody reads it. It is the
//      single most concrete demonstration that the list is re-cut for right now
//      rather than pre-baked, which is the whole product claim.
//   2. THE DEALS. The Coupons tab is one of two surfaces that earn money, and
//      on the home screen it is a tab icon at the bottom of the window. Three
//      geo-gated rows here put it in the reader's eye on the screen where they
//      are deciding.
//   3. WHY THE RANKING SHOULD BE BELIEVED. Desktop visitors research; the "no
//      paid placement" claim is the answer to the objection they are already
//      forming, and /how-wayfind-ranks is otherwise reachable only from a
//      footer link.
//
// NO COMMERCE URL IS CONSTRUCTED HERE, DELIBERATELY. The deal rows route to the
// Coupons screen, which owns the vetted card, the proximate disclosure and the
// attribution wiring (lib/commerce.js rule 2: the UI never builds a partner
// URL). A teaser that hands off is worth more than a second, thinner redeem
// path that has to re-implement all three and can drift from them.
//
// WHY EVERY CARD CARRIES A minHeight. The aside is a sticky grid cell in its
// own column, so a height change here cannot move the feed (align-items:start,
// and the feed is always the taller row). It CAN move the cards below it inside
// this column, and weather, location and the live-deal set all resolve after
// mount. So each card reserves the height of its loaded state and shows an
// honest empty line instead of collapsing — no card ever resizes, so there is
// nothing to shift. Same discipline as the reserved event rail and the clamped
// bookable-card title (test-layout-shift §7).
//
// VISIBILITY IS CSS-ONLY. This component always renders; .wf-col-side is
// display:none below WF_WIDE_BP. It must never become `isDesktop && <Aside/>` —
// that is the exact pattern that produced the 0.4938 CLS incident documented at
// the top of app/components/css.js and banned by test-layout-shift §5.
import { C } from "./kit";
import { COUPONS } from "../../lib/coupons";
import { dealTiers } from "../../lib/dealSheet";
import { siteTodayStr } from "../../lib/siteTime";

const cardStyle = {
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  background: "linear-gradient(150deg,rgba(255,255,255,.03),transparent 42%),#111824",
  padding: "13px 14px 14px",
  marginBottom: 12,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.03), 0 10px 26px rgba(0,0,0,.22)",
};

function Kicker({ children }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: ".11em", textTransform: "uppercase", color: C.accent, marginBottom: 8 }}>
      {children}
    </div>
  );
}

// The list the reader sees, in the order dealTiers already ranked it: deals
// that earn (affiliate or a stated monetary value) ahead of the free standing
// offers, locality before expiry inside each. Slicing is the ONLY thing done to
// that order here — a second sort in a second surface is how two pages start
// disagreeing about which deal is the best one nearby.
export function asideDeals(center, todayIso) {
  let tiers;
  try {
    tiers = dealTiers(COUPONS, todayIso, center);
  } catch (e) {
    return [];
  }
  return [...(tiers.featured || []), ...(tiers.ledger || [])].slice(0, 3);
}

export default function HomeAside({ city, weather, take, center, onCoupons }) {
  const today = siteTodayStr();
  const deals = asideDeals(center, today);
  const where = city ? String(city).split(",")[0] : null;
  const temp = weather && weather.temp != null ? weather.temp : null;
  const feels = weather && weather.feels != null ? weather.feels : null;
  const label = weather && weather.label ? weather.label : null;
  const good = take && Array.isArray(take.good) ? take.good : [];
  const avoid = take && Array.isArray(take.avoid) ? take.avoid : [];

  return (
    <aside className="wf-col-side" aria-label={where ? "Right now near " + where : "Right now near you"}>

      {/* 1 — what the conditions are doing to the ranking, in words */}
      <section style={{ ...cardStyle, minHeight: 132 }}>
        <Kicker>{where ? "Right now in " + where : "Right now near you"}</Kicker>
        {temp != null ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 27, fontWeight: 850, color: C.text, lineHeight: 1 }}>{temp}°</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.light }}>{label || ""}</span>
              {feels != null && feels !== temp ? <span style={{ fontSize: 11, color: C.muted }}>feels {feels}°</span> : null}
            </div>
            {good.length ? (
              <p style={{ margin: "0 0 5px", fontSize: 12.5, lineHeight: 1.5, color: C.light }}>
                <strong style={{ color: C.text, fontWeight: 800 }}>Good for</strong>{" " + good.join(", ") + "."}
              </p>
            ) : null}
            {avoid.length ? (
              <p style={{ margin: "0 0 7px", fontSize: 12, lineHeight: 1.5, color: C.muted }}>
                {"Ranked down for now: " + avoid.join(", ") + "."}
              </p>
            ) : null}
            <p style={{ margin: 0, fontSize: 10.75, lineHeight: 1.5, color: C.muted }}>
              The lists on this page are re-cut for this hour, not stored and served.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.muted }}>
            Reading the conditions where you are — the lists on this page are re-cut for this hour, not stored and served.
          </p>
        )}
      </section>

      {/* 2 — the money surface, on the screen where the decision is made */}
      <section style={{ ...cardStyle, minHeight: 186 }}>
        <Kicker>Deals near you</Kicker>
        {deals.length ? (
          <>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {deals.map((c) => (
                <li key={c.id} style={{ borderTop: `1px solid ${C.adim}`, paddingTop: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="wf-aside-row"
                    onClick={() => { if (onCoupons) onCoupons(c.id); }}
                  >
                    <span className="wf-aside-row-title">{c.title}</span>
                    <span className="wf-aside-row-sub">{c.business}{c.area ? " · " + c.area : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="wf-railsec-more" onClick={() => { if (onCoupons) onCoupons(null); }}>
              {"See every deal →"}
            </button>
            <p style={{ margin: "7px 0 0", fontSize: 10.25, lineHeight: 1.5, color: C.muted }}>
              Each one is checked at its source and disappears the day it expires.
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.5, color: C.light }}>
              Nothing verified within reach of you right now. A deal only appears here once we have checked it at its source, so an empty column beats a coupon from the wrong city.
            </p>
            <button type="button" className="wf-railsec-more" onClick={() => { if (onCoupons) onCoupons(null); }}>
              {"Open the deals tab →"}
            </button>
          </>
        )}
      </section>

      {/* v8.2 — "No paid placement" is NOT rendered on "/" any more (owner
          brief, 2026-08-15: remove it from the homepage). The claim itself is
          not retired — /how-wayfind-ranks still carries it in full, the footer
          still links there, and the Best Around You section still states "No
          paid placement" in its own support line. What went is the third card
          in a block that is now two cards wide in the feed.

          ONE LINE TO PUT IT BACK if that reads as too thin: restore the
          section here and the onRanking prop at the call site in app/home.js. */}
    </aside>
  );
}
