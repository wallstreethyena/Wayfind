"use client";
// Extracted from app/home.js (G3, July 2026 decomposition). Render-only.
// The place-detail bottom sheet — Wayfind's core, most-used UI surface.
// Five helpers used exclusively here move in too (galleryBtn, InfoChip,
// WorthTheDriveWidget, compass, insightSane); everything else (including
// betterAlternatives/similarPlaces/relatedPicks, which close over the
// module-scope EXPERIENCES table) stays in home.js and flows through ctx,
// same as every other extraction phase.
import { C, sheetBg, sheet, SHEET_EASE, Grabber, directionsUrl, offerLabel, scoreLabel, stars } from "../kit";
import * as Dining from "../../../lib/dining";
import * as Ranking from "../../../lib/ranking";
import * as Tags from "../../../lib/tags";
import * as Aff from "../../../lib/affiliates";
import { supabase } from "../../../lib/supabase";
import BookingCTA from "../BookingCTA";
import { creatorVideosFor, PLATFORM } from "../../../lib/creatorVideos";

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

function compass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
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

export default function DetailSheet({ ctx }) {
  const { detail, setDetail, detailExtra, setLightbox, reviewsOpen, setReviewsOpen, hoursOpen, setHoursOpen, venueEvents, venueEventsLoading, venueEventsOpen, setVenueEventsOpen, videos, videosLoading, beachCond, beachCondLoading, insight, insightLoading, insightFull, insightFullLoading, showMore, viaTours, debugOn, placeComments, setPlaceComments, commentType, setCommentType, placePosts, setPlacePosts, confirmDel, setConfirmDel, taInfo, insider, detailContext, myVotes, communityVotes, galleryRef, noteRef, scrollGallery, loadFullInsight, addReservation, handleVote, loadVenueEvents, placeShareUrl, FeaturedTag, curatedNote, curatedFor, wayfindNotes, betterAlternatives, similarPlaces, relatedPicks, placeKind, isBeach, suggested, places, offers, locName, blurbs, liked, disliked, user, sheetDragStart, sheetDragMove, sheetDragEnd, quickSaveFavorite, isSaved, toggleLike, toggleDislike, addShared, giveawayMark, logEvent, openExternal, openCuisine, openExperience, openDetail, setAuthOpen, ticketUrl, formatEventDate, shareLink, showToast, dedupePlaces, primaryCategory, experienceBadges, Critter, FallbackImg } = ctx;
  return (
        <div style={sheetBg} onClick={() => window.history.back()}>
          <div style={{ ...sheet, overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => window.history.back())} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ position: "relative" }}>
              <button onClick={() => window.history.back()} aria-label="Back" style={{ position: "absolute", top: "max(8px, env(safe-area-inset-top))", left: 12, zIndex: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.28)", background: "rgba(13,17,23,.55)", backdropFilter: "blur(6px)", color: "#fff", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
              {detail.photos && detail.photos.length > 0 ? (
                <div style={{ position: "relative" }}>
                  <div ref={galleryRef} style={{ display: "flex", gap: 6, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
                    {detail.photos.map((src, i) => (
                      <FallbackImg key={i} src={src} icon={detail._event ? "🎟️" : "🍽️"} onClick={() => setLightbox(src)} style={{ width: "100%", flexShrink: 0, height: 250, objectFit: "cover", scrollSnapAlign: "start", cursor: "zoom-in" }} />
                    ))}
                  </div>
                  {detail.photos.length > 1 && (
                    <>
                      <button onClick={() => scrollGallery(-1)} aria-label="Previous photo" style={galleryBtn("left")}>‹</button>
                      <button onClick={() => scrollGallery(1)} aria-label="Next photo" style={galleryBtn("right")}>›</button>
                    </>
                  )}
                </div>
              ) : detail._event && !detail.photo ? (
                <div style={{ width: "100%", height: 250, background: `linear-gradient(150deg, ${C.adim} 0%, #0D1117 78%)`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 54, opacity: 0.5 }}>🎟️</span></div>
              ) : (
                <FallbackImg src={detail.photo} icon={detail._event ? "🎟️" : "🍽️"} onClick={() => detail.photo && setLightbox(detail.photo)} style={{ width: "100%", height: 250, objectFit: "cover", cursor: detail.photo ? "zoom-in" : "default" }} />
              )}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "48px 18px 15px", background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.45) 45%, rgba(0,0,0,.88) 100%)", pointerEvents: "none" }}>
                {(() => { const pc = primaryCategory(detail); return pc ? <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.9px", marginBottom: 5, textShadow: "0 1px 5px rgba(0,0,0,.9)" }}>{pc}</div> : null; })()}
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
                {(() => { const sl = scoreLabel(detail.wfScore); return sl ? <span style={{ color: C.accent, fontWeight: 800 }}>{sl.s}<span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}> / 10</span></span> : null; })()}
                {(() => { const a = new Set((placePosts || []).map((x) => x.user_id)).size; if (!a) return null; return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.muted, fontWeight: 700, fontSize: 11 }}>{a} member take{a === 1 ? "" : "s"}{a >= 3 ? " · in score" : ""}</span></>); })()}
                {detail.rating != null && (<>
                  <span style={{ color: C.border }}>·</span>
                  <span onClick={() => { if (!(detail.reviews > 0)) return; const n = !reviewsOpen; setReviewsOpen(n); if (n) loadFullInsight(detail, detailExtra); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.text, cursor: detail.reviews > 0 ? "pointer" : "default" }}><span style={{ color: "#F59E0B" }}>★</span>{detail.rating}{detail.reviews > 0 && <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ color: C.muted, textDecoration: "none" }}><span style={{ color: C.muted, fontWeight: 600 }}>({detail.reviews.toLocaleString()}) ↗</span></a>}</span>{(() => { const _ta = taInfo[detail.id]; if (!_ta || _ta.none || _ta.rating == null) return null; return (<a href={_ta.url || "https://www.tripadvisor.com"} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href); try { logEvent("ta_out", detail); } catch (er) {} openExternal(_live); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", color: C.muted, fontSize: 12.5, fontWeight: 600 }}><span style={{ color: "#34E0A1", fontWeight: 800 }}>●</span>{_ta.rating}{_ta.reviews ? ` (${_ta.reviews.toLocaleString()})` : ""} on Tripadvisor ↗</a>); })()}
                </>)}
                {detail._event ? (() => {
                  const ef = formatEventDate(detail._event.date, detail._event.time);
                  const d = detail._event.date ? new Date(detail._event.date + "T00:00:00") : null;
                  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
                  const diff = d && !isNaN(d) ? Math.round((d - t0) / 86400000) : null;
                  const when = ef.wd ? (ef.wd + ", " + ef.mo + " " + ef.day + (ef.time ? " · " + ef.time : "")) : (detail._event.time || "");
                  const label = diff == null ? (when || "Event") : diff < 0 ? "Ended" : diff === 0 ? ("Tonight" + (ef.time ? " · " + ef.time : "")) : diff === 1 ? ("Tomorrow" + (ef.time ? " · " + ef.time : "")) : when;
                  return (<>
                    <span style={{ color: C.border }}>·</span>
                    <span style={{ fontWeight: 800, color: diff != null && diff < 0 ? C.muted : C.accent }}>{label}</span>
                    {detail.openNow != null && (<span onClick={() => setHoursOpen((o) => !o)} style={{ cursor: "pointer", fontWeight: 600, fontSize: 11.5, color: C.muted }}>Venue hours</span>)}
                  </>);
                })() : (detail.openNow != null && (<>
                  <span style={{ color: C.border }}>·</span>
                  <span onClick={() => setHoursOpen((o) => !o)} style={{ cursor: "pointer", fontWeight: 800, color: detail.openNow ? C.green : C.red }}>{detail.openNow ? "Open now" : "Closed"}<span style={{ fontSize: 8.5, marginLeft: 3, display: "inline-block", transform: hoursOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span></span>
                </>))}
                {detail.distMi != null && (<><span style={{ color: C.border }}>·</span><a href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail, { src: "meta" }); } catch (e) {} }} style={{ color: C.accent, fontWeight: 700, textDecoration: "none" }}>{detail.distMi.toFixed(1)} mi ▸</a></>)}
                {(() => { const cz = Dining.cuisineLabel(detail) || primaryCategory(detail); return cz ? (<><span style={{ color: C.border }}>·</span><button onClick={() => { try { logEvent("cuisine_link", detail, { cz }); } catch (e) {} openCuisine(cz, detail); }} style={{ background: "transparent", border: "none", padding: 0, color: C.accent, fontWeight: 700, fontSize: "inherit", cursor: "pointer" }}>{cz} ›</button></>) : null; })()}
                {(() => { if (detail._event) return null; const isD = ["Food", "Nightlife"].includes(Ranking.coarseCat(detail) || ""); const cost = isD ? Dining.costForTwo(detail) : null; if (cost && cost.listed) return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.green, fontWeight: 800 }}>{cost.text}</span></>); if (detail.price) return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.green, fontWeight: 800 }}>{detail.price}</span></>); return null; })()}
              </div>
              {!detail._event && Tags.requiresParkAdmission(detail.types) && (
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, marginTop: -4, marginBottom: 12 }}>May require park admission.</div>
              )}
              {hoursOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
                  {detailExtra && detailExtra.hours && detailExtra.hours.length > 0 ? (
                    detailExtra.hours.map((line, i) => {
                      const parts = line.split(": ");
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: C.light, padding: "2px 0" }}>
                          <span style={{ fontWeight: 600, color: C.text }}>{parts[0]}</span>
                          <span style={{ textAlign: "right" }}>{parts.slice(1).join(": ")}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: 12.5, color: C.muted }}>{detailExtra ? "Hours not listed for this place." : "Loading hours…"}</div>
                  )}
                  <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 8 }}>Hours from Google.</div>
                </div>
              )}

              {/* Action dock: one row. Directions (or Get tickets for events) is the single primary; everything else is a quiet icon. */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "stretch" }}>
                {detail._event && detail._event.url ? (
                  <a href={ticketUrl(detail._event.url)} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("ticket", null, { src: "detail_primary" }); } catch (e) {} }} style={{ flex: 1, padding: "13px 0", background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none", textAlign: "center" }}>Get tickets ↗</a>
                ) : (
                  <><a href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail); } catch (e) {} }} style={{ flex: 1, padding: "13px 0", background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none", textAlign: "center" }}>Directions ↗</a><BookingCTA variant="primary" detail={detail} kind={placeKind(detail)} viaTours={viaTours} logEvent={logEvent} addReservation={addReservation} openExternal={openExternal} /></>
                )}
                {detail._event && detail._event.url && (
                  <a href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail); } catch (e) {} }} aria-label="Directions" style={{ flexShrink: 0, width: 46, display: "flex", alignItems: "center", justifyContent: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, textDecoration: "none" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M9 7h8v8" /></svg></a>
                )}
                {!detail._event && (<>
                  <button onClick={() => quickSaveFavorite(detail)} aria-label="Save" style={{ flexShrink: 0, width: 46, background: C.card, border: `1px solid ${isSaved(detail.id) ? C.accent : C.border}`, borderRadius: 12, color: isSaved(detail.id) ? C.accent : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved(detail.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>
                  <button onClick={(e) => toggleLike(e, detail)} aria-label="Like" style={{ flexShrink: 0, width: 46, background: liked[detail.id] ? C.adim : C.card, border: `1px solid ${liked[detail.id] ? C.accent : C.border}`, borderRadius: 12, color: liked[detail.id] ? C.accent : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg></button>
                  <button onClick={(e) => toggleDislike(e, detail)} aria-label="Not for me" style={{ flexShrink: 0, width: 46, background: C.card, border: `1px solid ${disliked[detail.id] ? C.red : C.border}`, borderRadius: 12, color: disliked[detail.id] ? C.red : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg></button>
                </>)}
                <button onClick={() => { shareLink(detail.name, placeShareUrl(detail, locName, blurbs[detail.id]), () => showToast("Link copied"), `Want to go to ${detail.name} together? Found it on Wayfind`, () => { try { logEvent("share", detail, { kind: "place" }); } catch (e) {} giveawayMark(detail.id); addShared(detail); }); }} aria-label="Share" style={{ flexShrink: 0, width: 46, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
              </div>
              <BookingCTA variant="disclosure" detail={detail} kind={placeKind(detail)} viaTours={viaTours} />
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
              {/* Why Wayfind picked this: the soul of the page. One grounded paragraph merging verdict, tip, timing, fit and caveats. Falls back to composing from the existing grounded fields until a fresh insight carries `why`. */}
              <div style={{ marginBottom: 16, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.card} 62%)`, border: `1px solid ${C.accent}55`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>{detail._event ? "Why this venue" : "Why Wayfind picked this"}</div>
                {insightLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginTop: 8 }}>
                    <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={22} /></div>
                    Reading the reviews
                  </div>
                )}
                {!insightLoading && (() => {
                  const ins = insight && !insight.error && !insight.unavailable ? insight : null;
                  const S = (v) => insightSane(v);
                  const dot = (t) => t && !/[.!?]$/.test(t) ? t + "." : t;
                  let why = ins ? S(ins.why) : "";
                  if (!why && ins) {
                    const goWhen = S(ins.goWhen) || S(ins.bestTime);
                    const skipIf = S(ins.skipIf);
                    why = [dot(S(ins.verdict)), dot(S(ins.whyPicked)), dot(S(ins.tip)), goWhen ? "Go " + dot(goWhen.charAt(0).toLowerCase() + goWhen.slice(1)) : "", skipIf ? "Skip it if " + dot(skipIf.charAt(0).toLowerCase() + skipIf.slice(1)) : ""].filter(Boolean).join(" ");
                  }
                  if (!why) why = detail.rating != null && detail.rating >= 4.3 ? "A highly reviewed nearby option with a strong rating." : "Worth a look while you are nearby.";
                  return <div style={{ fontSize: 14.5, color: C.text, lineHeight: 1.6, marginTop: 8, fontWeight: 500 }}>{why}</div>;
                })()}
              </div>
              {!detail._event && insightFull && Array.isArray(insightFull.mustTry) && insightFull.mustTry.filter((x) => x && String(x).trim()).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 8 }}>{Tags.sectionLabel(Tags.resolveIdentity(detail.types || []))}</div>
                  {insightFull.mustTry.filter((x) => x && String(x).trim()).slice(0, 3).map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 5 }}>
                      <span style={{ color: C.accent, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{d}</span>
                    </div>
                  ))}
                  {insightFull.pairing && String(insightFull.pairing).trim() && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}><span style={{ color: C.light, fontWeight: 700 }}>Pairs well: </span>{insightFull.pairing}</div>}
                  <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 7 }}>From what reviewers mention most.</div>
                </div>
              )}
              {(() => { const _wn = !detail._event ? wayfindNotes(detail.name) : null; if (!_wn) return null; return (
                <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>Insider notes</span>
                    <span style={{ fontSize: 9.5, color: C.muted }}>Curated by Wayfind</span>
                  </div>
                  {_wn.map((n, i) => { const o = typeof n === "string" ? { text: n } : n; return (
                    <div key={i} style={{ marginTop: i ? 8 : 0 }}>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>{o.text}</div>
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("note_link", detail, { label: o.label || "" }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 7, padding: "9px 15px", borderRadius: 999, background: C.adim, border: `1.5px solid ${C.accent}`, color: C.accent, fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>🎟 {o.label || "Open link"} ↗</a>
                      )}
                    </div>
                  ); })}
                </div>
              ); })()}
              {/* 3. Insider tip */}
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
                return <BookingCTA variant="list" detail={detail} kind={placeKind(detail)} viaTours={viaTours} logEvent={logEvent} addReservation={addReservation} openExternal={openExternal} locName={locName} suppressFallback={_hasNoteUrl} />;
              })()}

              {!detail._event && (
                <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>Community takes</span>
                    {placePosts.length > 0 && <span style={{ fontSize: 10, color: C.muted }}>{placePosts.length}</span>}
                  </div>
                  <div style={{ marginBottom: placePosts.length ? 12 : 0, paddingBottom: placePosts.length ? 12 : 0, borderBottom: placePosts.length ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 2 }}>Add yours</div>
                    <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 8 }}>Posts to this page for everyone when you are signed in; saved privately on this device when you are not.</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {["Tip", "Best dish", "Warning", "Review"].map((t) => (
                        <button key={t} onClick={() => setCommentType(t)} style={{ padding: "5px 11px", borderRadius: 999, border: `1px solid ${commentType === t ? C.accent : C.border}`, background: commentType === t ? C.adim : "transparent", color: commentType === t ? C.accent : C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t}</button>
                      ))}
                    </div>
                    <textarea key={detail.id} ref={noteRef} defaultValue={(placeComments[detail.id] && placeComments[detail.id].text) || ""} placeholder={"Share your " + commentType.toLowerCase() + " for this place."} rows={3} style={{ width: "100%", resize: "vertical", background: "rgba(22,27,34,.75)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13.5, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <button onClick={() => { const v = (noteRef.current && noteRef.current.value ? noteRef.current.value : "").trim(); const next = { ...placeComments }; if (v) next[detail.id] = { type: commentType, text: v }; else delete next[detail.id]; setPlaceComments(next); try { localStorage.setItem("wf_place_comments", JSON.stringify(next)); } catch (e) {} const posting = !!(supabase && user && v); if (v && supabase && !user) { setAuthOpen(true); } showToast(v ? (posting ? "Saving…" : commentType + " saved on this device — sign in to post to everyone") : "Cleared"); try { logEvent("user_comment", detail, { type: commentType, len: v.length, posted: posting }); } catch (e) {} if (posting) { try { supabase.auth.getSession().then(({ data: _sd }) => { const _u = _sd && _sd.session && _sd.session.user; if (!_u) { setAuthOpen(true); showToast("Session expired — sign in and tap Save again"); return; } const author = ((_u.email || "member").split("@")[0] || "member").slice(0, 24); supabase.from("comments").upsert({ place_id: detail.id, place_name: detail.name || "", user_id: _u.id, author, type: commentType, body: v.slice(0, 600), updated_at: new Date().toISOString() }, { onConflict: "user_id,place_id" }).then((res) => { if (res && res.error) { showToast("Couldn't post: " + String((res.error && res.error.message) || "server error").slice(0, 90) + " — saved on this device"); try { console.error("[wayfind comment]", res.error.message || res.error); } catch (e2) {} } else { showToast(commentType + " posted"); setPlacePosts((pp) => [{ place_id: detail.id, user_id: _u.id, author, type: commentType, body: v.slice(0, 600), created_at: new Date().toISOString() }, ...(pp || []).filter((x) => x.user_id !== _u.id)]); } }, (err) => { showToast("Couldn't post: " + String((err && err.message) || "network error").slice(0, 90) + " — saved on this device"); try { console.error("[wayfind comment]", err); } catch (e2) {} }); }, () => { showToast("Couldn't reach the server — saved on this device"); }); } catch (e) {} } }} style={{ padding: "8px 18px", background: "transparent", border: `1.5px solid ${C.accent}`, borderRadius: 12, color: C.accent, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Save</button>
                      {placeComments[detail.id] && <span style={{ fontSize: 11, color: C.muted }}>Saved as <span style={{ color: C.accent, fontWeight: 700 }}>{placeComments[detail.id].type}</span></span>}
                    </div>
                  </div>
                  {placePosts.length > 0 ? placePosts.slice(0, 6).map((cp, i) => (
                    <div key={cp.id || i} style={{ paddingTop: 10, marginTop: i ? 10 : 0, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.light }}>{cp.author || "member"}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}44`, borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{cp.type}</span>
                        {user && cp.user_id === user.id && (
                          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10 }}>
                            <button onClick={() => { setCommentType(cp.type || "Tip"); if (noteRef.current) { noteRef.current.value = cp.body || ""; noteRef.current.focus(); } }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>Edit</button>
                            {confirmDel ? (
                              <button onClick={() => { try { supabase.from("comments").delete().eq("user_id", user.id).eq("place_id", detail.id).then(() => {}, () => {}); } catch (e) {} setPlacePosts((pp) => (pp || []).filter((x) => x.user_id !== user.id)); const next = { ...placeComments }; delete next[detail.id]; setPlaceComments(next); try { localStorage.setItem("wf_place_comments", JSON.stringify(next)); } catch (e) {} if (noteRef.current) noteRef.current.value = ""; setConfirmDel(false); showToast("Deleted"); try { logEvent("user_comment_delete", detail, {}); } catch (e) {} }} style={{ background: "transparent", border: "none", color: "#F26D6D", fontSize: 10.5, fontWeight: 800, cursor: "pointer", padding: 0 }}>Confirm delete</button>
                            ) : (
                              <button onClick={() => { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>Delete</button>
                            )}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{cp.body}</div>
                    </div>
                  )) : (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>Be the first to share a tip for this place.</div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
                <FeaturedTag name={detail.name} />
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
                if (detail.rating != null) why.push("★ " + detail.rating + " venue"); else why.push("at " + detail.name);
                if (detail.distMi != null) why.push(detail.distMi.toFixed(1) + " mi from " + place);
                return (
                  <div style={{ border: `1.5px solid ${C.accent}`, borderRadius: 16, overflow: "hidden", marginBottom: 14, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.card} 70%)` }}>
                    <div style={{ padding: "14px 15px" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>Know before you go</div>
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, marginBottom: 8 }}>Event time from the venue listing.</div>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>🎟️ Upcoming event</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{detail._event.name}</div>
                      {human && <div style={{ fontSize: 14, fontWeight: 800, color: C.accent, marginTop: 7 }}>{human}</div>}
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
                  {insightFullLoading && !insightFull && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Reading the reviews…</div>}
                  {insightFull && !insightFull.error && (() => {
                    const A = (v) => (Array.isArray(v) ? v.filter((x) => x && String(x).trim()) : []);
                    const loves = A(insightFull.loves);
                    const keywords = A(insightFull.keywords);
                    if (!loves.length && !keywords.length) return null;
                    return (
                      <div style={{ marginBottom: 12 }}>
                        {loves.length > 0 && loves.slice(0, 5).map((l, i) => (
                          <div key={i} style={{ fontSize: 13.5, color: C.text, display: "flex", gap: 8, padding: "3px 0" }}><span style={{ color: C.green }}>✔</span><span>{l}</span></div>
                        ))}
                        {keywords.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {keywords.slice(0, 6).map((k, i) => (
                              <span key={i} style={{ fontSize: 11, fontWeight: 600, color: C.light, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px" }}>{k}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                  <a href={`https://search.google.com/local/reviews?placeid=${detail.id}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 800, color: C.accent, textDecoration: "none" }}>Read all reviews on Google ↗</a>
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
                <div style={{ background: `linear-gradient(135deg, ${C.adim} 0%, ${C.card} 55%)`, border: `1px solid ${C.accent}55`, borderRadius: 14, padding: "14px 15px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: cn.intro ? 3 : 10 }}>
                    <span style={{ fontSize: 15 }}>📌</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>{cn.title}</span>
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
                    {insightFullLoading && !insightFull && <div style={{ fontSize: 13, color: C.muted }}>Pulling the details together…</div>}
                    {insightFull && !insightFull.error && !insightFull.unavailable && (() => {
                      const A = (v) => (Array.isArray(v) ? v.filter((x) => x && String(x).trim()) : []);
                      const goodFor = A(insightFull.goodFor);
                      const tips = A(insightFull.tips);
                      const lab = { fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", margin: "12px 0 7px" };
                      return (
                        <div>
                          {goodFor.length > 0 && (
                            <>
                              <div style={lab}>Good for</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {goodFor.slice(0, 6).map((g, i) => (
                                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 12px" }}><span style={{ color: C.green, fontWeight: 800 }}>✓</span>{g}</span>
                                ))}
                              </div>
                            </>
                          )}
                          {(() => {
                            const mt = Array.isArray(insightFull.mustTry) ? insightFull.mustTry.filter((x) => x && String(x).trim()) : (insightFull.mustTry && String(insightFull.mustTry).trim() ? [insightFull.mustTry] : []);
                            if (!mt.length) return null;
                            return (
                              <>
                                <div style={lab}>Must try</div>
                                <div style={{ background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "10px 12px" }}>
                                  {mt.slice(0, 3).map((m, i) => (
                                    <div key={i} style={{ fontSize: 14, fontWeight: 600, color: C.text, display: "flex", gap: 8, padding: "2px 0" }}><span>🍴</span><span>{m}</span></div>
                                  ))}
                                </div>
                              </>
                            );
                          })()}
                          {tips.length > 0 && (
                            <>
                              <div style={lab}>Insider tips</div>
                              {tips.slice(0, 4).map((t, i) => (
                                <div key={i} style={{ fontSize: 13, color: C.light, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 6, display: "flex", gap: 8 }}><span>💡</span><span>{t}</span></div>
                              ))}
                            </>
                          )}
                          {insightFull.vibe && String(insightFull.vibe).trim() && (
                            <div style={{ marginTop: 10 }}><InfoChip label="Vibe" value={insightFull.vibe} /></div>
                          )}
                        </div>
                      );
                    })()}
                    {insightFull && insightFull.error && (
                      <div style={{ fontSize: 13, color: C.muted }}>That's everything we have on this spot for now.</div>
                    )}
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
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 800 }}>{venueEventsOpen ? "▴" : "▾"}</span>
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
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, textTransform: "uppercase" }}>{f.mo}</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1 }}>{f.day}</div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.venue ? `📍 ${e.venue} · ` : ""}{f.wd}{f.time ? ` · ${f.time}` : ""}{e.price ? ` · ${e.price}` : ""}</div>
                              </div>
                              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: C.accent }}>{e.ticketed === false ? "Details ↗" : "Tickets ↗"}</span>
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

              {detail && offers[detail.id] && (() => {
                const o0 = offers[detail.id];
                const o = { ...o0, offer_title: o0.offer_title || o0.title, offer_description: o0.offer_description || o0.description, affiliate_url: o0.affiliate_url || o0.url, expiration_date: o0.expiration_date || (o0.expires_at ? String(o0.expires_at).slice(0, 10) : null) };
                return (
                  <div style={{ background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, border: `1px solid ${C.accent}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 999, padding: "2px 9px" }}>{offerLabel(o)}</span>
                      {o.last_verified_at && <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>✓ Verified</span>}
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text }}>{o.offer_title}</div>
                    {o.offer_description && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 5 }}>{o.offer_description}</div>}
                    {o.terms && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>{o.terms}</div>}
                    {o.expiration_date && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>Through {o.expiration_date}</div>}
                    {(o.affiliate_url || o.direct_url) && <a href={o.affiliate_url || o.direct_url} target="_blank" rel="noreferrer" onClick={() => logEvent("offer_redeem", detail, { offer_id: o.id, source: o.source })} style={{ display: "block", textAlign: "center", marginTop: 10, padding: 12, background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>{o.coupon_code ? "Show code" : "View offer ↗"}</a>}
                    {o.coupon_code && <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: C.accent, marginTop: 8, letterSpacing: "0.5px" }}>Code: {o.coupon_code}</div>}
                    <div onClick={() => { logEvent("offer_report", detail, { offer_id: o.id }); showToast("Thanks, we will take a look"); }} style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 10, cursor: "pointer", textDecoration: "underline" }}>Report an issue</div>
                  </div>
                );
              })()}

              {isBeach(detail) && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#2DD4BF", marginBottom: 8 }}>🏖️ Beach conditions</div>
                  {beachCondLoading && <div style={{ fontSize: 13, color: C.muted }}>Checking wind and water…</div>}
                  {!beachCondLoading && beachCond && (() => {
                    const bc = beachCond;
                    const dir = bc.windDir != null ? compass(bc.windDir) : null;
                    const opp = bc.windDir != null ? compass((bc.windDir + 180) % 360) : null;
                    let shore = null;
                    if (bc.windDir != null && bc.waveDir != null) {
                      let diff = Math.abs(bc.windDir - bc.waveDir) % 360;
                      if (diff > 180) diff = 360 - diff;
                      shore = diff <= 60 ? "onshore" : diff >= 120 ? "offshore" : "cross";
                    }
                    const waveFt = bc.waveHeight != null ? (bc.waveHeight * 3.281).toFixed(1) : null;
                    const hasAny = bc.wind != null || shore || waveFt;
                    return (
                      <div>
                        {bc.wind != null && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>💨 Wind {bc.wind} mph{bc.gust ? " (gusts " + bc.gust + ")" : ""}{dir ? " from the " + dir : ""}</div>}
                        {shore && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🧭 {shore === "onshore" ? "Blowing in off the water" : shore === "offshore" ? "Blowing out toward the water" : "Blowing along the beach"}</div>}
                        {waveFt && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🌊 Waves about {waveFt} ft{bc.wavePeriod != null ? ", " + Math.round(bc.wavePeriod) + "s apart" : ""}</div>}
                        {dir && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>Tent tip: the wind comes from the {dir}, so set your tent or windbreak with the opening facing the {opp}, away from the wind.</div>}
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
                const ai = insight && !insight.error && !insight.unavailable ? insight : {};
                const aiRow = (k) => { const v = ai[k]; const has = Array.isArray(v) ? v.filter(Boolean).length > 0 : !!(v && String(v).trim()); return k + ": " + (has ? "shown" : "empty/hidden"); };
                return (
                  <div style={{ marginBottom: 16, padding: "10px 12px", background: "#0A0E14", border: "1px dashed #30363D", borderRadius: 10, fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#8B949E", lineHeight: 1.6, overflowWrap: "anywhere" }}>
                    <div style={{ color: "#F97316", fontWeight: 800 }}>TRUST AUDIT</div>
                    <div>identity: {audit.identity}</div>
                    <div>types: {(detail.types || []).join(", ") || "none"}</div>
                    <div>candidates: {(audit.candidates || []).join(", ") || "none"}</div>
                    <div>shown: {(audit.shown || []).join(", ") || "none"}</div>
                    <div>blocked: {(audit.blocked || []).map((b) => b.key + " (" + b.reason + ")").join("; ") || "none"}</div>
                    <div>park admission cue: {String(Tags.requiresParkAdmission(detail.types))}</div>
                    <div>ai fields: {["verdict", "bestFor", "goWhen", "skipIf", "whyPicked", "tip", "caution", "mustTry"].map(aiRow).join(" · ")}</div>
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
                            {p.rating != null && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {p.rating}</span>}
                            {p.openNow === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span>}
                            {p.openNow === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.red }}>· Closed</span>}
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
                        {p.rating != null && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {p.rating}</span>}
                        {p.openNow === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span>}
                        {p.openNow === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.red }}>· Closed</span>}
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
