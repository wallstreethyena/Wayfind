"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only; the
// three original sibling branches (root, system folder, custom list) keep
// their exact conditions.
import { C } from "../kit";
import { supabase } from "../../../lib/supabase";

export default function SavedScreen({ ctx }) {
  const { activeList, setActiveList, sysFolder, setSysFolder, setNewListOpen, user, setAuthOpen, signOutUser, lists, setListMenu, likedItems, dislikedItems, sharedItems, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, openExperience, openCuisine, shareList, deleteList, rollDice, PlaceCard, requireAuth } = ctx;
  return (
    <>
        {!activeList && !sysFolder && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingTop: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Saved</div>
              <button onClick={() => { if (!requireAuth("Sign in to create lists")) return; setNewListOpen(true); }} style={{ background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 20, cursor: "pointer" }}>+ New list</button>
            </div>
            {supabase && !user && (
              <div onClick={() => setAuthOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: 16, cursor: "pointer" }}>
                <span style={{ fontSize: 17 }}>☁️</span>
                <div style={{ flex: 1, fontSize: 12.5, color: C.light, lineHeight: 1.35 }}>Sign in to save your lists across devices.</div>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: C.accent, whiteSpace: "nowrap" }}>Sign in ›</span>
              </div>
            )}
            {supabase && user && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Signed in as {user.email}</div>
                <span onClick={signOutUser} style={{ fontSize: 13, fontWeight: 700, color: C.accent, cursor: "pointer" }}>Sign out</span>
              </div>
            )}
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase", marginBottom: 2 }}>Your lists</div>
            {Object.values(lists).map((l) => {
              const row = (
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div onClick={() => setActiveList(l.id)} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0, cursor: "pointer" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: `1px solid ${C.border}`, flexShrink: 0 }}>{l.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                      <div style={{ fontSize: 13, color: C.muted }}>{l.places.length} place{l.places.length !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setListMenu(l.id); }} aria-label="List options" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", color: C.muted, fontSize: 22, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⋯</button>
                </div>
              );
              // v4.6: render every list as a plain tap-to-open row, like Favorites (which always opened).
              // The swipe-to-delete wrapper put touch handlers and a transform around the row, which
              // swallowed taps on iOS so the list would not open. Delete is unaffected: it still lives in
              // the row "..." menu (Open / Share / Rename / Delete) and the trash button inside the open list.
              return <div key={l.id}>{row}</div>;
            })}
            {(
              <>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase", marginTop: 18, marginBottom: 2 }}>From your activity</div>
                {[{ k: "liked", name: "Liked", emoji: "\uD83D\uDC4D", items: likedItems }, { k: "disliked", name: "Disliked", emoji: "\uD83D\uDC4E", items: dislikedItems }, { k: "shared", name: "Shared", emoji: "\uD83D\uDCE4", items: sharedItems }].map((f) => {
                  const cnt = Object.keys(f.items || {}).length;
                  return (
                    <div key={f.k} onClick={() => setSysFolder(f.k)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.adim, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{f.emoji}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{f.name}</div>
                        <div style={{ fontSize: 13, color: C.muted }}>{cnt} place{cnt !== 1 ? "s" : ""} · automatic</div>
                      </div>
                      <span style={{ color: C.muted, fontSize: 20 }}>›</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
        {sysFolder && (() => {
          const cfg = { liked: { name: "Liked", emoji: "\uD83D\uDC4D", items: likedItems, empty: "Tap the thumbs up on any place and it lands here, newest first." }, disliked: { name: "Disliked", emoji: "\uD83D\uDC4E", items: dislikedItems, empty: "Places you thumbs down collect here, so you can revisit them or change your mind." }, shared: { name: "Shared", emoji: "\uD83D\uDCE4", items: sharedItems, empty: "Anything you share gets gathered here automatically." } }[sysFolder];
          if (!cfg) return null;
          const arr = Object.values(cfg.items || {}).filter((x) => x && x.place && x.place.id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
                <button onClick={() => setSysFolder(null)} style={{ background: "none", border: "none", color: C.accent, fontSize: 22, cursor: "pointer" }}>‹</button>
                <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{cfg.emoji} {cfg.name}</div>
                <span style={{ fontSize: 13, color: C.muted }}>{arr.length} place{arr.length !== 1 ? "s" : ""}</span>
              </div>
              {supabase && !user && arr.length > 0 && (
                <div onClick={() => setAuthOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12, border: `1px solid ${C.accent}`, background: C.adim, marginBottom: 14, cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>☁️</span>
                  <div style={{ flex: 1, fontSize: 12.5, color: C.light, lineHeight: 1.4 }}>These live only on this phone. Sign in to save them.</div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, whiteSpace: "nowrap" }}>Sign in ›</span>
                </div>
              )}
              {arr.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{cfg.empty}</div>
              ) : (
                arr.map(({ place: p }) => (
                  <PlaceCard key={p.id} p={p} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
                ))
              )}
            </div>
          );
        })()}
        {activeList && lists[activeList] && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <button onClick={() => setActiveList(null)} style={{ background: "none", border: "none", color: C.accent, fontSize: 22, cursor: "pointer" }}>‹</button>
              <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{lists[activeList].emoji} {lists[activeList].name}</div>
              {lists[activeList].places.length > 0 && (
                <button onClick={() => shareList(lists[activeList].places, lists[activeList].name)} style={{ background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 13, fontWeight: 700, padding: "7px 12px", borderRadius: 20, cursor: "pointer" }}>Share ↗</button>
              )}
              {activeList !== "favorites" && (
                <button onClick={() => deleteList(activeList)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.red, fontSize: 16, width: 34, height: 34, borderRadius: 10, cursor: "pointer" }}>🗑</button>
              )}
            </div>
            {lists[activeList].places.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: C.muted }}>Tap the bookmark on any place to save it here.</div>
            ) : (
              <>
                {lists[activeList].places.length > 1 && (
                  <button onClick={rollDice} style={{ width: "100%", marginBottom: 14, padding: "12px 0", borderRadius: 12, border: `1.5px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                )}
                {lists[activeList].places.map((p) => (
                  <PlaceCard key={p.id} p={p} saved liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
                ))}
              </>
            )}
          </div>
        )}
    </>
  );
}
