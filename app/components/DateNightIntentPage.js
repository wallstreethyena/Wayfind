"use client";
import { openShareFlow } from "../../lib/shareFlow.js";
import { shareOut } from "../../lib/shareOut.js";

// Date Night as a QUALIFIED INTENT — not a category list.
// Homepage Date Night poster lands here. Existing RankedExperiencePage shell,
// existing IconicPlaceCard on every result. No new card chrome.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RankedExperiencePage from "./RankedExperiencePage";
import DateNightRails from "./DateNightRails";
import { BackControl } from "../best-beaches/[metro]/parts";
import { editorialIntentHeader } from "../../lib/collectionHeader";
import { INTENT_PAGES } from "../../lib/intentPages";
import { areaSeasonalContext } from "../../lib/areaSeasonalContext";
import { currentSeason } from "../../lib/seasons";
import { resolveLocationContext, locationSurface, milesBetween } from "../../lib/locationHonesty";
import { canonicalShareUrl } from "../../lib/site";
import { track } from "../../lib/track";
import { readStoredCenter, fetchIpCenter } from "../../lib/intentLocationFallback.js";
import IntentLocationChooser from "./IntentLocationChooser";

function dateNightLocation({ urlCity = "", urlLat = NaN, urlLng = NaN, stored = null } = {}) {
  const coords = { lat: Number(urlLat), lng: Number(urlLng) };
  const hasUrlCoords = Number.isFinite(coords.lat) && Number.isFinite(coords.lng);
  let city = String(urlCity || "").slice(0, 40);

  // A coordinates-only poster URL may recover the matching stored label after
  // hydration, but a stale pin from another town must never replace the URL's
  // ranking origin. The old render-time localStorage read did both: it made
  // SSR say "your town", made the first client render say the stored city,
  // and let that stored city/point override explicit URL coordinates.
  if (!city && hasUrlCoords && stored) {
    const distance = milesBetween(coords, stored);
    if (Number.isFinite(distance) && distance <= 25) city = stored.loc || "";
  }

  const ctx = resolveLocationContext({
    urlCity: city,
    urlLat,
    urlLng,
    stored: hasUrlCoords ? null : stored,
  });
  const surface = locationSurface(ctx);
  return { lat: ctx.lat, lng: ctx.lng, city: surface.headingCity };
}

export default function DateNightIntentPage() {
  const def = INTENT_PAGES["date-night"];
  const sp = useSearchParams();
  const [copied, setCopied] = useState(false);
  const urlCity = (sp.get("city") || "").slice(0, 40);
  const urlLat = parseFloat(sp.get("lat"));
  const urlLng = parseFloat(sp.get("lng"));

  // SSR and the first client render use URL data only. Browser storage is read
  // in an effect, so a returning visitor cannot trigger React #425/#422 and
  // lose hydration on this page. Explicit URL coordinates remain authoritative.
  const [loc, setLoc] = useState(() => dateNightLocation({ urlCity, urlLat, urlLng }));
  // No URL point and no saved homepage location: try the free IP location,
  // then show the city chooser (lib/intentLocationFallback.js).
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    const stored = readStoredCenter();
    const next = dateNightLocation({ urlCity, urlLat, urlLng, stored });
    setLoc(next);
    if (Number.isFinite(next.lat) && Number.isFinite(next.lng)) { setLocating(false); return undefined; }
    let cancelled = false;
    setLocating(true);
    fetchIpCenter().then((ip) => {
      if (cancelled) return;
      if (ip) setLoc(dateNightLocation({ urlCity, urlLat, urlLng, stored: ip }));
      setLocating(false);
    });
    return () => { cancelled = true; };
  }, [urlCity, urlLat, urlLng]);

  const areaCtx = areaSeasonalContext(loc && loc.city, currentSeason());
  const header = editorialIntentHeader("date-night", loc.city, areaCtx);

  // v8.92 — the fetch, the skeleton, the failure copy and the rail render all
  // live in <DateNightRails> now. This page owns the shell and the share.

  const share = () => {
    const url = canonicalShareUrl(typeof window !== "undefined" ? window.location.href : "/date-night");
    openShareFlow({ title: header.eyebrow || "Date night", url, city: loc.city || "", surface: "date_night" }, () => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };

  const askSomeone = () => {
    const url = canonicalShareUrl(typeof window !== "undefined" ? window.location.href : "/date-night");
    openShareFlow({
      title: header.eyebrow || "Date night",
      url,
      city: loc.city || "",
      kind: "dinner",
      surface: "date_night",
      geo: Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? `${loc.lat},${loc.lng}` : "",
      directInvite: true,
    }, () => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };

  return (
    <RankedExperiencePage
      topLeft={<BackControl fallback="/" variant="editorial" />}
      eyebrow={header.eyebrow}
      titleTop={header.title}
      subtitle={header.deck}
      heroImg={def.art}
      heroPresentation="poster"
      heroBackground="#f6bcc2"
      location={loc.city}
      imageKicker={header.imageKicker}
      imageTitle={header.imageTitle}
      dekLead={header.dekLead}
      actionSlot={(
        <div style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            data-wf-ask-someone="date_night"
            onClick={askSomeone}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, padding: "10px 18px", borderRadius: 14, border: "1px solid rgba(17,24,36,.18)", background: "#111824", color: "#F8FAFC", fontSize: 12.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <span aria-hidden="true">♡</span> Ask someone out
          </button>
          <button onClick={share} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, padding: "10px 20px", borderRadius: 14, border: "1px solid rgba(17,24,36,.12)", background: def.accent, color: "#111824", fontSize: 12.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? "Link copied" : "Share this list"} <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
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
        partnerCity={Number.isFinite(urlLat) && Number.isFinite(urlLng) && (urlLat !== loc.lat || urlLng !== loc.lng) ? "" : urlCity || loc.city}
        hour={Number.isFinite(parseFloat(sp.get("hour"))) ? parseFloat(sp.get("hour")) : null}
        emptyLocation={<IntentLocationChooser intent="date-night" locating={locating} />}
        onTrack={(name, props) => { try { track(name, props); } catch (e) {} }}
      />
    </RankedExperiencePage>
  );
}
