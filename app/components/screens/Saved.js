"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only; the
// three original sibling branches (root, system folder, custom list) keep
// their exact conditions.
import { useEffect, useState } from "react";
import { C } from "../kit";
import { supabase } from "../../../lib/supabase";
import { fetchSavedItems, removeSavedItem } from "../../../lib/savedItems";
// v6.56: the SAME read model the taste sheet renders its chips from, so the
// "N things learned" count can never disagree with the list it counts.
import { tasteChips } from "../../../lib/taste";

export default function SavedScreen({ ctx }) {
  const { activeList, setActiveList, sysFolder, setSysFolder, setNewListOpen, user, setAuthOpen, signOutUser, lists, setListMenu, likedItems, dislikedItems, sharedItems, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, openExperience, openCuisine, shareList, deleteList, rollDice, PlaceCard, requireAuth, personalize, setConsent, setTasteOpen, tasteVecState, logEvent } = ctx;
  // Saved experiences & deals (wf_saved_items) — separate from the place lists
  // above (saved_places). Loads for the signed-in user; empty when signed out.
  const [savedItems, setSavedItems] = useState([]);
  useEffect(() => {
    let dead = false;
    if (!user) { setSavedItems([]); return; }
    fetchSavedItems(user.id).then((rows) => { if (!dead) setSavedItems(rows); });
    return () => { dead = true; };
  }, [user]);
  const removeItem = async (it) => {
    if (!user) return;
    setSavedItems((prev) => prev.filter((x) => x.id !== it.id));
    try { await removeSavedItem(user.id, it.item_type, it.item_id); } catch (e) {}
  };
  return (
    <>
        {!activeList && !sysFolder && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingTop: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Saved</div>
              <button onClick={() => { if (!requireAuth("Sign up free to build a list and open it from any device.")) return; setNewListOpen(true); }} style={{ background: C.adim, border: `1px solid ${C.border}`, color: C.light, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 20, cursor: "pointer" }}>+ New list</button>
            </div>
            {supabase && !user && (
              <div onClick={() => setAuthOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: 16, cursor: "pointer" }}>
                <span style={{ fontSize: 17 }}>☁️</span>
                <div style={{ flex: 1, fontSize: 12.5, color: C.light, lineHeight: 1.35 }}>Sign up free — your lists, saved and synced to every device.</div>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: C.light, whiteSpace: "nowrap" }}>Sign in ›</span>
              </div>
            )}
            {supabase && user && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Signed in as {user.email}</div>
                <span onClick={signOutUser} style={{ fontSize: 13, fontWeight: 700, color: C.light, cursor: "pointer" }}>Sign out</span>
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
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.adim, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{f.emoji}</div>
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
            {user && savedItems.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase", marginTop: 18, marginBottom: 8 }}>Saved experiences & deals</div>
                {savedItems.map((it) => (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                    <a href={it.item_url || "#"} target="_blank" rel="noopener sponsored" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none" }}>
                      <div style={{ width: 54, height: 54, borderRadius: 10, flexShrink: 0, background: it.item_image ? `center/cover no-repeat url(${it.item_image})` : C.adim }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.item_title}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>{it.item_type === "deal" ? "Deal" : "Experience"}{it.provider ? " · via " + (it.provider === "undercover_tourist" ? "Undercover Tourist" : it.provider === "viator" ? "Viator" : it.provider) : ""}</div>
                      </div>
                    </a>
                    <button onClick={() => removeItem(it)} aria-label={"Remove " + it.item_title} style={{ flexShrink: 0, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, borderRadius: 999, width: 30, height: 30, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </>
            )}
            {/* v6.56 (owner: "remove the item on image 2 ... put the
                personalization under the favorites ... not in their face at the
                main page that is too much and it messes with the flow ... also
                still looks bulky", then: "make the personalization only
                available after the user signs in").
                This is the whole personalization surface now. It used to be
                three separate blocks at the top of the home feed — a consent
                ask, an "on" status strip and an "off" status strip — which is a
                setting interrupting the thing it configures on every load. It
                is built as ONE of this file's standard rows (48px circle,
                title, subtitle, right-hand control) so it reads as a setting.
                SIGNED IN ONLY, by explicit instruction. That is a real
                constraint, not a display rule: the re-ranking itself is gated
                on `user` in home.js. A control a person cannot reach is the
                same as no control, so if the switch is behind sign-in then the
                behaviour it switches must be too — otherwise a signed-out
                visitor would have a silently re-ranked feed and nowhere to
                turn it off. `user &&` rather than relying on the surrounding
                AuthWall: the wall waits for authReady, this must not flash. */}
            {user && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase", marginTop: 18, marginBottom: 2 }}>Personalization</div>
                {(() => {
                  const on = personalize === "on";
                  const learned = on ? tasteChips(tasteVecState || {}).length : 0;
                  const sub = on
                    ? (learned ? `On · ${learned} thing${learned === 1 ? "" : "s"} learned` : "On · nothing learned yet")
                    : "Off · same feed for everyone";
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div onClick={on ? () => setTasteOpen(true) : undefined} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0, cursor: on ? "pointer" : "default" }}>
                          <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.adim, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: on ? C.gold : C.muted, flexShrink: 0 }} aria-hidden="true">✦</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Your taste</div>
                            {/* Deliberately NOT truncated: this subtitle IS the
                                disclosure — the one place that states whether the
                                feed is being re-ranked — so it must never be able
                                to end in an ellipsis on a narrow screen or at a
                                large text size. It wraps instead. */}
                            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.35 }}>{sub}</div>
                          </div>
                        </div>
                        {on ? (
                          <button onClick={() => setTasteOpen(true)} aria-label="Manage your taste" style={{ flexShrink: 0, background: C.adim, border: `1px solid ${C.border}`, color: C.light, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 20, cursor: "pointer" }}>Manage</button>
                        ) : (
                          <button onClick={() => { setConsent("on"); try { logEvent("taste_consent", null, { v: "on", from: "saved" }); } catch (e) {} }} aria-label="Turn on personalization" style={{ flexShrink: 0, background: C.adim, border: `1px solid ${C.border}`, color: C.light, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 20, cursor: "pointer" }}>Turn on</button>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, margin: "10px 0 0" }}>
                        {on
                          ? "Your feed is ordered to match what you like, save and share. It never changes a place's Wayfind Score — only the order you see them in. Open it to remove anything, or turn it off."
                          : "Turn this on and your feed gets ordered to match what you like, save and share. It never changes a place's Wayfind Score — only the order you see them in, and you can turn it off or erase it anytime."}
                      </p>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}
        {sysFolder && (() => {
          const cfg = { liked: { name: "Liked", emoji: "\uD83D\uDC4D", items: likedItems, empty: "Like a place and it lands here \u2014 sign up free to keep your taste on every device." }, disliked: { name: "Disliked", emoji: "\uD83D\uDC4E", items: dislikedItems, empty: "Thumbs-down a place and it collects here \u2014 revisit or change your mind anytime." }, shared: { name: "Shared", emoji: "\uD83D\uDCE4", items: sharedItems, empty: "Every place you share gathers here \u2014 sign up free to keep them on every device." } }[sysFolder];
          if (!cfg) return null;
          const arr = Object.values(cfg.items || {}).filter((x) => x && x.place && x.place.id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
                <button onClick={() => setSysFolder(null)} style={{ background: "none", border: "none", color: C.light, fontSize: 22, cursor: "pointer" }}>‹</button>
                <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{cfg.emoji} {cfg.name}</div>
                <span style={{ fontSize: 13, color: C.muted }}>{arr.length} place{arr.length !== 1 ? "s" : ""}</span>
              </div>
              {supabase && !user && arr.length > 0 && (
                <div onClick={() => setAuthOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.adim, marginBottom: 14, cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>☁️</span>
                  <div style={{ flex: 1, fontSize: 12.5, color: C.light, lineHeight: 1.4 }}>Sign in to save these and sync them across your devices.</div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.light, whiteSpace: "nowrap" }}>Sign in ›</span>
                </div>
              )}
              {arr.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{cfg.empty}</div>
              ) : (
                arr.map(({ place: p }) => (
                  <PlaceCard key={p.id} p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
                ))
              )}
            </div>
          );
        })()}
        {activeList && lists[activeList] && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <button onClick={() => setActiveList(null)} style={{ background: "none", border: "none", color: C.light, fontSize: 22, cursor: "pointer" }}>‹</button>
              <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{lists[activeList].emoji} {lists[activeList].name}</div>
              {lists[activeList].places.length > 0 && (
                <button onClick={() => shareList(lists[activeList].places, lists[activeList].name)} style={{ background: C.adim, border: `1px solid ${C.border}`, color: C.light, fontSize: 13, fontWeight: 700, padding: "7px 12px", borderRadius: 20, cursor: "pointer" }}>Share ↗</button>
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
                  <button onClick={rollDice} style={{ width: "100%", marginBottom: 14, padding: "12px 0", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.adim, color: C.light, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                )}
                {lists[activeList].places.map((p) => (
                  <PlaceCard key={p.id} p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
                ))}
              </>
            )}
          </div>
        )}
    </>
  );
}
