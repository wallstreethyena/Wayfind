"use client";
import PlaceDistance from "./PlaceDistance.js";
import MapCategoryPin from "./MapCategoryPin.js";
import { usePhotoSrcFilter } from "./photoPolicyContext";
import CardPhoto from "./CardPhoto.js";
import VenueParkingResults from "./VenueParkingResults.js";
import { VENUE_MAP_SHELL_CSS } from "./VenueMapLoading.js";

// Shared venue Apple Maps surface. The route overlay is added by the same
// MapKit session as the venue and nearby annotations; EventDrivingRoute owns
// only the controls and summary shown below this map.
import { useEffect, useMemo, useRef, useState } from "react";
import { createAppleMapController, loadAppleMapKit } from "../../lib/appleMapsRuntime.js";
import { appleMapsTokenUsable } from "../../lib/appleMapsToken.js";
import { EVENT_MAP_FAMILY, eventMapFamily } from "../../lib/eventMapPlaces.js";
import { hasParkingCoordinate } from "../../lib/appleParking.js";
import { needsAppleVenueCheck, resolveAppleVenueLocation, applyVenueResolution } from "../../lib/appleVenueLocation.js";
import { mapFailureReason, reportMapServiceIssue } from "../../lib/mapDiagnostics.js";

const ACCENT = "#F97316";
const PICK = "#2EC9A6";
const CSS = `
${VENUE_MAP_SHELL_CSS}
.wfev-chip{position:absolute;left:12px;top:12px;z-index:3;display:inline-flex;align-items:center;gap:9px;padding:9px 13px 9px 11px;border-radius:999px;background:rgba(10,15,23,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.28);color:#F8FAFC;font-size:13px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:calc(100% - 24px)}
.wfev-chip i{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:${ACCENT};color:#0D1117;font-style:normal;font-size:13px;flex:0 0 auto}.wfev-chip small{display:block;font-size:11px;font-weight:700;color:#94A3B8;margin-top:1px}.wfev-chip b{display:block;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfev-legend{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;gap:10px;padding:7px 11px;border-radius:999px;background:rgba(10,15,23,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.22);color:#CBD5E1;font-size:11.5px;font-weight:700}.wfev-legend span{display:inline-flex;align-items:center;gap:5px}.wfev-legend em{width:9px;height:9px;border-radius:999px;display:inline-block}
.wfev-card{position:absolute;left:12px;right:12px;bottom:12px;z-index:4;display:flex;gap:12px;align-items:center;padding:10px;border-radius:16px;background:rgba(10,15,23,.9);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(46,201,166,.45);box-shadow:0 18px 40px rgba(0,0,0,.5);text-decoration:none;color:#F8FAFC}.wfev-card img{width:58px;height:58px;border-radius:12px;object-fit:cover;background:linear-gradient(145deg,#1B2433,#0E1520);flex:0 0 auto}.wfev-card b{display:block;font-size:14.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wfev-card small{display:block;font-size:12px;color:#94A3B8;font-weight:700;margin-top:3px}.wfev-card u{text-decoration:none;color:#0D1117;background:${PICK};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800;margin-right:6px}.wfev-card .wfev-x{margin-left:auto;flex:0 0 auto;width:30px;height:30px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:transparent;color:#CBD5E1;font:inherit;font-size:15px;cursor:pointer}.wfev-card .wfev-go{flex:0 0 auto;padding:9px 13px;border-radius:11px;background:${PICK};color:#0D1117;font-size:13px;font-weight:800}
.wfev-fb{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px;text-align:center;background:linear-gradient(145deg,#17212E 0%,#0A111B 72%)}
@media (max-width:700px){.wfev-legend{display:none}}
`;

