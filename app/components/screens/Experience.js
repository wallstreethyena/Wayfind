"use client";
// Extracted from app/home.js (G4, July 2026 decomposition). Render-only.
// PageInner aliases cityFixM as "cityFix" locally; this file calls
// ctx.cityFixM directly (same function, already flowing through ctx).
import { C } from "../kit";

export default function ExperienceScreen({ ctx }) {
  const { activeBadge, setActiveBadge, EXPERIENCES, expPlaces, expMi, setExpMi, expSort, setExpSort, expTours, expLoading, momentPicks, setBrowseCat, setIntent, setScreen, shareLink, listShareUrl, locName, showToast, logEvent, giveawayMark, setMapListOverride, hookLikes, toggleHookLike, saveHookList, ViatorRail, Loader, SortControl, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, blurbs, openExperience, openCuisine, PlaceCard, cityFixM } = ctx;
          const exp = EXPERIENCES[activeBadge];
          let list = expPlaces || [];
          if (expMi < 60) list = list.filter((p) => p.distMi == null || p.distMi <= expMi);
          if (expSort === "near") list = [...list].sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
          else if (expSort === "rated") list = [...list].sort((a, b) => (((b.wfScore || 0) - ((b.distMi || 0) <= 4 ? 0 : Math.min(30, ((b.distMi || 0) - 4) * 1.3)) + (b.openNow === false ? -8 : 0)) - ((a.wfScore || 0) - ((a.distMi || 0) <= 4 ? 0 : Math.min(30, ((a.distMi || 0) - 4) * 1.3)) + (a.openNow === false ? -8 : 0))) || ((b.reviews || 0) - (a.reviews || 0)));
          else if (expSort === "price") list = [...list].sort((a, b) => (((a.price_level ?? a.priceLevel ?? 9)) - ((b.price_level ?? b.priceLevel ?? 9))) || ((b.rating || 0) - (a.rating || 0)));
          else list = [...list].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div onClick={() => { setActiveBadge(null); setIntent(null); setBrowseCat(null); setScreen("suggested"); try { window.scrollTo(0, 0); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: C.accent, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: "8px 15px" }}>‹ Back</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => { shareLink(cityFixM(exp.title), listShareUrl(activeBadge, cityFixM(exp.title), list.length, locName), () => showToast("Link copied"), "Check this Wayfind list: " + cityFixM(exp.title), () => { try { logEvent("share", null, { kind: "list", theme: activeBadge }); } catch (e) {} giveawayMark("list:" + activeBadge); }); }} aria-label="Share list" title="Share list" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                  {list.some((pp) => pp && pp.lat != null) ? (<button aria-label="See this list on the map" title="See on map" onClick={() => { setMapListOverride(list.filter((pp) => pp && pp.lat != null).slice(0, 20)); setScreen("map"); try { logEvent("maps_list", null, { theme: activeBadge, n: Math.min(list.length, 20), inapp: 1 }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 3.6 5.4A1 1 0 0 0 3 6.3V20l6-2.5 6 2.5 5.4-2.4a1 1 0 0 0 .6-.9V3l-6 2.5Z" /><path d="M9 3v14.5" /><path d="M15 5.5V20" /></svg></button>) : null}
                  {(() => { const lk = hookLikes.has("badge-" + activeBadge); return (<button onClick={() => { toggleHookLike("badge-" + activeBadge); saveHookList({ id: "badge-" + activeBadge, key: activeBadge, title: cityFixM(exp.title), label: cityFixM(exp.title) }, list); }} aria-label={lk ? "Saved to lists" : "Save to lists"} title={lk ? "Saved to lists" : "Save to lists"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: lk ? C.adim : "transparent", border: `1.5px solid ${lk ? C.accent : C.border}`, color: lk ? C.accent : C.muted, cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill={lk ? C.accent : "none"} stroke={lk ? C.accent : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>); })()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{exp.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.2px", color: C.accent, textTransform: "uppercase" }}>Wayfind picks</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.text, lineHeight: 1.08, letterSpacing: "-0.6px", marginBottom: 10 }}>{cityFixM(exp.title)}</div>
              <div style={{ fontSize: 14.5, color: C.light, lineHeight: 1.55, marginBottom: 8 }}>{exp.lead}</div>
              {EXPERIENCES[activeBadge] && EXPERIENCES[activeBadge].viator && <ViatorRail title={EXPERIENCES[activeBadge].viatorMode === "gems" ? "Hidden gem experiences" : "Top-rated experiences"} items={expTours} theme={activeBadge} />}
              {!expLoading && momentPicks && momentPicks.badge === activeBadge && (() => {
                const byId = new Map((expPlaces || []).map((p) => [p.id, p]));
                const rows = momentPicks.picks.map((x) => ({ ...x, p: byId.get(x.id) })).filter((x) => x.p);
                if (!rows.length) return null;
                return (
                  <div style={{ background: C.card, border: `1.5px solid ${C.accent}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 8 }}>✨ Perfect right now</div>
                    {rows.map((x, i) => (
                      <div key={x.id} onClick={() => openDetail(x.p)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: C.adim, color: C.accent, fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{x.p.name}{x.p.rating ? <span style={{ fontSize: 12, color: "#F59E0B", fontWeight: 700 }}> ★ {x.p.rating}</span> : null}</div>
                          <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.4, marginTop: 2 }}>{x.why}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>Based on rating, review volume, distance, relevance, and real experience signals, plus member takes once a place has enough of them. No ads, no paid placement.</div>
              {!expLoading && <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>{list.length} curated pick{list.length === 1 ? "" : "s"} · Tap any to see full details</div>}
              {expLoading && <Loader label="Curating the best spots" pad="8px 2px" />}
              {/* v4.98 GLOBAL RULE (user direction): every list — browse,
                  sheets, experiences — shows ONE control: the standard
                  SortControl (Top rated default, 17-mi default radius). No
                  extra chip bars, no "Open now" toggle, no dice chip on
                  list views, here or anywhere else. */}
              {!expLoading && (expPlaces || []).length > 0 && (
                <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <SortControl sortBy={expSort} onSort={setExpSort} mi={expMi} onMi={setExpMi} where={locName ? locName.split(",")[0] : "you"} dealsAvailable={false} dealsOnly={false} onDeals={null} />
                </div>
              )}
              {!expLoading && activeBadge === "instagram" && (expPlaces || []).length > 0 && (() => {
                const h = new Date().getHours();
                let light;
                if (h < 8) light = "Early light is soft and golden. Keep the sun to one side of your subject and shoot toward the open sky, not into the sun.";
                else if (h < 11) light = "Morning sun sits in the east. Stand with the sun behind you or to your left so faces are evenly lit and shadows stay short.";
                else if (h < 15) light = "Midday sun is high and harsh. Find open shade or a covered spot, keep the sun behind you, and avoid overhead noon shadows on faces.";
                else if (h < 18) light = "Afternoon sun moves to the west and softens. Side light works well; angle your subject so light skims across them.";
                else if (h < 20) light = "Golden hour. Put the sun behind your subject for a warm rim glow, then tap to focus and raise exposure so faces do not go dark.";
                else light = "After sunset, light is low. Use railings or a ledge to steady the shot, and frame against city lights or the sky.";
                return (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.pink, marginBottom: 8 }}>📸 Photo tips for right now</div>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{light}</div>
                    <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.55 }}>
                      <div style={{ marginBottom: 4 }}>🎯 Framing: put the subject on a third, not dead center, and use a doorway, archway, or branches in front as a natural frame.</div>
                      <div style={{ marginBottom: 4 }}>🧍 Poses: shoot a candid walking or looking-away shot rather than a straight-on stare, turn shoulders slightly off camera, and keep hands busy.</div>
                      <div>📐 Lines: line up paths, railings, or shorelines so they lead toward the subject, and get low for a taller, more dramatic look.</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>General photography guidance based on the current time, not specific to each spot.</div>
                  </div>
                );
              })()}
              {!expLoading && list.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{exp.icon}</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing matched within 60 miles</strong>
                  <span style={{ fontSize: 13 }}>Try a different experience or area.</span>
                </div>
              )}
              {!expLoading && list.map((p, i) => (
                <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} selectedBadge={activeBadge} />
              ))}
            </div>
          );
}
