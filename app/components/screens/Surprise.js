"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only: all
// state and callbacks arrive via the single ctx prop assembled in PageInner.
//
// v6.73: the last quick-link tile to join the universal collection look. The
// nine list routes reach it through IntentPageClient -> RankedExperiencePage;
// this screen CANNOT, and copying that component would have been the wrong
// move: Surprise Me returns ONE place, and a list shell with a single row in it
// is a list that looks broken. So it wears the same system, assembled for a
// different shape — CollectionHero chrome, the same glass controls, the same
// coral CTA, the same row styling for the alternatives underneath.
//
// The translation that makes it fit: on a list page the headline names the
// COLLECTION and the rows name the places. Here there is one place, so the
// place IS the subject — its photo becomes the hero, its name becomes the
// headline, and the body carries the evidence for it. Nothing is duplicated
// into a card below the hero, because the hero already is the card.
//
// Every control the old flat screen carried survives, relocated to the slot the
// system reserves for its kind: the state-aware primary action is the coral CTA
// (it is the action this screen exists to drive), Save and Roll again are the
// glass circles, See details / Find open now stay labelled buttons in the body,
// and the Open-now / For-later backup split is unchanged.
import { C, scoreLabel, PlaceScoreChip } from "../kit";
import CollectionHero, { HeroPill, HeroIconButton, HeroCta } from "../CollectionHero";
import { RankedRow, ROW_IMG_STYLE } from "../RankedExperiencePage";
import { openExternal } from "../../../lib/links";
import { siteHourFloat, bucketForHour } from "../../../lib/nowContext.js";

