"use client";
// One quiet location lookup for the whole Christmas page (owner 2026-11-11:
// best rated, trending choices near the visitor). The device position is used
// only when the visitor already allowed it, otherwise the coarse Florida only
// city lookup (/api/geo, the same one home uses). No permission prompt. Nothing
// found means null and the page stays statewide. `shouldSkip` lets a link that
// already carries a location (or sort=tickets) opt out. The result is never
// written to the address bar: a shared link must not carry the sharer's spot.
import { useEffect, useState } from "react";

export default function useChristmasLocation(shouldSkip) {
  const [loc, setLoc] = useState(null);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (shouldSkip && shouldSkip()) return undefined;
    let dead = false;
    const adopt = (lat, lng) => {
      if (dead || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setLoc({ lat: lat.toFixed(3), lng: lng.toFixed(3) });
    };
    const byCity = () => fetch("/api/geo", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j && j.ok) adopt(Number(j.lat), Number(j.lng)); }).catch(() => {});
    const byDevice = () => navigator.geolocation.getCurrentPosition((pos) => adopt(pos.coords.latitude, pos.coords.longitude), byCity, { timeout: 8000 });
    try {
      if (navigator.permissions && navigator.geolocation) navigator.permissions.query({ name: "geolocation" }).then((p) => (p.state === "granted" ? byDevice() : byCity()), byCity);
      else byCity();
    } catch { byCity(); }
    return () => { dead = true; };
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return loc;
}
