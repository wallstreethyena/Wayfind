"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only; the
// three original sibling branches (root, system folder, custom list) keep
// their exact conditions.
import { useEffect, useState } from "react";
import { C, Icon } from "../kit";
import { supabase } from "../../../lib/supabase";
import { fetchSavedItems, removeSavedItem } from "../../../lib/savedItems";

const SAVED_CSS = `
.wf-saved-shell{padding:4px 0 28px}
.wf-saved-hero{
  position:relative;
  isolation:isolate;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:end;
  gap:24px;
  min-height:178px;
  padding:30px 32px;
  overflow:hidden;
  border:1px solid rgba(249,115,22,.26);
  border-radius:24px;
  background:
    radial-gradient(circle at 86% 5%,rgba(249,115,22,.22),transparent 28%),
    radial-gradient(circle at 8% 118%,rgba(56,189,248,.10),transparent 36%),
    linear-gradient(135deg,#151D2A 0%,#0C131E 58%,#080D15 100%);
  box-shadow:0 24px 64px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.06);
}
.wf-saved-hero:before{
  content:"";
  position:absolute;
  z-index:-1;
  top:-96px;
  right:96px;
  width:240px;
  height:240px;
  border:1px solid rgba(249,115,22,.15);
  border-radius:50%;
  box-shadow:0 0 0 34px rgba(249,115,22,.025),0 0 0 72px rgba(249,115,22,.018);
}
.wf-saved-eyebrow,.wf-saved-section-kicker{
  display:flex;
  align-items:center;
  gap:9px;
  color:#FF9A50;
  font-size:10px;
  font-weight:900;
  letter-spacing:.18em;
  line-height:1;
  text-transform:uppercase;
}
.wf-saved-eyebrow:before,.wf-saved-section-kicker:before{content:"";width:24px;height:1px;background:currentColor}
.wf-saved-hero h1{
  max-width:680px;
  margin:15px 0 8px;
  color:#F8F4EC;
  font-family:Georgia,"Times New Roman",serif;
  font-size:clamp(32px,4vw,48px);
  font-weight:500;
  letter-spacing:-.035em;
  line-height:1.02;
}
.wf-saved-hero-copy{max-width:620px;margin:0;color:#AEBBCE;font-size:14px;line-height:1.55}
.wf-saved-stats{display:flex;gap:9px;margin-top:18px;flex-wrap:wrap}
.wf-saved-stat{
  display:inline-flex;
  align-items:center;
  min-height:28px;
  padding:0 10px;
  border:1px solid rgba(148,163,184,.18);
  border-radius:999px;
  background:rgba(5,9,15,.45);
  color:#CBD5E1;
  font-size:11px;
  font-weight:750;
}
.wf-saved-new{
  position:relative;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:9px;
  min-width:150px;
  min-height:48px;
  padding:0 18px;
  border:1px solid #FF8A35;
  border-radius:999px;
  background:linear-gradient(135deg,#FF8A35,#F35E0A);
  color:#0B0D11;
  font-size:13px;
  font-weight:900;
  box-shadow:0 12px 30px rgba(249,115,22,.23),inset 0 1px rgba(255,255,255,.36);
  cursor:pointer;
}
.wf-saved-new svg{transition:transform .18s ease}
.wf-saved-new:hover svg{transform:rotate(90deg)}
.wf-saved-account{
  display:flex;
  width:100%;
  box-sizing:border-box;
  align-items:center;
  gap:12px;
  min-height:48px;
  margin:14px 0 30px;
  padding:0 14px;
  border:1px solid rgba(148,163,184,.16);
  border-radius:14px;
  background:rgba(22,29,41,.68);
  color:#94A3B8;
  font-family:inherit;
  text-align:left;
  backdrop-filter:blur(12px);
}
.wf-saved-account-icon{
  display:grid;
  width:28px;
  height:28px;
  flex:0 0 28px;
  place-items:center;
  border:1px solid rgba(34,197,94,.35);
  border-radius:50%;
  background:rgba(34,197,94,.08);
  color:#4ADE80;
}
.wf-saved-account-copy{min-width:0;flex:1}
.wf-saved-account-copy strong{display:block;color:#DDE5EF;font-size:12px}
.wf-saved-account-copy span{display:block;overflow:hidden;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.wf-saved-account-action{
  min-width:44px;
  min-height:44px;
  padding:0 8px;
  border:0;
  background:transparent;
  color:#AEBBCE;
  font-size:12px;
  font-weight:800;
  cursor:pointer;
}
.wf-saved-section{margin-top:28px}
.wf-saved-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:13px}
.wf-saved-section-head h2{margin:8px 0 0;color:#F1F5F9;font-size:20px;letter-spacing:-.02em}
.wf-saved-section-head>span{color:#6F7E92;font-size:11px}
.wf-saved-list-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.wf-saved-list-card{
  position:relative;
  display:flex;
  min-width:0;
  min-height:126px;
  overflow:hidden;
  border:1px solid rgba(148,163,184,.18);
  border-radius:18px;
  background:linear-gradient(145deg,rgba(26,35,49,.96),rgba(14,21,31,.96));
  box-shadow:0 12px 30px rgba(0,0,0,.22),inset 0 1px rgba(255,255,255,.045);
  transition:border-color .18s ease,transform .18s ease,box-shadow .18s ease;
}
.wf-saved-list-card:hover{transform:translateY(-2px);border-color:rgba(249,115,22,.42);box-shadow:0 18px 38px rgba(0,0,0,.3)}
.wf-saved-list-open{
  display:flex;
  align-items:stretch;
  min-width:0;
  flex:1;
  padding:0;
  border:0;
  background:transparent;
  color:inherit;
  text-align:left;
  cursor:pointer;
}
.wf-saved-list-preview{
  position:relative;
  display:grid;
  width:112px;
  flex:0 0 112px;
  place-items:center;
  overflow:hidden;
  background:
    radial-gradient(circle at 28% 25%,rgba(255,154,80,.28),transparent 32%),
    linear-gradient(145deg,#3A2318,#171D28 68%);
  background-position:center;
  background-size:cover;
}
.wf-saved-list-preview:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 45%,rgba(14,21,31,.88))}
.wf-saved-list-preview span{position:relative;z-index:1;font-size:30px;filter:drop-shadow(0 5px 12px rgba(0,0,0,.45))}
.wf-saved-list-body{display:flex;min-width:0;flex:1;flex-direction:column;justify-content:center;padding:20px 46px 20px 18px}
.wf-saved-list-label{margin-bottom:7px;color:#FF9A50;font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
.wf-saved-list-name{overflow:hidden;color:#F7F3EC;font-family:Georgia,"Times New Roman",serif;font-size:22px;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}
.wf-saved-list-meta{margin-top:8px;color:#8998AC;font-size:12px}
.wf-saved-list-menu{
  position:absolute;
  z-index:2;
  top:10px;
  right:10px;
  display:grid;
  width:38px;
  height:38px;
  place-items:center;
  border:1px solid rgba(148,163,184,.16);
  border-radius:50%;
  background:rgba(5,9,15,.42);
  color:#AEBBCE;
  font-size:20px;
  cursor:pointer;
}
.wf-saved-activity-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.wf-saved-activity-card{
  display:flex;
  min-width:0;
  min-height:126px;
  align-items:center;
  gap:14px;
  padding:18px;
  border:1px solid rgba(148,163,184,.16);
  border-radius:18px;
  background:
    radial-gradient(circle at 0% 100%,var(--activity-dim),transparent 44%),
    linear-gradient(145deg,rgba(23,31,44,.94),rgba(12,18,27,.96));
  color:#F1F5F9;
  text-align:left;
  box-shadow:inset 0 1px rgba(255,255,255,.04);
  cursor:pointer;
  transition:border-color .18s ease,transform .18s ease;
}
.wf-saved-activity-card:hover{transform:translateY(-2px);border-color:var(--activity)}
.wf-saved-activity-icon{
  display:grid;
  width:46px;
  height:46px;
  flex:0 0 46px;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--activity) 55%,transparent);
  border-radius:14px;
  background:var(--activity-dim);
  color:var(--activity);
}
.wf-saved-activity-content{min-width:0;flex:1}
.wf-saved-activity-content strong{display:block;font-size:15px}
.wf-saved-activity-content span{display:block;margin-top:4px;color:#8E9DB1;font-size:11px;line-height:1.35}
.wf-saved-activity-count{display:inline-flex!important;width:max-content;margin-top:10px!important;color:var(--activity)!important;font-size:10px!important;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
.wf-saved-arrow{color:#65758A}
.wf-saved-items-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.wf-saved-item{
  display:flex;
  min-width:0;
  align-items:center;
  gap:12px;
  padding:10px;
  border:1px solid rgba(148,163,184,.16);
  border-radius:15px;
  background:rgba(19,27,39,.82);
}
.wf-saved-item>a{display:flex;min-width:0;flex:1;align-items:center;gap:12px;text-decoration:none}
.wf-saved-item-image{width:56px;height:56px;flex:0 0 56px;border-radius:11px;background-color:rgba(148,163,184,.1);background-position:center;background-size:cover}
.wf-saved-item-title{overflow:hidden;color:#F1F5F9;font-size:13px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}
.wf-saved-item-meta{margin-top:4px;color:#8695A9;font-size:11px}
.wf-saved-item-remove{width:34px;height:34px;flex:0 0 34px;border:1px solid rgba(148,163,184,.16);border-radius:50%;background:transparent;color:#8998AC;cursor:pointer}
.wf-saved-detail-head{
  display:flex;
  align-items:center;
  gap:12px;
  margin:4px 0 18px;
  padding:16px 18px;
  border:1px solid rgba(148,163,184,.17);
  border-radius:18px;
  background:linear-gradient(145deg,rgba(27,36,50,.94),rgba(13,19,29,.96));
}
.wf-saved-detail-back{display:grid;width:44px;height:44px;place-items:center;border:1px solid rgba(148,163,184,.18);border-radius:50%;background:rgba(5,9,15,.35);color:#D7E0EA;font-size:22px;cursor:pointer}
.wf-saved-detail-title{min-width:0;flex:1;color:#F8F4EC;font-family:Georgia,"Times New Roman",serif;font-size:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-saved-detail-count{color:#8190A4;font-size:11px}
@media(max-width:760px){
  .wf-saved-hero{grid-template-columns:1fr;align-items:start;min-height:0;padding:24px 20px}
  .wf-saved-hero:before{right:-70px}
  .wf-saved-hero h1{font-size:34px}
  .wf-saved-new{width:100%}
  .wf-saved-list-grid,.wf-saved-items-grid{grid-template-columns:1fr}
  .wf-saved-activity-grid{grid-template-columns:1fr}
  .wf-saved-activity-card{min-height:92px}
}
@media(max-width:420px){
  .wf-saved-list-preview{width:92px;flex-basis:92px}
  .wf-saved-list-body{padding-left:14px}
  .wf-saved-account{padding-left:10px}
}
@media(prefers-reduced-motion:reduce){
  .wf-saved-list-card,.wf-saved-activity-card,.wf-saved-new svg{transition:none}
}
`;

