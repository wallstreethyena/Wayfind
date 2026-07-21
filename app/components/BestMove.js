"use client";
// BestMove v2 — the "Your best move right now" homepage section (issue #232,
// owner iteration 2026-07-21 evening): no chips row, no browse slot (the
// category menu lives above this section now), Wayfind Score everywhere a
// number appears (never the raw Google star), and one LLM-written "why this,
// why now" line per pick from /api/bestmove/why. Data honesty holds: every
// rendered value is engine- or weather-supplied, the why-lines are grounded
// in ONLY those signals (the endpoint's system prompt bans invention), and a
// missing anything renders as nothing. The why slot is RESERVED geometry,
// filled exactly once (LLM line if it lands in time, else the engine's own
// reasons) — content never swaps under the reader (#233).
// scripts/test-best-move.mjs locks the contract.
import { useState } from "react";
import { C, CAT_COLOR, TYPE, RADII, SHADOW, MOTION, FOCUS, TARGET, Icon, directionsUrl, PlaceScoreChip } from "./kit";
import { pickPhotoUrl, splitPicks } from "../../lib/bestMove.js";
import { siteTodayStr } from "../../lib/siteTime.js";

// Category gradient fallback when a pick ships without a photo — branded, not
// a bare gray box (bare gradient was flagged a bug in #230, so tint by category).
function catGradient(category) {
  const cc = (CAT_COLOR[category] || CAT_COLOR.attractions);
  return `linear-gradient(150deg, ${cc.dim} 0%, ${C.card} 70%)`;
}

const secTitle = { ...TYPE.title, color: C.text, margin: 0 };

// Distance + Wayfind Score. The Score chip self-heals from rating signals via
// the ONE Bayesian formula (kit/PlaceScoreChip) and shows an honest "Score
// pending" when there is nothing real to compute from. The raw Google star
// and review count are deliberately not rendered (owner call, 2026-07-21).
function MetaLine({ p }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, ...TYPE.meta, color: C.muted }}>
      {isFinite(p.distance_mi) ? <span>{p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)} mi</span> : null}
      <PlaceScoreChip p={{ rating: p.rating, reviews: p.reviews }} size={12.5} />
    </div>
  );
}

