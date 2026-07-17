"use client";
// Extracted from app/home.js (G2, July 2026 decomposition). Render-only.
import { Fragment } from "react";
import { C, sheetBg, sheet, SHEET_EASE, PlaceScoreChip } from "../kit";
import { byTopRated } from "../../../lib/ranking";
import * as Fam from "../../../lib/family";
import * as WCC from "../../../lib/wc";

export default function HookDetailSheet({ ctx }) {
  const { hookDetail, setHookDetail, hookLikes, suggested, places, offers, isDesktop, hkSort, setHkSort, hkMi, setHkMi, hkDeals, setHkDeals, weather, locName, cityNow, dedupePlaces, placesForHook, pickReason, isNightNow, isSaved, quickSaveFavorite, toggleHookLike, saveHookList, openDetail, setMapListOverride, setScreen, logEvent, listShareUrl, shareLink, showToast, giveawayMark, buildListShareUrl, liveOpen, iconForPlace, cityFixM, experienceBadges, whyFirst, Loader, Critter, FallbackImg, SortControl, openCurated } = ctx;
        // Merge the two source lists, but de-dupe by id — a place that appears
        // in both the suggested feed and the nearby search would otherwise show
        // up twice in a themed list.
        const allSrc = dedupePlaces([...(suggested || []), ...places], true);
        const acc = hookDetail.accent || C.accent;
        const theme = hookDetail.theme || "best";
        const isLiked = hookLikes.has(hookDetail.id);
        const primaryId = hookDetail.placeId;

        // Theme-specific place curation — each theme shows the right number
        // of places, curated from real data. "Top 5" = exactly 5. "Skip" = 3.
        const byScore = [...allSrc].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
        let themePlaces = hookDetail.places || placesForHook(hookDetail, allSrc);

        if (themePlaces.length === 0 && primaryId) {
          const pri = allSrc.find((x) => x.id === primaryId);
          if (pri) themePlaces = [pri];
        }
        // Safety net: no theme should ever render the same place twice.
        themePlaces = themePlaces.filter((p, i, a) => p && p.id && a.findIndex((x) => x && x.id === p.id) === i);
        if (hkSort === "near") themePlaces = themePlaces.slice().sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
        // v6.12: Top rated = the displayed Wayfind Score, best to worst (shared byTopRated).
        // Was a Bayesian-quality-minus-distance blend that stranded a 4.9 below 4.4s.
        else if (hkSort === "rated") themePlaces = themePlaces.slice().sort(byTopRated); // v6.42: Wayfind Score order — never raw stars; the badge IS the order
        else if (hkSort === "price") themePlaces = themePlaces.slice().sort((a, b) => (((a.price_level ?? a.priceLevel ?? 9)) - ((b.price_level ?? b.priceLevel ?? 9))) || ((b.rating || 0) - (a.rating || 0)));
        if (hkMi < 60) themePlaces = themePlaces.filter((p) => p.distMi == null || p.distMi <= hkMi);
        if (hkDeals) themePlaces = themePlaces.filter((p) => offers[p.id]);
        const sheetLoading = !!(hookDetail.fetchKey && !hookDetail.places);

        const MEDALS = { 0: "🥇", 1: "🥈", 2: "🥉" };
        const rankColours = { 0: "#FBBF24", 1: "#CBD5E1", 2: "#CD7F32" };
        const showRank = theme === "top5" || theme === "best";
        const showWarn = theme === "skip";

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 950, background: C.bg, display: "flex", flexDirection: "column", overflowY: "auto", overscrollBehavior: "contain", alignItems: isDesktop ? "center" : "stretch" }}>
            {/* Gradient hero header */}
            <div style={{ background: `linear-gradient(155deg, ${acc}2A 0%, ${C.bg} 72%)`, borderBottom: `1px solid ${acc}35`, padding: "max(16px, calc(env(safe-area-inset-top) + 12px)) 16px 18px", flexShrink: 0, width: "100%", maxWidth: isDesktop ? 880 : "none", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <button onClick={() => setHookDetail(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: acc, fontSize: 14, fontWeight: 800, cursor: "pointer", padding: "8px 15px" }}>‹ Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {themePlaces.some((pp) => pp && pp.lat != null) ? (
                    <button aria-label="See this list on the map" title="See on map" onClick={() => { setMapListOverride(themePlaces.filter((pp) => pp && pp.lat != null).slice(0, 20)); setHookDetail(null); setScreen("map"); try { logEvent("maps_list", null, { theme, n: Math.min(themePlaces.length, 20), inapp: 1 }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 3.6 5.4A1 1 0 0 0 3 6.3V20l6-2.5 6 2.5 5.4-2.4a1 1 0 0 0 .6-.9V3l-6 2.5Z" /><path d="M9 3v14.5" /><path d="M15 5.5V20" /></svg></button>
                  ) : null}
                  <button onClick={() => { const _k = (hookDetail && (hookDetail.key || hookDetail.id)) || theme; const _t = (hookDetail && (hookDetail.title || hookDetail.label)) || "Top picks"; shareLink(_t, listShareUrl(_k, _t, themePlaces.length, locName, hookDetail.hol || ""), () => showToast("Link copied"), "Check this Wayfind list: " + _t, () => { try { logEvent("share", null, { kind: "list", theme: _k }); } catch (e) {} giveawayMark("list:" + _k); }); }} aria-label="Share list" title="Share list" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                  <button onClick={() => { toggleHookLike(hookDetail.id); saveHookList(hookDetail, themePlaces); }} aria-label={isLiked ? "Saved to lists" : "Save to lists"} title={isLiked ? "Saved to lists" : "Save to lists"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: isLiked ? acc + "25" : "transparent", border: `1.5px solid ${isLiked ? acc : C.border}`, color: isLiked ? acc : C.muted, cursor: "pointer" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? acc : "none"} stroke={isLiked ? acc : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 7 }}>{hookDetail.emoji} {hookDetail.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1.25, marginBottom: hookDetail.themeBody ? 10 : 4 }}>
                {hookDetail.themeTitle || hookDetail.hook}
              </div>
              {hookDetail.themeBody && (
                <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.6, marginBottom: 8 }}>{hookDetail.themeBody}</div>
              )}
              <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>
                {sheetLoading ? "Finding the best picks near you…" : (themePlaces.length + " " + (theme === "skip" ? "to avoid" : theme === "drive" ? "worth the trip" : "curated picks") + " · Tap any to see full details")}
              </div>
              <div style={{ marginTop: 10 }}>
                <SortControl sortBy={hkSort} onSort={setHkSort} mi={hkMi} onMi={setHkMi} where={cityNow} dealsAvailable={Object.keys(offers).length > 0} dealsOnly={hkDeals} onDeals={setHkDeals} />
              </div>
              {hookDetail.id === "cur-bestof" && (
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {[["institutions", "Institutions"], ["gems", "Hidden gems"]].map(([id, lb]) => {
                    const on = (hookDetail.lens || "institutions") === id;
                    return (
                      <button key={id} onClick={() => openCurated("bestof", { lens: id })} aria-pressed={on} style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: `1px solid ${on ? acc : C.border}`, background: on ? acc + "20" : "transparent", color: on ? acc : C.light, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{lb}</button>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Rankings are merit-based. Affiliate links never change placement.</div>
            </div>

            {/* Scrollable editorial list */}
            <div style={{ flexShrink: 0, padding: "14px 16px calc(24px + env(safe-area-inset-bottom))", width: "100%", maxWidth: isDesktop ? 880 : "none", boxSizing: "border-box" }}>
              {sheetLoading && <Loader label="Finding the best picks" pad="28px 0" />}
              {!sheetLoading && themePlaces.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ display: "inline-flex", animation: "wfbob 1.4s ease-in-out infinite", marginBottom: 12 }}><Critter size={48} /></div>
                  <div style={{ fontSize: 14, color: C.light }}>Not enough data for this filter right now</div>
                </div>
              )}

              {themePlaces.map((p, i) => {
                const isFeatured = i === 0;
                const medalEmoji = MEDALS[i];
                const rankColor = rankColours[i] || C.accent;
                const _isWC = !!(hookDetail && hookDetail.hol === "worldcup");
                const _wcb = _isWC ? WCC.wcBadge(p, themePlaces) : null;
                const badges = _isWC ? (_wcb ? [{ key: "wc", icon: _wcb.icon, label: _wcb.label }] : []) : experienceBadges(p, null, 2);
                return (
                  <Fragment key={p.id}>
                    {hookDetail.sections && (() => { let acc = 0; for (const sec of hookDetail.sections) { if (i === acc) return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.9px", textTransform: "uppercase", color: C.accent, margin: i === 0 ? "2px 2px 10px" : "18px 2px 10px" }}>{sec.label}</div>; acc += sec.count; } return null; })()}
                  <div
                    onClick={() => { setHookDetail(null); openDetail(p, hookDetail.theme); }}
                    style={{
                      background: isFeatured ? `linear-gradient(135deg, ${acc}18 0%, ${C.card} 60%)` : C.card,
                      border: `1.5px solid ${isFeatured ? acc + "60" : C.border}`,
                      borderRadius: 16, marginBottom: 10, overflow: "hidden", cursor: "pointer",
                      boxShadow: isFeatured ? `0 4px 20px ${acc}20` : "none",
                    }}
                  >
                    {/* Featured (first) place: large photo on top */}
                    {isFeatured && (
                      <div style={{ position: "relative" }}>
                        <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                        {showRank && (
                          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,.7)", borderRadius: 10, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 20 }}>{medalEmoji || "🏆"}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>#{i + 1} Pick</span>
                          </div>
                        )}
                        {showWarn && (
                          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(239,68,68,.85)", borderRadius: 10, padding: "5px 12px" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>⚠️ Skip this</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(13,17,23,.95))", padding: "20px 14px 12px" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{p.name}</div>
                        </div>
                      </div>
                    )}

                    {/* Card body */}
                    <div style={{ display: isFeatured ? "block" : "flex", padding: isFeatured ? "12px 14px 14px" : 0, gap: 0 }}>
                      {!isFeatured && (
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: 86, height: 86, objectFit: "cover", display: "block" }} />
                          {showRank && (
                            <div style={{ position: "absolute", top: 5, left: 5, width: 22, height: 22, borderRadius: "50%", background: rankColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: medalEmoji ? 14 : 10, fontWeight: 800, color: "#0D1117" }}>
                              {medalEmoji || (i + 1)}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ padding: isFeatured ? 0 : "10px 12px", flex: 1, minWidth: 0, position: "relative" }}>
                        {(() => { const _sv = isSaved(p.id); return (
                          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 2 }}>
                            <button onClick={(e) => { e.stopPropagation(); quickSaveFavorite(p); }} aria-label="Save" title="Save" style={{ width: 30, height: 30, borderRadius: "50%", background: _sv ? acc : "rgba(0,0,0,.38)", border: `1px solid ${_sv ? acc : "rgba(255,255,255,.28)"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill={_sv ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>
                            
                          </div>
                        ); })()}
                        {!isFeatured && <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 5, paddingRight: 74 }}>{p.name}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5, paddingRight: isFeatured ? 74 : 0 }}>
                          <PlaceScoreChip p={p} size={13} />
                          {p.reviews > 0 && <span style={{ fontSize: 12, color: C.muted }}>{p.reviews.toLocaleString()} reviews</span>}
                          {liveOpen(p) === true && <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>Open now</span>}
                          {liveOpen(p) === false && <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>Closed</span>}
                          {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                          {p.price && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{p.price}</span>}
                        </div>
                        {badges.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                            {badges.map((b) => (
                              <span key={b.key} style={{ fontSize: 11, fontWeight: 700, color: acc, background: acc + "18", border: `1px solid ${acc}55`, borderRadius: 999, padding: "2px 8px" }}>{b.icon} {cityFixM(b.label)}</span>
                            ))}
                          </div>
                        )}
                        {isFeatured && (() => { const _w1 = whyFirst(p, themePlaces); return _w1 ? <div style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", background: acc + "14", border: "1px solid " + acc + "3D", borderRadius: 9, padding: "7px 10px", marginBottom: 9, lineHeight: 1.4 }}>{_w1}</div> : null; })()}
                        {(() => { const _isFam = !!(hookDetail && (hookDetail.fetchKey === "family" || hookDetail.theme === "family")); const _fam = _isFam ? Fam.familyWhy(p, { temp: weather ? weather.temp : null, rainy: !!(weather && /rain|storm|shower/i.test(weather.label || "")), distMi: p.distMi, openNow: liveOpen(p) }) : null; const why = _isWC ? WCC.wcCopy(p, themePlaces, i) : (_fam ? _fam.line : pickReason(p, { rank: i + 1, total: themePlaces.length, next: themePlaces[i + 1], weather, night: isNightNow(weather), foodContext: (theme === "best" || theme === "top5" || theme === "food" || /food|eat|breakfast|lunch|dinner/i.test(hookDetail.themeTitle || "")) })); return why ? <div style={{ fontSize: 12.5, color: _fam ? C.accent : C.light, fontWeight: _fam ? 700 : 400, lineHeight: 1.4, marginBottom: isFeatured ? 8 : 2 }}>{why}</div> : null; })()}
                        {isFeatured && (
                          <div style={{ fontSize: 12.5, color: acc, fontWeight: 700 }}>See full details →</div>
                        )}
                      </div>
                    </div>
                  </div>
                  </Fragment>
                );
              })}

              {/* Bottom save + share actions */}
              {themePlaces.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    onClick={() => { toggleHookLike(hookDetail.id); saveHookList(hookDetail, themePlaces); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 14, border: `1.5px solid ${isLiked ? acc : C.border}`, background: isLiked ? acc + "20" : "transparent", color: isLiked ? acc : C.light, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  >
                    {isLiked ? "❤️ Saved" : "🤍 Save this list"}
                  </button>
                  <button
                    onClick={async () => { const ttl = hookDetail.themeTitle || hookDetail.hook || "My Wayfind picks"; const url = await buildListShareUrl(themePlaces, ttl); shareLink(ttl, url, () => showToast("Link copied"), `${ttl} — help me wayfind it`); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 14, border: "none", background: acc, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                  >
                    ↗ Share
                  </button>
                </div>
              )}
            </div>
          </div>
        );
}
