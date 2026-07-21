"use client";
// BestMove — the "Your best move right now" homepage section (issue #232).
// One hero recommendation from the wf_best_picks engine, two backups, a
// real-signals-only Local Pulse, and up to three "Something unexpected" picks.
// Data honesty: every line here renders a field the engine or weather source
// actually supplied, or renders nothing. Per the #232 triage: the mockup's
// crowd-level line had no source and became the sunset countdown + next real
// event; drive-time distance had no source and renders as real straight-line
// miles. scripts/test-best-move.mjs locks the contract.
import { useState } from "react";
import { C, CAT_COLOR, TYPE, SPACE, RADII, SHADOW, MOTION, FOCUS, TARGET, Icon, directionsUrl } from "./kit";
import { pickPhotoUrl, splitPicks } from "../../lib/bestMove.js";
import { siteTodayStr } from "../../lib/siteTime.js";

// Category gradient fallback when a pick ships without a photo — branded, not
// a bare gray box (bare gradient was flagged a bug in #230, so tint by category).
function catGradient(category) {
  const cc = (CAT_COLOR[category] || CAT_COLOR.attractions);
  return `linear-gradient(150deg, ${cc.dim} 0%, ${C.card} 70%)`;
}

// The mockup's intent chips. The free-stuff chip is deliberately absent: we
// hold no wired price signal to filter on, and a chip that promises no-cost
// places and shows maybe-paid ones is exactly what the product rule forbids.
const CHIPS = [
  { id: "rightnow", label: "Right now", icon: "sparkles", active: true },
  { id: "food", label: "Food" },
  { id: "datenight", label: "Date night" },
  { id: "family", label: "Family" },
  { id: "surprise", label: "Surprise me" },
];

const secTitle = { ...TYPE.title, color: C.text, margin: 0 };
const metaTxt = { ...TYPE.meta, color: C.muted };

