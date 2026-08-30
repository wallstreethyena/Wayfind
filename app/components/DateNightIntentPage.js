"use client";

// Date Night as a QUALIFIED INTENT — not a category list.
// Homepage Date Night poster lands here. Existing RankedExperiencePage shell,
// existing IconicPlaceCard on every result. No new card chrome.

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "./RankedExperiencePage";
import DateNightRails from "./DateNightRails";
import { BackControl } from "../best-beaches/[metro]/parts";
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

  // v8.92 — the fetch, the skeleton, the failure copy and the rail render all
  // live in <DateNightRails> now. This page owns the shell and the share.

  const share = async () => {
    const url = canonicalShareUrl(typeof window !== "undefined" ? window.location.href : "/date-night");
    try { if (navigator.share) { await navigator.share({ title: header.eyebrow || "Date night", url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

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
      {/* v8.92 — the rails moved into <DateNightRails> so the DROP and this
          PAGE cannot drift. Two copies of "what is a date night" is how that
          claim came to have three different rules in v8.82. This shell keeps
          what a page is for — the hero, the share, the score disclosure — and
          nothing about the intent itself lives here any more. */}
      <DateNightRails
        active
        center={{ lat: loc.lat, lng: loc.lng }}
        city={loc.city}
        hour={Number.isFinite(parseFloat(sp.get("hour"))) ? parseFloat(sp.get("hour")) : null}
        onTrack={(name, props) => { try { track(name, props); } catch (e) {} }}
      />
    </RankedExperiencePage>
  );
}
