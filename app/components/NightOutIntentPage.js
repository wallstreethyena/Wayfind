"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "./RankedExperiencePage";
import NightOutRails from "./NightOutRails";
import { BackControl } from "../best-beaches/[metro]/parts";
import { editorialIntentHeader } from "../../lib/collectionHeader";
import { INTENT_PAGES } from "../../lib/intentPages";
import { areaSeasonalContext } from "../../lib/areaSeasonalContext";
import { currentSeason } from "../../lib/seasons";
import { ScoreDisclosure } from "./ExperienceBlocks";
import { resolveLocationContext, locationSurface, milesBetween } from "../../lib/locationHonesty";
import { canonicalShareUrl } from "../../lib/site";
import { usePosterEvents } from "./usePosterEvents";
import PosterEventCard from "./PosterEventCard";

function nightOutLocation({ urlCity = "", urlLat = NaN, urlLng = NaN, stored = null } = {}) {
  const coords = { lat: Number(urlLat), lng: Number(urlLng) };
  const hasUrlCoords = Number.isFinite(coords.lat) && Number.isFinite(coords.lng);
  let city = String(urlCity || "").slice(0, 40);
  if (!city && hasUrlCoords && stored) {
    const distance = milesBetween(coords, stored);
    if (Number.isFinite(distance) && distance <= 25) city = stored.loc || "";
  }
  const ctx = resolveLocationContext({ urlCity: city, urlLat, urlLng, stored: hasUrlCoords ? null : stored });
  const surface = locationSurface(ctx);
  return { lat: ctx.lat, lng: ctx.lng, city: surface.headingCity };
}

export default function NightOutIntentPage() {
  const def = INTENT_PAGES.tonight;
  const sp = useSearchParams();
  const [copied, setCopied] = useState(false);
  const urlCity = (sp.get("city") || "").slice(0, 40);
  const urlLat = parseFloat(sp.get("lat"));
  const urlLng = parseFloat(sp.get("lng"));
  const [loc, setLoc] = useState(() => nightOutLocation({ urlCity, urlLat, urlLng }));

  useEffect(() => {
    let stored = null;
    try {
      const value = JSON.parse(localStorage.getItem("wf_center") || "null");
      if (value && isFinite(value.lat) && isFinite(value.lng)) stored = { lat: Number(value.lat), lng: Number(value.lng), loc: value.loc };
    } catch {}
    setLoc(nightOutLocation({ urlCity, urlLat, urlLng, stored }));
  }, [urlCity, urlLat, urlLng]);

  const areaCtx = areaSeasonalContext(loc.city, currentSeason());
  const header = editorialIntentHeader("tonight", loc.city, areaCtx);
  const posterEvents = usePosterEvents({
    active: true,
    center: { lat: loc.lat, lng: loc.lng },
    city: loc.city,
    mode: "night-out",
  });
  const eventSurface = useMemo(() => ({
    pending: posterEvents.pending,
    failed: posterEvents.failed,
    byRail: Object.fromEntries(Object.entries(posterEvents.byRail || {}).map(([railId, events]) => [
      railId,
      (Array.isArray(events) ? events : []).map((event, index) => <PosterEventCard
        key={event.id} event={event} rank={index + 1} surface={`night_out_${railId}`} />),
    ])),
  }), [posterEvents]);
  const share = async () => {
    const url = canonicalShareUrl(typeof window !== "undefined" ? window.location.href : "/tonight");
    try { if (navigator.share) { await navigator.share({ title: header.eyebrow || "Night Out", url }); return; } } catch (error) { if (error?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return <RankedExperiencePage
    topLeft={<BackControl fallback="/" variant="editorial" />}
    eyebrow={header.eyebrow} titleTop={header.title} subtitle={header.deck}
    heroImg={def.art} location={loc.city} imageKicker={header.imageKicker}
    imageTitle={header.imageTitle} dekLead={header.dekLead}
    actionSlot={<button onClick={share} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, padding: "10px 20px", borderRadius: 14, border: "1px solid rgba(17,24,36,.12)", background: def.accent, color: "#111824", fontSize: 12.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}>
      {copied ? "Link copied" : "Share this list"} <span aria-hidden="true">↗</span>
    </button>}
    footerSlot={<ScoreDisclosure />}>
    <NightOutRails active center={{ lat: loc.lat, lng: loc.lng }} city={loc.city}
      eventsSlot={(mode) => mode === "night-out" ? eventSurface : null} />
  </RankedExperiencePage>;
}
