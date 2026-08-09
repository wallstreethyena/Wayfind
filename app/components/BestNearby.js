"use client";
// BestNearby v2 — one near-black card, three expandable menus (owner
// directions 2026-07-21 late evening):
//   1. Best places to eat nearby — wf_best_picks(food). The engine's daypart
//      math IS the owner's rule (5-10:30 boosts breakfast 1.4x, midday boosts
//      open-kitchen restaurants, evening boosts bars/late food and penalizes
//      breakfast -1.2). Rows open OUR detail sheet, never Google.
//   2. Top things to do — wf_things_to_do (tours + attractions + beaches
//      ranked together). Tours book on Viator; places open the detail sheet.
//   3. Local trends — the area right now: beach intelligence when the
//      nearest beach is within 20 mi (owner's definition of "near"), plus
//      the LLM-written daily brief (/api/local/report) grounded ONLY in
//      today's real events + live weather + the beach reading. No crowd or
//      trend claims anywhere — nothing here measures those.
// Top-3 ranks wear medals (champagne/silver/bronze trophy — the premium
// treatment the owner asked for). Lazy per-section fetches, one open at a
// time, reserved-height loading, honest empty states.
// scripts/test-todays-best.mjs locks the contract.
import { useState, useRef, useEffect } from "react";
import { reasonLine } from "../../lib/reasonLine";
import { C, CHAMPAGNE, TYPE, RADII, SHADOW, FOCUS, TARGET, Icon, NavIcon, directionsUrl, PlaceScoreChip } from "./kit";
import { fetchTodaysBest, fetchThingsToDo, tbPhotoUrl, byVisibleScore, NEAR_RADIUS_MI, WIDEN_RADIUS_MI } from "../../lib/todaysBest.js";
// v7.04 — the Top 40 rail renders the SAME card every other rail renders.
import RailCard, { RailNav } from "./RailCard";
// v7.05 — the four intent rails (hidden gems / tonight / worth the drive /
// big fun small budget) render the SAME card from the SAME engine their
// destination pages use. See IntentRail.js for why this is the real list and
// not a cheap filter over the pool already in memory.
import IntentRailBody from "./IntentRail";
import { INTENT_PAGES } from "../../lib/intentPages";
import { applyCollapsedAttr, isCollapsed, nextCollapsed, readCollapsed, writeCollapsed } from "../../lib/railCollapse";
import { toDisplayScore } from "../../lib/score.js";
import { placePartnerPick } from "../../lib/placePartnerPicks.js";
import { couponForPlaceName } from "../../lib/coupons.js";
import { experienceTags } from "./IconicPlaceCard";
import { priceLabel } from "../../lib/price.js";
import { businessStatus } from "../../lib/businessStatus.js";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce.js";
import { PLATFORM } from "../../lib/creatorVideos";
import { supabase } from "../../lib/supabase.js";
import { siteTodayStr } from "../../lib/siteTime.js";
// v6.72: one source for the hour, the bucket and the outdoor gate.
import { nowContext } from "../../lib/nowContext.js";
import { gateOutdoor } from "../../lib/ranking.js";
// v7.06 — ONE editorial-line implementation, shared by every place surface.
import { toHookLine } from "../../lib/editorialHook.js";
import useEditorialHooks from "./useEditorialHooks";

// Owner: "a little lighter, almost black" — one step off the page's #040810.
const CARD_BG = "#0B0E15";
const MEDAL = [CHAMPAGNE.base, "#C7CCD6", "#B8804A"]; // gold, silver, bronze

const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

// The editorial line — the compressor, the 100-char cap, the apostrophe fix
// and the placeholder rejection now live in lib/editorialHook.js, imported
// above. It moved because the Top 40 rail carried the line and nine other
// place surfaces did not, and nine copies of a 60-line compressor drift.
// Behaviour is unchanged: proven by CALLING both implementations across the
// apostrophe, abbreviation, placeholder and cap cases before the move.

// Rank medal: top three only — a trophy in gold, silver, bronze.
function Medal({ i }) {
  if (i > 2) return <span style={{ width: 20, textAlign: "center", fontSize: 12, fontWeight: 800, color: C.muted, flexShrink: 0 }}>{i + 1}</span>;
  return (
    <span style={{ width: 20, display: "inline-flex", justifyContent: "center", flexShrink: 0 }} aria-label={"Ranked #" + (i + 1)}>
      <Icon name="trophy" size={15} color={MEDAL[i]} strokeWidth={2.2} />
    </span>
  );
}

// The expanded panel is overflow:hidden with a hard maxHeight. This must be
// >= the TALLEST a row can get or the last rows are silently clipped — a bug
// with no error, no warning and no signature in a diff. 64 was the pre-reason
// row; a two-line why at 12px/1.35 adds ~32px. 100 leaves headroom without
// making the collapse animation feel loose.
// Pinned by scripts/check-home-answer-first.mjs.
const ROW_MAX_H = 100;



// 22.4 -> "10pm". Whole hours only: "10:24pm" claims a precision the ranking
// does not have (wf_best_picks buckets the day into four dayparts), and a
// minute-accurate label on an hour-accurate ranking is a small lie that gets
// noticed.
function hourLabel(h) {
  const n = Math.floor(((Number(h) % 24) + 24) % 24);
  const ampm = n >= 12 ? "pm" : "am";
  const h12 = n % 12 === 0 ? 12 : n % 12;
  return h12 + ampm;
}

