"use client";
// Category and Events local guide. Its researched notes and strict named-place
// grounding load only after a visitor opens one of those views.
import { useEffect, useState } from "react";
import { KB_CLICK } from "./kit";
import { CULTURE_TITLES } from "../../lib/culture";
import { findPlace } from "../../lib/google";
import * as Aff from "../../lib/affiliates";
import { openExternal } from "../../lib/links";

const NOLOG = () => {};
const _wfNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const CULT_STOP = /^(the|and|for|its|it's)$/i;
function cultNameMatch(placeQuery, resultName) {
  const rn = _wfNorm(resultName);
  if (!rn) return false;
  const words = String(placeQuery || "").toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length >= 3 && !CULT_STOP.test(w));
  const hit = words.filter((w) => rn.includes(_wfNorm(w))).length;
  return hit >= Math.min(2, words.length);
}
async function verifyCulturePlaces(items, center) {
  const CK = "wf_cultground_v1";
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CK) || "{}"); } catch (e) {}
  const now = Date.now();
  const out = {};
  let dirty = false;
  for (const it of items) {
    const k = it.place;
    const hit = cache[k];
    if (hit && hit.exp > now) { out[k] = !!hit.ok; continue; }
    let good = false;
    try {
      const pl = await findPlace(it.place, center);
      good = !!(pl && cultNameMatch(it.place, pl.name)
        && (!pl.status || pl.status === "OPERATIONAL")
        && (pl.distMi == null || pl.distMi <= (it.farOk ? 25 : 10)));
    } catch (e) {}
    out[k] = good;
    cache[k] = { ok: good, exp: now + 7 * 864e5 };
    dirty = true;
  }
  if (dirty) { try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) {} }
  return out;
}
export default function AreaInsight({ metro, cat, town, center, onFind, onLog = NOLOG }) {
  const [openIt, setOpenIt] = useState(false);
  const [grounded, setGrounded] = useState({});
  // The researched notes are a separate chunk. They load when a category
  // browse opens, not with the first homepage paint.
  const [pack, setPack] = useState(null);
  useEffect(() => {
    let live = true;
    import("../../lib/cultureNotes.js").then((m) => { if (live) setPack(m); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // v4.84 — the culture card renders on ALL SIX categories. Root cause of it
  // only showing on Food and Beach day: the category menu passes Google
  // category ids (nightlife, attractions, hotels, shopping) but this map only
  // knew the legacy short keys, so four categories never matched a note.
  const map = { food: "food", nightlife: "night", night: "night", attractions: "todo", todo: "todo", hotels: "stays", stays: "stays", beach: "todo", shopping: "shop", shop: "shop", events: "events" };
  const key = map[cat];
  // v4.30: a town with its own researched notes outranks the metro story.
  // v4.82: town notes come from TOWN_PROFILES via townNotesFor (alias-aware —
  // "Holmes Beach" lands on Anna Maria Island). Beach browses prefer the
  // town's real beach note over its things-to-do note.
  const tn = pack && town && pack.townNotesFor ? pack.townNotesFor(town) : null;
  const townNote = tn ? ((cat === "beach" && tn.beach) || (key && tn[key]) || null) : null;
  const notes = townNote || (pack && metro && key && pack.CAT_NOTES[metro] ? pack.CAT_NOTES[metro][key] : null);
  const cTitle = metro ? CULTURE_TITLES[metro] : null;
  const isTown = !!townNote;
  const named = isTown && notes ? (notes.items || []).filter((x) => x.place) : [];
  const namedKey = named.map((x) => x.place).join("|");
  useEffect(() => {
    if (!namedKey || !center) return;
    let cancelled = false;
    verifyCulturePlaces(named, center).then((v) => { if (!cancelled) setGrounded(v); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namedKey, center && center.lat, center && center.lng]);
  if (!notes || !cTitle) return null;
  const placeLabel = isTown ? town : (town && town.toLowerCase() !== cTitle.toLowerCase() ? town + " + " + cTitle : cTitle);
  const headline = notes.headline || ("A local read on " + placeLabel + ".");
  const visibleItems = (notes.items || []).filter((x) => !isTown || !x.place || grounded[x.place]);
  const readCount = Math.max(1, Math.ceil((visibleItems.length + (notes.mistake ? 1 : 0) + (isTown && tn && tn.one ? 1 : 0)) * 0.66));
  const featureRow = (marker, title, body, tone, onClick, keyId) => (
    <div key={keyId} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? KB_CLICK : undefined} style={{ display: "grid", gridTemplateColumns: "38px minmax(0,1fr)", gap: 12, padding: "13px 12px", borderTop: "1px solid rgba(255,255,255,.08)", cursor: onClick ? "pointer" : "default" }}>
      <span style={{ width: 31, height: 31, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "#151F2B", color: tone, fontSize: 11.5, fontWeight: 900 }}>{marker}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: "#FFFFFF", fontSize: 13, lineHeight: 1.25, fontWeight: 850, textDecoration: onClick ? "underline" : "none", textDecorationColor: onClick ? "rgba(255,151,70,.36)" : "transparent", textUnderlineOffset: 3 }}>{title}</span>
        <span style={{ display: "block", color: "#AFBBC9", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{body}</span>
      </span>
    </div>
  );
  return (
    <div style={{ position: "relative", margin: "0 0 14px", borderRadius: 24, border: "1px solid rgba(255,255,255,.13)", background: "#0B1119", boxShadow: "inset 0 1px 0 rgba(255,255,255,.055), 0 30px 70px rgba(0,0,0,.42)", overflow: "hidden" }}>
      <div style={{ height: 5, background: "linear-gradient(90deg,#FF7A1A,#FFB35F 42%,#42D3AE)" }} />
      <div onClick={() => { const nv = !openIt; setOpenIt(nv); if (nv) { try { onLog("area_insight", null, { metro, cat: key }); } catch (e) {} } }} role="button" aria-expanded={openIt} tabIndex={0} onKeyDown={KB_CLICK} style={{ position: "relative", padding: "clamp(24px,4vw,27px) clamp(20px,4vw,25px) clamp(19px,3vw,21px)", cursor: "pointer", background: "radial-gradient(circle at 92% 0,rgba(255,122,26,.18),transparent 45%),linear-gradient(145deg,#121C27,#0A1119)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, color: "#FFB16E", fontSize: 10, lineHeight: 1.2, fontWeight: 900, letterSpacing: ".17em", textTransform: "uppercase" }}>
            <span style={{ width: 30, height: 36, display: "inline-grid", placeItems: "center", flex: "0 0 auto", filter: "drop-shadow(0 7px 12px rgba(255,122,26,.28))" }}>
              <img src="/brand/wayfind-pin-transparent.png" alt="" width="27" height="35" style={{ display: "block", width: 27, height: 35, objectFit: "contain", transform: "scale(1.55)" }} />
            </span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{placeLabel} local culture</span>
          </span>
          <span style={{ flex: "0 0 auto", padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.13)", color: "#B8C4D2", fontSize: 10, fontWeight: 800 }}>{readCount} min local read</span>
        </div>
        <span style={{ display: "block", color: "#FFFFFF", fontSize: "clamp(15px,3.1vw,18px)", lineHeight: 1.1, letterSpacing: "-.025em", fontWeight: 900, whiteSpace: headline.length < 54 ? "nowrap" : "normal" }}>{headline}</span>
        <span style={{ display: "block", maxWidth: 455, color: "#B9C6D3", fontSize: 13.5, lineHeight: 1.52, marginTop: 11 }}>{notes.line}</span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 19, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.1)", color: openIt ? "#D5DEE8" : "#FFFFFF" }}>
          <span>
            <span style={{ display: "block", fontSize: 11, lineHeight: 1.2, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{openIt ? "Collapse local guide" : "Open local guide"}</span>
            <span style={{ display: "block", marginTop: 3, color: "#8F9BAA", fontSize: 10.5, lineHeight: 1.35, fontWeight: 700 }}>{openIt ? "Return to the quick overview" : "See what locals know"}</span>
          </span>
          <span aria-hidden="true" style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", borderRadius: "50%", border: "1px solid rgba(255,177,110,.38)", background: "linear-gradient(145deg,rgba(255,122,26,.16),rgba(255,255,255,.045))", color: "#FFB16E", fontSize: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)", transform: openIt ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}>{"\u2304"}</span>
        </span>
      </div>
      {openIt && (
        <div style={{ padding: "19px 20px 21px", borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <div style={{ marginBottom: 11, color: "#7F8C9B", fontSize: 9.5, fontWeight: 900, letterSpacing: ".17em", textTransform: "uppercase" }}>What locals know</div>
          {visibleItems.map((x, i) => {
            // 2026-09-10 (affiliate deep-link audit, owner P0): this was
            // Aff.viatorDirectUrl(), which renders a LIVE monetized viator.com
            // href straight into crawlable DOM — every click bypassed
            // /api/viator/go, so there was no provider_redirect_started, no
            // server record, and any JS-rendering crawler "clicked" it. Same
            // destination and same attribution (the route re-applies
            // withViatorTracking), but the handoff is ours and can fail closed.
            // /culture/[metro] and /guides/[slug] already do exactly this.
            const book = x.viatorUrl ? Aff.viatorProductGoUrl(x.viatorUrl, cTitle, "culture", "culture_local_guide") : null;
            const body = book ? <>{x.story} <a href={book} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href) || book; try { onLog("culture_book", null, { metro, q: x.name }); } catch (er) {} openExternal(_live); }} style={{ color: "#59DDBB", fontWeight: 850, textDecoration: "none" }}>Book ↗</a></> : x.story;
            return featureRow(String(i + 1).padStart(2, "0"), x.name, body, "#FF9B4B", (e) => { e.stopPropagation(); try { onLog("insight_find", null, { metro, q: x.name }); } catch (er) {} onFind && onFind(x.query || x.name); }, "item-" + i);
          })}
          {notes.say ? featureRow("“”", "Talk local: “" + notes.say.phrase + "”", notes.say.meaning, "#8ED6C4", null, "say") : null}
          {notes.mistake ? featureRow("!", "The rookie mistake", notes.mistake, "#FFD15D", null, "mistake") : null}
          {isTown && tn && tn.one ? featureRow("★", "The one thing", tn.one, "#64DFBF", null, "one") : null}
        </div>
      )}
    </div>
  );
}