function MetaLine({ p }) {
  // Only fields the engine supplied: real miles, real rating, real volume.
  const bits = [];
  if (isFinite(p.distance_mi)) bits.push(p.distance_mi < 10 ? p.distance_mi.toFixed(1) + " mi away" : Math.round(p.distance_mi) + " mi away");
  if (isFinite(p.rating)) bits.push(p.rating.toFixed(1) + " ★" + (p.reviews ? " · " + Number(p.reviews).toLocaleString() + " reviews" : ""));
  return <div style={metaTxt}>{bits.join(" · ")}</div>;
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

function BackupCard({ p, saved, onSave, onOpenDirections }) {
  const img = pickPhotoUrl(p.photo_ref, 480);
  return (
    <div style={{ flex: 1, minWidth: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: RADII.card, overflow: "hidden", boxShadow: SHADOW.card }}>
      <div style={{ aspectRatio: "3 / 2", background: catGradient(p.category), position: "relative" }}>
        {img && <img src={img} alt={p.name} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <button onClick={() => onSave(p)} aria-label={saved ? "Saved" : "Save " + p.name} style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%", background: saved ? C.accent : "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)" }}>
          <Icon name="heart" size={14} color="#fff" />
        </button>
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ ...TYPE.title, fontSize: 14.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
        <div style={{ marginTop: 3 }}><MetaLine p={p} /></div>
        <button onClick={() => onOpenDirections(p)} style={{ marginTop: 8, width: "100%", minHeight: 34, borderRadius: RADII.control, border: `1px solid ${C.border}`, background: "transparent", color: C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Directions</button>
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
          <div className="wf-sk" style={{ flex: 1, borderRadius: RADII.card, height: 180 }} />
          <div className="wf-sk" style={{ flex: 1, borderRadius: RADII.card, height: 180 }} />
        </div>
        <div className="wf-sk" style={{ borderRadius: RADII.card, height: 120 }} />
      </div>
    </div>
  );
}

export default function BestMove({ picks, loading, usedFallback, fallbackLabel, weather, events, savedIds, onChip, onSave, onLog, browse }) {
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

  // Hero reason bullets come straight from the engine's reasons[] (already
  // phrased for display). The sunset line joins them only when it is real AND
  // genuinely urgent (<75 min) — outside that window the Pulse card and the
  // weather chip already carry it, and three sunset mentions is two too many.
  const heroReasons = hero ? [
    ...(minsToSunset != null && minsToSunset > 0 && minsToSunset < 75 ? [{ icon: "sparkles", text: "Sunset is in " + minsToSunset + " minutes" }] : []),
    ...((hero.reasons || []).slice(0, 3).map((r) => ({ icon: /★|rated|favorite/i.test(r) ? "trophy" : "sparkles", text: r }))),
  ].slice(0, 3) : [];

  // w=800 (not more): the hero card renders ~370-400 CSS px wide, so 800 covers
  // 2x DPR. Measured 2026-07-21: w=1200 spent 7.4s of a 10.5s LCP on download
  // alone at 1.6Mbps. MUST match the layout.js primer width so its pre-warmed
  // bytes are a cache hit, not a second download.
  const heroImg = hero ? pickPhotoUrl(hero.photo_ref, 800) : null;

  return (
    <section aria-label="Your best move right now" style={{ margin: "4px 0 18px" }}>
      <style>{`.wf-bm-grid{display:flex;flex-direction:column;gap:12px}.wf-bm-backups{display:flex;gap:12px}@media(min-width:900px){.wf-bm-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start}}
.wf-bm-chip:focus-visible,.wf-bm-cta:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}`}</style>

      <h1 style={{ ...TYPE.display, fontSize: 26, color: C.text, margin: "6px 0 12px" }}>Your best move right now</h1>

      {/* Intent chips — Right now is this view; the rest route to existing surfaces */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 2, marginBottom: 12 }}>
        {CHIPS.map((c) => (
          <button key={c.id} className="wf-bm-chip" onClick={() => { if (!c.active && onChip) onChip(c.id); }} aria-current={c.active ? "true" : undefined} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "7px 14px", borderRadius: RADII.chip, border: `1px solid ${c.active ? C.accent : C.border}`, background: c.active ? C.accent : C.card, color: c.active ? "#0D1117" : C.light, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: `background ${MOTION.fast} ${MOTION.ease}` }}>
            {c.icon ? <Icon name={c.icon} size={14} color={c.active ? "#0D1117" : C.accent} /> : null}{c.label}
          </button>
        ))}
      </div>

      {/* Browse all — the shared CategoryMenu, slotted so the mockup's order
          (chips, then browse, then hero) holds without forking the menu. */}
      {browse ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...TYPE.eyebrow, color: C.muted, marginBottom: 6 }}>Browse all</div>
          {browse}
        </div>
      ) : null}

      {usedFallback && fallbackLabel ? (
        <div style={{ ...TYPE.meta, color: C.muted, margin: "0 0 10px" }}>No coverage right where you are yet — showing {fallbackLabel}.</div>
      ) : null}

      {loading && !hero ? <BestMoveSkeleton /> : null}

      {!loading && !hero ? null /* engine empty even after fallback: the rails below carry the page */ : null}

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
              {heroReasons.length ? (
                <div style={{ margin: "10px 0 2px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.light, marginBottom: 6 }}>Why Wayfind picked it</div>
                  {heroReasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13, color: C.text }}>
                      <Icon name={r.icon} size={14} color={C.accent} />{r.text}
                    </div>
                  ))}
                </div>
              ) : null}
              {weather && weather.temp != null ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: RADII.chip, background: "rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.15)", fontSize: 12, fontWeight: 700, color: C.text, margin: "8px 0 2px" }}>
                  {weather.temp}°{weather.sunset ? " · Sunset " + weather.sunset : ""}
                </div>
              ) : null}
              <a href={directionsUrl({ id: hero.place_id, name: hero.name, lat: hero.lat, lng: hero.lng }) || "#"} onClick={(e) => { e.preventDefault(); openDirections(hero); }} className="wf-bm-cta" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: TARGET, borderRadius: RADII.control, background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, textDecoration: "none", marginTop: 10, cursor: "pointer" }}>Take me there</a>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => onSave(hero)} className="wf-bm-cta" style={{ flex: 1, minHeight: 38, borderRadius: RADII.control, border: `1px solid ${savedIds && savedIds[hero.place_id] ? C.accent : "rgba(255,255,255,.25)"}`, background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="heart" size={14} color={savedIds && savedIds[hero.place_id] ? C.accent : "#fff"} />{savedIds && savedIds[hero.place_id] ? "Saved" : "Save"}</button>
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
                    <BackupCard key={p.place_id} p={p} saved={!!(savedIds && savedIds[p.place_id])} onSave={onSave} onOpenDirections={openDirections} />
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
                      <button key={p.place_id} onClick={() => openDirections(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderRadius: RADII.control, border: `1px solid ${C.border}`, background: C.card, cursor: "pointer", textAlign: "left", minHeight: TARGET }}>
                        <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: catGradient(p.category) }}>
                          {img && <img src={img} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <MetaLine p={p} />
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
