"use client";
// v6.93 — the "Social Media Find" bookshelf sheet (owner: "these tiktok are
// great but it should open up it's own sheet... dont call it the tik tok
// find call it social media find"). Opened from a videoHeroPlaces card in
// the home hero rail (see home.js) instead of the regular place Detail
// sheet. Two modes, both driven by ctx.socialFind:
//   { place, video } — a specific creator-video find: the creator "profile"
//     (a real avatar photo when /api/creator-avatar can resolve one — see
//     CreatorAvatar below — falling back to an initials circle otherwise;
//     the PLACE's own photo, never the creator's video thumbnail, still
//     follows CREATOR_VIDEO_SPEC.md's never-re-host rule), a link out to
//     their real video, how many other spots they're featured at, a strip
//     of other nearby finds, and a way back into the place's own full
//     Detail sheet.
//   { place: null } — "not in your region yet": the honest empty state,
//     listing every metro the curated library currently covers.
// Same bottom-sheet chrome as sheets/Detail.js (sheetBg/sheet/Grabber/
// history-back-to-close via ctx.sheetDragStart et al, wired in home.js the
// same way DetailSheet is).
import { useState } from "react";
import { C, sheetBg, sheet, SHEET_EASE, Grabber, Icon } from "../kit";
import { PLATFORM, PLATFORM_RGB, creatorStats, allCreators } from "../../../lib/creatorVideos";

const closeBtnOverlay = { position: "absolute", top: "max(10px, env(safe-area-inset-top))", right: 12, zIndex: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.28)", background: "rgba(13,17,23,.55)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" };
const closeBtnPlain = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 15, fontWeight: 700, cursor: "pointer" };
// v6.93 (owner: "make it look premium, i want this a place where the
// influencer feels proud") — the same gradient-card language HookDetail.js
// already uses for its premium hero pages, reused here so a creator's card
// reads like a real feature, not a plain list row.
const premiumCardBg = "linear-gradient(145deg, rgba(27,36,51,.98) 0%, rgba(14,21,32,.99) 100%)";
const premiumCardBorder = "rgba(148,163,184,.22)";

// A real, working link to the creator's OWN profile — genuine, standard
// per-platform URL construction from their real handle, not a guess. Given
// only when the platform's URL scheme is actually handle-based (a Facebook
// share link carries no @handle to build one from).
function profileUrlFor(platform, handle) {
  if (!handle) return null;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  if (platform === "instagram") return `https://www.instagram.com/${handle}/`;
  if (platform === "youtube") return `https://www.youtube.com/@${handle}`;
  return null;
}

// Initials fallback — used as the BASE layer under every avatar (see
// CreatorAvatar) so there is never a blank/broken circle: the real photo, if
// it loads, simply covers this; if it fails (platform unsupported, TikTok
// blocked the fetch, etc.) this was already there and nothing visibly breaks.
function initials(handle) {
  const s = String(handle || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!s) return "★";
  return (s[0] + (s[1] || "")).toUpperCase();
}

