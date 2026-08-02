"use client";
// Extracted from app/home.js (G3, July 2026 decomposition). Render-only.
// The place-detail bottom sheet — Wayfind's core, most-used UI surface.
// Five helpers used exclusively here move in too (galleryBtn, InfoChip,
// WorthTheDriveWidget, compass, insightSane); everything else (including
// betterAlternatives/similarPlaces/relatedPicks, which close over the
// module-scope EXPERIENCES table) stays in home.js and flows through ctx,
// same as every other extraction phase.
import { useEffect, useRef, useState } from "react";
import { C, sheetBg, sheet, SHEET_EASE, Grabber, directionsUrl, offerLabel, scoreLabel, stars, PlaceScoreChip, PriceBadge, TRENDING_POPULARITY_THRESHOLD } from "../kit";
import { priceLevelOf } from "../../../lib/price";
import { couponForPlaceName, couponIsLive, couponEndsLabel } from "../../../lib/coupons";
import { eventWhenLabel } from "../../../lib/eventTime";
import * as Dining from "../../../lib/dining";
import * as Ranking from "../../../lib/ranking";
import * as Tags from "../../../lib/tags";
import * as Aff from "../../../lib/affiliates";
import { supabase } from "../../../lib/supabase";
import { isNative, nativePickPhoto } from "../../../lib/native";
import BookingCTA, { hasBookingCTA } from "../BookingCTA";
import BookItLink from "../BookItLink";
import { creatorVideosFor, PLATFORM } from "../../../lib/creatorVideos";
import { resolveDetailCta, detailVerdict, detailCtaLabel, DETAIL_CTA_TYPES } from "../../../lib/detailCta";
import { emitCommerce, commerceHref, mintClickId } from "../../../lib/commerce";
import { funnelProps } from "../../../lib/funnel";
import { useCommerceImpression } from "../useCommerceImpression";
import { placePartnerPick } from "../../../lib/placePartnerPicks";

// Community takes (v6.54, owner: "the review is capped on characters we
// should be able to allow the user to have more characters and write it
// longer" + "allow the user to also post pictures on the review"). These are
// the client-side companions to the DB-level backstops in
// supabase/comment-photos.sql (char_length(body) <= COMMENT_MAX_CHARS,
// jsonb_array_length(photos) <= COMMENT_MAX_PHOTOS) — the write goes straight
// from the browser to Supabase with the user's own session (no server route
// in between, same as the rest of this comment feature), so a client-side cap
// alone would be trivially bypassed by anyone calling the REST API directly
// with a valid token. Both layers enforce the SAME numbers so a real user
// never sees the client accept something the database then silently rejects.
const COMMENT_MAX_CHARS = 4000;
const COMMENT_MAX_PHOTOS = 4;
const COMMENT_MAX_PHOTO_MB = 8;
const COMMENT_PHOTO_BUCKET = "comment-photos";

function galleryBtn(side) {
  return {
    position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: 8,
    width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(13,17,23,.55)", color: "#fff", fontSize: 20, lineHeight: 1,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };
}


function InfoChip({ label, value }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</div>
    </div>
  );
}

// v6.57: short "Jul 20"-style date for a water-quality/red-tide sample
// timestamp — same formatting rule as the Best Beaches page's BeachLiveChips.
function fmtBeachDay(d) {
  try { return new Date(d).toLocaleDateString([], { month: "short", day: "numeric" }); } catch { return d; }
}

// v4.52: AI insight text guard. The insight model occasionally returns meta
// commentary about categorization ("this is a performing arts theater, not a
// food establishment...") instead of a real verdict. That must never reach a
// user. Applied at render time so poisoned cache entries are neutralized too.
function insightSane(t) {
  const x = String(t || "").trim();
  if (!x) return "";
  if (/not a (food|restaurant|dining)|food establishment|does not belong|browsing category|miscategor|wrong category|as an ai|i cannot|i can't|unable to (assess|evaluate)/i.test(x)) return "";
  return x;
}

function WorthTheDriveWidget({ place, myVote, votes, onVote }) {
  const hasVoted = !!myVote;
  const total = votes ? (votes.yes || 0) + (votes.no || 0) : 0;
  const yesPct = total > 0 ? Math.round(((votes.yes || 0) / total) * 100) : 0;
  return (
    <div style={{ background: "rgba(56,189,248,.08)", border: "1.5px solid rgba(56,189,248,.35)", borderRadius: 16, padding: "16px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>🚗</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#E2E8F0" }}>Worth the drive?</div>
          {place.distMi != null && <div style={{ fontSize: 12, color: "#64748B" }}>{place.distMi.toFixed(1)} miles from you — weigh in</div>}
        </div>
      </div>
      {!hasVoted ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => onVote("yes")}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1.5px solid #22C55E", background: "rgba(34,197,94,.12)", color: "#22C55E", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
          >
            🚗 Yes, worth it
          </button>
          <button
            onClick={() => onVote("no")}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1.5px solid #64748B", background: "transparent", color: "#94A3B8", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            🤷 Not really
          </button>
        </div>
      ) : (
        <div>
          {total > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: yesPct >= 50 ? "#22C55E" : "#EF4444" }}>{yesPct}%</span>
                <span style={{ fontSize: 12, color: "#64748B" }}>say yes · {total} vote{total === 1 ? "" : "s"} total</span>
              </div>
              <div style={{ height: 9, background: "#2D3748", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${yesPct}%`, background: yesPct >= 50 ? "#22C55E" : "#EF4444", borderRadius: 999, transition: "width 0.6s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: "#22C55E", fontWeight: 700 }}>🚗 {votes.yes || 0} say worth it</span>
                <span style={{ color: "#64748B" }}>{votes.no || 0} say not really</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#64748B", borderTop: "1px solid #2D3748", paddingTop: 8 }}>
                You voted: <span style={{ fontWeight: 700, color: myVote === "yes" ? "#22C55E" : "#EF4444" }}>{myVote === "yes" ? "✓ Worth the drive" : "✗ Not really"}</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "6px 0" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: myVote === "yes" ? "#22C55E" : "#94A3B8", marginBottom: 4 }}>
                {myVote === "yes" ? "🚗 You said it's worth the drive!" : "You said not really. Fair enough."}
              </div>
              <div style={{ fontSize: 12, color: "#64748B" }}>Results will show as others weigh in.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The Wayfind take — a peek-carousel of labeled cards (owner, 2026-07-22).
// One aspect per card; the next peeks in and the dots track the swipe, so the
// reader always sees there is more and what it is. Body is near-white and
// regular-weight for readability.
function WayfindTakeRail({ editorial }) {
  const railRef = useRef(null);
  const [active, setActive] = useState(0);
  const SPEC = [
    ["why", "Why go", "🧭", C.accent], ["knownFor", "Known for", "⭐", C.gold],
    ["insiderMove", "Insider move", "🔑", C.gold], ["proMove", "Pro move", "⚡", C.green],
    ["proof", "Why it stands out", "💎", C.green],
    ["goodToKnow", "Good to know", "💡", "#7DD3FC"], ["watchOut", "Heads up", "⚠️", "#E8B84B"],
    ["bestFor", "Best for", "🎯", C.accent], ["move", "Best move", "✨", C.accent],
    ["foodMove", "Food move", "🍽️", C.gold], ["drinkMove", "Drink move", "🍸", C.gold],
    ["story", "The story", "📖", "#7DD3FC"], ["vibe", "Vibe check", "🎭", C.accent],
    ["funFact", "Fun fact", "💡", C.gold],
  ];
  const items = SPEC.map(([k, label, icon, color]) => ({ label, icon, color, body: editorial[k] })).filter((x) => x.body);
  if (!items.length) return null;
  const multi = items.length > 1;
  const onScroll = () => {
    const el = railRef.current;
    const firstCard = el?.firstElementChild;
    if (!el || !firstCard) return;
    const w = firstCard.getBoundingClientRect().width + 12;
    setActive(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w))));
  };
  return (
    <section style={{ marginBottom: 18, padding: "16px 0 14px", borderTop: "1px solid rgba(255,122,24,.22)", borderBottom: "1px solid rgba(255,255,255,.08)", background: "linear-gradient(180deg, rgba(255,122,24,.035), rgba(255,255,255,.012))" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, padding: "0 2px" }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 900, color: C.accent, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 }}>Wayfind editorial</div>
          <div style={{ fontSize: 17, fontWeight: 850, color: C.text, letterSpacing: "-.25px" }}>The local take, distilled.</div>
        </div>
          {multi ? <div style={{ flexShrink: 0, padding: "6px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", background: "rgba(8,12,18,.72)", fontSize: 10.5, fontWeight: 800, color: C.muted }}>{active + 1} / {items.length} · <span style={{ color: C.accent }}>Swipe →</span></div> : null}
      </div>
      <div ref={railRef} onScroll={onScroll} style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", padding: "0 2px 3px" }}>
        {items.map((it) => (
          <article key={it.label} style={{ position: "relative", overflow: "hidden", flex: multi ? "0 0 86%" : "0 0 100%", scrollSnapAlign: "start", background: "linear-gradient(145deg, rgba(28,34,44,.98), rgba(10,14,21,.96))", border: "1px solid rgba(255,255,255,.12)", borderRadius: 18, padding: "17px 18px 18px", minHeight: 126, boxSizing: "border-box", boxShadow: "0 14px 28px rgba(0,0,0,.22)" }}>
            <span aria-hidden="true" style={{ position: "absolute", inset: "0 auto 0 0", width: 3, background: `linear-gradient(180deg, ${it.color}, transparent 84%)` }} />
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <span style={{ width: 30, height: 30, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.065)", border: "1px solid rgba(255,255,255,.1)", fontSize: 15 }}>{it.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "1.25px", textTransform: "uppercase", color: it.color }}>{it.label}</span>
            </div>
            <div style={{ maxWidth: "34ch", fontSize: 14, fontWeight: 400, color: "#E6EDF3", lineHeight: 1.55, letterSpacing: "-.04px" }}>{it.body}</div>
          </article>
        ))}
      </div>
      {multi ? (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 11 }}>
          {items.map((it, i) => (<span key={i} title={it.label} style={{ width: i === active ? 20 : 5, height: 5, borderRadius: 999, background: i === active ? C.accent : "rgba(255,255,255,.2)", transition: "width .2s ease, background .2s ease" }} />))}
        </div>
      ) : null}
    </section>
  );
}

// v6.72 — FTC disclosure for the detail-sheet primary CTA. Rendered adjacent to
// any monetized action (tickets, rates, deals, tracked delivery).
function FTCDisclosure() {
  return (
    <div style={{ fontSize: 10.5, color: C.muted, margin: "7px 2px 0", textAlign: "center" }}>
      Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.
    </div>
  );
}

// v6.72 — the primary action button rendered by the detail-sheet CTA ladder.
// Tickets and rates still route through BookingCTA (preserving the booking-
// integrity contract and keeping <BookingCTA variant="primary"> in Detail.js),
// with a label override so the verb matches the ladder spec.
function PrimaryActionButton({ primaryCta, detail, kind, viaTours, locName, logEvent, addReservation, openExternal, ctaRef, onClick }) {
  const style = {
    minWidth: 0, height: 48, padding: "0 15px", background: C.accent, borderRadius: 12, color: "#0D1117",
    fontSize: 14.5, fontWeight: 800, textDecoration: "none", display: "inline-flex", alignItems: "center",
    justifyContent: "center", gap: 8, whiteSpace: "nowrap", cursor: "pointer", border: "none", flex: 1,
  };

  if (primaryCta.type === DETAIL_CTA_TYPES.tickets || primaryCta.type === DETAIL_CTA_TYPES.rates) {
    return (
      <BookingCTA
        variant="primary"
        detail={detail}
        kind={kind}
        viaTours={viaTours}
        logEvent={logEvent}
        addReservation={addReservation}
        openExternal={openExternal}
        locName={locName}
        label={primaryCta.label}
        placeId={detail.id}
        city={locName ? locName.split(",")[0] : ""}
      />
    );
  }

  const open = (url) => { try { (openExternal || window.open)(url, "_blank", "noopener"); } catch (e) {} };

  if (primaryCta.type === DETAIL_CTA_TYPES.conditions) {
    return (
      <a ref={ctaRef} href="#beach-conditions" onClick={(e) => { e.preventDefault(); try { document.getElementById("beach-conditions")?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} onClick(); }} style={style}>
        <span>{primaryCta.label}</span><span aria-hidden="true">↗</span>
      </a>
    );
  }

  if (primaryCta.type === DETAIL_CTA_TYPES.plan) {
    return (
      <button ref={ctaRef} onClick={onClick} style={style}>
        <span>{primaryCta.label}</span><span aria-hidden="true">+</span>
      </button>
    );
  }

  return (
    <a ref={ctaRef} href={primaryCta.href || primaryCta.mapsUrl || "#"} target="_blank" rel={primaryCta.monetized ? "sponsored noopener" : "noreferrer"} onClick={(e) => { e.preventDefault(); const live = (e.currentTarget && e.currentTarget.href) || primaryCta.href || primaryCta.mapsUrl; onClick(); open(live); }} style={style}>
      <span>{primaryCta.label}</span><span aria-hidden="true">↗</span>
    </a>
  );
}

// v6.72 — "Go now / wait" verdict pill rendered above the primary CTA.
function VerdictPill({ verdict }) {
  const isGo = verdict.tone === "go";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "6px 12px", borderRadius: 999, background: isGo ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)", border: `1px solid ${isGo ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)"}`, color: isGo ? "#22C55E" : "#EF4444", fontSize: 12.5, fontWeight: 800 }}>
      <span>{isGo ? "●" : "◐"}</span>
      <span>{verdict.text}</span>
    </div>
  );
}

// 2026-08-01 (owner: "recommend affiliate attractions nearby ... search the
// card's location and see major attractions nearby that we offer"). One row
// of "Where to go next" — a REAL nearby place (from the same suggested/places
// pool "More like this" already reads, so this adds no new geo source) that
// ALSO clears lib/placePartnerPicks.js's exact-name registry, i.e. a place we
// already have a verified partner ticket for. Same registry, same
// commerceHref/mintClickId/emitCommerce call shape as IconicPlaceCard's
// "🎟️ Partner tickets via X" pill — ONE partner-place lookup, not a second
// one invented for this rail. Tapping the row opens OUR detail page for that
// place (consistent with every other nearby rail on this sheet); the pill is
// the one monetized affordance, exactly like IconicPlaceCard's card.
function WhereToGoNextRow({ p, partner, openDetail, liveOpen, FallbackImg, ctaCity }) {
  const commerceCtx = { surface: "detail_where_next", provider: partner.provider, merchant: partner.merchant, offer_id: partner.offerId, canonical_place_id: p.id, city_id: ctaCity || null };
  const impressionRef = useCommerceImpression(commerceCtx);
  const baseHref = commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "detail_where_next", contentId: p.id });
  return (
    <div ref={impressionRef} style={{ display: "flex", gap: 11, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, marginBottom: 8 }}>
      <div onClick={() => openDetail(p)} style={{ display: "flex", gap: 11, alignItems: "center", flex: 1, minWidth: 0, cursor: "pointer" }}>
        <FallbackImg src={p.photo} icon="📍" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
            <PlaceScoreChip p={p} size={12} />
            {(() => { const lo = typeof liveOpen === "function" ? liveOpen(p) : p.openNow; return lo === true ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span> : lo === false ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.red }}>· Closed</span> : null; })()}
            {p.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
          </div>
        </div>
      </div>
      {baseHref ? (
        <a
          href={baseHref}
          target="_blank"
          rel="sponsored noopener"
          aria-label={`Tickets for ${p.name} via ${partner.merchant}`}
          title="Partner link. Wayfind may earn a commission; rankings never change."
          onClick={(e) => {
            e.stopPropagation();
            const clickId = mintClickId();
            const live = commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "detail_where_next", contentId: p.id, clickId });
            if (live && e.currentTarget) e.currentTarget.href = live;
            try { emitCommerce("commerce_cta_clicked", { ...commerceCtx, click_id: clickId }); } catch (er) {}
          }}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 10, background: C.adim, border: `1px solid ${C.border}`, color: "#FDBA74", textDecoration: "none", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}
        >🎟️ Tickets ↗</a>
      ) : (
        <span style={{ fontSize: 18, color: C.muted, flexShrink: 0 }}>›</span>
      )}
    </div>
  );
}

