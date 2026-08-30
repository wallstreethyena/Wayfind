"use client";

// Date Night as a QUALIFIED INTENT — not a category list.
// Homepage Date Night poster lands here. Existing RankedExperiencePage shell,
// existing IconicPlaceCard on every result. No new card chrome.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "./RankedExperiencePage";
import IconicPlaceCard from "./IconicPlaceCard";
import { BackControl } from "../best-beaches/[metro]/parts";
import { toHookLine } from "../../lib/editorialHook";
import { editorialIntentHeader } from "../../lib/collectionHeader";
import { INTENT_PAGES } from "../../lib/intentPages";
import { areaSeasonalContext } from "../../lib/areaSeasonalContext";
import { currentSeason } from "../../lib/seasons";
import { ScoreDisclosure } from "./ExperienceBlocks";
import { resolveLocationContext, locationSurface } from "../../lib/locationHonesty";
import { canonicalShareUrl } from "../../lib/site";
import { track } from "../../lib/track";

const C = { text: "#F1F5F9", muted: "#8b93a1" };

export default function DateNightIntentPage() {
  const def = INTENT_PAGES["date-night"];
  const sp = useSearchParams();
  const [payload, setPayload] = useState(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const loc = useMemo(() => {
    let stored = null;
    try {
      const c = JSON.parse(localStorage.getItem("wf_center") || "null");
      if (c && isFinite(c.lat) && isFinite(c.lng)) stored = { lat: c.lat, lng: c.lng, loc: c.loc };
    } catch (e) {}
    const ctx = resolveLocationContext({
      urlCity: (sp.get("city") || "").slice(0, 40),
      urlLat: parseFloat(sp.get("lat")),
      urlLng: parseFloat(sp.get("lng")),
      stored,
    });
    const surface = locationSurface(ctx);
    return { lat: ctx.lat, lng: ctx.lng, city: surface.headingCity };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const areaCtx = areaSeasonalContext(loc && loc.city, currentSeason());
  const header = editorialIntentHeader("date-night", loc.city, areaCtx);

  useEffect(() => {
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      setFailed(true);
      return;
    }
    let dead = false;
    const q = new URLSearchParams({
      lat: String(loc.lat),
      lng: String(loc.lng),
    });
    if (loc.city) q.set("city", loc.city);
    const hour = parseFloat(sp.get("hour"));
    if (Number.isFinite(hour)) q.set("hour", String(hour));
    (async () => {
      try {
        const r = await fetch("/api/date-night?" + q.toString());
        const j = r.ok ? await r.json() : null;
        if (dead) return;
        if (!j || !Array.isArray(j.rails)) { setFailed(true); return; }
        setPayload(j);
        try { track("date_night_intent_open", { city: loc.city, rails: j.rails.map((x) => x.id).join(","), hidden: (j.hidden || []).join(","), beach_ok: !!j.beachOk }); } catch (e) {}
      } catch (e) {
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const url = canonicalShareUrl(typeof window !== "undefined" ? window.location.href : "/date-night");
    try { if (navigator.share) { await navigator.share({ title: header.eyebrow || "Date night", url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const rails = (payload && payload.rails) || [];
  const firstNightOutId = (rails.find((r) => r.group === "nightlife") || {}).id;

  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" variant="editorial" />}
      eyebrow={header.eyebrow}
      titleTop={header.title}
      subtitle={header.deck}
      heroImg={def.art}
      location={loc.city}
      imageKicker={header.imageKicker}
      imageTitle={header.imageTitle}
      dekLead={header.dekLead}
      actionSlot={(
        <button onClick={share} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, padding: "10px 20px", borderRadius: 14, border: "1px solid rgba(17,24,36,.12)", background: def.accent, color: "#111824", fontSize: 12.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}>
          {copied ? "Link copied" : "Share this list"} <span aria-hidden="true">↗</span>
        </button>
      )}
      footerSlot={<ScoreDisclosure />}
    >
      {payload == null && !failed ? (
        <div style={{ marginTop: 18 }}>
          {[0, 1, 2].map((i) => <div key={i} className="wf-skeleton" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}
        </div>
      ) : failed ? (
        <p style={{ marginTop: 18, fontSize: 13, color: C.muted }}>We could not build tonight&apos;s date from owned inventory. That is a miss on our side, not an empty town.</p>
      ) : !rails.length ? (
        <p style={{ marginTop: 18, fontSize: 13, color: C.muted }}>Nothing near you clears the bar for a date-night journey right now — that honesty is the product.</p>
      ) : rails.map((rail) => {
        return (
          <section key={rail.id} aria-label={rail.title} style={{ marginTop: 28 }}>
            {rail.id === firstNightOutId ? <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Night Out</p> : null}
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: C.text }}>{rail.title}</h2>
            <div style={{ display: "flex", overflowX: "auto", overscrollBehaviorX: "contain", gap: 14, padding: "2px 0 8px", WebkitOverflowScrolling: "touch" }}>
              {rail.places.map((p, i) => (
                <div key={p.id} style={{ flex: "0 0 auto", width: 300, maxWidth: "86vw" }}>
                  <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    <IconicPlaceCard
                      place={p}
                      rank={i + 1}
                      href={"/p/" + encodeURIComponent(p.id)}
                      editorial={toHookLine(p.editorial, p.name) || null}
                      surface="date_night_intent"
                    />
                  </ol>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </RankedExperiencePage>
  );
}
