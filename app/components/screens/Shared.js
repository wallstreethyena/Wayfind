"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only.
// home.js only renders this when screen === "shared" && sharedList.
import { C } from "../kit";

export default function SharedScreen({ ctx }) {
  const { sharedList, setSharedList, setScreen, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, openExperience, openCuisine, PlaceCard } = ctx;
  return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>📩 Shared with you</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sharedList.length} place{sharedList.length !== 1 ? "s" : ""} someone wanted you to see</div>
              </div>
              <button onClick={() => { setSharedList(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
            </div>
            {sharedList.map((p) => (
              <PlaceCard key={p.id} p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
            ))}
          </div>
  );
}
