// app/components/ThisWeekEvents.js - "This week in Florida" homepage strip.
//
// Data is built on the server (lib/thisWeekEvents.js, called from app/page.js) and passed
// down exactly like LocalEdit's guides, so this file is a plain presentational component,
// safe inside the client-rendered Home. Photos go through CardPhoto, the same
// rights-aware component the /florida-events hub cards use. Every card is a real <a href>.
// Event cards open /florida-events/<slug>. The Christmas hub card opens /christmas-in-florida.
// Statewide, no geolocation, no prices. Fewer than two events: renders nothing.
//
// NEVER BLANK AFTER A DEPLOY (2026-11-27): the homepage HTML is regenerated
// hourly and `next build` does not read the database, so a fresh deploy served
// this strip with no events for up to an hour. When the server sent fewer than
// two, this component asks /api/events/this-week (the same cached read) once,
// shows a same-size placeholder meanwhile so nothing below it jumps, and only
// renders nothing when that answer is also short (a real quiet week).
import { useEffect, useState } from "react";
import CardPhoto from "./CardPhoto.js";
import { C, TYPE } from "./kit";

export const THIS_WEEK_FALLBACK_URL = "/api/events/this-week";
const FALLBACK_TIMEOUT_MS = 6000;

// The answer comes from our own route, but it is still checked before it is
// painted: every card needs a slug, a name and a same-site link.
export function usableStripCards(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e && typeof e === "object" && typeof e.slug === "string" && e.slug &&
    typeof e.name === "string" && e.name && typeof e.href === "string" && /^\/(?!\/)/.test(e.href));
}

function StripPlaceholder() {
  return (
    <section aria-label="This week in Florida" aria-busy="true" data-this-week-loading="" style={{ marginBottom: 12 }}>
      <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 4 }}>This week in Florida</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#8D9AAB" }}>Dated events with verified pages</span>
        <a href="/florida-events" style={{ fontSize: 12, fontWeight: 700, color: C.text, textDecoration: "none", whiteSpace: "nowrap" }}>See all events</a>
      </div>
      <div style={{ display: "flex", gap: 10, overflow: "hidden", paddingBottom: 4 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" style={{ flex: "0 0 168px", border: "1px solid " + C.border, borderRadius: 14, background: "#0B0E15", overflow: "hidden" }}>
            <div style={{ width: "100%", aspectRatio: "16 / 10", background: "#141A24" }} />
            <div style={{ padding: "8px 10px 10px" }}>
              <div style={{ height: 11, width: 70, borderRadius: 4, background: "#1A2130" }} />
              <div style={{ height: 13, width: 128, borderRadius: 4, background: "#1A2130", marginTop: 6 }} />
              <div style={{ height: 11, width: 84, borderRadius: 4, background: "#161C28", marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ThisWeekEvents({ events, guide = null }) {
  const serverEvs = usableStripCards(events);
  const serverFull = serverEvs.length >= 2;
  // "idle": the server strip is enough. "loading" / "done": the fallback read.
  const [fallback, setFallback] = useState(() => ({ state: serverFull ? "idle" : "loading", events: [] }));
  useEffect(() => {
    if (serverFull) return undefined;
    let dead = false;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch {} }, FALLBACK_TIMEOUT_MS);
    fetch(THIS_WEEK_FALLBACK_URL, { signal: ctrl ? ctrl.signal : undefined, headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (!dead) setFallback({ state: "done", events: usableStripCards(body && body.events) }); })
      .catch(() => { if (!dead) setFallback({ state: "done", events: [] }); })
      .finally(() => clearTimeout(timer));
    return () => { dead = true; clearTimeout(timer); try { ctrl && ctrl.abort(); } catch {} };
  }, [serverFull]);
  if (!serverFull && fallback.state === "loading") return <StripPlaceholder />;
  const evs = serverFull ? serverEvs : fallback.events;
  // The weekly trend guide (lib/thisWeekEvents.js weeklyTrendGuideCard) leads the strip.
  // The Christmas hub card, when the season is live, is the first dated card
  // behind it (built in app/page.js from lib/christmasHubCard.js).
  const cards = guide && guide.href ? [guide, ...evs] : evs;
  if (evs.length < 2 || cards.length < 2) return null;
  return (
    <section aria-label="This week in Florida" style={{ marginBottom: 12 }}>
      <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 4 }}>This week in Florida</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: guide && guide.brief ? 4 : 8 }}>
        <span style={{ fontSize: 12, color: "#8D9AAB" }}>Dated events with verified pages</span>
        <a href="/florida-events" style={{ fontSize: 12, fontWeight: 700, color: C.text, textDecoration: "none", whiteSpace: "nowrap" }}>See all events</a>
      </div>
      {guide && guide.brief ? (
        <div data-florida-intel-brief style={{ fontSize: 12, color: "#B8C4D4", lineHeight: 1.4, marginBottom: 8 }}>{guide.brief}</div>
      ) : null}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 4, scrollSnapType: "x proximity" }}>
        {cards.map((e) => (
          <a key={e.slug} href={e.href} data-hub={e.hub ? e.slug : undefined} style={{ flex: "0 0 168px", scrollSnapAlign: "start", textDecoration: "none", border: "1px solid " + C.border, borderRadius: 14, background: "#0B0E15", overflow: "hidden", fontFamily: "var(--wf-sans)" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 10", background: "#141A24" }}>
              {e.image ? <CardPhoto inLink loading="lazy" src={e.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: e.position || undefined, display: "block" }} fallbackCategory="events" /> : null}
              {e.credit ? <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "2px 6px", fontSize: 9, lineHeight: 1.3, color: "rgba(255,255,255,.85)", background: "linear-gradient(transparent, rgba(0,0,0,.55))", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Photo: {e.credit}</span> : null}
            </div>
            <div style={{ padding: "8px 10px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: e.accent || "#FF8A3D", letterSpacing: 0.3 }}>{e.when}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.3, marginTop: 2 }}>{e.name}</div>
              {e.city ? <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{e.city}</div> : null}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