const thumb = (p) => p.photo || (p.photoRef ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&g=2&w=640" : "/api/photo?place=" + encodeURIComponent(p.id) + "&g=2&w=640");

export default function EventVenueMap({ venue, picks = [], onSelect, onMapReady, venueKind = "event", parkingEnabled = true, nearbyStatus }) {
  const hostRef = useRef(null);
  const controllerRef = useRef(null);
  // Under a PhotoPolicyProvider (guides) the pin card shows no Google photo:
  // a 58px thumbnail has no room for Google's required visible credit.
  const photoSrcFilter = usePhotoSrcFilter();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gen, setGen] = useState(0);
  const [sel, setSel] = useState(null);
  const [active, setActive] = useState(null);
  const [parking, setParking] = useState({ status: "idle", places: [] });
  const [parkingAttempt, setParkingAttempt] = useState(0);
  const parkingCache = useRef(new Map());
  const parkingRequest = useRef(0);
  // The venue the map, parking search and Walk link actually use. A provider
  // point (Ticketmaster ZIP centroid) is swapped for Apple's verified point
  // before the controller is built; everything else stays the venue as given.
  const [mapVenue, setMapVenue] = useState(venue);
  // The key stays on the provider venue (plus its trust), so the parking cache
  // and the controller lifecycle are not re-keyed by the corrected point.
  const venueKey = JSON.stringify([venue?.id, venue?.name, venue?.lat, venue?.lng, venue?.locationTrust]);
  const currentView = useRef({ active, venueKey });
  currentView.current = { active, venueKey };
  const canPark = parkingEnabled && hasParkingCoordinate(venue);
  const parkingMode = active === "parking" && canPark;
  const pins = useMemo(() => picks.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)), [picks]);
  const groups = useMemo(() => {
    const counts = new Map();
    for (const place of pins) {
      const family = eventMapFamily(place);
      counts.set(family, (counts.get(family) || 0) + 1);
    }
    return Array.from(counts, ([family, count]) => ({ family, count, ...(EVENT_MAP_FAMILY[family] || EVENT_MAP_FAMILY.other) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [pins]);
  const shown = useMemo(() => active && active !== "parking" ? pins.filter((place) => eventMapFamily(place) === active) : pins, [active, pins]);
  const token = process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN;

  useEffect(() => {
    setActive(null); setSel(null); setMapVenue(venue);
    setParking(parkingCache.current.get(venueKey) || { status: "idle", places: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueKey]);

  useEffect(() => { if (!canPark && active === "parking") setActive(null); }, [canPark, active]);

  useEffect(() => {
    if (!hostRef.current || !venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return undefined;
    let dead = false;
    let controller = null;
    const watchdog = setTimeout(() => { if (!dead) setFailed(true); }, 12000);
    setReady(false); setFailed(false); setSel(null);
    loadAppleMapKit(token).then(async (mapkit) => {
      if (dead || !hostRef.current) return;
      // Provider-sourced venues only: ask Apple where the venue really is. The
      // resolver never rejects (no match, timeout or an old SDK keep the
      // provider point); the guard is for a contract break, which must not
      // take the whole map down.
      let resolution = null;
      if (needsAppleVenueCheck(venue)) {
        try { resolution = await resolveAppleVenueLocation({ mapkit, venue }); } catch { resolution = null; }
      }
      if (dead || !hostRef.current) return;
      const resolvedVenue = resolution ? applyVenueResolution(venue, resolution) : venue;
      controller = createAppleMapController({
        mapkit, container: hostRef.current, venue: resolvedVenue, picks: shown, venueKind,
        onSelect: (id) => { if (!dead) setSel(id); },
      });
      if (dead) { controller.destroy(); return; }
      controllerRef.current = controller;
      setMapVenue(resolvedVenue);
      clearTimeout(watchdog); setFailed(false); setReady(true); onMapReady?.(controller);
    }).catch(() => { if (!dead) { clearTimeout(watchdog); setFailed(true); } });
    return () => {
      dead = true; clearTimeout(watchdog);
      if (controller) controller.destroy();
      controllerRef.current = null;
      onMapReady?.(null);
    };
    // `pins` is intentionally represented by venue coordinates + generation;
    // the venue key also resets controllers for venues sharing coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, venueKey, venueKind]);

  const pinIdentity = JSON.stringify(shown.map(p => [p.id, p.lat, p.lng, p.name, p.cat, p.primaryType, p.mapKind, p.mapRank]));
  useEffect(() => { controllerRef.current?.setPicks(shown); }, [pinIdentity, ready]);
  useEffect(() => {
    if (active && active !== "parking" && !groups.some((group) => group.family === active)) setActive(null);
  }, [active, groups]);
  useEffect(() => {
    const visible = parkingMode ? parking.places : shown;
    if (sel && !visible.some((place) => String(place.id) === String(sel))) setSel(null);
  }, [sel, shown, parkingMode, parking.places]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!parkingMode || !ready || !controller) return undefined;
    const request = ++parkingRequest.current;
    const cached = parkingCache.current.get(venueKey);
    controller.setParkingMode(true, cached?.places || []);
    const isCurrent = () => request === parkingRequest.current && currentView.current.active === "parking" && currentView.current.venueKey === venueKey && controllerRef.current === controller;
    if (cached) setParking(cached);
    else {
      setParking({ status: "loading", places: [] });
      Promise.resolve().then(() => isCurrent() ? controller.searchParking() : null).then((result) => {
        if (!isCurrent() || !result) return;
        const next = { ...result, status: "success" };
        parkingCache.current.set(venueKey, next);
        setParking(next);
        controller.setParkingMode(true, next.places);
      }).catch((error) => {
        if (isCurrent()) {
          reportMapServiceIssue("parking", mapFailureReason(error?.cause || error));
          setParking({ status: "error", places: [] });
        }
      });
    }
    return () => {
      parkingRequest.current += 1;
      controller.cancelParkingSearch();
      controller.setParkingMode(false);
      setParking((previous) => previous.status === "loading" ? { status: "idle", places: [] } : previous);
    };
  }, [parkingMode, ready, venueKey, parkingAttempt]);

  useEffect(() => { if (onSelect) onSelect(parkingMode ? null : sel); }, [sel, parkingMode, onSelect]);
  const chooseCategory = (next) => {
    // Invalidate synchronously so a completed request cannot win the click race.
    currentView.current = { active: next, venueKey };
    parkingRequest.current += 1;
    if (active === "parking" && next !== "parking") controllerRef.current?.cancelParkingSearch();
    setActive(next); setSel(null);
  };
  const retry = () => { setFailed(false); setReady(false); setSel(null); setGen((g) => g + 1); };
  const selected = !parkingMode && sel ? shown.find((p) => String(p.id) === String(sel)) : null;
  // Missing, placeholder, or already-expired: render the fallback at once and
  // never start MapKit (lib/appleMapsToken.js reads the expiry from the JWT).
  const unavailable = !appleMapsTokenUsable(token);
  return (
    <div className="wfev-grid">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wfev-cats" aria-label="Map categories">
        <button type="button" className="wfev-cat" aria-pressed={active === null} onClick={() => chooseCategory(null)}><MapCategoryPin />{nearbyStatus === "loading" && pins.length === 0 ? <><span>All places</span><span>…</span></> : nearbyStatus === "error" && pins.length === 0 ? <span>All places</span> : <><span>All places</span><b>{pins.length}</b></>}</button>
        {canPark ? <button type="button" className="wfev-cat" aria-pressed={parkingMode} onClick={() => { if (!parkingMode) chooseCategory("parking"); }}><MapCategoryPin family="parking" /><span>Parking</span></button> : null}
        {groups.map((group) => <button key={group.family} type="button" className="wfev-cat" aria-pressed={active === group.family} onClick={() => chooseCategory(active === group.family ? null : group.family)}><MapCategoryPin family={group.family} /><span>{group.label}</span><b>{group.count}</b></button>)}
      </div>
      <div className="wfev wfev-h" aria-label={`Apple map of ${mapVenue.name}`}>
        <div ref={hostRef} className="wfev-canvas" />
        {ready && !parkingMode && shown.length > 0 && !selected ? <div className="wfev-legend" aria-hidden="true"><span><MapCategoryPin family={venueKind === "place" ? eventMapFamily(venue) : "event"} height={24} />{venueKind === "place" ? "Place" : "Event"}</span><span>{shown.length} {active ? (EVENT_MAP_FAMILY[active]?.label || "places") : "places"}</span></div> : null}
        {selected ? <div className="wfev-card" role="region" aria-label={selected.name}>
          {photoSrcFilter(thumb(selected)) ? <span className="wfev-thumb" style={{ position: "relative", display: "block", width: 58, height: 58, flex: "0 0 58px", borderRadius: 12, overflow: "hidden" }}><CardPhoto src={photoSrcFilter(thumb(selected))} alt="" compact style={{ width: 58, height: 58, objectFit: "cover", display: "block" }} /></span> : null}<span style={{ minWidth: 0, flex: 1 }}><b>{selected.name}</b><small>{Number.isFinite(selected.wfScore) ? <u>{(selected.wfScore / 10).toFixed(1)}</u> : null}{selected.cat || "Nearby"}<PlaceDistance place={selected} prefix=" · " /></small></span>
          <a className="wfev-go" href={selected.href}>Open</a><button type="button" className="wfev-x" aria-label="Close" onClick={() => setSel(null)}>×</button>
        </div> : null}
        {failed || unavailable ? <div className="wfev-fb"><div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(148,163,184,.14)", border: "1px solid rgba(148,163,184,.38)", display: "grid", placeItems: "center", color: "#FB923C", fontSize: 20 }}>⌁</div><div style={{ fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{venue.name}</div><div style={{ maxWidth: 280, color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>The map preview is unavailable right now. The address and external navigation link are still available.</div>{!unavailable ? <button type="button" onClick={retry} style={{ marginTop: 4, padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(249,115,22,.5)", background: "rgba(249,115,22,.14)", color: "#FB923C", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button> : null}</div> : null}
      </div>
      {parkingMode ? <VenueParkingResults venue={mapVenue} places={parking.places} status={failed || unavailable ? "error" : parking.status} message={failed || unavailable ? "The Apple map is unavailable, so parking cannot be loaded right now." : undefined} radiusMeters={parking.radiusMeters} selectedId={sel} onSelect={(id) => { setSel(id); controllerRef.current?.selectParking(id); }} onRetry={() => { if (failed && !unavailable) retry(); else setParkingAttempt((attempt) => attempt + 1); }} /> : null}
    </div>
  );
}