function Row({ i, thumb, title, why, meta, badge, trailing, onClick, href, whyOneLine }) {
  const inner = (
    <>
      <Medal i={i} />
      <div style={{ width: 46, height: 46, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.card }}>
        {thumb && <img src={thumb} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          {badge}
        </div>
        {why ? (
          // The WHY, above the numbers. wf_best_picks has always returned a
          // `reasons text[]` — "Breakfast — right for the hour", "A cool treat
          // for a 83° day", "Local favorite — 4.9★ from 1782 reviews" — and no
          // surface has ever rendered it. The engine was explaining itself to
          // nobody. Two lines max so a long reason cannot push the row height
          // around; the list must not reflow when it refreshes on the hour.
          //
          // v6.62 (owner, live screenshot: "this area jumps... like there is
          // something underneath and it has the old description"). ROOT CAUSE:
          // `why` starts as the generic engine reasonLine() (whyOneLine=false,
          // up to 2 lines) before the /api/known-for fetch above resolves, then
          // swaps to the shorter editorial hook (whyOneLine=true, 1 line). Both
          // states rendered real text, so nothing looked "broken" in isolation
          // — but a 2-line reasonLine collapsing to a 1-line hook shrank this
          // block's actual height, which is the jump: the row (and everything
          // below it) visibly resettles once the fetch lands. minHeight below
          // reserves 2 lines' worth of space in EITHER state so the swap is a
          // text change, not a layout change. fontSize bumped 12.5->13.5 per
          // the same screenshot review ("the text bigger").
          <div style={whyOneLine
            ? { fontSize: 13.5, lineHeight: 1.35, color: "#B6C2CE", marginTop: 3, minHeight: 37, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
            : { fontSize: 13.5, lineHeight: 1.35, color: "#B6C2CE", marginTop: 3, minHeight: 37, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{why}</div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: why ? 4 : 2, fontSize: 12.5, color: C.muted, flexWrap: "wrap" }}>{meta}</div>
      </div>
      {trailing}
    </>
  );
  const style = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 2px", minHeight: TARGET, background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,.06)", cursor: "pointer", textDecoration: "none" };
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className="wf-bn-focus" style={style}>{inner}</a>
    : <button onClick={onClick} className="wf-bn-focus" style={style}>{inner}</button>;
}

const SellingFast = () => (
  <span style={{ flexShrink: 0, background: "#B33A2B", color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px" }}>Selling fast</span>
);

// 2026-08-07 (owner): the 🔥 now means ONE thing everywhere — the unified
// trend signal (lib/trendSignal.js: real foot-traffic + major-event proximity,
// never a paid input). It is also the DISCLOSURE for the +0.6 trending bump
// in the governed score (lib/wayfindScore.js TRENDING_BONUS): a bumped row
// must say why, so the flame carries the signal's own reason.
const Flame = ({ reason }) => (
  <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#FB923C" }} aria-label={"Trending — " + (reason || "trending now")} title={reason || "Trending now"}>🔥</span>
);

// The visible reason, rendered in the meta line right beside the Score chip —
// the bump is only allowed where this renders (check-score-law.mjs).
const TrendReason = ({ r }) => (
  r && r.trending && r.trend_reason
    ? <span style={{ color: "#FB923C", fontWeight: 700 }}>🔥 {r.trend_reason}</span>
    : null
);

const STATUS_LABEL = { great: "Great beach day", great_uv_caution: "Great beach day · high UV", poor: "Not a beach day", unsafe: "Beach advisories active", too_far: null };

// Which section greets a visitor. Food is the default because it is the only
// rail that is answerable at every hour of the day — "top things to do" is
// empty-ish at 11pm, and an empty first impression is worse than a collapsed
// one. Set to null to restore the pre-2026-08-06 all-collapsed behaviour;
// scripts/check-home-answer-first.mjs asserts it is a real section id.
// ─── THE TOP 40 (owner, 2026-08-08) ─────────────────────────────────────────
// "i want the best cards from each category, place 40 cards there and give the
// best options, allow the user scroll right and left... i want the things that
// are most trending, preferably the instagram videos."
//
// HOW THE ORDER IS PRODUCED, and why there is no new algorithm here. The bias
// the owner is asking for ALREADY EXISTS in the governed score that ranks every
// surface on this site: lib/wayfindScore.js adds +0.6 for a trending place and
// +0.7 for one with a creator video (the Instagram/TikTok library), on the /10
// scale. So "most trending, preferably the creator videos" is what
// byVisibleScore() already returns — this rail just widens the POOL it sees and
// then sorts the union by exactly that same number.
//
// Deliberately NOT done: a fourth ranking term, or a head re-shuffle that
// floats creator places above a higher-scoring one. check-creator-video-boost
// and check-score-law both forbid it by name, for the reason stated in their
// own text — "ranked by the Wayfind Score, everywhere". Making the rail lean
// harder is a change to those two constants, which re-ranks every page, and
// that is an owner decision rather than a local sort tweak.
//
// FOUR CATEGORIES, not one. `wf_best_picks` takes a category, so a single call
// returns 40 restaurants. The owner asked for "the best of each category", so
// the rail fans out across the four that the engine actually serves with real
// inventory and merges the results. 'beach' and 'hotels' are left out on
// purpose: they are trip decisions rather than "near me right now" picks, and
// beaches are never bookable (lib/affiliates.js's standing exclusion).
// SHOPPING IS OUT (owner, 2026-08-09, from the live rail). It put a BEAUTY
// SALON — The Mint Retreat, 9.8, 17 miles away — at #1 "Top pick near you" on a
// Saturday at 9pm, above a concert hall and a performing-arts theatre.
//
// The score was not wrong: a 4.9-star salon with 586 reviews really does
// outscore a concert hall, and re-ranking to hide that would break shown ==
// sorted. The POOL was wrong. `shopping` in wf_best_picks includes services —
// salons, spas — which are not answers to "what should I do near me right now".
// Fixing the input is the honest fix; fixing the sort would have been a lie
// about the score.
const TOP40_CATEGORIES = ["food", "attractions", "nightlife"];
const TOP40_PER_CATEGORY = 18; // 3 x 18 = 54 raw, before dedupe/vetting, to land 40
const TOP40_MAX = 40;
// ERRANDS ARE NOT THINGS TO DO (owner, 2026-08-09, from the live rail:
// "Detwiler's showing up in the top 40 is a joke"). Detwiler's Farm Market is a
// GROCERY STORE and it ranked #5 at 9.6 — correctly, by score: 4.7 stars and
// 4.4k reviews is a genuinely beloved shop. It is still not an answer to "what
// should I do near me".
//
// wf_best_picks' `food` category is "places that sell food", which includes
// supermarkets and markets; the same leak put a beauty salon at #1 through
// `shopping` (now removed above). This is a POOL filter on the row's own Google
// primary_type — the same shape of fix lib/placeFilter.js's CAT_EXCLUDE applies
// elsewhere, and the reason its header warns that "category leaks are usually a
// broad allow token substring-matching a service type".
//
// Deliberately narrow: it excludes retail and personal-services types only. It
// does NOT touch restaurants, bars, bakeries or cafes, and it never looks at
// the score — a place is dropped for being an errand, never for ranking badly.
// ONE status read, shared by the open-now filter and the card's facts row — two
// separate calls could show "Open" on a card the filter had judged closed.
const top40Status = (r) => businessStatus({ ...r, oh: r.oh || r.regularOpeningHours || null, utcOffset: r.utcOffset != null ? r.utcOffset : r.utcOffsetMinutes });
const TOP40_TYPE_EXCLUDE = /^(grocery_store|supermarket|convenience_store|liquor_store|drugstore|pharmacy|department_store|shopping_mall|clothing_store|furniture_store|home_goods_store|hardware_store|electronics_store|beauty_salon|hair_salon|hair_care|nail_salon|barber_shop|spa|gym|fitness_center|bank|atm|gas_station|car_.*|storage|laundry|dry_cleaner|veterinary_care|doctor|dentist|hospital|real_estate_agency|insurance_agency)$/i;
function top40Allowed(r) {
  const t = String((r && r.primary_type) || "").trim();
  if (!t) return true; // no type is not evidence of an errand — keep it
  return !TOP40_TYPE_EXCLUDE.test(t);
}

// OPEN-NESS (owner, 2026-08-09: "top 40 must only show things that are open and
// that make sense for the time of the day").
//
// The rule is DROP KNOWN-CLOSED, not KEEP KNOWN-OPEN, and the difference is not
// pedantry — it is the whole design:
//
//   Google returns no opening hours for a large share of these rows. Both places
//   the owner opened from the live rail read "Hours unavailable" on their detail
//   sheet. `wf_best_picks` filters permanently-closed BUSINESS STATUS, which is
//   a different thing from "closed right now", and CLAUDE.md already records why
//   the section header may not claim "Open now": nothing in the engine checked
//   hours. So a keep-only-known-open filter would not show a cleaner 40, it
//   would empty the rail in most markets and call that correctness.
//
//   Dropping known-closed is the half we can prove. A place whose hours say it
//   is shut right now is never a good answer, whatever it scores. A place with
//   no hours data is shown WITHOUT any open/closed claim — the facts row simply
//   omits it, so the card never asserts something the data cannot support.
//
// TIME OF DAY is already handled upstream and deliberately not re-implemented
// here: `wf_best_picks` takes p_local_hour and ranks for the daypart, and
// gateOutdoor() (applied to the result below) drops outdoor answers when the
// hour and the weather make them wrong. Adding a third daypart rule on this
// surface would be a second, competing definition of "right now".
function top40OpenNow(r, statusOf) {
  const st = statusOf(r);
  return st.open !== false;
}
// Matches the events rail's floor so the two read as one system; measured the
// same way (a real render at 390 and 1024 with the shipped webfonts).
const TOP40_CARD_H = 224;
const compactReviews = (n) => (Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0));
// wf_best_picks returns Google's raw primary_type ("mexican_restaurant").
// Title-cased with the underscores gone, it is the card's eyebrow — the same
// slot the place card fills with "Fine dining". Never invented: a row with no
// primary_type gets no eyebrow rather than a guessed one.
function prettyType(t) {
  const raw = String(t || "").replace(/_/g, " ").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ONE ACCORDION ROW. The header, the icon tile, the orange left rail, the wash
// and the collapse are defined once, here — the Top 40 row and the seven mapped
// sections under it are the same object, so the menu cannot grow a second
// header treatment the way the feed grew four.
//
// The header is a native <button> with aria-expanded/aria-controls: it is a
// disclosure control, and a div with a click handler would need the whole
// role/tabIndex/onKeyDown triple to be reachable at all (test-card-a11y.mjs).
function SectionShell({ sdef, isOpen, first, onToggle, nodeRef, children }) {
  return (
    <div
      ref={nodeRef}
      data-wf-section={sdef.id}
      style={{ borderTop: first ? "none" : "1px solid rgba(255,255,255,.07)", borderLeft: isOpen ? `2px solid ${C.accent}` : "2px solid transparent", background: isOpen ? "linear-gradient(90deg, rgba(249,115,22,.075), transparent 70%)" : "transparent", transition: "border-color .22s ease, background .22s ease" }}
    >
      <button onClick={() => onToggle(sdef.id)} aria-expanded={isOpen} aria-controls={"wf-sec-" + sdef.id} className="wf-bn-focus" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "13px 2px 13px 10px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <span style={{ width: 29, height: 29, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 9, background: isOpen ? "rgba(249,115,22,.1)" : "rgba(255,255,255,.028)" }}>
          {sdef.line
            ? <Icon name={sdef.icon} size={19} strokeWidth={1.9} color={isOpen ? C.light : "#E7EDF5"} />
            : <NavIcon name={sdef.icon} size={21} strokeWidth={1.7} color={isOpen ? C.light : "#E7EDF5"} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15.2, fontWeight: 740, letterSpacing: "-.08px", color: isOpen ? "#FFF3E8" : C.text, lineHeight: 1.25 }}>{sdef.label}</span>
          <span style={{ display: "block", fontSize: 11.5, color: "#8D9AAB", marginTop: 2 }}>{sdef.sub}</span>
        </span>
        <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, color: isOpen ? C.light : "rgba(255,255,255,.42)", display: "grid", placeItems: "center", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .22s ease" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {/* visibility, not just height: a collapsed section must be out of the
          tab order and out of the accessibility tree, or a keyboard reader
          walks four hidden rails of Save/Like/Share buttons. It flips with a
          delay on the way down so the collapse can finish animating, and
          instantly on the way up so the content is reachable straight away. */}
      <div id={"wf-sec-" + sdef.id} style={{ overflow: "hidden", maxHeight: isOpen ? 10 * ROW_MAX_H + 220 : 0, opacity: isOpen ? 1 : 0, visibility: isOpen ? "visible" : "hidden", transition: "max-height .3s cubic-bezier(.4,0,.2,1), opacity .22s ease, visibility 0s linear " + (isOpen ? "0s" : ".3s") }}>
        <div style={{ padding: "0 2px 12px 12px" }}>{children}</div>
      </div>
    </div>
  );
}

// The Top 40's own header. Not a member of SECTIONS because its rail JSX has to
// stay ABOVE the {SECTIONS.map( call (scripts/check-top40-rail.mjs pins that
// order, and the rail is what the whole panel is named after).
const TOP40_SECTION = { id: "best", label: "The best near you", sub: "Forty places worth your time, ranked for this hour", icon: "award" };

// The sections whose data `load()` below knows how to fetch. Everything else in
// the menu resolves its own rail.
const LOADABLE = { eat: 1, todo: 1, trends: 1 };

// Under three is not a shortlist, it is a shelf — the same threshold the
// creator row and the intent rails use to decide a list is too thin to stand.
const MIN_RAIL_ROWS = 3;

export const DEFAULT_SECTION = "eat";

// v7.05 (owner, 2026-08-09): "we would pretty much be adding to the existing
// menu we have and just reorganizing and adding the horizontal rails to them."
//
// So this panel stops being "the ranked list plus a Top 40 rail" and becomes
// THE MENU: eight sections, one accordion, each one a rail of the same place
// card. The alternative — eight separate panels down the feed — was built
// first and thrown away: it re-created the problem this component exists to
// solve, which is that a reader was meeting eight different headings for eight
// different lists and had to decide which one was the answer.
//
// EVERY SECTION IS OPEN ON ARRIVAL and closes on tap, and the closed set
// persists (lib/railCollapse.js). This inverts the previous behaviour in one
// visible way: the accordion used to be one-open-at-a-time, so closing a
// section opened another. It no longer does. The measured reason the FIRST
// section opens by default (259 single-page sessions, median 10 seconds) is
// unchanged and now applies to all of them.
export default function BestNearby({
  center, weather, events, videoPlaces, city, creatorSlot, eventsSlot, onOpenPlace, onLog,
  isSaved, liked, disliked, onSave, onLike, onDislike, onShare, onExperience,
}) {
  // v6.57 (2026-08-06, owner): the FIRST section is open on arrival.
  //
  // MEASURED, not a preference. 259 single-page sessions landed on "/" in the
  // 14 days to 2026-08-05; the MEDIAN one lasted 10 seconds and 130 of them
  // ended inside those 10 seconds. The ranked list — the entire product — sat
  // below the events rail, below the link grid, inside a collapsed accordion.
  // `result_count_shown` fired 3,766 times in 30 days for a list almost nobody
  // scrolled far enough to open. A visitor was asked for ~15 decisions before
  // being shown one recommendation.
  //
  // Opening by default costs one Supabase read on mount (wf_best_picks, the
  // same read a tap already triggered) and removes the tap that was losing
  // them. `toggle` still closes it, so the accordion is not being deleted —
  // its default is being inverted.
  const [open, setOpen] = useState(DEFAULT_SECTION);
  // v7.05: `open` no longer means "the only section that is open" — the
  // collapsed set below decides that. It is now the section the reader last
  // acted on, which is what the headline describes and what the mount fetch
  // loads first, and it is still seeded from DEFAULT_SECTION so the answer-
  // first read is unchanged.
  //
  // THE CLOSED SET, not the open set. `null` means "the reader's choice has not
  // been read yet", which renders as all-open — the same thing the server
  // rendered, so hydration cannot disagree. See lib/railCollapse.js.
  const [closed, setClosed] = useState(null);
  // The ref is what the NEXT toggle reads. React batches state updates across a
  // task, so two toggles in one tick both see the pre-batch `closed` and the
  // second one writes a list that has forgotten the first — measured live, not
  // theorised: collapsing two sections in the same tick persisted only one.
  // The ref is updated synchronously, so it cannot go stale between taps.
  const closedRef = useRef(null);
  useEffect(() => {
    let list = [];
    try { list = readCollapsed(); } catch (e) { list = []; }
    closedRef.current = list;
    setClosed(list);
    // The pre-paint script in app/layout.js already set this from the same
    // storage; re-applying keeps <html> honest if another tab changed it
    // between that script and this effect.
    applyCollapsedAttr(list);
  }, []);
  const sectionOpen = (id) => !isCollapsed(closed, id);
  // v7.06 (owner, 2026-08-09): "no longer place the 10 restriction on these
  // lists… the top 10 should be sufficient." The head-of-three and its
  // see-all button are GONE. They existed because a vertical row of three was
  // what fit above the fold; a rail shows one card at a time whatever its
  // length, so slicing to three bought no vertical space and cost seven picks
  // the reader had already been ranked. The rail renders the whole list, and
  // the link under it goes to the page that widens the search.
  const [rows, setRows] = useState({});
  const fetchedFor = useRef("");
  // One node per section, so the observer below can load a section's data the
  // moment it is both OPEN and near the viewport — see the effect further down.
  const secRefs = useRef({});
  // 2026-08-07: the per-component beach popularity read (beachPop) is gone —
  // lib/trendSignal.js now attaches the SAME popularity signal (plus event
  // proximity) to every place row inside the fetchers, before the sort, so
  // the flame and the +0.6 bump can never disagree with the ranking.

  // v6.72: nowContext is the single source of the hour AND the outdoor gate.
  // `now()` is a function, not a memo, so a rail opened at 17:29 and again at
  // 17:31 gets the two different buckets it should.
  const nowCtx = () => nowContext({ lat: center && center.lat, lng: center && center.lng, weather });
  const baseArgs = () => {
    const n = nowCtx();
    return {
      lat: center && center.lat, lng: center && center.lng,
      localHour: n.hour,
      tempF: weather && weather.temp != null ? weather.temp : null,
      condition: weather && weather.label ? weather.label : null,
    };
  };

  // Local trends: nearest beach ≤20mi (owner's "near"), its live conditions,
  // today's real events, and the grounded LLM brief. Every piece fails soft.
  const loadTrends = async () => {
    const { lat, lng } = baseArgs();
    const today = siteTodayStr();
    const todays = (events || []).filter((e) => e && e.name && e.date === today).slice(0, 8);
    let beach = null;
    try {
      if (supabase && isFinite(lat)) {
        const { data } = await supabase.rpc("wf_nearest_beaches", { p_lat: lat, p_lng: lng, p_radius_mi: 20, p_max: 1 });
        const b = Array.isArray(data) && data[0];
        if (b && b.name) {
          beach = { name: b.name, distance_mi: b.distance_mi, lat: b.lat, lng: b.lng };
          try {
            const r = await fetch("/api/beach/conditions?lat=" + b.lat + "&lng=" + b.lng + "&dist=" + b.distance_mi);
            const c = r.ok ? await r.json() : null;
            if (c) beach = { ...beach, status: c.status, reasons: c.reasons || [], waterTempF: c.conditions && c.conditions.waterTempF, waveHeightFt: c.conditions && c.conditions.waveHeightFt };
          } catch (e) {}
        }
      }
    } catch (e) {}
    let report = null;
    try {
      const r = await fetch("/api/local/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: null, events: todays.map((e) => ({ name: e.name, time: e.time, venue: e.venue || e.city })),
          weather: weather ? { temp: weather.temp, label: weather.label, sunset: weather.sunset } : null,
          beach,
        }),
      });
      const j = r.ok ? await r.json() : null;
      report = j && j.report ? j.report : null;
    } catch (e) {}
    return { kindOf: "trends", beach, todays, report };
  };

  // The Top 40's own load. Independent of the accordion's `rows` so a slow
  // category cannot hold up the answer below it, and so a failed category
  // degrades to fewer cards rather than to none.
  const [top40, setTop40] = useState("loading");
  const top40For = useRef("");
  useEffect(() => {
    if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return;
    const key = center.lat.toFixed(3) + "," + center.lng.toFixed(3);
    if (top40For.current === key) return;
    top40For.current = key;
    setTop40("loading");
    let dead = false;
    (async () => {
      const args = baseArgs();
      const sweep = (radiusMi) => Promise.all(
        TOP40_CATEGORIES.map((category) =>
          fetchTodaysBest({ ...args, category, limit: TOP40_PER_CATEGORY, events, radiusMi }).catch(() => [])
        )
      );
      let batches = await sweep(NEAR_RADIUS_MI);
      // Same ladder as the ranked sections: 17 first, 25 only if 17 cannot fill
      // a rail. The rail refuses to render under three anyway, so widening
      // below that is the difference between a section and no section at all.
      if (!dead && batches.reduce((n, b) => n + (Array.isArray(b) ? b.length : 0), 0) < MIN_RAIL_ROWS) {
        const wider = await sweep(WIDEN_RADIUS_MI);
        if (wider.reduce((n, b) => n + (Array.isArray(b) ? b.length : 0), 0) > batches.reduce((n, b) => n + (Array.isArray(b) ? b.length : 0), 0)) batches = wider;
      }
      if (dead) return;
      // One row per place. wf_best_picks can return the same venue under two
      // categories (a brewery is nightlife AND food), and a rail that shows it
      // twice reads as a broken list rather than a rich one.
      const seen = new Set();
      const pool = [];
      batches.forEach((rows) => (Array.isArray(rows) ? rows : []).forEach((r) => {
        const id = r && (r.place_id || r.id);
        if (!id || seen.has(id) || !top40Allowed(r)) return;
        if (!top40OpenNow(r, top40Status)) return;
        seen.add(id);
        pool.push(r);
      }));
      // THE SAME SORT the rest of the site uses. byVisibleScore stamps
      // governed_score (base +0.7 creator video, -0.2 past 17mi, +0.6
      // trending) and orders by it, so the rail is "shown == sorted" like
      // every other ranked surface — the badge on each card is the number
      // that put it in that position.
      const ranked = byVisibleScore(pool).slice(0, TOP40_MAX);
      setTop40(gateOutdoor(ranked, nowCtx()));
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center && center.lat, center && center.lng]);

  // THE EDITORIAL LAW, applied to EVERY place on this card (owner, 2026-08-09:
  // "the editorial needs to answer one question — why should I choose this
  // place... this is the rule for every editorial"; "it is the global rule for
  // the entire app").
  //
  // ONE resolver for all three lists. This file used to run TWO near-identical
  // effects — one for the eat rows, one for the Top 40 — and the things-to-do
  // rows had none at all, so the same reader saw "A hidden door upstairs leads
  // to Maya" on one row and nothing on the next. useEditorialHooks holds the
  // #687 precedence (researched wf_editorial wins; a validated cached blurb
  // fills the gap; cacheOnly keeps generation off the render path) and batches
  // in 40s, which matters here because these three lists total ~60 places and
  // /api/known-for silently drops everything past its 40-id cap.
  //
  // NOTHING IS INVENTED. A place with no verified hook renders no line at all.
  // An empty slot is honest; a generic line would be filler; a generated one
  // would be the fabrication this codebase exists to prevent.
  //
  // EVENTS ARE EXCLUDED, PERMANENTLY — an event is not a place. So are bookable
  // experiences: a Viator tour is a supplier product with no wf_editorial row,
  // and it keeps its supplier subtitle.
  const hooks = useEditorialHooks(
    [
      ...(Array.isArray(rows.eat) ? rows.eat : []),
      ...(Array.isArray(rows.todo) ? rows.todo.filter((r) => r && r.kind !== "experience") : []),
      ...(Array.isArray(top40) ? top40 : []),
    ].map((p) => ({
      id: p.place_id || p.id,
      name: p.name || p.title || "",
      type: p.primary_type || p.category || "",
      rating: p.rating,
      reviews: p.reviews,
    }))
  );

  // THE BUG THIS SHAPE FIXES (owner-reported crash, 2026-08-09, v6.68:
  // "(places || []).filter is not a function"). This used to end in a bare
  // `: loadTrends()` — "anything that is not eat or todo is trends" — which was
  // safe while the accordion had exactly three sections and became a crash the
  // moment it had eight: re-opening a collapsed intent section called
  // ensureLoaded("gems"), got the trends OBJECT back, and handed it to
  // gateOutdoor, which filters an array. Named branches only, and an unknown id
  // resolves to an empty list rather than to whichever fetch happened to be
  // last in the chain.
  // `events` rides along so the trend signal can score major-event proximity
  // (PredictHQ demand fields) — fails soft to no events.
  const fetchAt = (id, radiusMi) =>
    id === "eat" ? fetchTodaysBest({ ...baseArgs(), category: "food", limit: 10, events, radiusMi })
    : id === "todo" ? fetchThingsToDo({ ...baseArgs(), limit: 10, events, radiusMi })
    : Promise.resolve([]);
  // THE WIDEN (owner, 2026-08-09). 17 miles first, always. Only when that comes
  // back with too little to render does it ask again at 25 — one extra read, on
  // the sparse areas that need it, and never on the ones that do not. A list
  // that quietly searched 25 every time would put a half-hour drive under a
  // heading that says "near you".
  const load = async (id) => {
    if (id === "trends") return loadTrends();
    if (!LOADABLE[id]) return [];
    const near = await fetchAt(id, NEAR_RADIUS_MI);
    if (Array.isArray(near) && near.length >= MIN_RAIL_ROWS) return near;
    const wider = await fetchAt(id, WIDEN_RADIUS_MI);
    return Array.isArray(wider) && wider.length > (Array.isArray(near) ? near.length : 0) ? wider : near;
  };
  // Fetching a section, independent of what caused it to open. Pulled out of
  // toggle() so the default-open section on mount and a user's tap go through
  // exactly ONE loading path — two copies would drift, and the mount path is
  // now the one almost every visitor takes.
  const ensureLoaded = (id) => {
    if (!id) return;
    const centerKey = center ? center.lat.toFixed(3) + "," + center.lng.toFixed(3) : "";
    if (fetchedFor.current !== centerKey) { fetchedFor.current = centerKey; setRows({}); }
    setRows((r) => {
      if (r[id]) return r;
      // THE GATE, applied to whichever rail loaded. The "eat" rail is
      // unaffected in practice (restaurants read indoor), so this is one
      // call site rather than two branches that can drift apart.
      // The weather gate is a FILTER over rows. The trends section's payload is
      // an object, not a list, so it is stored as-is — the second half of the
      // same crash above, and the reason this is a branch and not a cast.
      (async () => { const data = await load(id); setRows((r2) => ({ ...r2, [id]: Array.isArray(data) ? gateOutdoor(data, nowCtx()) : data })); })();
      return { ...r, [id]: "loading" };
    });
  };

  // The default-open section cannot fetch until there is a location to rank
  // against, and `center` arrives asynchronously (saved wf_center, then URL,
  // then geolocation). So this waits for a real centre rather than firing a
  // request with lat=undefined — which is what an unconditional mount fetch
  // would have done, once per visitor, for nothing.
  useEffect(() => {
    if (!open) return;
    if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return;
    ensureLoaded(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, center && center.lat, center && center.lng]);

  // EVERY OTHER OPEN SECTION LOADS ON APPROACH, not on mount. Eight sections
  // open by default must not become eight requests fired at once on the first
  // paint — that would spend the whole request budget above the fold to fill
  // rails the reader has not reached yet, and slow down the one they have.
  // `ensureLoaded` is idempotent, so a section that is already loading or
  // loaded is a no-op here.
  useEffect(() => {
    if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = e.target.getAttribute("data-wf-section");
        // Only the sections whose data `load()` knows how to fetch. An intent
        // rail loads itself (it owns its own query bank), and the Top 40 and
        // the creator slot are already resolved — routing either through
        // ensureLoaded would fall through to loadTrends() and fire the wrong
        // request entirely.
        if (!id || !LOADABLE[id] || isCollapsed(closed, id)) continue;
        ensureLoaded(id);
      }
    }, { rootMargin: "300px 0px" });
    for (const key of Object.keys(secRefs.current)) {
      const el = secRefs.current[key];
      if (el) io.observe(el);
    }
    // BACKSTOP. Same reason as IntentRail's: an open section that never loads
    // reads as broken, and the observer is not guaranteed to deliver for an
    // element that was already on screen when it was created. ensureLoaded is
    // idempotent, so this is a no-op for every section the observer already got.
    const backstop = setTimeout(() => {
      for (const id of Object.keys(LOADABLE)) if (!isCollapsed(closed, id)) ensureLoaded(id);
    }, 2500);
    return () => { clearTimeout(backstop); io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, center && center.lat, center && center.lng]);

  const toggle = (id) => {
    const base = closedRef.current || readCollapsed();
    const closing = !isCollapsed(base, id);
    const list = nextCollapsed(base, id, closing);
    closedRef.current = list;
    setClosed(list);
    try { writeCollapsed(list); } catch (e) {}
    if (closing) return;
    const next = id;
    setOpen(next);
    // `trigger` separates a deliberate tap from the section that was already
    // open on arrival. Without it the default-open fire would silently inflate
    // best_nearby_open and make the before/after read on this change
    // uninterpretable — which is the only reason the change is being made.
    try { onLog && onLog("best_nearby_open", null, { section: id, trigger: "tap" }); } catch (e) {}
    // Only the sections whose data this component fetches. An intent rail and
    // the creator slot resolve their own content and must never be routed
    // through ensureLoaded — see the comment on `load` for what that cost.
    if (LOADABLE[id]) ensureLoaded(id);
  };

  // Owner call: rows open OUR detail sheet (the same card the main menu
  // uses), never a Google tab. Tours still book out on Viator — that is the
  // product. Directions live inside the detail sheet.
  const openPlace = (p) => {
    try { onLog && onLog("best_nearby_detail", { id: p.id, name: p.name }); } catch (e) {}
    if (onOpenPlace) onOpenPlace(p);
    else { const u = directionsUrl(p); if (u) { try { window.open(u, "_blank", "noopener"); } catch (e) {} } }
  };

  // Owner (2026-07-21, late): Local trends is OFF for now — vertical budget
  // goes to the taller hero. All trends machinery stays; flip to bring back.
  const SHOW_TRENDS = false;
  // THE MENU (owner, 2026-08-09). Order is the owner's own numbering. Three
  // kinds of section, one shell:
  //   · rail   — the Top 40, rendered from wf_best_picks (id "best")
  //   · rows   — the two ranked lists that were already here (eat, todo)
  //   · intent — a rail that runs its destination page's real query bank
  //   · slot   — a rail owned by another component and passed in (creators)
  //
  // `line: true` picks the stroke-icon set for the header tile; the original
  // two sections keep the NavIcon category glyphs they have always had, so
  // nothing about the existing rows moved.
  //
  // The intent sections take their one-line sub from INTENT_PAGES' own
  // `card.promise` rather than from new copy written here — that string is
  // already the vetted promise for the same list (check-intent-cards enforces
  // it exists), so the rail and the page it opens cannot describe themselves
  // differently.
  const SECTIONS = [
    { id: "eat", label: "Where to eat nearby", sub: "Ranked for this exact hour — not a generic top ten", icon: "food" },
    { id: "todo", label: "Things to do today", sub: "Tours, beaches, museums and attractions — one ranked list", icon: "attractions" },
    { id: "gems", label: "Hidden gems", icon: "gem", line: true, intent: "hidden-gems", href: "/hidden-gems", unit: "hidden gems" },
    { id: "creators", label: "Finds from local creators", sub: "Filmed by people who actually live here", icon: "film", line: true, slot: "creators" },
    { id: "tonight", label: "Perfect for tonight", icon: "ticket", line: true, intent: "tonight", href: "/tonight", unit: "picks for tonight" },
    { id: "drive", label: "Worth the drive", icon: "car", line: true, intent: "worth-the-drive", href: "/worth-the-drive", unit: "day trips" },
    { id: "budget", label: "Big fun, small budget", icon: "wallet", line: true, intent: "budget", href: "/budget", unit: "low-cost picks" },
    // Ninth, and only when there is something on. An accordion row that opens
    // onto "no events near you" is a row that costs a tap to learn nothing;
    // home.js hands `eventsSlot` a null when the chain comes back empty.
    ...(eventsSlot ? [{ id: "events", label: "Events near you", sub: "Concerts, games and shows — with dates, times and tickets", icon: "events", slot: "events" }] : []),
    ...(SHOW_TRENDS ? [{ id: "trends", label: "Local trends", sub: "What creators are posting, plus your area right now", icon: "map" }] : []),
  ];

  const trendsBody = (d) => (
    <>
      {(videoPlaces || []).length ? (
        <div style={{ padding: "6px 2px 4px" }}>
          <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 2 }}>Creators are posting about these</div>
          {(videoPlaces || []).map(({ p, videos }, i) => (
            <button key={p.id} onClick={() => openPlace(p)} className="wf-bn-focus" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "7px 0", minHeight: TARGET, background: "transparent", border: "none", borderTop: i ? "1px solid rgba(255,255,255,.05)" : "none", cursor: "pointer" }}>
              <Medal i={i} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2, flexWrap: "wrap" }}>
                  {[...new Set(videos.map((v) => v.platform))].slice(0, 3).map((pl) => PLATFORM[pl] ? (
                    <span key={pl} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: PLATFORM[pl].color }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: PLATFORM[pl].color, display: "inline-block" }} />{PLATFORM[pl].label}
                    </span>
                  ) : null)}
                  {videos[0] && videos[0].creator ? <span style={{ fontSize: 11, color: C.muted }}>{videos[0].creator}</span> : null}
                  <PlaceScoreChip p={p} size={11.5} />
                </div>
              </div>
              <span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ padding: "8px 2px 2px", fontSize: 12.5, color: C.muted }}>No creator videos linked near you yet — they appear here the moment one is.</div>
      )}
      {d.report ? (
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, padding: "8px 2px 4px", borderTop: "1px solid rgba(255,255,255,.06)" }}>{d.report}</div>
      ) : null}
      {d.beach && d.beach.status && STATUS_LABEL[d.beach.status] !== null ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 2px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <NavIcon name="beach" size={20} strokeWidth={1.6} color={C.blue} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{STATUS_LABEL[d.beach.status] || "Beach nearby"} · {d.beach.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {[isFinite(d.beach.distance_mi) ? d.beach.distance_mi.toFixed(1) + " mi" : null,
                isFinite(d.beach.waterTempF) ? "water " + Math.round(d.beach.waterTempF) + "°" : null,
                isFinite(d.beach.waveHeightFt) ? "waves " + d.beach.waveHeightFt + " ft" : null,
                ...(d.beach.reasons || []).slice(0, 1)].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      ) : null}
      {d.todays.length ? (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", padding: "8px 2px 2px" }}>
          <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 4 }}>Today</div>
          {d.todays.map((e, i) => (
            <div key={e.id || i} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: 13 }}>
              <span style={{ color: C.light, fontWeight: 800, fontSize: 11.5, flexShrink: 0, minWidth: 52 }}>{e.time || "Today"}</span>
              <span style={{ color: C.text, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              {e.venue || e.city ? <span style={{ color: C.muted, fontSize: 11.5, flexShrink: 0 }}>· {e.venue || e.city}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      
    </>
  );

  // Built here, not in JSX, so the honesty rules are readable in one place.
  const headline = (() => {
    const ctx = nowCtx();
    const openList = Array.isArray(rows[open]) ? rows[open] : [];
    const n = openList.length;
    // The COUNT clause is dropped entirely while loading or empty. A headline
    // that says "0 places scored" is worse than a headline with no count, and
    // one that says "30" when the engine returned 12 is worse than both.
    const factors = "scored on reviews, distance and time of day";
    return {
      // HONESTY FIX (owner-reported 2026-08-07: Rocco's Tacos & Tequila Bar
      // under "Open now" at 7am). Nothing in the engine checks opening hours —
      // wf_best_picks filters permanently-closed status only — so the header
      // must not claim "Open now" until an hours engine exists (scoped: hours
      // column + open-now filter + freshness cron). "The best near you" is
      // what the list actually is; the hour framing stays because the daypart
      // fit is real.
      lead: open === "todo" ? "Things to do near you," : "The best near you,",
      tail: "ranked for " + hourLabel(ctx.hour) + " " + ctx.dayName + ".",
      sub: (n ? n + " places " + factors : "Ranked " + factors) + " · no paid placement",
    };
  })();

  return (
    <section aria-label="Best nearby" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(145deg, #101722 0%, #0A0E15 72%)", border: "1px solid #293442", borderRadius: 19, padding: "4px 14px", marginBottom: 12, boxShadow: "inset 0 1px 0 rgba(255,255,255,.045), 0 12px 30px rgba(0,0,0,.2)" }}>
      <style dangerouslySetInnerHTML={{ __html: `.wf-bn-focus:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}` }} />
      {/* v6.97 — THE ANSWER, stated before anything is asked of the reader.
          This replaced an eyebrow that read "Nearby, right now / Updated for
          this hour": true, but it described the section instead of answering
          the question, and a stranger who lands here has about ten seconds.
          Every number in it is real — the hour and day come from the same
          nowContext() the ranking uses, and the count is the length of the
          list actually rendered below, never a round figure. */}
      <div style={{ padding: "13px 1px 11px" }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 820, letterSpacing: "-.7px", lineHeight: 1.16, color: C.text }}>
          {headline.lead}
          <br />
          <span style={{ background: "linear-gradient(120deg, #FDA60A, #FB3502)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{headline.tail}</span>
        </h2>
        <div style={{ marginTop: 6, fontSize: 11.5, color: "#7F8DA0", lineHeight: 1.4 }}>{headline.sub}</div>
      </div>
      {/* ── THE TOP 40 (owner, 2026-08-08) ────────────────────────────────
          "i want the same cards inside this... place 40 cards there... allow
          the user scroll right and left", and "make sure it is housed under
          this structure" — so it sits INSIDE this panel, directly under the
          gradient headline it belongs to, and renders the same RailCard the
          events and creator rails render. The ranked accordion below is
          untouched: it is the ANSWER, it still leads, and every measured
          decision behind it (the head of three, the see-all, the why line)
          still holds. This is a browse surface added above it, not a
          replacement for it. */}
      {(() => {
        const railBody = (() => {
        if (top40 === "loading") {
          return (
            <div style={{ paddingTop: 2 }} role="status" aria-busy="true" aria-label="Ranking the best near you">
              <div className="wf-sk" style={{ height: 16, width: 180, borderRadius: 6, marginBottom: 8 }} />
              <div className="wf-rail" aria-hidden="true" style={{ minHeight: TOP40_CARD_H }}>
                <div className="wf-sk" style={{ width: "100%", height: TOP40_CARD_H, borderRadius: 17, flexShrink: 0 }} />
              </div>
            </div>
          );
        }
        const list = Array.isArray(top40) ? top40 : [];
        // Fewer than three is not a shortlist, it is a thin shelf — the same
        // coverage rule the creator row already applies. The accordion below
        // still answers the question, so rendering nothing here costs nothing.
        if (list.length < 3) return null;
        return (
          <div style={{ paddingTop: 2 }}>
            <RailNav railId="top40" count={list.length} unit="top picks near you" />
            <div className="wf-rail wf-rail-top40" data-rail="top40" tabIndex={0} role="region" aria-label="Top picks near you" style={{ minHeight: TOP40_CARD_H }}>
              {list.map((p, i) => {
                // Only a VERIFIED partner pick becomes a CTA. placePartnerPick
                // is an exact normalized-name match against nine curated rows,
                // so this is null on almost every card and never a guessed
                // ticket link for a venue we have not confirmed sells one.
                const partner = placePartnerPick(p);
                const coupon = couponForPlaceName(p.name);
                // The SAME facts row the food cards carry (owner, 2026-08-09:
                // "we don't have much information like the ones from the
                // food"). Reviews, price, open/closed and distance — the four
                // things that decide whether a place is worth the trip — read
                // through the same single sources the rest of the app uses
                // (lib/price's priceLabel, lib/businessStatus), never
                // re-derived here.
                const st = top40Status(p);
                const facts = [
                  p.reviews ? compactReviews(p.reviews) + " reviews" : null,
                  priceLabel(p.price_level != null ? p.price_level : p.priceLevel),
                  st.open === true ? "Open" : st.open === false ? "Closed" : null,
                  isFinite(p.distance_mi) ? (p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)) + " mi" : null,
                  // The trend bump is DISCLOSED wherever it is applied — the
                  // same rule the rows below follow with <TrendReason>.
                  p.trending && p.trend_reason ? "🔥 " + p.trend_reason : null,
                ].filter(Boolean);
                // THE CHIPS (owner, 2026-08-09, with the /best-of card as the
                // reference: "Creator video · Waterfront · Great value · Crowd
                // favorite"). The first pass shipped only the creator-video and
                // coupon chips, which are both rare — measured live, 3 of the
                // first 4 cards had ZERO chips, leaving a visible hole between
                // the award band and the action row.
                //
                // experienceTags is IconicPlaceCard's portable, evidence-bound
                // tag engine — the same one the reference card uses, already
                // pinned by check-collection-look. Nothing here is invented: it
                // derives only from rating, review volume, price and the place's
                // real Google type, and it drops any tag incompatible with the
                // resolved identity. wf_best_picks returns a single
                // `primary_type` rather than the `types` array it expects, so
                // the row is adapted, never fabricated — a row with no type
                // simply yields fewer tags.
                const tagged = { ...p, types: Array.isArray(p.types) ? p.types : (p.primary_type ? [p.primary_type] : []), priceLevel: p.price_level != null ? p.price_level : p.priceLevel };
                const chips = [
                  // byVisibleScore stamps creator_video when it applied the
                  // +0.7, so this label and the score can never disagree.
                  p.creator_video ? { key: "creatorvideo", icon: "🎬", label: "Creator video" } : null,
                  coupon ? { key: "deal", icon: "🏷️", label: "Deal" } : null,
                  ...experienceTags(tagged, 4).map((t) => ({ key: t.key, icon: t.icon, label: t.label })),
                ].filter(Boolean).slice(0, 4);
                return (
                  <RailCard
                    key={p.place_id || p.id || i}
                    photo={tbPhotoUrl(p.photo_ref, 480)}
                    title={p.name}
                    eyebrow={prettyType(p.primary_type)}
                    rank={i + 1}
                    score={toDisplayScore(p.governed_score)}
                    facts={facts}
                    award={i < 3 ? { tone: i + 1, icon: i === 0 ? "🏆" : String(i + 1), label: i === 0 ? "Top pick near you" : "Top " + (i + 1) + " near you" } : null}
                    chips={chips}
                    cta={partner ? {
                      label: "🎟️ Tickets via " + partner.merchant + " ↗",
                      href: commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "top40_rail", contentId: p.place_id }),
                      external: true,
                      onClick: (e) => {
                        const clickId = mintClickId();
                        const live = commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "top40_rail", contentId: p.place_id, clickId });
                        if (live && e && e.currentTarget) e.currentTarget.href = live;
                        try { emitCommerce("commerce_cta_clicked", { surface: "top40_rail", provider: partner.provider, merchant: partner.merchant, offer_id: partner.offerId, content_id: p.place_id, click_id: clickId, disclosure_version: "partner-place-v1" }); } catch (err) {}
                      },
                    } : null}
                    take={toHookLine(hooks[p.place_id], p.name)}
                    ariaLabel={"Open " + p.name}
                    onOpen={() => { try { onLog && onLog("best_nearby_detail", { id: p.place_id, name: p.name }, { rail: "top40", pos: i + 1 }); } catch (e) {} openPlace(p); }}
                    onShare={() => { try { onLog && onLog("share", null, { id: p.place_id, kind: "top40_card" }); } catch (e) {} }}
                  />
                );
              })}
            </div>
            {/* Proximate disclosure, because a ticket CTA can appear above. */}
            <div style={{ marginTop: 7, fontSize: 10, color: "#6F7C8D" }}>Ticket links are affiliate links; Wayfind may earn a commission. Ranking never changes.</div>
          </div>
        );
        })();
        // A thin area returns no rail at all, and an empty accordion row that
        // opens onto nothing is worse than no row — so the header goes with it.
        if (!railBody) return null;
        return (
          <SectionShell sdef={TOP40_SECTION} isOpen={sectionOpen(TOP40_SECTION.id)} first onToggle={toggle} nodeRef={(el) => { secRefs.current.best = el; }}>
            {railBody}
          </SectionShell>
        );
      })()}
      {SECTIONS.map((sdef) => {
        const isOpen = sectionOpen(sdef.id);
        const data = rows[sdef.id];
        const list = Array.isArray(data) ? data : [];
        // The intent rails describe themselves with their destination page's
        // OWN vetted promise line, so a rail and the page it opens can never
        // read differently. A slot section (creator finds) keeps the sub it was
        // given, because the component that owns it owns that claim too.
        const def = sdef.intent ? INTENT_PAGES[sdef.intent] : null;
        const head = def && def.card && def.card.promise ? { ...sdef, sub: def.card.promise } : sdef;
        return (
          <SectionShell key={sdef.id} sdef={head} isOpen={isOpen} onToggle={toggle} nodeRef={(el) => { secRefs.current[sdef.id] = el; }}>
              <>
                {sdef.intent ? (
                  <IntentRailBody
                    intent={sdef.intent} href={sdef.href} unit={sdef.unit} label={sdef.label}
                    active={isOpen} center={center} weather={weather} city={city}
                    onOpenPlace={onOpenPlace} onLog={onLog} onExperience={onExperience}
                    isSaved={isSaved} liked={liked} disliked={disliked}
                    onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare}
                  />
                ) : sdef.slot === "events" ? (
                  eventsSlot || null
                ) : sdef.slot ? (
                  creatorSlot || null
                ) : data === "loading" ? (
                  // Rail-shaped, and the SAME height the live rail reserves, so
                  // the swap cannot shift the eight sections below it.
                  <div className="wf-rail" aria-hidden="true" style={{ minHeight: TOP40_CARD_H }}>
                    <div className="wf-sk" style={{ width: "100%", height: TOP40_CARD_H, borderRadius: 17, flexShrink: 0 }} />
                  </div>
                ) : sdef.id === "trends" && data && data.kindOf === "trends" ? (
                  trendsBody(data)
                ) : list.length ? (
                  <>
                    {/* THE MOOD ROW IS GONE (owner, 2026-08-09: "this shows what we
                        need to remove now that the menu has been updated"). It was
                        four chips inside the food section pointing at Date night,
                        Family and Hidden gems. Every one of those is now a SECTION
                        OF THIS MENU a few rows further down, so the chips had
                        become a second, worse navigation to destinations the
                        reader can already see — nested inside one of the very
                        sections they competed with. The routes themselves are
                        untouched and still reachable from the discovery rail at
                        the top of the feed. */}
                    {/* v7.05 (owner, 2026-08-09: "best places to eat is still
                        vertical instead of the horizontal, it is the only thing
                        that has not been changed"). The two ranked lists now
                        render the SAME RailCard as every other rail in the menu.

                        NOTHING ABOUT THE RANKING MOVED. Same wf_best_picks and
                        wf_things_to_do calls, same governed_score order, same
                        head of three with the measured see-all behind it, same
                        editorial hook with the engine's reason line as its
                        fallback — the reason simply rides on the card now
                        (RailCard's `why`) instead of in a row that no other
                        surface looked like. */}
                    <RailNav railId={sdef.id} count={list.length} unit={sdef.id === "eat" ? "ranked near you" : "things to do"} />
                    <div className={"wf-rail wf-rail-" + sdef.id} data-rail={sdef.id} tabIndex={0} role="region" aria-label={sdef.label} style={{ minHeight: TOP40_CARD_H }}>
                    {sdef.id === "eat"
                      ? list.map((p, i) => {
                          const tagged = { ...p, types: Array.isArray(p.types) ? p.types : (p.primary_type ? [p.primary_type] : []), priceLevel: p.price_level != null ? p.price_level : p.priceLevel };
                          const coupon = couponForPlaceName(p.name);
                          return (
                          <RailCard key={p.place_id} rank={i + 1}
                            photo={tbPhotoUrl(p.photo_ref, 480)} title={p.name} eyebrow={prettyType(p.primary_type)}
                            score={toDisplayScore(p.governed_score)}
                            take={toHookLine(hooks[p.place_id], p.name)}
                            badge={<>{p.trending ? <Flame reason={p.trend_reason} /> : null}<TrendReason r={p} /></>}
                            facts={[
                              p.reviews ? compactReviews(p.reviews) + " reviews" : null,
                              priceLabel(p.price_level != null ? p.price_level : p.priceLevel),
                              isFinite(p.distance_mi) ? (p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)) + " mi" : null,
                            ].filter(Boolean)}
                            chips={[
                              coupon ? { key: "deal", icon: "\u{1F3F7}\u{FE0F}", label: "Deal" } : null,
                              ...experienceTags(tagged, 3).map((t) => ({ key: t.key, icon: t.icon, label: t.label, onClick: onExperience ? () => onExperience(t.key, tagged) : undefined })),
                            ].filter(Boolean).slice(0, 3)}
                            ariaLabel={"Open " + p.name}
                            saved={!!(isSaved && isSaved({ id: p.place_id }))}
                            liked={!!(liked && liked[p.place_id])}
                            disliked={!!(disliked && disliked[p.place_id])}
                            onOpen={() => openPlace({ id: p.place_id, name: p.name, lat: p.lat, lng: p.lng, rating: p.rating, reviews: p.reviews, photo: tbPhotoUrl(p.photo_ref, 640) })}
                            onSave={(e) => { if (onSave) onSave(e, { id: p.place_id, name: p.name, lat: p.lat, lng: p.lng, rating: p.rating, reviews: p.reviews, photo: tbPhotoUrl(p.photo_ref, 640) }); }}
                            onLike={(e) => { if (onLike) onLike(e, { id: p.place_id, name: p.name, rating: p.rating, reviews: p.reviews }); }}
                            onDislike={(e) => { if (onDislike) onDislike(e, { id: p.place_id, name: p.name, rating: p.rating, reviews: p.reviews }); }}
                            onShare={() => { if (onShare) onShare({ id: p.place_id, name: p.name }); }}
                          />
                          );
                        })
                      : list.map((r, i) => r.kind === "experience" ? (
                          <RailCard key={r.id} rank={i + 1}
                            photo={r.image_url || null} title={r.title} eyebrow="Tour"
                            score={toDisplayScore(r.governed_score)}
                            take={reasonLine([r.subtitle])}
                            badge={r.selling_out ? <SellingFast /> : null}
                            facts={[
                              r.price_from != null ? "from $" + r.price_from : null,
                              fmtDur(r.duration_min),
                              r.reviews ? compactReviews(r.reviews) + " reviews" : null,
                            ].filter(Boolean)}
                            cta={r.booking_url ? { label: "Book \u2197", href: r.booking_url, external: true } : null}
                            ariaLabel={"Book " + r.title}
                            href={r.booking_url} external
                          />
                        ) : (
                          <RailCard key={r.id} rank={i + 1}
                            photo={tbPhotoUrl(r.photo_ref, 480)} title={r.title} eyebrow={prettyType(r.category)}
                            score={toDisplayScore(r.governed_score)}
                            take={toHookLine(hooks[r.id], r.title)}
                            badge={<>{r.trending ? <Flame reason={r.trend_reason} /> : null}<TrendReason r={r} /></>}
                            facts={[
                              r.reviews ? compactReviews(r.reviews) + " reviews" : null,
                              isFinite(r.distance_mi) ? (r.distance_mi < 10 ? r.distance_mi.toFixed(1) : Math.round(r.distance_mi)) + " mi" : null,
                            ].filter(Boolean)}
                            ariaLabel={"Open " + r.title}
                            saved={!!(isSaved && isSaved({ id: r.id }))}
                            liked={!!(liked && liked[r.id])}
                            disliked={!!(disliked && disliked[r.id])}
                            onOpen={() => openPlace({ id: r.id, name: r.title, category: r.category, rating: r.rating, reviews: r.reviews, photo: tbPhotoUrl(r.photo_ref, 640) })}
                            onSave={(e) => { if (onSave) onSave(e, { id: r.id, name: r.title, rating: r.rating, reviews: r.reviews, photo: tbPhotoUrl(r.photo_ref, 640) }); }}
                            onLike={(e) => { if (onLike) onLike(e, { id: r.id, name: r.title, rating: r.rating, reviews: r.reviews }); }}
                            onDislike={(e) => { if (onDislike) onDislike(e, { id: r.id, name: r.title, rating: r.rating, reviews: r.reviews }); }}
                            onShare={() => { if (onShare) onShare({ id: r.id, name: r.title }); }}
                          />                        ))}
                    </div>
                    {/* THE WAY TO MORE (owner, 2026-08-09: "offer the ability
                        for the user to search for more if there is more"). The
                        engine returns ten; these two pages are where the same
                        ranking runs without that ceiling. Real routes, both of
                        them — a dead end here is a dead end at the exact moment
                        someone decided to trust the list. */}
                    <a href={sdef.id === "eat" ? "/best-of" : "/nearby"} className="wf-railsec-more"
                      onClick={() => { try { onLog && onLog("best_nearby_more", null, { section: sdef.id, shown: list.length }); } catch (e) {} }}>
                      {"Search past these " + list.length + " \u2192"}
                    </a>
                    {sdef.id === "todo" && list.some((r) => r.kind === "experience") ? (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>Tours &amp; activities are affiliate links; Wayfind may earn a commission at no cost to you. It never changes what we recommend.</div>
                    ) : null}
                  </>
                ) : Array.isArray(data) ? (
                  <div style={{ padding: "8px 2px 10px", fontSize: 12.5, color: C.muted }}>Nothing strong here right now.</div>
                ) : null}
              </>
          </SectionShell>
        );
      })}
    </section>
  );
}
