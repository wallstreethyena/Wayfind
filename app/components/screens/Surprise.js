"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only: all
// state and callbacks arrive via the single ctx prop assembled in PageInner.
import { C, scoreLabel } from "../kit";

export default function SurpriseScreen({ ctx }) {
  const { surprisePick, surprisePool, surpriseLoading, setSurprisePick, rerollSurprise, setScreen, openDetail, openExperience, quickSaveFavorite, isSaved, blurbs, experienceBadges, cityFixM, liveOpen, iconForPlace, Loader, FallbackImg } = ctx;
          const p = surprisePick;
          const sl = p ? scoreLabel(p.wfScore) : null;
          const badges = p ? experienceBadges(p).slice(0, 2) : [];
          const cuisineLabel = p ? (() => { const t = (p.types || []).find((x) => /_(restaurant|store|bar)$/.test(x)); return t ? t.replace(/_(restaurant|store|bar)$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null; })() : null;
          // v4.6: capitalized identity + state-aware subtitle so a closed pick is never framed as "right now".
          const period = (() => { const hr = new Date().getHours(); return hr < 12 ? "Morning" : hr < 17 ? "Afternoon" : "Evening"; })();
          const sOpen = !!(p && p.openNow === true);
          const sOpensLater = !!(p && p.openNow === false && p.nextOpen && p.nextOpen.today);
          const sSub = sOpen ? "Open now, nearby, and worth your time."
            : sOpensLater ? (p.nextOpen.label + " · a strong pick for a little later.")
            : "A top pick nearby, chosen for rating, distance, and fit.";
          // v5.0: state-aware primary action. Never tell someone to drive to a closed place.
          const openAlt = surprisePool.find((o) => o && o.openNow === true && (!p || o.id !== p.id)) || null;
          const goMaps = () => { if (p && p.mapsUrl) window.open(p.mapsUrl, "_blank", "noopener"); else if (p) openDetail(p); };
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
          return (
            <div>
              <div onClick={() => setScreen("suggested")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: C.accent, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: "8px 15px", marginBottom: 10 }}>‹ Back</div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>🎲 Your {period} Pick</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{sSub}</div>
              </div>
              {surpriseLoading && <Loader label="Finding something good" pad="16px 2px" />}
              {!surpriseLoading && !p && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing to suggest right now</strong>
                  <span style={{ fontSize: 13 }}>Try a different area.</span>
                </div>
              )}
              {!surpriseLoading && p && (
                <div>
                  <div onClick={() => openDetail(p)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
                    <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: "100%", height: 168, objectFit: "cover", display: "block" }} />
                    <div style={{ padding: 13 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{p.name}</div>
                      {p.address && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>📍 {p.address}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {sl && <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{sl.word}</span>}
                        {sl && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{sl.s}/10</span>}
                        {p.rating && <span style={{ color: "#F59E0B", fontSize: 13 }}>★ {p.rating}{p.reviews ? ` (${p.reviews.toLocaleString()})` : ""}</span>}
                        {liveOpen(p) === true && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Open now</span>}
                        {liveOpen(p) === false && <span style={{ fontSize: 12, fontWeight: 700, color: p.nextOpen && p.nextOpen.today ? C.gold : C.red }}>{p.nextOpen && p.nextOpen.today ? p.nextOpen.label : "Closed today"}</span>}
                        {p.price && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>· {p.price}</span>}
                        {cuisineLabel && <span style={{ fontSize: 12, color: C.muted }}>· {cuisineLabel}</span>}
                        {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                      </div>
                      {sWhy.length > 0 && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 9 }}><span style={{ color: C.accent, fontWeight: 800 }}>Why: </span>{sWhy.slice(0, 4).join(" · ")}</div>}
                      {badges.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                          {badges.map((b) => (
                            <button key={b.key} onClick={(e) => { e.stopPropagation(); openExperience(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>{b.icon} {cityFixM(b.label)} ›</button>
                          ))}
                        </div>
                      )}
                      {blurbs[p.id] && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45, marginTop: 10 }}>{blurbs[p.id]}</div>}
                    </div>
                  </div>
                  <button onClick={primaryAction} style={{ width: "100%", marginTop: 10, background: C.accent, color: "#0D1117", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}>{primaryLabel}</button>
                  <div style={{ display: "flex", gap: 10, marginTop: 9 }}>
                    
                    <button onClick={() => quickSaveFavorite(p)} style={{ flex: 1, background: isSaved(p.id) ? C.adim : "transparent", color: isSaved(p.id) ? C.accent : C.light, border: `1px solid ${isSaved(p.id) ? C.accent : C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "11px 0", cursor: "pointer" }}>{isSaved(p.id) ? "♥ Saved" : "♡ Save"}</button>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 9 }}>
                    {!sOpen && openAlt ? (
                      <button onClick={() => setSurprisePick(openAlt)} style={{ flex: 1, background: "transparent", color: C.green, border: `1.5px solid ${C.green}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" }}>Find open now</button>
                    ) : (
                      <button onClick={() => openDetail(p)} style={{ flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 700, padding: "12px 0", cursor: "pointer" }}>See details</button>
                    )}
                    <button onClick={rerollSurprise} style={{ flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" }}>🎲 Roll again</button>
                  </div>
                  {/* v4.6: backup picks split into Open now and For later so closed spots are labeled, not hidden in prime slots. */}
                  {(() => {
                    const others = surprisePool.filter((o) => o && o.id !== p.id);
                    const openG = others.filter((o) => o.openNow === true).slice(0, 3);
                    const laterG = others.filter((o) => o.openNow === false).slice(0, 3);
                    if (!openG.length && !laterG.length) return null;
                    return (
                      <div style={{ marginTop: 22, paddingBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: 10 }}>Backup picks</div>
                        {openG.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 7 }}>Open now</div>}
                        {openG.map((other) => (
                          <div key={other.id} onClick={() => setSurprisePick(other)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
                            <FallbackImg src={other.photo} icon="🍽️" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{other.name}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                                {other.rating && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {other.rating}</span>}
                                {other.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {other.distMi.toFixed(1)} mi</span>}
                              </div>
                            </div>
                            <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                          </div>
                        ))}
                        {laterG.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.4px", margin: "12px 0 7px" }}>For later</div>}
                        {laterG.map((other) => (
                          <div key={other.id} onClick={() => setSurprisePick(other)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer", opacity: 0.82 }}>
                            <FallbackImg src={other.photo} icon="🍽️" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{other.name}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                                {other.rating && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {other.rating}</span>}
                                {other.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {other.distMi.toFixed(1)} mi</span>}
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.gold }}>{other.nextOpen && other.nextOpen.today ? other.nextOpen.label : "Opens later"}</span>
                              </div>
                            </div>
                            <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
}
