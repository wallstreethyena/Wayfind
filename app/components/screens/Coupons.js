"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only.
import { C } from "../kit";
import { COUPONS } from "../../../lib/coupons";

export default function CouponsScreen({ ctx }) {
  const { cpnOffers, savedCoupons, toggleSaveCoupon, copyCouponCode, shareCoupon, logEvent, walletOpen, setWalletOpen, openExternal } = ctx;
          const _today = new Date().toISOString().slice(0, 10);
          const _liveOk = (c) => c && c.id && c.title && (!c.expires || String(c.expires).slice(0, 10) >= _today);
          const live = [...COUPONS, ...cpnOffers].filter(_liveOk);
          const savedList = Object.values(savedCoupons).map((x) => x && x.c).filter(_liveOk).sort((a, b) => ((savedCoupons[b.id] || {}).ts || 0) - ((savedCoupons[a.id] || {}).ts || 0));
          const savedIds = new Set(savedList.map((c) => c.id));
          const fresh = live.filter((c) => !savedIds.has(c.id));
          const Cpn = (c) => {
            const isSaved = !!savedCoupons[c.id];
            return (
              <div key={c.id} style={{ background: C.card, border: `1.5px dashed ${isSaved ? C.accent : C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    {c.business ? <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.4px" }}>{c.business}{c.area ? " · " + c.area : ""}</div> : null}
                    <div style={{ fontSize: 16.5, fontWeight: 800, color: C.text, marginTop: 2, lineHeight: 1.3 }}>🏷️ {c.title}</div>
                    {c.details ? <div style={{ fontSize: 13, color: C.light, marginTop: 4, lineHeight: 1.45 }}>{c.details}</div> : null}
                    {c.expires ? <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>Ends {String(c.expires).slice(0, 10)}</div> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => shareCoupon(c)} aria-label="Share coupon" title="Share this coupon" style={{ width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.accent, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg>
                    </button>
                    <button onClick={() => toggleSaveCoupon(c)} aria-label={isSaved ? "Remove saved coupon" : "Save coupon"} style={{ width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${isSaved ? C.accent : C.border}`, background: isSaved ? C.adim : "transparent", color: isSaved ? C.accent : C.muted, cursor: "pointer", fontSize: 16 }}>{isSaved ? "♥" : "♡"}</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                  {c.code ? <button onClick={() => copyCouponCode(c.code)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer", letterSpacing: "0.6px" }}>{c.code} · Copy</button> : null}
                  {c.url ? <a href={c.url} target="_blank" rel="noreferrer sponsored" onClick={(e) => { e.preventDefault(); const _live2 = (e.currentTarget && e.currentTarget.href) || c.url; try { logEvent("coupon_out", null, { id: c.id }); } catch (er) {} openExternal(_live2); }} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: C.accent, color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer", textAlign: "center", textDecoration: "none" }}>{c.cta || "Claim deal"} ↗</a> : null}
                  {!c.code && !c.url ? <div style={{ flex: 1, padding: "10px 0", fontSize: 12.5, color: C.muted, textAlign: "center" }}>Mention Wayfind when you order</div> : null}
                </div>
              </div>
            );
          };
          return (
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: "4px 0 4px" }}>🏷️ Coupons</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>Real deals at great local places, hand-picked by Wayfind — no junk offers. Tap ♡ to keep one; saved coupons stay on this device and in your account when you're signed in.</div>
              {savedList.length > 0 && (
                <>
                  {/* v5.08 (user direction): saved coupons behave like cards in
                      Apple Wallet — a collapsed stack showing each card's top
                      band, tap to fan out, tap the header to restack. */}
                  <div onClick={() => setWalletOpen((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, cursor: "pointer" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase" }}>Your wallet · {savedList.length}</div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: C.accent }}>{walletOpen ? "Stack ▴" : "Fan out ▾"}</span>
                  </div>
                  {walletOpen || savedList.length === 1 ? savedList.map(Cpn) : (
                    <div onClick={() => setWalletOpen(true)} style={{ cursor: "pointer", marginBottom: 16 }}>
                      {[...savedList.slice(0, 6)].reverse().map((c, i, arr) => (
                        <div key={c.id} style={{ position: "relative", marginTop: i === 0 ? 0 : -58, zIndex: i + 1, background: "#1A2030", border: `1.5px solid ${C.accent}`, borderRadius: 14, padding: i === arr.length - 1 ? "13px 16px 15px" : "13px 16px 74px", boxShadow: "0 -8px 20px rgba(0,0,0,.5)" }}>
                          {c.business ? <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.4px" }}>{c.business}</div> : null}
                          <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🏷️ {c.title}</div>
                        </div>
                      ))}
                      <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted, marginTop: 8 }}>{savedList.length > 6 ? `+${savedList.length - 6} more · ` : ""}Tap to open your wallet</div>
                    </div>
                  )}
                  {fresh.length > 0 && <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase", margin: "14px 0 8px" }}>More deals</div>}
                </>
              )}
              {fresh.map(Cpn)}
              {live.length === 0 && savedList.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 42, marginBottom: 12 }}>🏷️</div>
                  <strong style={{ display: "block", color: C.light, marginBottom: 6 }}>New local deals land here</strong>
                  <span style={{ fontSize: 13, lineHeight: 1.5, display: "block" }}>Wayfind is signing up local spots now. Every coupon here will be real — no junk offers, ever. Check back soon.</span>
                </div>
              )}
              {live.length > 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: "center" }}>Some deals may be affiliate offers. Wayfind may earn a commission at no cost to you.</div>}
            </div>
          );
}