export default function DetailSheet({ ctx }) {
  const { detail, setDetail, detailExtra, setLightbox, reviewsOpen, setReviewsOpen, hoursOpen, setHoursOpen, venueEvents, venueEventsLoading, venueEventsOpen, setVenueEventsOpen, videos, videosLoading, beachCond, beachCondLoading, insight, insightLoading, insightFull, insightFullLoading, showMore, viaTours, debugOn, placeComments, setPlaceComments, commentType, setCommentType, placePosts, setPlacePosts, confirmDel, setConfirmDel, taInfo, insider, detailContext, myVotes, communityVotes, galleryRef, noteRef, scrollGallery, loadFullInsight, addReservation, handleVote, loadVenueEvents, placeShareUrl, FeaturedTag, curatedNote, curatedFor, wayfindNotes, betterAlternatives, similarPlaces, relatedPicks, placeKind, isBeach, suggested, places, offers, locName, blurbs, blurbLine, liked, disliked, user, authReady, sheetDragStart, sheetDragMove, sheetDragEnd, quickSaveFavorite, isSaved, toggleLike, toggleDislike, addShared, giveawayMark, logEvent, openExternal, openCuisine, openExperience, openDetail, setAuthOpen, ticketUrl, formatEventDate, shareLink, showToast, dedupePlaces, primaryCategory, experienceBadges, Critter, FallbackImg, liveOpen, weather } = ctx;

  // v6.37 — the owner's editorial voice (Vibe Check / Why Go / Best Move),
  // fetched per opened place from /api/editorial so the 288-place data module
  // stays server-side (zero client-bundle bytes; same pattern as insider).
  const [editorial, setEditorial] = useState(null);
  useEffect(() => {
    let dead = false;
    setEditorial(null);
    const nm = detail && !detail._event ? detail.name : null;
    if (!nm) return;
    fetch("/api/editorial?name=" + encodeURIComponent(nm) + (detail.id ? "&id=" + encodeURIComponent(detail.id) : "")) // v6.42: pass place_id so a richer Atlas card (when one exists) wins over the name-keyed note
      .then((r) => r.json())
      .then((j) => { if (!dead && j && j.editorial) setEditorial(j.editorial); })
      .catch(() => {});
    return () => { dead = true; };
  }, [detail && detail.id]);
  // v6.31: open/closed must match the list card exactly — compute live from the
  // hours periods (never the stale cached openNow), so "Open" in the list can't
  // become "Closed" in the sheet.
  const openState = (typeof liveOpen === "function" ? liveOpen(detail) : (detail && detail.openNow != null ? detail.openNow : null));

  // v6.72 — detail-sheet CTA ladder (Kimi revenue lane). One primary action,
  // place-type-aware, with a live "go now / wait" verdict above it.
  const primaryCta = resolveDetailCta({ detail, kind: placeKind(detail), viaTours, locName, offers, openState });
  const verdict = detailVerdict({ detail, weather, openState });
  const ctaCategory = Dining.cuisineLabel(detail) || primaryCategory(detail) || placeKind(detail) || "";
  const ctaCity = locName ? locName.split(",")[0] : "";
  const commerceCtx = primaryCta.monetized ? {
    ...funnelProps("commerce_impression", { metro: ctaCity, cuisine: ctaCategory, placeId: detail.id }),
    surface: "detail",
    provider: primaryCta.provider,
    offer_id: primaryCta.offerId,
  } : null;
  const ctaRef = useCommerceImpression(commerceCtx);

  // Guard event: if the ladder ever fails to produce a primary CTA, record it.
  useEffect(() => {
    if (!primaryCta || !primaryCta.type) {
      try { logEvent("primary_cta_null", detail, { city: ctaCity, category: ctaCategory }); } catch (e) {}
    }
  }, [detail && detail.id, primaryCta, ctaCity, ctaCategory, logEvent]);

  function handlePrimaryCtaClick() {
    try { logEvent("primary_cta_clicked", detail, { cta_type: primaryCta.type, provider: primaryCta.provider }); } catch (e) {}
    if (primaryCta.monetized && commerceCtx) {
      try { emitCommerce("commerce_cta_clicked", commerceCtx); } catch (e) {}
    }
    if (primaryCta.type === DETAIL_CTA_TYPES.plan) {
      quickSaveFavorite(detail);
    }
  }

  function addToPlan() {
    try { logEvent("primary_cta_clicked", detail, { cta_type: "add_to_plan" }); } catch (e) {}
    quickSaveFavorite(detail);
  }

  // v6.44 (owner-reported, with a photo): the hero showed TWO identical
  // circular left-chevron buttons down the left edge — the Back button at the
  // top and the gallery's "previous photo" arrow at the vertical centre — which
  // reads as a duplicate/broken control. Root cause: both arrows rendered
  // unconditionally, so on photo 1 (i.e. every time the sheet opens) a
  // "previous" affordance existed with nothing behind it. Track the live slide
  // and render each arrow only when it has somewhere to go; on open that
  // removes the left arrow entirely, and the ambiguity with it. A "2 / 7"
  // counter replaces it as the orientation cue, which is also what tells a
  // first-time user the gallery is swipeable at all.
  const [galleryIdx, setGalleryIdx] = useState(0);
  useEffect(() => { setGalleryIdx(0); }, [detail && detail.id]);

  // Community-take photos (v6.54). pendingPhotos are freshly-picked files not
  // uploaded yet (local object-URL previews only — nothing hits the network
  // until Save). existingPhotoUrls are storage PATHS (not full URLs — a path
  // survives a bucket/project URL change and needs no parsing to delete)
  // already attached to the signed-in user's own post for this place, so
  // editing the text never silently drops photos that were never touched.
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [noteLen, setNoteLen] = useState(0);
  const photoInputRef = useRef(null);
  useEffect(() => {
    // Reset on a place change — an attached-but-unsaved photo from the last
    // place shouldn't silently ride along to this one.
    setPendingPhotos((prev) => { prev.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch (e) {} }); return []; });
    const mine = user && Array.isArray(placePosts) ? placePosts.find((p) => p.user_id === user.id) : null;
    setExistingPhotoUrls((mine && Array.isArray(mine.photos) ? mine.photos : []).slice(0, COMMENT_MAX_PHOTOS));
    setNoteLen(((placeComments[detail && detail.id] && placeComments[detail.id].text) || "").length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail && detail.id, placePosts]);
  function photoUrlFor(path) {
    if (!supabase || !path) return null;
    try { return supabase.storage.from(COMMENT_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl; } catch (e) { return null; }
  }
  function onPickPhotos(fileList) {
    const room = COMMENT_MAX_PHOTOS - existingPhotoUrls.length - pendingPhotos.length;
    if (room <= 0) { showToast(`Up to ${COMMENT_MAX_PHOTOS} photos per post`); return; }
    const files = Array.from(fileList || []).filter((f) => f && /^image\//.test(f.type));
    const tooBig = files.some((f) => f.size > COMMENT_MAX_PHOTO_MB * 1024 * 1024);
    if (tooBig) showToast(`Photos must be under ${COMMENT_MAX_PHOTO_MB}MB`);
    const accepted = files.filter((f) => f.size <= COMMENT_MAX_PHOTO_MB * 1024 * 1024).slice(0, room);
    if (!accepted.length) return;
    setPendingPhotos((prev) => [...prev, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }
  // Native camera/photo-library picker (iOS wrapper only — nativePickPhoto
  // resolves to null on the website, and onPickPhotos below already knows
  // how to take a plain array of File objects, so this is a drop-in
  // alternate SOURCE for the exact same upload path, not a parallel one).
  async function onPickPhotoNative() {
    const room = COMMENT_MAX_PHOTOS - existingPhotoUrls.length - pendingPhotos.length;
    if (room <= 0) { showToast(`Up to ${COMMENT_MAX_PHOTOS} photos per post`); return; }
    const file = await nativePickPhoto({ source: "PROMPT" });
    if (file) onPickPhotos([file]);
  }
  function removeExistingPhoto(path) { setExistingPhotoUrls((prev) => prev.filter((p) => p !== path)); }
  function removePendingPhoto(previewUrl) {
    setPendingPhotos((prev) => { const hit = prev.find((p) => p.previewUrl === previewUrl); if (hit) { try { URL.revokeObjectURL(hit.previewUrl); } catch (e) {} } return prev.filter((p) => p.previewUrl !== previewUrl); });
  }
  // Uploads every pending file under the user's OWN folder — storage.objects'
  // RLS policy (supabase/comment-photos.sql) only allows an authenticated user
  // to write under `${auth.uid()}/...`, so this path shape is load-bearing,
  // not cosmetic. Best-effort: one failed upload doesn't drop the rest.
  async function uploadPendingPhotos() {
    if (!supabase || !user || !pendingPhotos.length) return [];
    setPhotoBusy(true);
    const uploaded = [];
    try {
      for (const p of pendingPhotos) {
        const ext = (p.file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        const path = `${user.id}/${detail.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        try {
          const { error } = await supabase.storage.from(COMMENT_PHOTO_BUCKET).upload(path, p.file, { upsert: false, contentType: p.file.type || "image/jpeg" });
          if (!error) uploaded.push(path);
        } catch (e) {}
      }
    } finally { setPhotoBusy(false); }
    return uploaded;
  }
  // Extracted from an inline JSX one-liner (v6.53 and earlier) so photo
  // upload could be inserted as a real async step before the upsert without
  // becoming unreadable. Behavior for text-only saves is unchanged: clearing
  // the box still only clears the LOCAL draft (never deletes an already-
  // posted comment — that's what the separate Delete button is for).
  // 2026-08-01: the composer itself is now gated behind sign-in (see the
  // authReady && !user branch below), so a signed-out visitor can no longer
  // reach this function with real content — the `!posting` "saved on this
  // device" branch is a defensive backstop (e.g. a session dropping between
  // render and this click), not the primary path it used to be.
  async function handleSaveComment() {
    const v = (noteRef.current && noteRef.current.value ? noteRef.current.value : "").trim().slice(0, COMMENT_MAX_CHARS);
    const next = { ...placeComments };
    if (v) next[detail.id] = { type: commentType, text: v }; else delete next[detail.id];
    setPlaceComments(next);
    try { localStorage.setItem("wf_place_comments", JSON.stringify(next)); } catch (e) {}

    const hasNewContent = !!(v || pendingPhotos.length);
    const posting = !!(supabase && user && hasNewContent);
    if (hasNewContent && supabase && !user) setAuthOpen(true);
    try { logEvent("user_comment", detail, { type: commentType, len: v.length, posted: posting, photos: existingPhotoUrls.length + pendingPhotos.length }); } catch (e) {}
    if (!hasNewContent) { showToast("Cleared"); return; }
    if (!posting) { showToast(commentType + " saved on this device — sign in to post to everyone"); return; }

    showToast(pendingPhotos.length ? "Uploading…" : "Saving…");
    try {
      const { data: _sd } = await supabase.auth.getSession();
      const _u = _sd && _sd.session && _sd.session.user;
      if (!_u) { setAuthOpen(true); showToast("Session expired — sign in and tap Save again"); return; }
      const uploaded = await uploadPendingPhotos();
      const photos = [...existingPhotoUrls, ...uploaded].slice(0, COMMENT_MAX_PHOTOS);
      const author = ((_u.email || "member").split("@")[0] || "member").slice(0, 24);
      const res = await supabase.from("comments").upsert(
        { place_id: detail.id, place_name: detail.name || "", user_id: _u.id, author, type: commentType, body: v, photos, updated_at: new Date().toISOString() },
        { onConflict: "user_id,place_id" }
      );
      if (res && res.error) {
        showToast("Couldn't post: " + String((res.error && res.error.message) || "server error").slice(0, 90) + " — saved on this device");
        try { console.error("[wayfind comment]", res.error.message || res.error); } catch (e2) {}
      } else {
        showToast(commentType + (uploaded.length < pendingPhotos.length ? " posted (some photos failed to upload)" : " posted"));
        setPlacePosts((pp) => [{ place_id: detail.id, user_id: _u.id, author, type: commentType, body: v, photos, created_at: new Date().toISOString() }, ...(pp || []).filter((x) => x.user_id !== _u.id)]);
        // 2026-08-01 (owner: "after the user posts it pushes but it looks like
        // it remained in the editorial"). A successful post used to leave the
        // draft box showing the SAME text and photos that now also appear in
        // the posted entry below it — reading as "did this actually save, or
        // is it just sitting here unposted?" The post itself lives in
        // placePosts (with its own Edit, which repopulates this box from the
        // real posted row) so the draft mirror is no longer needed once it
        // has actually posted — clear it back to an empty composer.
        setExistingPhotoUrls([]);
        setPendingPhotos((prev) => { prev.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch (e) {} }); return []; });
        if (noteRef.current) noteRef.current.value = "";
        setNoteLen(0);
        { const cleared = { ...placeComments }; delete cleared[detail.id]; setPlaceComments(cleared); try { localStorage.setItem("wf_place_comments", JSON.stringify(cleared)); } catch (e) {} }
      }
    } catch (err) {
      showToast("Couldn't reach the server — saved on this device");
      try { console.error("[wayfind comment]", err); } catch (e2) {}
    }
  }
  function handleDeleteComment() {
    try { supabase.from("comments").delete().eq("user_id", user.id).eq("place_id", detail.id).then(() => {}, () => {}); } catch (e) {}
    // Best-effort storage cleanup — orphaning a few small images on failure is
    // harmless (no cost/quota concern at this scale), so this never blocks
    // the comment delete itself.
    if (existingPhotoUrls.length) { try { supabase.storage.from(COMMENT_PHOTO_BUCKET).remove(existingPhotoUrls).then(() => {}, () => {}); } catch (e) {} }
    setPlacePosts((pp) => (pp || []).filter((x) => x.user_id !== user.id));
    const next = { ...placeComments }; delete next[detail.id]; setPlaceComments(next);
    try { localStorage.setItem("wf_place_comments", JSON.stringify(next)); } catch (e) {}
    if (noteRef.current) noteRef.current.value = "";
    setNoteLen(0);
    setExistingPhotoUrls([]);
    setPendingPhotos((prev) => { prev.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch (e) {} }); return []; });
    setConfirmDel(false);
    showToast("Deleted");
    try { logEvent("user_comment_delete", detail, {}); } catch (e) {}
  }
  // Measured off the children's real offsetLeft rather than clientWidth, so the
  // 6px inter-slide gap can't accumulate into an off-by-one on long galleries.
  const onGalleryScroll = (e) => {
    const el = e.currentTarget;
    if (!el || !el.children || !el.children.length) return;
    const x = el.scrollLeft;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const d = Math.abs(el.children[i].offsetLeft - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    setGalleryIdx(best);
  };

  // v6.44: does the booking CTA actually render? The dock's grid template
  // depends on it — see hasBookingCTA in components/BookingCTA.js.
  const hasBooking = detail ? hasBookingCTA(detail, placeKind(detail), viaTours, locName) : false;
  // ── THE PRIMARY CTA MATRIX (v6.77) ─────────────────────────────────────────
  // ONE primary per sheet, verb-labeled, resolved in a fixed order:
  //     deal > bookable(tickets) > delivery > directions
  //
  // Before this, DIRECTIONS was the orange primary and the monetized CTA sat in
  // the second cell — the decision surface led with the one action that earns
  // nothing. The order below is the inversion, and it is resolved ONCE here so
  // the button, the layout and the instrumentation cannot disagree.
  //
  // Every monetized rung reads the SAME predicate the disclosure reads
  // (hasBookingCTA -> bookingTargets). No parallel resolution: that is what let
  // an earning link render with no FTC line once, and it is what makes the
  // CityPASS/TicketSmarter registration a drop-in — when PROVIDERS exposes a
  // covered city + attraction kind as a verified-class target, the `bookable`
  // rung picks it up with zero change here.
  //
  // ONE PROVIDER PER CARD (owner's hard rule): exactly one rung wins, so exactly
  // one monetized href can occupy the primary slot.
  // primary_cta_null: fires when no MONETIZABLE CTA resolved. Directions is the
  // acknowledged non-monetized terminal and does NOT suppress the event — the
  // point is to count the sheets where we had nothing to sell, which is the
  // denominator for the attraction-ticket gap.
  const ctaFiredFor = useRef(null);
  useEffect(() => {
    if (!detail || !detail.id) return;
    if (ctaFiredFor.current === detail.id) return;
    ctaFiredFor.current = detail.id;
    try {
      logEvent("commerce_impression", detail, { place_type: placeKind(detail), cta_type: primaryCta.type });
      if (!primaryCta.monetized) logEvent("primary_cta_null", detail, { place_type: placeKind(detail), terminal: primaryCta.type });
    } catch (e) {}
  }, [detail && detail.id, primaryCta.type, primaryCta.monetized]);


  return (
        <div style={sheetBg} onClick={() => window.history.back()}>
          <div style={{ ...sheet, overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => window.history.back())} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ position: "relative" }}>
              <button onClick={() => window.history.back()} aria-label="Back" style={{ position: "absolute", top: "max(8px, env(safe-area-inset-top))", left: 12, zIndex: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.28)", background: "rgba(13,17,23,.55)", backdropFilter: "blur(6px)", color: "#fff", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
              {detail.photos && detail.photos.length > 0 ? (
                <div style={{ position: "relative" }}>
                  <div ref={galleryRef} onScroll={onGalleryScroll} style={{ display: "flex", gap: 6, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
                    {detail.photos.map((src, i) => (
                      <FallbackImg key={i} src={src} icon={detail._event ? "🎟️" : "🍽️"} onClick={() => setLightbox(src)} style={{ width: "100%", flexShrink: 0, height: 250, objectFit: "cover", scrollSnapAlign: "start", cursor: "zoom-in" }} />
                    ))}
                  </div>
                  {detail.photos.length > 1 && (
                    <>
                      {galleryIdx > 0 && (
                        <button onClick={() => scrollGallery(-1)} aria-label="Previous photo" style={galleryBtn("left")}>‹</button>
                      )}
                      {galleryIdx < detail.photos.length - 1 && (
                        <button onClick={() => scrollGallery(1)} aria-label="Next photo" style={galleryBtn("right")}>›</button>
                      )}
                      <div aria-hidden="true" style={{ position: "absolute", top: "max(12px, calc(env(safe-area-inset-top) + 4px))", right: 12, zIndex: 6, padding: "3px 9px", borderRadius: 999, background: "rgba(13,17,23,.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.16)", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: ".02em", lineHeight: 1.5, pointerEvents: "none" }}>{galleryIdx + 1} / {detail.photos.length}</div>
                    </>
                  )}
                </div>
              ) : detail._event && !detail.photo ? (
                <div style={{ width: "100%", height: 250, background: `linear-gradient(150deg, ${C.adim} 0%, #0D1117 78%)`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 54, opacity: 0.5 }}>🎟️</span></div>
              ) : (
                <FallbackImg src={detail.photo} icon={detail._event ? "🎟️" : "🍽️"} onClick={() => detail.photo && setLightbox(detail.photo)} style={{ width: "100%", height: 250, objectFit: "cover", cursor: detail.photo ? "zoom-in" : "default" }} />
              )}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "48px 18px 15px", background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.45) 45%, rgba(0,0,0,.88) 100%)", pointerEvents: "none" }}>
                {(() => { const pc = primaryCategory(detail); return pc ? <div style={{ fontSize: 11, fontWeight: 800, color: C.light, textTransform: "uppercase", letterSpacing: "0.9px", marginBottom: 5, textShadow: "0 1px 5px rgba(0,0,0,.9)" }}>{pc}</div> : null; })()}
                <div style={{ fontSize: 27, fontWeight: 800, color: "#fff", lineHeight: 1.13, letterSpacing: "-0.5px", textShadow: "0 2px 12px rgba(0,0,0,.8)" }}>{detail.name}</div>
              </div>
            </div>
            <div style={{ padding: "16px 16px calc(30px + env(safe-area-inset-bottom))" }}>
              {/* 1. Basics */}

              {detail.address && (
                <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12.5, color: C.muted, textDecoration: "none", marginBottom: 14, lineHeight: 1.4 }}>{detail.address}</a>
              )}
              {/* Verdict: one consistent row of the things that decide whether to go */}
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
                {(() => { const sl = scoreLabel(detail.wfScore); return sl ? <span style={{ color: C.light, fontWeight: 800 }}>{sl.s}<span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}> / 10</span></span> : null; })()}
                {(() => { const a = new Set((placePosts || []).map((x) => x.user_id)).size; if (!a) return null; return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.muted, fontWeight: 700, fontSize: 11 }}>{a} member take{a === 1 ? "" : "s"}{a >= 3 ? " · in score" : ""}</span></>); })()}
                {detail.reviews > 0 && (<>
                  <span style={{ color: C.border }}>·</span>
                  <span onClick={() => { const n = !reviewsOpen; setReviewsOpen(n); if (n) loadFullInsight(detail, detailExtra); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.muted, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>{detail.reviews.toLocaleString()} review{detail.reviews === 1 ? "" : "s"}</span>
                </>)}
                {(() => { const _ta = taInfo[detail.id]; if (!_ta || _ta.none || _ta.rating == null) return null; return (<><span style={{ color: C.border }}>·</span><a href={_ta.url || "https://www.tripadvisor.com"} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href); try { logEvent("ta_out", detail); } catch (er) {} openExternal(_live); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", color: C.muted, fontSize: 12.5, fontWeight: 600 }}><span style={{ color: "#34E0A1", fontWeight: 800 }}>●</span>{_ta.rating}{_ta.reviews ? ` (${_ta.reviews.toLocaleString()})` : ""} on Tripadvisor ↗</a></>); })()}
                {detail._event ? (() => {
                  const ef = formatEventDate(detail._event.date, detail._event.time);
                  const d = detail._event.date ? new Date(detail._event.date + "T00:00:00") : null;
                  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
                  const diff = d && !isNaN(d) ? Math.round((d - t0) / 86400000) : null;
                  const when = ef.wd ? (ef.wd + ", " + ef.mo + " " + ef.day + (ef.time ? " · " + ef.time : "")) : (detail._event.time || "");
                  const rel = eventWhenLabel(detail._event); const label = diff != null && diff < 0 ? "Ended" : rel ? (rel + (ef.time ? " · " + ef.time : "")) : (when || "Event"); // v6.13: same-day label reflects the real hour
                  return (<>
                    <span style={{ color: C.border }}>·</span>
                    <span style={{ fontWeight: 800, color: diff != null && diff < 0 ? C.muted : C.accent }}>{label}</span>
                    {openState != null && (<span onClick={() => setHoursOpen((o) => !o)} style={{ cursor: "pointer", fontWeight: 600, fontSize: 11.5, color: C.muted }}>Venue hours</span>)}
                  </>);
                })() : (<>
                  <span style={{ color: C.border }}>·</span>
                  {openState == null ? (
                    <span onClick={() => setHoursOpen((o) => !o)} style={{ cursor: "pointer", fontWeight: 700, fontSize: 12, color: C.muted }}>Hours unavailable<span style={{ fontSize: 8.5, marginLeft: 3, display: "inline-block", transform: hoursOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span></span>
                  ) : (
                    <span onClick={() => setHoursOpen((o) => !o)} style={{ cursor: "pointer", fontWeight: 800, color: openState ? C.green : C.red }}>{openState ? "Open now" : "Closed"}<span style={{ fontSize: 8.5, marginLeft: 3, display: "inline-block", transform: hoursOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span></span>
                  )}
                </>)}
                {detail.distMi != null && (<><span style={{ color: C.border }}>·</span><a href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail, { src: "meta" }); } catch (e) {} }} style={{ color: C.light, fontWeight: 700, textDecoration: "none" }}>{detail.distMi.toFixed(1)} mi ▸</a></>)}
                {(() => { const cz = Dining.cuisineLabel(detail) || primaryCategory(detail); return cz ? (<><span style={{ color: C.border }}>·</span><button onClick={() => { try { logEvent("cuisine_link", detail, { cz }); } catch (e) {} openCuisine(cz, detail); }} style={{ background: "transparent", border: "none", padding: 0, color: C.light, fontWeight: 700, fontSize: "inherit", cursor: "pointer" }}>{cz} ›</button></>) : null; })()}
                {(() => { if (detail._event) return null; const isD = ["Food", "Nightlife"].includes(Ranking.coarseCat(detail) || ""); const cost = isD ? Dining.costForTwo(detail) : null; /* PriceBadge reads the NUMBER, not the glyph string: detail.price was pre-rendered "$$" with no word, and a glyph without its label is exactly the half-signal that let "$$$$" and "Moderate" disagree. costForTwo stays ahead of it — a real dollar range for two is more specific than a band. */ const lvl = priceLevelOf(detail.priceNum != null ? detail.priceNum : (detail.price_level != null ? detail.price_level : detail.priceLevel)); if (cost && cost.listed) return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.green, fontWeight: 800 }}>{cost.text}</span></>); if (lvl) return (<><span style={{ color: C.border }}>·</span><PriceBadge level={lvl} /></>); return null; })()}
              </div>
              {!detail._event && Tags.requiresParkAdmission(detail.types) && (
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, marginTop: -4, marginBottom: 12 }}>May require park admission.</div>
              )}
              {hoursOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
                  {(() => {
                    // v6.31: hours come from whichever source we already have — the
                    // detail fetch (detailExtra.hours) or the weekday text captured
                    // at search time (detail.oh.weekdayDescriptions). We only sit on
                    // "Loading…" while the detail fetch is genuinely in flight AND we
                    // have no cached weekday text; otherwise the sheet never gets
                    // stuck spinning when that fetch fails or returns nothing.
                    const lines = (detailExtra && Array.isArray(detailExtra.hours) && detailExtra.hours.length > 0)
                      ? detailExtra.hours
                      : (detail.oh && Array.isArray(detail.oh.weekdayDescriptions) && detail.oh.weekdayDescriptions.length > 0
                          ? detail.oh.weekdayDescriptions
                          : null);
                    if (lines) {
                      return (<>
                        {lines.map((line, i) => {
                          const parts = line.split(": ");
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: C.light, padding: "2px 0" }}>
                              <span style={{ fontWeight: 600, color: C.text }}>{parts[0]}</span>
                              <span style={{ textAlign: "right" }}>{parts.slice(1).join(": ")}</span>
                            </div>
                          );
                        })}
                        {/* v6.34: attribution renders only under real hours — it used
                            to sit beneath "Hours not listed" too, crediting Google
                            for hours we don't have. */}
                        <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 8 }}>Hours from Google.</div>
                      </>);
                    }
                    return <div style={{ fontSize: 12.5, color: C.muted }}>{detailExtra === null ? "Loading hours…" : "Hours not listed for this place."}</div>;
                  })()}
                </div>
              )}

              {/* Premium action dock (v6.72): verdict pill + Add to plan + primary CTA ladder. */}
              <div style={{ marginBottom: 16, padding: 10, background: "linear-gradient(145deg, rgba(25,34,47,.98), rgba(12,18,27,.98))", border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 16px 34px rgba(0,0,0,.24)" }}>

                {!detail._event && <VerdictPill verdict={verdict} />}
                {/* v6.44: the second column exists only if BookingCTA will actually
                    render into it. Previously this was always 2 columns, so a place
                    with no booking target left "Directions" at half width beside an
                    empty cell (owner-reported, with a photo). */}
                {/* v6.77: ONE primary, resolved by primaryCta above. The orange
                    slot now belongs to whatever EARNS — it used to belong to
                    Directions, which earns nothing, while the booking CTA sat in
                    a second cell. Directions moved to the secondary row unless it
                    IS the resolved primary (the honest terminal). Single column
                    always, so the v6.44 "half-width Directions beside a hole"
                    bug cannot return by way of an empty second cell. */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 8 }}>
                  <PrimaryActionButton
                    primaryCta={primaryCta}
                    detail={detail}
                    kind={placeKind(detail)}
                    viaTours={viaTours}
                    locName={locName}
                    logEvent={logEvent}
                    addReservation={addReservation}
                    openExternal={openExternal}
                    ctaRef={ctaRef}
                    onClick={handlePrimaryCtaClick}
                  />
                </div>
                {!detail._event && primaryCta.monetized && primaryCta.type !== DETAIL_CTA_TYPES.tickets && primaryCta.type !== DETAIL_CTA_TYPES.rates && <FTCDisclosure />}
                {/* One balanced secondary bar. Directions used to occupy a row
                    by itself above reactions, which made the dock look like two
                    unrelated button systems. Keep every secondary action on the
                    same baseline; the earning/decision CTA remains the sole
                    full-width primary above. */}
                <div data-detail-secondary-actions style={{ display: "flex", alignItems: "stretch", gap: 8, marginTop: 8 }}>
                  {primaryCta.type !== "directions" && (
                    <a data-detail-directions href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail); } catch (e) {} }} style={{ flex: "1 1 104px", minWidth: 92, height: 44, padding: "0 10px", background: "rgba(255,255,255,.035)", border: `1px solid ${C.border}`, borderRadius: 12, color: C.accent, fontSize: 12.5, fontWeight: 800, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }} aria-label="Directions">
                      <span>Directions</span><span aria-hidden="true">↗</span>
                    </a>
                  )}
                  {!detail._event && (<>
                    <button onClick={(e) => toggleLike(e, detail)} aria-label="Like" style={{ flexShrink: 0, width: 44, height: 44, background: liked[detail.id] ? C.adim : "rgba(255,255,255,.035)", border: `1px solid ${liked[detail.id] ? C.light : C.border}`, borderRadius: 12, color: liked[detail.id] ? C.light : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg></button>
                    <button onClick={(e) => toggleDislike(e, detail)} aria-label="Not for me" style={{ flexShrink: 0, width: 44, height: 44, background: "rgba(255,255,255,.035)", border: `1px solid ${disliked[detail.id] ? C.red : C.border}`, borderRadius: 12, color: disliked[detail.id] ? C.red : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg></button>
                  </>)}
                  <button onClick={() => { shareLink(detail.name, placeShareUrl(detail, locName, blurbLine(blurbs[detail.id])), () => showToast("Link copied"), `Want to go to ${detail.name} together? Found it on Wayfind`, () => { try { logEvent("share", detail, { kind: "place" }); } catch (e) {} giveawayMark(detail.id); addShared(detail); }); }} aria-label="Share" style={{ flex: "1 1 104px", minWidth: 88, height: 44, padding: "0 10px", background: "rgba(255,255,255,.035)", border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 750, whiteSpace: "nowrap" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg><span>Share</span></button>
                </div>
              </div>
              {(() => { /* v6.37 — VRBO whole-home alternative for lodging places (Expedia affiliate; template in lib/affiliates, plain link until set). */
                const _ty = ((detail.types || []).join(" ")).toLowerCase();
                if (!/lodging|hotel|resort|motel|bed_and_breakfast|guest_house/.test(_ty)) return null;
                const _vu = Aff.vrboUrl(locName);
                if (!_vu) return null;
                return <a href={_vu} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("vrbo_out", detail); } catch (e) {} }} style={{ display: "block", textAlign: "center", fontSize: 12, fontWeight: 800, color: C.light, textDecoration: "none", margin: "8px 2px 0" }}>Prefer a whole place? Vacation rentals on VRBO ↗</a>;
              })()}

              <BookingCTA variant="disclosure" detail={detail} kind={placeKind(detail)} viaTours={viaTours} />
              {Array.isArray(detail._children) && detail._children.length ? (
                <section data-contained-venues style={{ margin: "10px 0 16px", padding: "13px 14px", background: "rgba(255,255,255,.025)", border: `1px solid ${C.border}`, borderRadius: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: ".6px", textTransform: "uppercase" }}>Inside {detail.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginTop: 4 }}>Included highlights at this destination — not separate places to visit.</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
                    {detail._children.slice(0, 6).map((child) => (
                      <span key={child.id || child.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", padding: "6px 10px", borderRadius: 999, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</span>
                        {child.rating != null ? <span style={{ color: C.gold, flexShrink: 0 }}>{child.rating}★</span> : null}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}
              {/* Featured creator video (Phase 1): curated UGC social proof, credited to the creator and linked out to their real video. Placed UNGATED here (below the action row, above "Why Wayfind picked this") on purpose so it's prominent — the auto-YouTube strip stays inside "show more" below. This sheet is noindex, so the creator's benefit here is traffic: we keep the referrer (rel="noopener", deliberately NOT "noreferrer") so the visit attributes to Wayfind in their analytics. No JSON-LD here; VideoObject lives only on /trending/[city]. */}
              {!detail._event && (() => {
                const cvs = creatorVideosFor(detail, locName);
                if (!cvs.length) return null;
                return (
                  <div style={{ marginBottom: 16 }}>
                    {cvs.map((v, i) => {
                      const p = PLATFORM[v.platform] || PLATFORM.tiktok;
                      const handle = v.creator ? "@" + v.creator : null;
                      const headline = handle ? `Watch ${handle}'s visit to ${detail.name}` : `See ${detail.name} on ${p.label}`;
                      return (
                        <a key={"cvid" + i} href={v.url} target="_blank" rel="noopener"
                           onClick={() => { try { logEvent("creator_video", detail, { platform: v.platform, creator: v.creator || "" }); } catch (e) {} }}
                           aria-label={`${headline} (opens in a new tab)`}
                           style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", background: `linear-gradient(160deg, ${p.color}1f 0%, ${C.card} 60%)`, border: `1.5px solid ${p.color}`, borderRadius: 14, padding: 12, marginBottom: i < cvs.length - 1 ? 10 : 0, minHeight: 44, boxShadow: "0 2px 16px rgba(0,0,0,.32)" }}>
                          <div style={{ position: "relative", flexShrink: 0, width: 88, height: 88, borderRadius: 11, overflow: "hidden", background: `linear-gradient(135deg, ${p.color} 0%, #0D1117 130%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {v.thumbnail && <FallbackImg src={v.thumbnail} icon="▶️" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                            <span aria-hidden="true" style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", background: "rgba(13,17,23,.66)", border: "1.5px solid rgba(255,255,255,.92)", color: "#fff", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 3 }}>▶</span>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", color: p.color, marginBottom: 3 }}>Featured on {p.label}</div>
                            <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{headline}</div>
                            {v.caption && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.35 }}>{v.caption}</div>}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 800, color: p.color }}>Watch Video ↗</span>
                              {handle && <span style={{ fontSize: 11.5, color: C.muted }}>· by {handle}</span>}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                );
              })()}
              {/* Why Wayfind picked this: the soul of the page. One grounded paragraph, written and validated as a single unit — never stitched together from separate loose fields. */}
              {/* v6.60 (owner, brand integrity — the Ryan's Coffee House bug):
                  "Why Wayfind picked this" is a Wayfind OPINION. It renders ONLY
                  when we actually have one — a review-grounded insight or a
                  curated editorial. It must NEVER stamp that header over generic
                  filler ("A highly reviewed nearby option..."). When there is no
                  real opinion the block is omitted; the neutral Google summary
                  still renders below, clearly sourced. */}
              {(() => {
                if (insightLoading) return (
                  <div style={{ marginBottom: 16, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.card} 62%)`, border: `1px solid ${C.border}55`, borderRadius: 14, padding: "13px 14px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>{detail._event ? "Why this venue" : "Why Wayfind picked this"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginTop: 8 }}>
                      <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={22} /></div>
                      Reading the reviews
                    </div>
                  </div>
                );
                // v6.9x (owner, editorial-quality audit 2026-08-01): the
                // stitch-from-parts fallback (verdict + whyPicked + tip +
                // goWhen + skipIf — none of which had been validated on its
                // own) is gone. /api/insight's compact mode now returns
                // exactly one field, why_wayfind_picked_this, and it always
                // comes through validateWhyParagraph before it ever reaches
                // here — so if it's present, it's already good. Nothing to
                // compose.
                const ins = insight && !insight.error && !insight.unavailable ? insight : null;
                const S = (v) => insightSane(v);
                const why = ins ? S(ins.why_wayfind_picked_this) : "";
                // A REAL, review-grounded opinion only — no filler, ever. The
                // curated editorial has its own surface (the Wayfind-take rail);
                // the Google summary renders neutrally below. So this block is
                // strictly the insight, shown only when it actually grounded.
                const body = why;
                if (!body) return null;
                return (
                  <div style={{ marginBottom: 16, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.card} 62%)`, border: `1px solid ${C.border}55`, borderRadius: 14, padding: "13px 14px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>{detail._event ? "Why this venue" : "Why Wayfind picked this"}</div>
                    <div style={{ fontSize: 14.5, color: C.text, lineHeight: 1.6, marginTop: 8, fontWeight: 500 }}>{body}</div>
                  </div>
                );
              })()}
              {/* v6.9x (owner, editorial-quality audit 2026-08-01): the ONLY
                  what-to-order block on the page — the duplicate "Must try"
                  render that used to live inside "Tips, videos & more" below
                  is gone. Reads insightFull.what_to_order (validated via
                  filterSupportedItems, ranked by distinctiveness rather than
                  raw mention frequency) plus the new pairs_well and caveat
                  fields — nothing here rides along unvalidated. */}
              {!detail._event && insightFull && Array.isArray(insightFull.what_to_order) && insightFull.what_to_order.filter((x) => x && String(x).trim()).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 8 }}>{Tags.sectionLabel(Tags.resolveIdentity(detail.types || []))}</div>
                  {insightFull.what_to_order.filter((x) => x && String(x).trim()).slice(0, 5).map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 5 }}>
                      <span style={{ color: C.light, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{d}</span>
                    </div>
                  ))}
                  {insightFull.pairs_well && String(insightFull.pairs_well).trim() && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}><span style={{ color: C.light, fontWeight: 700 }}>Pairs well: </span>{insightFull.pairs_well}</div>}
                  {insightFull.caveat && String(insightFull.caveat).trim() && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.4 }}><span style={{ color: C.light, fontWeight: 700 }}>Good to know: </span>{insightFull.caveat}</div>}
                  <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 7 }}>The signature picks, not just what gets mentioned most.</div>
                </div>
              )}
              {/* "Where to go next" (2026-08-01, owner). Real nearby places —
                  same suggested/places pool "More like this" reads below —
                  that ALSO clear lib/placePartnerPicks.js's exact-name
                  registry, so every row here is a place we already have a
                  verified partner ticket for, not a guess at what might be
                  nearby. Deliberately placed up here beside "what to order"
                  rather than buried with the non-monetized nearby rails at
                  the bottom of the sheet. */}
              {!detail._event && (() => {
                const nextPool = dedupePlaces([...(suggested || []), ...places]).filter((p) => p && p.id !== detail.id);
                const seenOffers = new Set();
                const picks = nextPool
                  .map((p) => ({ p, partner: placePartnerPick(p) }))
                  .filter((x) => x.partner)
                  .filter((x) => { if (seenOffers.has(x.partner.offerId)) return false; seenOffers.add(x.partner.offerId); return true; })
                  .sort((a, b) => (a.p.distMi ?? 1e9) - (b.p.distMi ?? 1e9))
                  .slice(0, 3);
                if (!picks.length) return null;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>Where to go next</div>
                    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Major attractions nearby with tickets we can book you into.</div>
                    {picks.map(({ p, partner }) => (
                      <WhereToGoNextRow key={"next-" + p.id} p={p} partner={partner} openDetail={openDetail} liveOpen={liveOpen} FallbackImg={FallbackImg} ctaCity={ctaCity} />
                    ))}
                    <FTCDisclosure />
                  </div>
                );
              })()}
              {/* Review/photo nudge (2026-08-01, owner: "recommend the user to
                  post a review and share photos"). The Community takes box
                  below already accepts both — a review-typed note plus up to
                  4 photos — this just turns that into an actively-recommended
                  action instead of a passive box the reader has to notice on
                  their own. Scrolls to and focuses the SAME textarea/upload
                  control, not a second entry point. */}
              {!detail._event && (
                <button
                  onClick={() => {
                    try { noteRef.current && noteRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
                    try { setCommentType("Review"); } catch (e) {}
                    try { noteRef.current && noteRef.current.focus(); } catch (e) {}
                    try { logEvent("review_prompt_tap", detail, {}); } catch (e) {}
                  }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", marginBottom: 16, padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ fontSize: 18 }}>⭐</span>
                    <span>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: C.text }}>Been here?</span>
                      <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 1 }}>Leave a review and share your photos</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 18, color: C.muted, flexShrink: 0 }}>›</span>
                </button>
              )}
              {(() => { const _wn = !detail._event ? wayfindNotes(detail.name) : null; if (!_wn) return null; return (
                <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>Insider notes</span>
                    <span style={{ fontSize: 9.5, color: C.muted }}>Curated by Wayfind</span>
                  </div>
                  {_wn.map((n, i) => { const o = typeof n === "string" ? { text: n } : n; return (
                    <div key={i} style={{ marginTop: i ? 8 : 0 }}>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>{o.text}</div>
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("note_link", detail, { label: o.label || "" }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 7, padding: "9px 15px", borderRadius: 999, background: C.adim, border: `1.5px solid ${C.border}`, color: C.light, fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>🎟 {o.label || "Open link"} ↗</a>
                      )}
                    </div>
                  ); })}
                </div>
              ); })()}
              {/* 3. Insider tip */}
              {/* v6.60 (owner) — the Wayfind take as a PEEK-CAROUSEL of labeled
                  cards: the swipe-one-at-a-time feel, but the next card peeks in
                  and every card wears its label, so nothing is hidden. Order:
                  Why go -> Known for -> Insider move -> Why it stands out ->
                  Good to know -> Heads up (remaining aspects appended so nothing
                  is dropped). Body is near-white, 14px, REGULAR weight — larger
                  and lighter than the label, the readability fix the owner asked
                  for. */}
              {!detail._event && editorial ? <WayfindTakeRail editorial={editorial} /> : null}

              {(() => { const _ins = insider[detail.id]; if (!_ins || _ins.none) return null; const _cf = curatedFor && curatedFor(detail); const rows = [["🗝️", "Insider tip", _ins.tip], ["🕐", "Best time", _ins.bestTime], ["⭐", "Don't miss", _ins.dontMiss], ["💡", "Fun fact", (_cf && _cf.funFact) || _ins.funFact]].filter((r) => r[2]); if (!rows.length) return null; return (
                <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: C.gold, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 8 }}>🔑 Insider intel</div>
                  {_ins.special ? <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 8, lineHeight: 1.4 }}>{_ins.special}</div> : null}
                  {rows.map(([ic, lb, tx], i) => (
                    <div key={lb} style={{ display: "flex", gap: 9, padding: "6px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ flexShrink: 0, fontSize: 14 }}>{ic}</span>
                      <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}><b style={{ color: C.text }}>{lb}:</b> {tx}</div>
                    </div>
                  ))}
                </div>
              ); })()}
              <div style={{ marginBottom: 16 }}>
              {!detail._event && ["museum", "wildlife", "entertainment", "scenic", "beach", "nature", "landmark", "waterfront"].includes(placeKind(detail)) && (() => {
                const _hasNoteUrl = (() => { const _n = wayfindNotes(detail.name); return !!(_n && _n.some((x) => x && typeof x === "object" && x.url)); })();
                return <BookingCTA variant="list" detail={detail} kind={placeKind(detail)} viaTours={viaTours} logEvent={logEvent} addReservation={addReservation} openExternal={openExternal} locName={locName} suppressFallback={_hasNoteUrl} placeId={detail.id} city={ctaCity} />;
              })()}
              {/* Travelpayouts "Book it" complement (ships dark; renders nothing until an owner sets program ids + NEXT_PUBLIC_BOOK_IT=on). Never duplicates the Viator CTA above. Scoped to non-events, which have their own ticket flow. */}
              {!detail._event && <BookItLink detail={detail} city={locName ? locName.split(",")[0] : ""} logEvent={logEvent} openExternal={openExternal} addReservation={addReservation} />}

              {!detail._event && (
                <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>Community takes</span>
                    {placePosts.length > 0 && <span style={{ fontSize: 10, color: C.muted }}>{placePosts.length}</span>}
                  </div>
                  <div style={{ marginBottom: placePosts.length ? 12 : 0, paddingBottom: placePosts.length ? 12 : 0, borderBottom: placePosts.length ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 2 }}>Add yours</div>
                    {/* 2026-08-01 (owner: a signed-out visitor wrote a full
                        review with 4 photos, was prompted to sign in only at
                        Save, and lost the photos — signInWithProvider does a
                        real browser redirect to the OAuth provider and back
                        (supabase.auth.signInWithOAuth), which wipes every
                        in-memory pendingPhotos File/blob-URL; there was never
                        anywhere else they lived. Text alone survived via the
                        wf_place_comments localStorage mirror, which is why it
                        looked like "everything" vanished but really only the
                        untransferable part did. Gating sign-in to the FIRST
                        tap — before a single character or photo is added —
                        removes the loss window entirely instead of trying to
                        make an OAuth redirect survive unsaved blobs. Mirrors
                        the authReady && !user pattern already used to gate
                        Favorites/Itinerary (AuthWall), so there is no flash of
                        an editable box before the real signed-out state is
                        known. */}
                    {authReady && !user ? (
                      <div style={{ textAlign: "center", padding: "16px 8px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>Sign in to add a tip, review, or photos</div>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, lineHeight: 1.4 }}>So your write-up and photos never get lost mid-post, sign in first — then write.</div>
                        <button onClick={() => setAuthOpen(true)} style={{ minHeight: 38, padding: "8px 20px", borderRadius: 12, background: C.accent, border: "none", color: "#0D1117", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Sign in</button>
                      </div>
                    ) : (<>
                    <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 8 }}>Posts to this page for everyone to see.</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {["Tip", "Best dish", "Warning", "Review"].map((t) => (
                        <button key={t} onClick={() => setCommentType(t)} style={{ padding: "5px 11px", borderRadius: 999, border: `1px solid ${commentType === t ? C.light : C.border}`, background: commentType === t ? C.adim : "transparent", color: commentType === t ? C.light : C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t}</button>
                      ))}
                    </div>
                    <textarea key={detail.id} ref={noteRef} defaultValue={(placeComments[detail.id] && placeComments[detail.id].text) || ""} onChange={(e) => setNoteLen(e.target.value.length)} maxLength={COMMENT_MAX_CHARS} placeholder={"Share your " + commentType.toLowerCase() + " for this place."} rows={4} style={{ width: "100%", resize: "vertical", background: "rgba(22,27,34,.75)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 16, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3 }}>
                      <span style={{ fontSize: 10.5, color: noteLen >= COMMENT_MAX_CHARS ? "#F26D6D" : C.muted }}>{noteLen.toLocaleString()} / {COMMENT_MAX_CHARS.toLocaleString()}</span>
                    </div>

                    {/* Photos (v6.54, owner: "allow the user to also post pictures on
                        the review"). Previews are free (local object URLs) — nothing
                        uploads until Save, same moment text is posted. */}
                    {(existingPhotoUrls.length > 0 || pendingPhotos.length > 0) && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        {existingPhotoUrls.map((path) => (
                          <div key={path} style={{ position: "relative", width: 64, height: 64 }}>
                            <FallbackImg src={photoUrlFor(path)} icon="🖼️" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.border}` }} />
                            <button onClick={() => removeExistingPhoto(path)} aria-label="Remove photo" style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#0D1117", border: `1px solid ${C.border}`, color: C.light, fontSize: 12, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                          </div>
                        ))}
                        {pendingPhotos.map((p) => (
                          <div key={p.previewUrl} style={{ position: "relative", width: 64, height: 64 }}>
                            <img src={p.previewUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.border}`, opacity: photoBusy ? 0.5 : 1 }} />
                            <button onClick={() => removePendingPhoto(p.previewUrl)} aria-label="Remove photo" style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#0D1117", border: `1px solid ${C.border}`, color: C.light, fontSize: 12, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={(e) => { onPickPhotos(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
                      <button
                        onClick={() => isNative() ? onPickPhotoNative() : (photoInputRef.current && photoInputRef.current.click())}
                        disabled={existingPhotoUrls.length + pendingPhotos.length >= COMMENT_MAX_PHOTOS}
                        style={{ padding: "8px 14px", background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 12, color: existingPhotoUrls.length + pendingPhotos.length >= COMMENT_MAX_PHOTOS ? C.muted : C.light, fontSize: 13, fontWeight: 700, cursor: existingPhotoUrls.length + pendingPhotos.length >= COMMENT_MAX_PHOTOS ? "default" : "pointer" }}
                      >
                        📷 Add photo
                      </button>
                      <button onClick={handleSaveComment} disabled={photoBusy} style={{ padding: "8px 18px", background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 12, color: C.light, fontSize: 13, fontWeight: 800, cursor: photoBusy ? "default" : "pointer" }}>{photoBusy ? "Uploading…" : "Save"}</button>
                      {placeComments[detail.id] && <span style={{ fontSize: 11, color: C.muted }}>Saved as <span style={{ color: C.light, fontWeight: 700 }}>{placeComments[detail.id].type}</span></span>}
                    </div>
                    </>)}
                  </div>
                  {placePosts.length > 0 ? placePosts.slice(0, 6).map((cp, i) => (
                    <div key={cp.id || i} style={{ paddingTop: 10, marginTop: i ? 10 : 0, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.light }}>{cp.author || "member"}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: C.light, background: C.adim, border: `1px solid ${C.border}44`, borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{cp.type}</span>
                        {user && cp.user_id === user.id && (
                          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10 }}>
                            <button onClick={() => { setCommentType(cp.type || "Tip"); if (noteRef.current) { noteRef.current.value = cp.body || ""; noteRef.current.focus(); } setNoteLen((cp.body || "").length); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>Edit</button>
                            {confirmDel ? (
                              <button onClick={handleDeleteComment} style={{ background: "transparent", border: "none", color: "#F26D6D", fontSize: 10.5, fontWeight: 800, cursor: "pointer", padding: 0 }}>Confirm delete</button>
                            ) : (
                              <button onClick={() => { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>Delete</button>
                            )}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{cp.body}</div>
                      {Array.isArray(cp.photos) && cp.photos.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          {cp.photos.map((path) => (
                            <FallbackImg key={path} src={photoUrlFor(path)} icon="🖼️" onClick={() => setLightbox(photoUrlFor(path))} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.border}`, cursor: "zoom-in" }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )) : (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>Be the first to share a tip for this place.</div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
                <FeaturedTag p={detail} />
                {experienceBadges(detail, null, 4).map((b) => (
                  <button key={b.key} onClick={() => { setDetail(null); openExperience(b.key); }} style={{ fontSize: 12, fontWeight: 700, color: C.light, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>{b.label}</button>
                ))}
              </div>

              {detail._event && (() => {
                const ef = formatEventDate(detail._event.date, detail._event.time);
                const human = ef.wd ? (ef.wd + ", " + ef.mo + " " + ef.day + (ef.time ? " · " + ef.time : "")) : (ef.time || [detail._event.date, detail._event.time].filter(Boolean).join(" · "));
                const url = detail._event.url || "";
                const hasTickets = /ticket|seatgeek|stubhub|axs|livenation|eventbrite/i.test(url);
                const place = locName ? locName.split(",")[0] : "you";
                const why = [];
                const _sl = scoreLabel(detail.wfScore); why.push(_sl ? _sl.s + "/10 venue" : "at " + detail.name);
                if (detail.distMi != null) why.push(detail.distMi.toFixed(1) + " mi from " + place);
                return (
                  <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 14, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.card} 70%)` }}>
                    <div style={{ padding: "14px 15px" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>Know before you go</div>
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, marginBottom: 8 }}>Event time from the venue listing.</div>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.light, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>🎟️ Upcoming event</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{detail._event.name}</div>
                      {human && <div style={{ fontSize: 14, fontWeight: 800, color: C.light, marginTop: 7 }}>{human}</div>}
                      <div style={{ fontSize: 13, color: C.light, marginTop: 5 }}>📍 {detail.name}{detail.distMi != null ? " · " + detail.distMi.toFixed(1) + " mi" : ""}</div>
                      {why.length > 0 && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginTop: 7 }}>{why.join(", ") + "."}</div>}
                      {url && <a href={url} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", marginTop: 12, padding: 12, background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>{hasTickets ? "Get tickets ↗" : "View event ↗"}</a>}
                    </div>
                  </div>
                );
              })()}
              {reviewsOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>What people say</div>
                  {/* v6.9x (owner, editorial-quality audit 2026-08-01): the
                      loves/keywords AI chip block that used to render here is
                      gone — DETAIL_EDITORIAL's full mode no longer generates
                      those fields (they were unvalidated and redundant with
                      the "why" paragraph and what-to-order block above). Raw
                      Google reviews below are the real "what people say". */}
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Reviews</div>
                  {detailExtra && detailExtra.reviews && detailExtra.reviews.length > 0 ? (
                    detailExtra.reviews.map((r, i) => (
                      <div key={i} style={{ marginBottom: i < detailExtra.reviews.length - 1 ? 12 : 0, paddingBottom: i < detailExtra.reviews.length - 1 ? 12 : 0, borderBottom: i < detailExtra.reviews.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                          {r.rating && <span style={{ color: "#F59E0B", fontSize: 12 }}>{stars(r.rating)}</span>}
                          {r.author && <span style={{ fontSize: 11, color: C.muted }}>{r.author}</span>}
                          {r.when && <span style={{ fontSize: 11, color: C.muted }}>· {r.when}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5 }}>{r.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 13, color: C.muted }}>No review text available for this place.</div>
                  )}
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>Reviews from Google, which shares up to five per place. The good, the bad, and everything between. No invented numbers.</div>
                  <a href={`https://search.google.com/local/reviews?placeid=${detail.id}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 800, color: C.light, textDecoration: "none" }}>Read all reviews on Google ↗</a>
                </div>
              )}

              {detailExtra && detailExtra.editorial && (
                <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.5, marginBottom: 14, paddingLeft: 10, borderLeft: `3px solid ${C.border}` }}>{detailExtra.editorial}</div>
              )}

              {/* Worth the Drive? widget — shows for far-away places or when opened from the drive hook */}
              {detail && (detailContext === "drive" || (detail.distMi != null && detail.distMi >= 20)) && (
                <WorthTheDriveWidget
                  place={detail}
                  myVote={(myVotes || {})[detail.id]}
                  votes={(communityVotes || {})[detail.id]}
                  onVote={(v) => handleVote(detail, v)}
                />
              )}

              {/* v6.25: founder curated note, shown only for properties in CURATED_NOTES. Hand-written, leads the page. */}
              {(() => { const cn = curatedNote(detail); if (!cn) return null; return (
                <div style={{ background: `linear-gradient(135deg, ${C.adim} 0%, ${C.card} 55%)`, border: `1px solid ${C.border}55`, borderRadius: 14, padding: "14px 15px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: cn.intro ? 3 : 10 }}>
                    <span style={{ fontSize: 15 }}>📌</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.light, letterSpacing: "0.6px", textTransform: "uppercase" }}>{cn.title}</span>
                  </div>
                  {cn.intro && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 11 }}>{cn.intro}</div>}
                  {cn.items.map((it, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < cn.items.length - 1 ? 11 : 0 }}>
                      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.3 }}>{it.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, lineHeight: 1.35 }}>{it.head}</div>
                        <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.5, marginTop: 2 }}>{it.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ); })()}

              {/* 2. Why Wayfind picked it — a judgment-driven decision reason, not a formula. No expand button; the deeper context lives in the insider tip and Tips, videos & more. */}
              {/* Viator experiences: shown only for activity-type places Viator actually sells (attractions, museums, nature, scenic, etc.), never restaurants, bars, or hotels. This is an affiliate link, disclosed in Terms; it is tracked once a Partner ID is set in AFFIL and works untracked until then. */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                {showMore && (
                  <div style={{ marginTop: 10 }}>
                    {/* v6.9x (owner, editorial-quality audit 2026-08-01): the
                        goodFor/mustTry(again)/tips/vibe block that used to
                        render here is gone. DETAIL_EDITORIAL's full mode no
                        longer generates those fields — what_to_order and
                        pairs_well/caveat already render once, above, in
                        their own canonical block; there is nothing left
                        here to show unvalidated. */}
                    {(videosLoading || (videos && videos.length > 0)) && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 2, display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: "#FF0000", fontSize: 14 }}>▶</span> Video reviews</div>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Creators who covered this place on YouTube.</div>
                        {videosLoading && !videos ? (
                          <div style={{ fontSize: 13, color: C.muted }}>Finding videos…</div>
                        ) : (
                          videos.map((v) => (
                            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 10, marginBottom: 10, textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                              {v.thumb && <FallbackImg src={v.thumb} icon="▶️" style={{ width: 120, height: 68, objectFit: "cover", flexShrink: 0 }} />}
                              <div style={{ padding: "7px 8px 7px 0", minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{v.channel}</div>
                              </div>
                            </a>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>


              {/* 5. Optional collapsed */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 4 }}>
                <div onClick={() => { const n = !venueEventsOpen; setVenueEventsOpen(n); if (n && venueEvents === null && !venueEventsLoading) loadVenueEvents(detail); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.text }}>
                  <span>What's happening nearby</span>
                  <span style={{ fontSize: 12, color: C.light, fontWeight: 800 }}>{venueEventsOpen ? "▴" : "▾"}</span>
                </div>
                {venueEventsOpen && (
                  <div style={{ marginTop: 10 }}>
                    {venueEventsLoading && <div style={{ fontSize: 13, color: C.muted }}>Checking Ticketmaster…</div>}
                    {!venueEventsLoading && venueEvents && venueEvents.length > 0 && (
                      <>
                        {venueEvents.filter((e) => e && e.dest).map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          const _internal = e.destKind === "internal";
                          return (
                            <a key={e.id} href={_internal ? e.dest : ticketUrl(e.dest)} {...(_internal ? {} : { target: "_blank", rel: "noreferrer" })} style={{ display: "flex", gap: 10, alignItems: "center", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 7 }}>
                              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 34 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.light, textTransform: "uppercase" }}>{f.mo}</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1 }}>{f.day}</div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.venue ? `📍 ${e.venue} · ` : ""}{f.wd}{f.time ? ` · ${f.time}` : ""}{e.price ? ` · ${e.price}` : ""}</div>
                              </div>
                              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: C.light }}>{e.ticketed === false ? "Details ↗" : "Tickets ↗"}</span>
                            </a>
                          );
                        })}
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Ticketed events at or near this location, from Ticketmaster. Check the venue on each before you go.</div>
                      </>
                    )}
                    {!venueEventsLoading && venueEvents && venueEvents.length === 0 && (
                      <div style={{ fontSize: 12.5, color: C.muted }}>No ticketed events found near here right now. Casual or free live music will not show up here, since only ticketed events are listed.</div>
                    )}
                  </div>
                )}
              </div>
              </div>

              {detailExtra && (detailExtra.phone || detailExtra.website) && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {detailExtra.phone && <a href={"tel:" + detailExtra.phone} style={{ flex: 1, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>📞 Call</a>}
                  {detailExtra.website && <a href={detailExtra.website} target="_blank" rel="noreferrer" style={{ flex: 1, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>🌐 Website ↗</a>}
                </div>
              )}

              {/* v6.34 — owner-curated coupon (lib/coupons): the card's Deal
                  pill promised a deal; the sheet now keeps that promise.
                  Renders only when no Supabase offer covers this place
                  (offers win the slot, same rule as the card pill). */}
              {detail && !detail._event && !offers[detail.id] && (() => {
                const cpn = couponForPlaceName(detail.name);
                if (!cpn || !couponIsLive(cpn)) return null;
                const ends = couponEndsLabel(cpn);
                return (
                  <div style={{ marginBottom: 16, background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 999, padding: "2px 9px" }}>🏷️ Deal</span>
                      {ends && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{ends}</span>}
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text }}>{cpn.title}</div>
                    {cpn.details && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 5 }}>{cpn.details}</div>}
                    {cpn.url && <a href={cpn.url} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("offer_redeem", detail, { offer_id: cpn.id, source: "curated" }); } catch (e) {} }} style={{ display: "block", textAlign: "center", marginTop: 10, padding: 12, background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>{cpn.code ? "Show code" : "View deal ↗"}</a>}
                    {cpn.code && <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: C.light, marginTop: 8, letterSpacing: "0.5px" }}>Code: {cpn.code}</div>}
                  </div>
                );
              })()}

              {detail && offers[detail.id] && (() => {
                const o0 = offers[detail.id];
                const o = { ...o0, offer_title: o0.offer_title || o0.title, offer_description: o0.offer_description || o0.description, affiliate_url: o0.affiliate_url || o0.url, expiration_date: o0.expiration_date || (o0.expires_at ? String(o0.expires_at).slice(0, 10) : null) };
                return (
                  <div style={{ background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 999, padding: "2px 9px" }}>{offerLabel(o)}</span>
                      {o.last_verified_at && <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>✓ Verified</span>}
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text }}>{o.offer_title}</div>
                    {o.offer_description && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 5 }}>{o.offer_description}</div>}
                    {o.terms && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>{o.terms}</div>}
                    {o.expiration_date && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>Through {o.expiration_date}</div>}
                    {(o.affiliate_url || o.direct_url) && <a href={o.affiliate_url || o.direct_url} target="_blank" rel="noreferrer" onClick={() => logEvent("offer_redeem", detail, { offer_id: o.id, source: o.source })} style={{ display: "block", textAlign: "center", marginTop: 10, padding: 12, background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>{o.coupon_code ? "Show code" : "View offer ↗"}</a>}
                    {o.coupon_code && <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: C.light, marginTop: 8, letterSpacing: "0.5px" }}>Code: {o.coupon_code}</div>}
                    <div onClick={() => { logEvent("offer_report", detail, { offer_id: o.id }); showToast("Thanks, we will take a look"); }} style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 10, cursor: "pointer", textDecoration: "underline" }}>Report an issue</div>
                  </div>
                );
              })()}

              {isBeach(detail) && (
                <div id="beach-conditions" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#2DD4BF" }}>🏖️ Beach conditions</div>
                    {/* v6.57: the same "Trending" flame as the card (kit.js's
                        TRENDING_POPULARITY_THRESHOLD keeps the bar identical). */}
                    {!beachCondLoading && beachCond && beachCond.popularityPct != null && beachCond.popularityPct >= TRENDING_POPULARITY_THRESHOLD && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: "#FB923C", background: "rgba(251,146,60,.12)", border: "1px solid rgba(251,146,60,.4)", borderRadius: 999, padding: "3px 9px" }}>🔥 Trending</span>
                    )}
                  </div>
                  {beachCondLoading && <div style={{ fontSize: 13, color: C.muted }}>Checking wind, water and water quality…</div>}
                  {/* v6.57: water quality (wf_beach_water) + red tide (FWC) now ride
                      along with wind/wave/water-temp — previously this panel was
                      wind/wave only via two raw client Open-Meteo calls; see
                      loadBeachConditions (home.js) for the root-cause fix. Both
                      DB-keyed signals (water quality, popularity) resolve by
                      place_id alone, so they still show up even when the place
                      was opened from a list with no lat/lng (e.g. ThingsToDoList). */}
                  {!beachCondLoading && beachCond && (() => {
                    const bc = beachCond;
                    const wq = bc.water ? (bc.water.advisory ? { t: "Advisory — check before swimming", c: C.red } : bc.water.result === "Good" ? { t: "Good", c: C.green } : bc.water.result === "Moderate" ? { t: "Moderate", c: "#E8B84B" } : { t: "Poor", c: C.red }) : null;
                    const hasAny = bc.wind != null || bc.waveHeight != null || bc.waterTemp != null || wq || bc.redTide;
                    return (
                      <div>
                        {bc.waterTemp != null && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🌡️ Water {Math.round(bc.waterTemp)}°F</div>}
                        {bc.wind != null && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>💨 Wind {bc.wind} mph{bc.windDir ? " from the " + bc.windDir : ""}</div>}
                        {bc.waveHeight != null && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🌊 Waves about {bc.waveHeight} ft</div>}
                        {wq && <div style={{ fontSize: 13.5, fontWeight: 700, color: wq.c, marginBottom: 6 }}>🧪 Water quality: {wq.t}{bc.water.sampled_at ? " · tested " + fmtBeachDay(bc.water.sampled_at) : ""}</div>}
                        {bc.redTide && <div style={{ fontSize: 13.5, fontWeight: 700, color: bc.redTide.tone === "bad" ? C.red : bc.redTide.tone === "warn" ? "#E8B84B" : C.green, marginBottom: 6 }}>🔬 Red tide: {bc.redTide.label}{bc.redTide.mi != null ? " · " + bc.redTide.mi + " mi away" : ""}</div>}
                        {!hasAny && <div style={{ fontSize: 13, color: C.muted }}>Live conditions are not available for this spot right now.</div>}
                      </div>
                    );
                  })()}
                  {!beachCondLoading && !beachCond && <div style={{ fontSize: 13, color: C.muted }}>Live conditions aren't available right now.</div>}
                </div>
              )}



              {/* Hours now expand from the Open/Closed status badge near the title. */}

              {debugOn && !detail._event && (() => {
                const audit = {};
                experienceBadges(detail, null, 99, audit);
                // v6.9x (owner, editorial-quality audit 2026-08-01): the
                // DETAIL_EDITORIAL contract collapsed to compact ->
                // { why_wayfind_picked_this } and full -> { what_to_order,
                // pairs_well, caveat }. The debug row now audits both.
                const ai = insight && !insight.error && !insight.unavailable ? insight : {};
                const full = insightFull && !insightFull.error && !insightFull.unavailable ? insightFull : {};
                const aiRow = (obj) => (k) => { const v = obj[k]; const has = Array.isArray(v) ? v.filter(Boolean).length > 0 : !!(v && String(v).trim()); return k + ": " + (has ? "shown" : "empty/hidden"); };
                return (
                  <div style={{ marginBottom: 16, padding: "10px 12px", background: "#0A0E14", border: "1px dashed #30363D", borderRadius: 10, fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#8B949E", lineHeight: 1.6, overflowWrap: "anywhere" }}>
                    <div style={{ color: "#CBD5E1", fontWeight: 800 }}>TRUST AUDIT</div>
                    <div>identity: {audit.identity}</div>
                    <div>types: {(detail.types || []).join(", ") || "none"}</div>
                    <div>candidates: {(audit.candidates || []).join(", ") || "none"}</div>
                    <div>shown: {(audit.shown || []).join(", ") || "none"}</div>
                    <div>blocked: {(audit.blocked || []).map((b) => b.key + " (" + b.reason + ")").join("; ") || "none"}</div>
                    <div>park admission cue: {String(Tags.requiresParkAdmission(detail.types))}</div>
                    <div>compact fields: {["why_wayfind_picked_this"].map(aiRow(ai)).join(" · ")}</div>
                    <div>full fields: {["what_to_order", "pairs_well", "caveat"].map(aiRow(full)).join(" · ")}</div>
                  </div>
                );
              })()}
              {/* v6.25: "More like this" — similar experience among loaded places, matched on shared traits. */}
              {!detail._event && (() => {
                const simPool = dedupePlaces([...(suggested || []), ...places]);
                const badgesOf = (x) => { try { return new Set(experienceBadges(x, null, 99).map((b) => b.key)); } catch (er) { return new Set(); } };
                const sim = similarPlaces(simPool, detail, 4, badgesOf);
                if (sim.length === 0) return null;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>More like {detail.name}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Spots nearby with a similar vibe and crowd, matched on what this place is known for.</div>
                    {sim.map((p) => (
                      <div key={"sim-" + p.id} onClick={() => openDetail(p)} style={{ display: "flex", gap: 11, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, marginBottom: 8, cursor: "pointer" }}>
                        <FallbackImg src={p.photo} icon="📍" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
                            {(() => { const cz = Dining.cuisineLabel(p); return cz ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.light }}>{cz}</span> : null; })()}
                            <PlaceScoreChip p={p} size={12} />
                            {(() => { const lo = typeof liveOpen === "function" ? liveOpen(p) : p.openNow; return lo === true ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span> : lo === false ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.red }}>· Closed</span> : null; })()}
                            {p.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 18, color: C.muted, flexShrink: 0 }}>›</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {(() => {
                const altPool = dedupePlaces([...(suggested || []), ...places]);
                const alts = betterAlternatives(detail, altPool, 3);
                const Row = (p, reasons, knownFor) => (
                  <div key={"alt-" + p.id} onClick={() => openDetail(p)} style={{ display: "flex", gap: 11, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, marginBottom: 8, cursor: "pointer" }}>
                    <FallbackImg src={p.photo} icon="📍" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
                        <PlaceScoreChip p={p} size={12} />
                        {(() => { const lo = typeof liveOpen === "function" ? liveOpen(p) : p.openNow; return lo === true ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span> : lo === false ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.red }}>· Closed</span> : null; })()}
                        {p.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                      </div>
                      {reasons && reasons.length > 0 && <div style={{ fontSize: 12, color: C.light, fontWeight: 600, lineHeight: 1.4, marginTop: 3 }}>{reasons.join(" · ")}</div>}
                      {knownFor ? <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 2 }}>{knownFor.charAt(0).toUpperCase() + knownFor.slice(1)}</div> : null}
                    </div>
                    <span style={{ fontSize: 18, color: C.muted, flexShrink: 0 }}>›</span>
                  </div>
                );
                if (alts.length > 0) {
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>Worth comparing nearby</div>
                      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Other strong spots nearby, in case you want to compare.</div>
                      {alts.map(({ p, reasons, knownFor }) => Row(p, reasons, knownFor))}
                    </div>
                  );
                }
                const others = relatedPicks(altPool, detail, 4).filter((p) => p && p.id !== detail.id).slice(0, 3);
                if (others.length === 0) return null;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>One of the strongest nearby</div>
                    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Nothing close by clearly beats this pick right now. If you still want to compare, these are the next best in the same vein.</div>
                    {others.map((p) => Row(p, null))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
  );
}