// One-shot why slot: fixed-height reserved space that fills exactly once.
// Before `settled`, empty air (no spinner, no placeholder text to replace).
// After, the LLM line if the endpoint grounded one, else the engine's reason.
function WhySlot({ p, why, settled, lines = 2 }) {
  const llm = settled && why && why[p.place_id];
  const fallback = settled && !llm ? (p.reasons || []).slice(0, 1).join("") : "";
  return (
    <div style={{ minHeight: lines * 18, fontSize: 13, lineHeight: "18px", color: C.light, display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
      {llm || fallback}
    </div>
  );
}

function PulseRow({ icon, title, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0" }}>
      <Icon name={icon} size={16} color={C.accent} style={{ marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{title}</div>
        {sub ? <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

// Backup card, owner iteration: THE CARD IS THE IMAGE — full-bleed photo,
// name + Wayfind Score + distance + why-line on a bottom scrim. Whole card
// is one directions tap; the heart floats top-right.
function BackupCard({ p, saved, onSave, onOpenDirections, why, settled }) {
  const img = pickPhotoUrl(p.photo_ref, 480);
  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative", borderRadius: RADII.card, overflow: "hidden", boxShadow: SHADOW.card, background: catGradient(p.category), aspectRatio: "3 / 4" }}>
      {img && <img src={img} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <button onClick={() => onOpenDirections(p)} aria-label={"Directions to " + p.name} className="wf-bm-cta" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0 }} />
      <button onClick={(e) => { e.stopPropagation(); onSave(p); }} aria-label={saved ? "Saved" : "Save " + p.name} style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%", background: saved ? C.accent : "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", zIndex: 2 }}>
        <Icon name="heart" size={14} color="#fff" />
      </button>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "26px 11px 10px", background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.86) 62%)", pointerEvents: "none" }}>
        <div style={{ ...TYPE.title, fontSize: 14.5, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
        <div style={{ margin: "3px 0 4px" }}><MetaLine p={p} /></div>
        <WhySlot p={p} why={why} settled={settled} lines={2} />
      </div>
    </div>
  );
}

// Reserved-geometry skeleton: same grid, same aspect ratios, so the engine
// answer lands with zero layout shift (the #218/#233 lesson).
function BestMoveSkeleton() {
  return (
    <div className="wf-bm-grid" aria-hidden="true">
      <div className="wf-sk" style={{ borderRadius: RADII.card, aspectRatio: "4 / 5", maxHeight: 460 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="wf-sk" style={{ flex: 1, borderRadius: RADII.card, aspectRatio: "3 / 4" }} />
          <div className="wf-sk" style={{ flex: 1, borderRadius: RADII.card, aspectRatio: "3 / 4" }} />
        </div>
        <div className="wf-sk" style={{ borderRadius: RADII.card, height: 120 }} />
      </div>
    </div>
  );
}

export default function BestMove({ picks, loading, usedFallback, fallbackLabel, weather, events, savedIds, onSave, onLog, why, whySettled }) {
  // "Not my vibe" advances to the next pick locally; the event feeds ranking later.
  const [dismissed, setDismissed] = useState([]);
  const live = (picks || []).filter((p) => !dismissed.includes(p.place_id));
  const { hero, backups, unexpected } = splitPicks(live);

  const openDirections = (p) => {
    try { onLog && onLog("bestmove_go", p); } catch (e) {}
    const u = directionsUrl({ id: p.place_id, name: p.name, lat: p.lat, lng: p.lng });
    if (u) { try { window.open(u, "_blank", "noopener"); } catch (e) {} }
  };
  const dismiss = (p) => {
    try { onLog && onLog("bestmove_dismiss", p); } catch (e) {}
    setDismissed((d) => [...d, p.place_id]);
  };

  // Local Pulse — only signals with a live source: the real sunset clock and
  // the next real events already fetched for the rail. No crowd claims.
  const now = Date.now();
  const minsToSunset = weather && weather.sunsetMs ? Math.round((weather.sunsetMs - now) / 60000) : null;
  const fmtCountdown = (m) => (m >= 60 ? Math.floor(m / 60) + " h " + (m % 60 ? (m % 60) + " min" : "").trim() : m + " minutes");
  const sunsetSoon = minsToSunset != null && minsToSunset > 0 && minsToSunset < 180;
  const today = siteTodayStr();
  const nextEvents = (events || []).filter((e) => e && e.name).slice(0, 2);

  // w=800 (not more): the hero card renders ~370-400 CSS px wide, so 800 covers
  // 2x DPR. Measured 2026-07-21: an oversized hero spent 7.4s of a 10.5s LCP on
  // download alone at 1.6Mbps. MUST match the layout.js primer width so its
  // pre-warmed bytes are a cache hit, not a second download.
  const heroImg = hero ? pickPhotoUrl(hero.photo_ref, 800) : null;

  return (
    <section aria-label="Your best move right now" style={{ margin: "4px 0 18px" }}>
      <style>{`.wf-bm-grid{display:flex;flex-direction:column;gap:12px}.wf-bm-backups{display:flex;gap:12px}@media(min-width:900px){.wf-bm-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start}}
.wf-bm-cta:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}`}</style>

      <h1 style={{ ...TYPE.display, fontSize: 26, color: C.text, margin: "6px 0 12px" }}>Your best move right now</h1>

      {usedFallback && fallbackLabel ? (
        <div style={{ ...TYPE.meta, color: C.muted, margin: "0 0 10px" }}>No coverage right where you are yet — showing {fallbackLabel}.</div>
      ) : null}

      {loading && !hero ? <BestMoveSkeleton /> : null}

      {hero ? (
        <div className="wf-bm-grid">
          {/* HERO — one single best recommendation */}
          <div style={{ position: "relative", borderRadius: RADII.card, overflow: "hidden", background: catGradient(hero.category), boxShadow: SHADOW.raised, aspectRatio: "4 / 5", maxHeight: 460, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            {heroImg && <img src={heroImg} alt={hero.name} fetchPriority="high" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.82) 78%)" }} />
            <div style={{ position: "relative", padding: "16px 16px 14px" }}>
              <div style={{ ...TYPE.eyebrow, color: C.accent }}>Best match</div>
              <div style={{ ...TYPE.display, color: "#fff", margin: "6px 0 4px" }}>{hero.name}</div>
              <MetaLine p={hero} />
              <div style={{ margin: "10px 0 2px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: C.light, marginBottom: 6 }}>Why Wayfind picked it</div>
                <WhySlot p={hero} why={why} settled={whySettled} lines={2} />
                {(hero.reasons || []).slice(0, why && why[hero.place_id] ? 2 : 0).map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13, color: C.text }}>
                    <Icon name={/★|rated|favorite/i.test(r) ? "trophy" : "sparkles"} size={14} color={C.accent} />{r}
                  </div>
                ))}
              </div>
              {weather && weather.temp != null ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: RADII.chip, background: "rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.15)", fontSize: 12, fontWeight: 700, color: C.text, margin: "8px 0 2px" }}>
                  {weather.temp}°{weather.sunset ? " · Sunset " + weather.sunset : ""}
                </div>
              ) : null}
              <a href={directionsUrl({ id: hero.place_id, name: hero.name, lat: hero.lat, lng: hero.lng }) || "#"} onClick={(e) => { e.preventDefault(); openDirections(hero); }} className="wf-bm-cta" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: TARGET, borderRadius: RADII.control, background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, textDecoration: "none", marginTop: 10, cursor: "pointer" }}>Take me there</a>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => onSave(hero)} className="wf-bm-cta" style={{ flex: 1, minHeight: 38, borderRadius: RADII.control, border: `1px solid ${savedIds && savedIds[hero.place_id] ? C.accent : "rgba(255,255,255,.25)"}`, background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, transition: `border-color ${MOTION.fast} ${MOTION.ease}` }}><Icon name="heart" size={14} color={savedIds && savedIds[hero.place_id] ? C.accent : "#fff"} />{savedIds && savedIds[hero.place_id] ? "Saved" : "Save"}</button>
                <button onClick={() => dismiss(hero)} className="wf-bm-cta" style={{ flex: 1, minHeight: 38, borderRadius: RADII.control, border: "1px solid rgba(255,255,255,.25)", background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Not my vibe</button>
              </div>
            </div>
          </div>

          {/* RIGHT column: backups, Local Pulse, Something unexpected */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {backups.length ? (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <h2 style={secTitle}>Two good backups</h2>
                </div>
                <div className="wf-bm-backups">
                  {backups.map((p) => (
                    <BackupCard key={p.place_id} p={p} saved={!!(savedIds && savedIds[p.place_id])} onSave={onSave} onOpenDirections={openDirections} why={why} settled={whySettled} />
                  ))}
                </div>
              </div>
            ) : null}

            {(sunsetSoon || nextEvents.length) ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADII.card, padding: "10px 14px", boxShadow: SHADOW.card }}>
                <h2 style={{ ...secTitle, padding: "4px 0 2px" }}>Local Pulse</h2>
                {sunsetSoon ? (
                  <PulseRow icon="sparkles" title={"Sunset in " + fmtCountdown(minsToSunset)} sub={"Golden hour · " + weather.sunset} />
                ) : null}
                {nextEvents.map((e, i) => (
                  <PulseRow key={e.id || i} icon="calendar" title={e.name} sub={[e.date === today ? "Tonight" : e.date, e.time, e.venue || e.city].filter(Boolean).join(" · ")} />
                ))}
              </div>
            ) : null}

            {unexpected.length ? (
              <div>
                <h2 style={{ ...secTitle, marginBottom: 8 }}>Something unexpected</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unexpected.map((p) => {
                    const img = pickPhotoUrl(p.photo_ref, 240);
                    return (
                      <button key={p.place_id} onClick={() => openDirections(p)} className="wf-bm-cta" style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderRadius: RADII.control, border: `1px solid ${C.border}`, background: C.card, cursor: "pointer", textAlign: "left", minHeight: TARGET }}>
                        <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: catGradient(p.category) }}>
                          {img && <img src={img} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <MetaLine p={p} />
                          <WhySlot p={p} why={why} settled={whySettled} lines={1} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
