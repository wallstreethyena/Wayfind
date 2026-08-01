"use client";

// A portable, explicit-props version of the visual language used by the home
// PlaceCard. The full home card is intentionally stateful and remains in
// app/home.js; collection pages use this presentational card so the photo,
// rank, score, evidence and actions travel together without importing hidden
// app state.
import { WayfindScoreBadge } from "./kit";
import { businessStatus } from "../../lib/businessStatus";
import { coarseCat } from "../../lib/ranking";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { priceLabel } from "../../lib/price";

const C = {
  card: "#111827", border: "rgba(255,255,255,.13)", text: "#F8F5EE",
  light: "#B7C0D1", muted: "#8791A4", accent: "#F97316",
  gold: "#E8C97A", green: "#4ADE80",
};

const compactCount = (n) => Number(n) >= 1000
  ? (Math.round(Number(n) / 100) / 10) + "k"
  : String(Number(n) || 0);

const photoUrl = (p) => p && p.photoRef
  ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640"
  : null;

export default function IconicPlaceCard({ place, rank, href, editorial, badge, intentLabel, rankingNote, onShare }) {
  if (!place) return null;
  const score = toDisplayScore(wayfindScore(place.rating, place.reviews));
  const category = coarseCat(place) || "Local pick";
  const status = businessStatus({
    ...place,
    oh: place.oh || place.regularOpeningHours || null,
    utcOffset: place.utcOffset != null ? place.utcOffset : place.utcOffsetMinutes,
  });
  const state = status.open === true ? "Open" : status.open === false ? "Closed" : null;
  const distance = Number.isFinite(Number(place.distMi))
    ? (Number(place.distMi) < 10 ? Number(place.distMi).toFixed(1) : Math.round(Number(place.distMi))) + " mi"
    : null;
  const facts = [place.reviews ? compactCount(place.reviews) + " reviews" : null, priceLabel(place.priceLevel ?? place.price_level ?? place.priceNum), state, distance].filter(Boolean);
  const award = rank <= 3 ? (rank === 1 ? "Best " : "Top ") + String(category).toLowerCase() + " pick" : null;
  const take = editorial || ("Our #" + rank + " pick — " + (place.rating || "strong") + "★ with " + compactCount(place.reviews) + " reviews, ranked on evidence rather than hype.");

  return (
    <li style={{ listStyle: "none", marginBottom: 14 }}>
      <article data-iconic-place-card style={{ overflow: "hidden", background: "linear-gradient(145deg,#151E2D,#0D1420)", border: "1px solid rgba(232,201,122,.32)", borderRadius: 20, boxShadow: "0 16px 40px rgba(0,0,0,.22)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "clamp(104px,29vw,150px) minmax(0,1fr)", minWidth: 0 }}>
          <a href={href} aria-label={"Open " + place.name} style={{ position: "relative", minHeight: 228, background: "linear-gradient(145deg,#263145,#121927)" }}>
            {photoUrl(place) ? <img src={photoUrl(place)} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            <span aria-label={"Rank " + rank} style={{ position: "absolute", top: 14, left: 14, width: 48, height: 48, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(4,8,16,.86)", border: "1px solid rgba(255,255,255,.15)", color: C.text, fontSize: 21, fontWeight: 900, boxShadow: "0 8px 20px rgba(0,0,0,.28)" }}>{rank}</span>
          </a>
          <div style={{ minWidth: 0, padding: "18px 16px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.gold, fontSize: 10.5, fontWeight: 900, letterSpacing: "1.8px", textTransform: "uppercase", overflowWrap: "anywhere" }}>— {category}</div>
                <h2 style={{ fontSize: "clamp(18px,5vw,25px)", lineHeight: 1.08, margin: "7px 0 0", overflowWrap: "anywhere" }}><a href={href} style={{ color: C.text, textDecoration: "none" }}>{place.name}</a></h2>
              </div>
              <WayfindScoreBadge score={score} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 8px", color: C.light, fontSize: 12.5, lineHeight: 1.45, marginTop: 13 }}>
              {facts.map((fact, i) => <span key={fact} style={{ color: fact === "Open" ? C.green : fact === "Closed" ? "#FB7185" : C.light }}>{i ? "· " : ""}{fact}</span>)}
            </div>

            {award ? <div style={{ display: "inline-flex", marginTop: 13, padding: "7px 12px", borderRadius: 999, border: "1px solid rgba(232,201,122,.55)", color: C.gold, fontSize: 10.5, fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase" }}>🏆 {award}</div> : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {intentLabel ? <span style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(249,115,22,.48)", color: "#F7C79E", fontSize: 11.5, fontWeight: 750 }}>{intentLabel}</span> : null}
              {badge || null}
            </div>

            <p style={{ borderLeft: "3px solid " + C.accent, color: C.light, fontSize: 12.5, lineHeight: 1.45, margin: "13px 0 0", paddingLeft: 10, overflowWrap: "anywhere" }}>{take}</p>
            {rankingNote ? <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.4, margin: "7px 0 0" }}>{rankingNote}</p> : null}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, borderTop: "1px solid " + C.border, padding: "10px 12px", background: "rgba(4,8,16,.28)" }}>
          <a href={href} style={{ display: "grid", placeItems: "center", minHeight: 40, borderRadius: 12, border: "1px solid " + C.border, color: C.text, fontSize: 12.5, fontWeight: 850, textDecoration: "none" }}>View place</a>
          <button type="button" aria-label={"Share " + place.name} onClick={() => onShare && onShare(place)} style={{ minWidth: 80, minHeight: 40, borderRadius: 12, border: "1px solid " + C.border, background: "transparent", color: C.text, fontSize: 12.5, fontWeight: 850, cursor: "pointer" }}>↗ Share</button>
        </div>
      </article>
    </li>
  );
}
