"use client";
// IntentLocationChooser — the one-tap answer when an intent page (Date Night,
// Family Day, Night Out) has no place to rank from. It replaces the old dead
// end ("Choose a location to build your date night." with nothing to choose).
// See lib/intentLocationFallback.js for the order that runs before this shows.
//
// Each city is a plain link, so it works before hydration, opens in a new tab,
// and puts the choice in the URL (shareable, never written to wf_center).

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { INTENT_CHOOSER_CITIES, chooserHref } from "../../lib/intentLocationFallback.js";
import { track } from "../../lib/track";

const INTENT_COPY = Object.freeze({
  "date-night": "Pick a city and we'll line up a date night there, ranked by the Wayfind Score.",
  family: "Pick a city and we'll rank family days out there by the Wayfind Score.",
  tonight: "Pick a city and we'll rank tonight's spots there by the Wayfind Score.",
});

export default function IntentLocationChooser({ intent = "", locating = false }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams ? searchParams.toString() : "";
  const [gpsState, setGpsState] = useState("idle"); // idle | asking | denied
  const shown = useRef(false);

  const cities = useMemo(() => INTENT_CHOOSER_CITIES.map((city) => ({
    ...city,
    href: chooserHref(pathname, search, city),
  })), [pathname, search]);

  useEffect(() => {
    if (locating || shown.current) return;
    shown.current = true;
    try { track("intent_location_chooser_shown", { intent, path: pathname }); } catch (error) {}
  }, [locating, intent, pathname]);

  if (locating) {
    return (
      <div className="wf-intent-loc" role="status" aria-live="polite">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <p className="wf-intent-loc-lead">Finding picks near you…</p>
      </div>
    );
  }

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGpsState("denied"); return; }
    setGpsState("asking");
    try { track("intent_location_chooser_gps", { intent }); } catch (error) {}
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams(search);
        params.set("lat", position.coords.latitude.toFixed(4));
        params.set("lng", position.coords.longitude.toFixed(4));
        params.delete("city");
        window.location.assign(`${pathname}?${params.toString()}`);
      },
      () => setGpsState("denied"),
      { timeout: 8000, maximumAge: 300000 },
    );
  };

  return (
    <section className="wf-intent-loc" aria-labelledby="wf-intent-loc-title">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <h2 id="wf-intent-loc-title" className="wf-intent-loc-title">Where are you headed?</h2>
      <p className="wf-intent-loc-lead">{INTENT_COPY[intent] || "Pick a city and we'll rank places there by the Wayfind Score."}</p>
      <div className="wf-intent-loc-cities">
        {cities.map((city) => (
          <a key={city.slug} href={city.href} className="wf-intent-loc-city"
            onClick={() => { try { track("intent_location_chooser_pick", { intent, city: city.slug }); } catch (error) {} }}>
            {city.name}
          </a>
        ))}
      </div>
      <button type="button" className="wf-intent-loc-gps" onClick={useMyLocation} disabled={gpsState === "asking"}>
        {gpsState === "asking" ? "Finding you…" : "Use my location"}
      </button>
      {gpsState === "denied" ? <p className="wf-intent-loc-note">Location is off on this device. Pick a city above instead.</p> : null}
    </section>
  );
}

const CSS = `
.wf-intent-loc{margin:6px 0 0;padding:18px 16px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:#0A0F18;color:#E6EBF2}
.wf-intent-loc-title{margin:0 0 4px;font-size:18px;line-height:1.25;font-weight:850;color:#F5F7FA}
.wf-intent-loc-lead{margin:0 0 14px;color:#AEB9C8;font-size:13.5px;line-height:1.5}
.wf-intent-loc[role=status] .wf-intent-loc-lead{margin:0}
.wf-intent-loc-cities{display:flex;flex-wrap:wrap;gap:8px}
.wf-intent-loc-city{display:inline-flex;align-items:center;min-height:40px;padding:8px 14px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:#131D2B;color:#F5F7FA;font-size:13px;font-weight:800;text-decoration:none}
.wf-intent-loc-city:hover,.wf-intent-loc-city:focus-visible{border-color:#F97316;color:#FDBA74}
.wf-intent-loc-gps{margin-top:14px;min-height:40px;padding:8px 16px;border:0;border-radius:999px;background:#F97316;color:#111824;font:inherit;font-size:13px;font-weight:850;cursor:pointer}
.wf-intent-loc-gps[disabled]{opacity:.7;cursor:progress}
.wf-intent-loc-note{margin:10px 0 0;color:#AEB9C8;font-size:12.5px}
`;