// v6.93 (owner: "cindy selects has a profile pic why can we not include that
// instead of CS") — real photo via /api/creator-avatar (server-side scrape +
// cache of TikTok's profile page, proxied through our own origin — see that
// route's header for the full story and the accepted risk). Only TikTok is
// implemented; any other platform 404s immediately. The initials circle is
// always rendered first and the photo is layered on top only once it has
// actually loaded, so a failure is invisible — never a broken-image icon.
function CreatorAvatar({ handle, platform, size, color }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = handle && platform === "tiktok" ? `/api/creator-avatar?handle=${encodeURIComponent(handle)}&platform=tiktok` : null;
  return (
    <div aria-hidden="true" style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: "50%", overflow: "hidden", background: `linear-gradient(135deg, ${color} 0%, #0D1117 130%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.33), fontWeight: 900, color: "#fff" }}>
      {initials(handle)}
      {src && !failed && (
        <img
          src={src}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity 180ms ease" }}
        />
      )}
    </div>
  );
}

const seeAllBtn = { display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: C.accent, fontSize: 12.5, fontWeight: 800, cursor: "pointer" };

export default function SocialFindSheet({ ctx }) {
  const { socialFind, setSocialFind, videoHeroPlaces, socialFindRegions, sheetDragStart, sheetDragMove, sheetDragEnd, logEvent, openDetail, openExternal, locName } = ctx;
  if (!socialFind) return null;
  const close = () => window.history.back();

  // Mode C: "this shelf needs to have all of the influencers in our app easy
  // to see, all organized nicely, in one page" (owner) — the full directory,
  // every renderable curated find grouped by creator. A spot opens straight
  // into Mode A when it's already loaded nearby (matched by video.url — the
  // one field guaranteed unique per entry); otherwise it just links out to
  // the real video, since we don't have a real, hydrated place record (photo,
  // id, hours…) for a spot outside the user's current area to open a place
  // sheet with — never fabricate one.
  if (socialFind.library) {
    return (
      <LibrarySheet
        onClose={close}
        onDragStart={sheetDragStart}
        onDragMove={sheetDragMove}
        onDragEnd={sheetDragEnd}
        logEvent={logEvent}
        videoHeroPlaces={videoHeroPlaces}
        onOpenSpot={(spot) => {
          const local = (videoHeroPlaces || []).find((o) => o.video.url === spot.video.url);
          if (local) { setSocialFind({ place: local.place, video: local.video }); return; }
          try { logEvent("creator_video", null, { platform: spot.platform, creator: spot.video.creator || "", src: "social_find_library" }); } catch (e) {}
          openExternal(spot.video.url);
        }}
      />
    );
  }

  const { place, video } = socialFind;

  // Mode B: "not in your region yet" — recommend where the library IS live.
  if (!place) {
    return (
      <div style={sheetBg} onClick={close}>
        <div style={{ ...sheet, overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, close)} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
          <Grabber />
          <div style={{ padding: "4px 18px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="sparkles" size={13} color={PLATFORM.tiktok.color} />
                <span style={{ fontSize: 10.5, fontWeight: 900, color: PLATFORM.tiktok.color, textTransform: "uppercase", letterSpacing: "1.2px" }}>Social Media Find</span>
              </div>
              <button onClick={close} aria-label="Close" style={closeBtnPlain}>✕</button>
            </div>
            <div style={{ fontSize: 21, fontWeight: 850, color: C.text, lineHeight: 1.25, marginBottom: 8 }}>Not featured near you — yet</div>
            <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55, marginBottom: 18 }}>
              A find only shows up here when a real creator's real video is tied to a real place within 25 miles of you — nothing invented, nothing guessed. The library is small today and growing every week. Right now it's live in:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {(socialFindRegions || []).map((r) => (
                <div key={r.city} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{r.city}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>{r.count} spot{r.count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginBottom: 16 }}>Traveling to one of these areas? Search that city on Wayfind and these finds show up right in your Trending rail.</div>
            <button onClick={() => setSocialFind({ library: true })} style={seeAllBtn}>See every creator we've featured ›</button>
          </div>
        </div>
      </div>
    );
  }

  // Mode A: a specific creator-video find.
  const plat = PLATFORM[video.platform] || PLATFORM.tiktok;
  const glowRgb = PLATFORM_RGB[video.platform] || PLATFORM_RGB.tiktok;
  const photo = (place.photos && place.photos[0]) || place.photo || null;
  const handle = video.creator || null;
  const stats = creatorStats(handle);
  const otherSpots = stats.spots.filter((s) => s.name !== place.name);
  const others = (videoHeroPlaces || []).filter((v) => v.place && v.place.id !== place.id).slice(0, 8);

  return (
    <div style={sheetBg} onClick={close}>
      <div style={{ ...sheet, overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, close)} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
        <Grabber />
        <div style={{ position: "relative", height: 190, overflow: "hidden", borderRadius: "20px 20px 0 0" }}>
          {photo
            ? <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${plat.color}3D 0%, #171C26 55%, #0B0E14 100%)` }} />}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.42) 55%, rgba(0,0,0,.9) 100%)" }} />
          <button onClick={close} aria-label="Close" style={closeBtnOverlay}>✕</button>
          <div style={{ position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.6)", border: `1px solid ${plat.color}99`, borderRadius: 999, padding: "4px 11px", backdropFilter: "blur(4px)" }}>
            <Icon name="sparkles" size={12} color={plat.color} />
            <span style={{ fontSize: 10.5, fontWeight: 800, color: plat.color, letterSpacing: "0.4px", textTransform: "uppercase" }}>Social media find</span>
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 850, color: "#fff", lineHeight: 1.2, textShadow: "0 1px 6px rgba(0,0,0,.7)" }}>{place.name}</div>
          </div>
        </div>

        <div style={{ padding: "16px 18px 26px" }}>
          <a
            href={video.url}
            target="_blank"
            rel="noopener"
            onClick={() => { try { logEvent("creator_video", place, { platform: video.platform, creator: handle || "", src: "social_find_sheet" }); } catch (e) {} }}
            aria-label={`Watch ${handle ? "@" + handle : "this creator"}'s video (opens in a new tab)`}
            className="wf-social-glow"
            style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", background: `linear-gradient(160deg, ${plat.color}1f 0%, ${C.card} 60%)`, border: `1.5px solid ${plat.color}`, borderRadius: 14, padding: 14, marginBottom: 16, "--glow-rgb": glowRgb }}
          >
            <CreatorAvatar handle={handle} platform={video.platform} size={52} color={plat.color} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{handle ? "@" + handle : plat.label + " creator"}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{stats.count > 0 ? `Featured at ${stats.count} spot${stats.count === 1 ? "" : "s"} on Wayfind` : `On ${plat.label}`}</div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: plat.color, marginTop: 6 }}>Watch on {plat.label} ↗</div>
            </div>
          </a>

          {video.caption && <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.55, marginBottom: 18 }}>{video.caption}</div>}

          <button onClick={() => { setSocialFind(null); openDetail(place, "social_find_sheet"); }} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13.5, fontWeight: 800, cursor: "pointer", marginBottom: 22 }}>
            View full place details ›
          </button>

          {others.length > 0 && (
            <div style={{ marginBottom: otherSpots.length > 0 ? 20 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>More finds near {locName ? locName.split(",")[0] : "you"}</div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                {others.map((o) => {
                  const op = PLATFORM[o.video.platform] || PLATFORM.tiktok;
                  const ophoto = (o.place.photos && o.place.photos[0]) || o.place.photo || null;
                  return (
                    <button
                      key={o.place.id}
                      onClick={() => { try { logEvent("creator_video_hero_open", null, { id: o.place.id, platform: o.video.platform, src: "social_find_bookshelf" }); } catch (e) {} setSocialFind({ place: o.place, video: o.video }); }}
                      style={{ flexShrink: 0, width: 130, textAlign: "left", scrollSnapAlign: "start", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      <div style={{ position: "relative", width: 130, height: 90, borderRadius: 12, overflow: "hidden", background: C.card, marginBottom: 6 }}>
                        {ophoto ? <img src={ophoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${op.color}3D 0%, #171C26 100%)` }} />}
                        <div aria-hidden="true" style={{ position: "absolute", top: 5, left: 5, width: 8, height: 8, borderRadius: "50%", background: op.color, boxShadow: `0 0 6px 1px ${op.color}` }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{o.place.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {otherSpots.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>More from @{handle}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {otherSpots.slice(0, 6).map((s) => (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: C.card, border: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.name}</span>
                    {s.city && <span style={{ fontSize: 11.5, color: C.muted }}>{s.city}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
            <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5, maxWidth: 200 }}>Curated by Wayfind, never sponsored — we credit the creator and link straight to their real video.</div>
            <button onClick={() => setSocialFind({ library: true })} style={seeAllBtn}>See all ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mode C — the full creator directory. Grouped by creator (most-featured
// first), with a trailing "verified but uncredited" bucket for the rare
// entry with no real handle to attribute (never invent one).
function LibrarySheet({ onClose, onDragStart, onDragMove, onDragEnd, onOpenSpot, logEvent }) {
  const { creators, unattributed } = allCreators();
  const totalSpots = creators.reduce((n, c) => n + c.count, 0) + unattributed.length;
  const cities = new Set();
  creators.forEach((c) => c.spots.forEach((s) => s.city && cities.add(s.city)));
  unattributed.forEach((s) => s.city && cities.add(s.city));

  return (
    <div style={sheetBg} onClick={onClose}>
      <div style={{ ...sheet, overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => onDragStart(e, onClose)} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
        <Grabber />
        <div style={{ padding: "4px 18px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="sparkles" size={13} color={PLATFORM.tiktok.color} />
              <span style={{ fontSize: 10.5, fontWeight: 900, color: PLATFORM.tiktok.color, textTransform: "uppercase", letterSpacing: "1.2px" }}>Social Media Find</span>
            </div>
            <button onClick={onClose} aria-label="Close" style={closeBtnPlain}>✕</button>
          </div>
          <div style={{ fontSize: 21, fontWeight: 850, color: C.text, lineHeight: 1.25, marginBottom: 6 }}>Every creator we've featured</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 20 }}>{creators.length} creator{creators.length === 1 ? "" : "s"} · {totalSpots} spot{totalSpots === 1 ? "" : "s"} · {cities.size} cit{cities.size === 1 ? "y" : "ies"}, growing every week.</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {creators.map((c) => {
              const plat = PLATFORM[c.spots[0].platform] || PLATFORM.tiktok;
              const profileUrl = profileUrlFor(c.spots[0].platform, c.handle);
              return (
                <div key={c.handle} style={{ background: premiumCardBg, border: `1px solid ${premiumCardBorder}`, borderRadius: 18, padding: 16, boxShadow: "0 10px 28px rgba(0,0,0,.28)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                    <div aria-hidden="true" style={{ flexShrink: 0, width: 60, height: 60, borderRadius: "50%", padding: 2.5, background: `linear-gradient(135deg, ${plat.color} 0%, ${plat.color}40 100%)` }}>
                      <CreatorAvatar handle={c.handle} platform={c.spots[0].platform} size={55} color={plat.color} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${plat.color}1f`, border: `1px solid ${plat.color}55`, borderRadius: 999, padding: "2px 8px", marginBottom: 6 }}>
                        <Icon name="sparkles" size={9} color={plat.color} />
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: plat.color, letterSpacing: ".4px", textTransform: "uppercase" }}>Wayfind Creator</span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 850, color: C.text, letterSpacing: "-.2px" }}>@{c.handle}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{c.count} spot{c.count === 1 ? "" : "s"} featured on Wayfind</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: profileUrl ? 14 : 0 }}>
                    {c.spots.map((s) => {
                      const sp = PLATFORM[s.platform] || PLATFORM.tiktok;
                      return (
                        <button key={s.key} onClick={() => onOpenSpot(s)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, cursor: "pointer" }}>
                          <span aria-hidden="true" style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: sp.color }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{s.name}</span>
                          {s.city && <span style={{ fontSize: 10.5, color: C.muted }}>· {s.city}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {profileUrl && (
                    <a
                      href={profileUrl}
                      target="_blank"
                      rel="noopener"
                      onClick={() => { try { logEvent("creator_profile_open", null, { platform: c.spots[0].platform, creator: c.handle, src: "social_find_library" }); } catch (e) {} }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800, color: plat.color, textDecoration: "none" }}
                    >
                      Follow @{c.handle} on {plat.label} ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {unattributed.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Verified finds, creator not yet credited</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {unattributed.map((s) => {
                  const sp = PLATFORM[s.platform] || PLATFORM.tiktok;
                  return (
                    <button key={s.key} onClick={() => onOpenSpot(s)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", padding: "9px 11px", borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7 }}>
                        <span aria-hidden="true" style={{ flexShrink: 0, width: 7, height: 7, borderRadius: "50%", background: sp.color }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      </span>
                      {s.city && <span style={{ flexShrink: 0, fontSize: 11, color: C.muted }}>{s.city}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 20, lineHeight: 1.5 }}>Curated by Wayfind, never sponsored. Tapping a spot opens it here if it's near you, or takes you straight to the creator's real video.</div>
        </div>
      </div>
    </div>
  );
}
