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
        const heroImage = hookDetail.heroImage || null;
        const premiumImagePage = !!heroImage;
        const premiumCardBg = "linear-gradient(145deg, rgba(27,36,51,.98) 0%, rgba(14,21,32,.99) 100%)";
        const premiumCardBorder = "rgba(148,163,184,.22)";
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
          <div style={{ position: "fixed", inset: 0, zIndex: 950, background: premiumImagePage ? `radial-gradient(circle at 50% 18%, ${acc}12 0%, transparent 34%), ${C.bg}` : C.bg, display: "flex", flexDirection: "column", overflowY: "auto", overscrollBehavior: "contain", alignItems: isDesktop ? "center" : "stretch" }}>
            {/* Gradient hero header */}
            <div style={{ background: heroImage ? `linear-gradient(90deg, rgba(3,7,14,.82) 0%, rgba(3,7,14,.50) 48%, rgba(3,7,14,.18) 100%), linear-gradient(180deg, rgba(4,8,16,.16) 0%, rgba(4,8,16,.38) 48%, ${C.bg} 100%), url("${heroImage}") center / cover no-repeat` : `linear-gradient(155deg, ${acc}2A 0%, ${C.bg} 72%)`, borderBottom: premiumImagePage ? "none" : `1px solid ${acc}35`, padding: premiumImagePage ? "max(18px, calc(env(safe-area-inset-top) + 14px)) 18px 82px" : "max(16px, calc(env(safe-area-inset-top) + 12px)) 16px 18px", minHeight: heroImage ? (isDesktop ? 390 : 350) : undefined, flexShrink: 0, width: "100%", maxWidth: isDesktop ? 920 : "none", boxSizing: "border-box", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <button onClick={() => setHookDetail(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: premiumImagePage ? "rgba(8,14,24,.58)" : C.card, border: `1px solid ${premiumImagePage ? "rgba(255,255,255,.20)" : C.border}`, borderRadius: 999, color: acc, fontSize: 14, fontWeight: 800, cursor: "pointer", padding: "8px 15px", backdropFilter: premiumImagePage ? "blur(14px)" : undefined, boxShadow: premiumImagePage ? "0 8px 24px rgba(0,0,0,.22)" : undefined }}>‹ Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {themePlaces.some((pp) => pp && pp.lat != null) ? (
                    <button aria-label="See this list on the map" title="See on map" onClick={() => { setMapListOverride(themePlaces.filter((pp) => pp && pp.lat != null).slice(0, 20)); setHookDetail(null); setScreen("map"); try { logEvent("maps_list", null, { theme, n: Math.min(themePlaces.length, 20), inapp: 1 }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${premiumImagePage ? "rgba(255,255,255,.22)" : C.border}`, background: premiumImagePage ? "rgba(8,14,24,.42)" : "transparent", color: premiumImagePage ? "#E8EEF7" : C.muted, cursor: "pointer", backdropFilter: premiumImagePage ? "blur(14px)" : undefined }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 3.6 5.4A1 1 0 0 0 3 6.3V20l6-2.5 6 2.5 5.4-2.4a1 1 0 0 0 .6-.9V3l-6 2.5Z" /><path d="M9 3v14.5" /><path d="M15 5.5V20" /></svg></button>
                  ) : null}
                  <button onClick={() => { const _k = (hookDetail && (hookDetail.key || hookDetail.id)) || theme; const _t = (hookDetail && (hookDetail.title || hookDetail.label)) || "Top picks"; shareLink(_t, listShareUrl(_k, _t, themePlaces.length, locName, hookDetail.hol || ""), () => showToast("Link copied"), "Check this Wayfind list: " + _t, () => { try { logEvent("share", null, { kind: "list", theme: _k }); } catch (e) {} giveawayMark("list:" + _k); }); }} aria-label="Share list" title="Share list" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${premiumImagePage ? "rgba(255,255,255,.22)" : C.border}`, background: premiumImagePage ? "rgba(8,14,24,.42)" : "transparent", color: premiumImagePage ? "#E8EEF7" : C.muted, cursor: "pointer", backdropFilter: premiumImagePage ? "blur(14px)" : undefined }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                  <button onClick={() => { toggleHookLike(hookDetail.id); saveHookList(hookDetail, themePlaces); }} aria-label={isLiked ? "Saved to lists" : "Save to lists"} title={isLiked ? "Saved to lists" : "Save to lists"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: isLiked ? acc + "30" : (premiumImagePage ? "rgba(8,14,24,.42)" : "transparent"), border: `1.5px solid ${isLiked ? acc : (premiumImagePage ? "rgba(255,255,255,.22)" : C.border)}`, color: isLiked ? acc : (premiumImagePage ? "#E8EEF7" : C.muted), cursor: "pointer", backdropFilter: premiumImagePage ? "blur(14px)" : undefined }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? acc : "none"} stroke={isLiked ? acc : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>
                  </button>
                </div>
              </div>
              <div style={{ maxWidth: premiumImagePage ? 620 : undefined, textShadow: premiumImagePage ? "0 2px 16px rgba(0,0,0,.72)" : undefined }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: acc, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 8 }}>{hookDetail.emoji} {hookDetail.label}</div>
              <div style={{ fontSize: premiumImagePage ? (isDesktop ? 34 : 29) : 24, fontWeight: 850, color: C.text, lineHeight: 1.12, letterSpacing: premiumImagePage ? "-0.7px" : undefined, marginBottom: hookDetail.themeBody ? 10 : 4 }}>
                {hookDetail.themeTitle || hookDetail.hook}
              </div>
              {hookDetail.themeBody && (
                <div style={{ fontSize: premiumImagePage ? 15 : 13.5, color: premiumImagePage ? "#E4EAF2" : C.light, lineHeight: 1.55, marginBottom: 10 }}>{hookDetail.themeBody}</div>
              )}
              <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>
                {sheetLoading ? "Finding the best picks near you…" : (themePlaces.length + " " + (theme === "skip" ? "to avoid" : theme === "drive" ? "worth the trip" : "curated picks") + " · Tap any to see full details")}
              </div>
              <div style={{ marginTop: 12, display: "inline-flex", padding: premiumImagePage ? 4 : 0, borderRadius: premiumImagePage ? 999 : undefined, background: premiumImagePage ? "rgba(8,14,24,.46)" : undefined, border: premiumImagePage ? "1px solid rgba(255,255,255,.13)" : undefined, backdropFilter: premiumImagePage ? "blur(14px)" : undefined }}>
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
            </div>

            {/* Scrollable editorial list */}
            <div style={{ flexShrink: 0, padding: premiumImagePage ? "0 16px calc(30px + env(safe-area-inset-bottom))" : "14px 16px calc(24px + env(safe-area-inset-bottom))", marginTop: premiumImagePage ? -54 : 0, width: "100%", maxWidth: isDesktop ? 920 : "none", boxSizing: "border-box", position: "relative", zIndex: 2 }}>
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
                    {hookDetail.sections && (() => { let acc = 0; for (const sec of hookDetail.sections) { if (i === acc) return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.9px", textTransform: "uppercase", color: C.light, margin: i === 0 ? "2px 2px 10px" : "18px 2px 10px" }}>{sec.label}</div>; acc += sec.count; } return null; })()}
                  <div
                    onClick={() => { setHookDetail(null); openDetail(p, hookDetail.theme); }}
                    style={{
                      background: premiumImagePage ? (isFeatured ? `linear-gradient(145deg, ${acc}20 0%, rgba(25,34,49,.99) 42%, rgba(12,18,28,.99) 100%)` : premiumCardBg) : (isFeatured ? `linear-gradient(135deg, ${acc}18 0%, ${C.card} 60%)` : C.card),
                      border: `1.5px solid ${isFeatured ? acc + (premiumImagePage ? "82" : "60") : (premiumImagePage ? premiumCardBorder : C.border)}`,
                      borderRadius: premiumImagePage ? 20 : 16, marginBottom: premiumImagePage ? 12 : 10, overflow: "hidden", cursor: "pointer",
                      boxShadow: premiumImagePage ? (isFeatured ? `0 18px 44px rgba(0,0,0,.4), 0 0 0 1px ${acc}12 inset` : "0 10px 24px rgba(0,0,0,.22)") : (isFeatured ? `0 4px 20px ${acc}20` : "none"),
                    }}
                  >
                    <div style={{ display: "flex", minHeight: premiumImagePage ? (isFeatured ? 176 : 142) : 104 }}>
                      <div style={{ position: "relative", flexShrink: 0, width: premiumImagePage ? (isFeatured ? (isDesktop ? 186 : 132) : (isDesktop ? 142 : 112)) : 92 }}>
                        <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(4,8,16,.04) 45%, rgba(4,8,16,.42) 100%)" }} />
                        {showRank && (
                          <div style={{ position: "absolute", top: 10, left: 10, minWidth: isFeatured ? 42 : 32, height: isFeatured ? 42 : 32, padding: isFeatured ? "0 10px" : 0, borderRadius: 12, background: isFeatured ? "rgba(8,12,19,.9)" : "rgba(8,12,19,.82)", border: `1px solid ${rankColor}88`, boxShadow: "0 8px 18px rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: isFeatured ? 14 : 12, fontWeight: 900, color: "#fff", backdropFilter: "blur(8px)" }}>
                            {medalEmoji && <span>{medalEmoji}</span>}<span>{i + 1}</span>
                          </div>
                        )}
                        {showWarn && (
                          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(185,28,28,.9)", borderRadius: 10, padding: "5px 9px", fontSize: 11, fontWeight: 850, color: "#fff" }}>Skip this</div>
                        )}
                        {isFeatured && (
                          <div style={{ position: "absolute", left: 10, bottom: 10, borderRadius: 999, padding: "5px 9px", background: "rgba(5,10,17,.86)", border: `1px solid ${acc}88`, color: acc, fontSize: 9.5, fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase", backdropFilter: "blur(8px)" }}>Wayfind select</div>
                        )}
                      </div>
                      <div style={{ padding: premiumImagePage ? (isFeatured ? "15px 16px 14px" : "12px 14px") : "10px 12px", flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        {(() => { const _sv = isSaved(p.id); return (
                          <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6, zIndex: 2 }}>
                            <button onClick={(e) => { e.stopPropagation(); quickSaveFavorite(p); }} aria-label="Save" title="Save" style={{ width: 34, height: 34, borderRadius: "50%", background: _sv ? acc : "rgba(4,8,16,.52)", border: `1px solid ${_sv ? acc : "rgba(255,255,255,.22)"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(8px)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill={_sv ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>
                          </div>
                        ); })()}
                        <div style={{ fontSize: isFeatured ? 19 : 15, fontWeight: 850, letterSpacing: isFeatured ? "-0.25px" : undefined, color: C.text, lineHeight: 1.22, marginBottom: 7, paddingRight: 42 }}>{p.name}</div>
                        {isFeatured && <div style={{ width: 32, height: 3, borderRadius: 999, background: acc, marginBottom: 8 }} />}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6, paddingRight: 38 }}>
                          <PlaceScoreChip p={p} size={13} />
                          {p.reviews > 0 && <span style={{ fontSize: 12, color: C.muted }}>{p.reviews.toLocaleString()} reviews</span>}
                          {liveOpen(p) === true && <span style={{ fontSize: 11, fontWeight: 750, color: C.green }}>Open now</span>}
                          {liveOpen(p) === false && <span style={{ fontSize: 11, fontWeight: 750, color: C.red }}>Closed</span>}
                          {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                          {p.price && <span style={{ fontSize: 12, color: C.green, fontWeight: 750 }}>{p.price}</span>}
                        </div>
                        {badges.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
                            {badges.map((b) => (
                              <span key={b.key} style={{ fontSize: 10.5, fontWeight: 750, color: acc, background: acc + "12", border: `1px solid ${acc}4D`, borderRadius: 999, padding: "3px 8px" }}>{b.icon} {cityFixM(b.label)}</span>
                            ))}
                          </div>
                        )}
                        {isFeatured && (() => { const _w1 = whyFirst(p, themePlaces); return _w1 ? <div style={{ fontSize: 11.5, fontWeight: 700, color: "#F8FAFC", background: acc + "0F", borderLeft: "2px solid " + acc, padding: "5px 0 5px 9px", marginBottom: 7, lineHeight: 1.35 }}>{_w1}</div> : null; })()}
                        {(() => { const _isFam = !!(hookDetail && (hookDetail.fetchKey === "family" || hookDetail.theme === "family")); const _fam = _isFam ? Fam.familyWhy(p, { temp: weather ? weather.temp : null, rainy: !!(weather && /rain|storm|shower/i.test(weather.label || "")), distMi: p.distMi, openNow: liveOpen(p) }) : null; const why = _isWC ? WCC.wcCopy(p, themePlaces, i) : (_fam ? _fam.line : pickReason(p, { rank: i + 1, total: themePlaces.length, next: themePlaces[i + 1], weather, night: isNightNow(weather), foodContext: (theme === "best" || theme === "top5" || theme === "food" || /food|eat|breakfast|lunch|dinner/i.test(hookDetail.themeTitle || "")) })); return why ? <div style={{ fontSize: isFeatured ? 12.5 : 12, color: C.light, fontWeight: _fam ? 700 : 400, lineHeight: 1.4, marginBottom: isFeatured ? 7 : 0 }}>{why}</div> : null; })()}
                        {isFeatured && <div style={{ fontSize: 11.5, color: acc, fontWeight: 800, marginTop: "auto" }}>See full details →</div>}
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