export default function SurpriseScreen({ ctx }) {
  const { surprisePick, surprisePool, surpriseLoading, setSurprisePick, rerollSurprise, setScreen, openDetail, openExperience, quickSaveFavorite, isSaved, blurbs, experienceBadges, cityFixM, liveOpen, iconForPlace, Loader, FallbackImg } = ctx;
          const p = surprisePick;
          const sl = p ? scoreLabel(p.wfScore) : null;
          const badges = p ? experienceBadges(p).slice(0, 2) : [];
          const cuisineLabel = p ? (() => { const t = (p.types || []).find((x) => /_(restaurant|store|bar)$/.test(x)); return t ? t.replace(/_(restaurant|store|bar)$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null; })() : null;
          // v4.6: capitalized identity + state-aware subtitle so a closed pick is never framed as "right now".
          // v6.72: was a FOURTH independent bucketing (12/17). Now the one
          // source, so this label cannot disagree with the list beside it.
          const period = { morning: "Morning", afternoon: "Afternoon", night: "Evening" }[bucketForHour(siteHourFloat())];
          const sOpen = !!(p && liveOpen(p) === true);
          const sOpensLater = !!(p && liveOpen(p) === false && p.nextOpen && p.nextOpen.today);
          const sSub = sOpen ? "Open now, nearby, and worth your time."
            : sOpensLater ? (p.nextOpen.label + " · a strong pick for a little later.")
            : "A top pick nearby, chosen for rating, distance, and fit.";
          // v5.0: state-aware primary action. Never tell someone to drive to a closed place.
          const openAlt = surprisePool.find((o) => o && liveOpen(o) === true && (!p || o.id !== p.id)) || null;
          const goMaps = () => { if (p && p.mapsUrl) openExternal(p.mapsUrl); else if (p) openDetail(p); };
          let primaryLabel = "Take me there →";
          let primaryAction = goMaps;
          if (p && !sOpen) {
            if (sOpensLater) { primaryLabel = "Plan for " + p.nextOpen.label.replace(/^opens\s+/i, "") + " →"; primaryAction = goMaps; }
            else { primaryLabel = isSaved(p.id) ? "Saved ✓" : "Save for later →"; primaryAction = () => quickSaveFavorite(p); }
          }
          const sWhy = [];
          if (p) {
            if (sOpen) sWhy.push("open now");
            else if (sOpensLater) sWhy.push("opens " + p.nextOpen.label.replace(/^opens\s+/i, "").trim());
            if (p.rating != null && p.rating >= 4.5) sWhy.push("local favorite");
            else if (sl && sl.word) sWhy.push(sl.word.toLowerCase() + " rated");
            if (p.distMi != null && p.distMi <= 20) sWhy.push("close enough");
            sWhy.push("strong " + period.toLowerCase() + " option");
          }
          // The alternatives, still split so a closed spot is labelled rather
          // than hidden in a prime slot (v4.6).
          const others = p ? surprisePool.filter((o) => o && o.id !== p.id) : [];
          const openG = others.filter((o) => liveOpen(o) === true).slice(0, 3);
          const laterG = others.filter((o) => liveOpen(o) === false).slice(0, 3);
          // The hero headline is a PLACE NAME here, not an authored collection
          // title, so its length is whatever Google returns. The hero's content
          // block is bottom-anchored inside a fixed 278px: measured, the safe
          // zone under the glass controls leaves ~112px for the headline, which
          // is three lines at 34px. Long names shrink instead of climbing into
          // the Back pill; titleLines is the backstop for the pathological ones
          // (some Google names run past 100 characters), because shrinking
          // forever would win the geometry and lose the legibility.
          const nameLen = p && p.name ? p.name.length : 0;
          const titleSize = nameLen > 46 ? 25 : nameLen > 32 ? 29 : 34;
          // Same geometry the system's section eyebrows use everywhere else.
          const sectionLabel = { fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 4 };
          const secondaryBtn = { flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" };
          const altRow = (other) => (
            <RankedRow key={other.id} i={0} rank={false} onClick={() => setSurprisePick(other)}
              imgEl={<FallbackImg src={other.photo} icon={iconForPlace(other)} style={ROW_IMG_STYLE} />}
              title={other.name}
              score={null}
              why={(other.distMi != null ? other.distMi.toFixed(1) + " mi" : "") + (liveOpen(other) === false ? (other.distMi != null ? " · " : "") + (other.nextOpen && other.nextOpen.today ? other.nextOpen.label : "Opens later") : "")}
              badge={<PlaceScoreChip p={other} size={12} />} />
          );
          return (
            <div>
              <CollectionHero
                wordmark={false}
                height={278}
                bleed="-7px -12px 14px"
                heroImg={p ? p.photo : null}
                accent={C.accent}
                titleSize={titleSize}
                titleLines={4}
                // "Your Evening pick" over "Nothing to suggest right now" is a
                // small lie the eyebrow tells; without a pick it names the
                // feature instead of promising a result.
                eyebrow={p ? "🎲 Your " + period + " pick" : "🎲 Surprise me"}
                titleTop={p ? p.name : surpriseLoading ? "Finding something good" : "Nothing to suggest right now"}
                subtitle={p ? sSub : surpriseLoading ? "Weighing rating, distance, and what is actually open." : "Try a different area."}
                topLeft={(
                  <div style={{ position: "absolute", top: 12, left: 12, zIndex: 2 }}>
                    <HeroPill ariaLabel="Back" onClick={() => { setScreen("suggested"); try { window.scrollTo(0, 0); } catch (e) {} }}>‹ Back</HeroPill>
                  </div>
                )}
                topRight={(
                  <div style={{ position: "absolute", top: 12, right: 12, zIndex: 2, display: "flex", alignItems: "center", gap: 8 }}>
                    {p ? (
                      <HeroIconButton active={isSaved(p.id)} ariaLabel={isSaved(p.id) ? "Saved" : "Save this place"} title={isSaved(p.id) ? "Saved" : "Save"} onClick={() => quickSaveFavorite(p)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={isSaved(p.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>
                      </HeroIconButton>
                    ) : null}
                    <HeroIconButton ariaLabel="Roll again" title="Roll again" onClick={rerollSurprise}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /></svg>
                    </HeroIconButton>
                  </div>
                )}
                cta={p ? <HeroCta accent={C.accent} ariaLabel={primaryLabel} onClick={primaryAction}>{primaryLabel}</HeroCta> : null}
              />
              {surpriseLoading && <Loader label="Finding something good" pad="16px 2px" />}
              {/* The hero headline IS the empty state now, so the body only adds
                  the way out of it. Repeating "Nothing to suggest right now"
                  under a headline that already says it reads like a rendering
                  bug, not emphasis. */}
              {!surpriseLoading && !p && (
                <div style={{ textAlign: "center", padding: "34px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
                  <span style={{ fontSize: 13 }}>Widen the area, or roll again for a different read on what is nearby.</span>
                </div>
              )}
              {!surpriseLoading && p && (
                <div>
                  {/* The evidence for the one pick. The hero above carries the
                      photo and the name, so this block starts where a list row's
                      why-line would: the score, the live state, the reasons. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <PlaceScoreChip p={p} size={13} />
                    {sl && <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{sl.word}</span>}
                    {sl && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{sl.s}/10</span>}
                    {liveOpen(p) === true && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Open now</span>}
                    {liveOpen(p) === false && <span style={{ fontSize: 12, fontWeight: 700, color: p.nextOpen && p.nextOpen.today ? C.gold : C.red }}>{p.nextOpen && p.nextOpen.today ? p.nextOpen.label : "Closed today"}</span>}
                    {p.price && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>· {p.price}</span>}
                    {cuisineLabel && <span style={{ fontSize: 12, color: C.muted }}>· {cuisineLabel}</span>}
                    {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                  </div>
                  {p.address && <div style={{ fontSize: 12, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>📍 {p.address}</div>}
                  {sWhy.length > 0 && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 10 }}><span style={{ fontWeight: 800 }}>Why: </span>{sWhy.slice(0, 4).join(" · ")}</div>}
                  {blurbs[p.id] && <div style={{ fontSize: 13, color: "rgba(241,245,249,.75)", lineHeight: 1.5, marginTop: 8 }}>{blurbs[p.id]}</div>}
                  {badges.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
                      {badges.map((b) => (
                        <button key={b.key} onClick={(e) => { e.stopPropagation(); openExperience(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.light, background: C.adim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>{b.icon} {cityFixM(b.label)} ›</button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    {!sOpen && openAlt ? (
                      <button onClick={() => setSurprisePick(openAlt)} style={{ ...secondaryBtn, color: C.green, border: `1.5px solid ${C.green}` }}>Find open now</button>
                    ) : (
                      <button onClick={() => openDetail(p)} style={secondaryBtn}>See details</button>
                    )}
                    <button onClick={rerollSurprise} style={secondaryBtn}>🎲 Roll again</button>
                  </div>
                  {(openG.length > 0 || laterG.length > 0) && (
                    <div style={{ marginTop: 24, paddingBottom: 8 }}>
                      <div style={{ ...sectionLabel, color: C.muted, marginBottom: 10 }}>Backup picks</div>
                      {openG.length > 0 && (
                        <>
                          <div style={{ ...sectionLabel, color: C.green }}>Open now</div>
                          <ol style={{ listStyle: "none", margin: "0 0 4px", padding: 0 }}>{openG.map(altRow)}</ol>
                        </>
                      )}
                      {laterG.length > 0 && (
                        <>
                          <div style={{ ...sectionLabel, color: C.muted, marginTop: 14 }}>For later</div>
                          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>{laterG.map(altRow)}</ol>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
}