function SavedGlyph({ kind }) {
  if (kind === "liked") return <Icon name="heart" size={21} strokeWidth={1.9} />;
  if (kind === "shared") return <Icon name="share" size={21} strokeWidth={1.9} />;
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 11v9" /><path d="M3.8 20H7" /><path d="M7 11l4.6-7a2 2 0 0 1 3.7 1.4L14.5 9H19a2 2 0 0 1 1.95 2.45l-1.45 6.2A3 3 0 0 1 16.58 20H7" />
    </svg>
  );
}

export default function SavedScreen({ ctx }) {
  const { activeList, setActiveList, sysFolder, setSysFolder, setNewListOpen, user, setAuthOpen, signOutUser, lists, setListMenu, likedItems, dislikedItems, sharedItems, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, openExperience, openCuisine, shareList, deleteList, rollDice, PlaceCard, requireAuth } = ctx;
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
  const listValues = Object.values(lists || {});
  const listPlaceCount = listValues.reduce((sum, list) => sum + ((list && list.places && list.places.length) || 0), 0);
  const activityFolders = [
    { k: "liked", name: "Liked", items: likedItems, color: "#F97316", dim: "rgba(249,115,22,.11)", note: "Shapes your recommendations" },
    { k: "disliked", name: "Passed on", items: dislikedItems, color: "#A78BFA", dim: "rgba(167,139,250,.10)", note: "Helps Wayfind avoid misses" },
    { k: "shared", name: "Shared", items: sharedItems, color: "#38BDF8", dim: "rgba(56,189,248,.10)", note: "Places you sent to someone" },
  ];
  const activityTotal = activityFolders.reduce((sum, folder) => sum + Object.keys(folder.items || {}).length, 0);
  return (
    <>
        <style dangerouslySetInnerHTML={{ __html: SAVED_CSS }} />
        {!activeList && !sysFolder && (
          <div className="wf-saved-shell">
            <section className="wf-saved-hero">
              <div>
                <div className="wf-saved-eyebrow">Your Wayfind</div>
                <h1>Keep the places worth remembering.</h1>
                <p className="wf-saved-hero-copy">Your shortlists, reactions, and shared finds—organized into one private collection that gets smarter every time you use it.</p>
                <div className="wf-saved-stats">
                  <span className="wf-saved-stat">{listValues.length} personal list{listValues.length === 1 ? "" : "s"}</span>
                  <span className="wf-saved-stat">{listPlaceCount} saved place{listPlaceCount === 1 ? "" : "s"}</span>
                  <span className="wf-saved-stat">{activityTotal} remembered action{activityTotal === 1 ? "" : "s"}</span>
                </div>
              </div>
              <button className="wf-saved-new" onClick={() => { if (!requireAuth("Sign up free to build a list and open it from any device.")) return; setNewListOpen(true); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Create a list
              </button>
            </section>
            {supabase && !user && (
              <button className="wf-saved-account" onClick={() => setAuthOpen(true)}>
                <span className="wf-saved-account-icon"><Icon name="cloudrain" size={15} strokeWidth={1.8} /></span>
                <div className="wf-saved-account-copy"><strong>Keep this collection with you</strong><span>Sign in to sync every list across your devices.</span></div>
                <span className="wf-saved-account-action">Sign in →</span>
              </button>
            )}
            {supabase && user && (
              <div className="wf-saved-account">
                <span className="wf-saved-account-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                </span>
                <div className="wf-saved-account-copy"><strong>Private &amp; synced</strong><span>Signed in as {user.email}</span></div>
                <button className="wf-saved-account-action" onClick={signOutUser}>Sign out</button>
              </div>
            )}

            <section className="wf-saved-section">
              <div className="wf-saved-section-head">
                <div><div className="wf-saved-section-kicker">Your collections</div><h2>Plans you can come back to</h2></div>
                <span>Private unless you share them</span>
              </div>
              <div className="wf-saved-list-grid">
                {listValues.map((l) => {
                  const cover = (l.places || []).find((place) => place && place.photo);
                  return (
                    <div className="wf-saved-list-card" key={l.id}>
                      <button className="wf-saved-list-open" onClick={() => setActiveList(l.id)}>
                        <div className="wf-saved-list-preview" style={cover ? { backgroundImage: `linear-gradient(90deg,transparent 42%,rgba(14,21,31,.9)),url("${cover.photo}")` } : undefined}><span>{l.emoji}</span></div>
                        <div className="wf-saved-list-body">
                          <span className="wf-saved-list-label">Personal list</span>
                          <span className="wf-saved-list-name">{l.name}</span>
                          <span className="wf-saved-list-meta">{l.places.length} place{l.places.length !== 1 ? "s" : ""} · ready when you are</span>
                        </div>
                      </button>
                      <button className="wf-saved-list-menu" onClick={(e) => { e.stopPropagation(); setListMenu(l.id); }} aria-label={"Options for " + l.name}>⋯</button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="wf-saved-section">
              <div className="wf-saved-section-head">
                <div><div className="wf-saved-section-kicker">From your activity</div><h2>Your taste, remembered</h2></div>
                <span>Automatic and private</span>
              </div>
              <div className="wf-saved-activity-grid">
                {activityFolders.map((f) => {
                  const cnt = Object.keys(f.items || {}).length;
                  return (
                    <button className="wf-saved-activity-card" key={f.k} onClick={() => setSysFolder(f.k)} style={{ "--activity": f.color, "--activity-dim": f.dim }}>
                      <span className="wf-saved-activity-icon"><SavedGlyph kind={f.k} /></span>
                      <span className="wf-saved-activity-content">
                        <strong>{f.name}</strong>
                        <span>{f.note}</span>
                        <span className="wf-saved-activity-count">{cnt} place{cnt !== 1 ? "s" : ""}</span>
                      </span>
                      <span className="wf-saved-arrow">›</span>
                    </button>
                  );
                })}
              </div>
            </section>
            {user && savedItems.length > 0 && (
              <section className="wf-saved-section">
                <div className="wf-saved-section-head">
                  <div><div className="wf-saved-section-kicker">Saved experiences &amp; deals</div><h2>Ready to book</h2></div>
                </div>
                <div className="wf-saved-items-grid">
                  {savedItems.map((it) => (
                    <div className="wf-saved-item" key={it.id}>
                      <a href={it.item_url || "#"} target="_blank" rel="noopener sponsored">
                        <div className="wf-saved-item-image" style={it.item_image ? { backgroundImage: `url("${it.item_image}")` } : undefined} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="wf-saved-item-title">{it.item_title}</div>
                          <div className="wf-saved-item-meta">{it.item_type === "deal" ? "Deal" : "Experience"}{it.provider ? " · via " + (it.provider === "undercover_tourist" ? "Undercover Tourist" : it.provider === "viator" ? "Viator" : it.provider) : ""}</div>
                        </div>
                      </a>
                      <button className="wf-saved-item-remove" onClick={() => removeItem(it)} aria-label={"Remove " + it.item_title}>✕</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
        {sysFolder && (() => {
          const cfg = { liked: { name: "Liked", kind: "liked", items: likedItems, empty: "Like a place and it lands here \u2014 sign up free to keep your taste on every device." }, disliked: { name: "Passed on", kind: "disliked", items: dislikedItems, empty: "Thumbs-down a place and it collects here \u2014 revisit or change your mind anytime." }, shared: { name: "Shared", kind: "shared", items: sharedItems, empty: "Every place you share gathers here \u2014 sign up free to keep them on every device." } }[sysFolder];
          if (!cfg) return null;
          const arr = Object.values(cfg.items || {}).filter((x) => x && x.place && x.place.id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
          return (
            <div>
              <div className="wf-saved-detail-head">
                <button className="wf-saved-detail-back" onClick={() => setSysFolder(null)} aria-label="Back to saved collections">‹</button>
                <span className="wf-saved-activity-icon" style={{ "--activity": sysFolder === "liked" ? "#F97316" : sysFolder === "shared" ? "#38BDF8" : "#A78BFA", "--activity-dim": sysFolder === "liked" ? "rgba(249,115,22,.11)" : sysFolder === "shared" ? "rgba(56,189,248,.10)" : "rgba(167,139,250,.10)" }}><SavedGlyph kind={cfg.kind} /></span>
                <div className="wf-saved-detail-title">{cfg.name}</div>
                <span className="wf-saved-detail-count">{arr.length} place{arr.length !== 1 ? "s" : ""}</span>
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
            <div className="wf-saved-detail-head">
              <button className="wf-saved-detail-back" onClick={() => setActiveList(null)} aria-label="Back to saved collections">‹</button>
              <span style={{ fontSize: 24 }}>{lists[activeList].emoji}</span>
              <div className="wf-saved-detail-title">{lists[activeList].name}</div>
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
