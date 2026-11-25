import { applePinOptions, createLocationDotElement } from "./mapPinStandard.js";
import { eventMapFamily } from "./eventMapPlaces.js";
import { categoryGlyph, pinFamily, NEUTRAL_GLYPH } from "./mapPinGlyph.js";

export function creatorMapGlyph(place) {
  const glyph = categoryGlyph(place);
  if (glyph !== NEUTRAL_GLYPH) return glyph;
  return ({ cafe: "☕", food: "🍽️", drinks: "🍸", shows: "🎭", outdoors: "🌳", water: "🌊", culture: "🏛️", stay: "🛏️", shop: "🛍️" })[pinFamily(place)] || "📍";
}

function validUserPoint(point) {
  if (!point || point.lat == null || point.lng == null) return null;
  if (typeof point.lat === "string" && !point.lat.trim()) return null;
  if (typeof point.lng === "string" && !point.lng.trim()) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 85.0511 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

// Every annotation is a verified creator place. No synthetic center pin.
export function createCreatorAppleMap({ mapkit, container, places, onSelect, deviceLoc = null }) {
  // WAYFIND-10: finite is not enough. A latitude past the Web Mercator limit
  // (85.0511) cannot be projected, and one such pin makes MapKit throw on the
  // next pan/zoom for the whole map. Same rule as lib/appleMapsRuntime.js.
  const rows = places.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85.0511 && Math.abs(p.lng) <= 180);
  const map = new mapkit.Map(container, { showsMapTypeControl: false, isRotationEnabled: false });
  const pins = rows.map(p => {
    const family = eventMapFamily(p);
    const annotation = new mapkit.ImageAnnotation(new mapkit.Coordinate(p.lat, p.lng), {
      title: p.name, subtitle: p.city || "", ...applePinOptions(mapkit, family),
    });
    // NO CALLOUT. The card beside the map is this pin's detail view, so Apple's
    // bubble would only repeat it -- and asking for one is not free. Our pins are
    // SVG data-URL images with no declared size, so MapKit cannot measure them
    // until they load; positioning a callout for an unmeasured image throws
    // inside mapkit.core (positionForCallout reads size.width). MapKit
    // re-positions the selected callout every time it adds another annotation,
    // so one selected pin aborts the add loop for all the rest. On
    // 2026-09-22 /guides/florida-fall-festivals-2026 shipped with a selected
    // card on load and rendered ONE pin of nine. Selection still works and the
    // map still emits select, so the card still follows the pin.
    annotation.calloutEnabled = false;
    annotation.__wayfindId = String(p.id);
    annotation.__wayfindFamily = family;
    annotation.__wayfindLifted = false;
    return annotation;
  });
  map.addAnnotations(pins);
  if (pins.length) map.showItems(pins, { animate: false, padding: new mapkit.Padding(50, 35, 50, 35) });
  // Optional non-interactive pulsing Wayfind Orange current-location dot ONLY
  // when a real user device coordinate is provided. Never added to `pins` and
  // never alters `showItems(pins)` framing.
  let dead = false;
  let userAnnotation = null;
  let userKey = "";
  const removeUserAnnotation = () => {
    if (!userAnnotation) return;
    if (typeof map.removeAnnotation === "function") map.removeAnnotation(userAnnotation);
    else if (typeof map.removeAnnotations === "function") map.removeAnnotations([userAnnotation]);
    userAnnotation = null;
  };
  const setUserLocation = (point) => {
    if (dead) return;
    const pt = validUserPoint(point);
    const nextKey = pt ? `${pt.lat}|${pt.lng}` : "";
    if (nextKey === userKey) return;
    removeUserAnnotation();
    userKey = nextKey;
    if (!pt) return;
    const coord = new mapkit.Coordinate(pt.lat, pt.lng);
    const ann = typeof mapkit.Annotation === "function" && typeof document !== "undefined"
      ? new mapkit.Annotation(
        coord,
        () => createLocationDotElement({ label: "Your location" }),
        { title: "Your location", accessibilityLabel: "Your location", displayPriority: 990, enabled: false },
      )
      : new mapkit.ImageAnnotation(coord, {
        title: "Your location",
        accessibilityLabel: "Your location",
        ...applePinOptions(mapkit, "location"),
        enabled: false,
      });
    ann.calloutEnabled = false;
    ann.__wayfindOrigin = true;
    userAnnotation = ann;
    if (typeof map.addAnnotation === "function") map.addAnnotation(ann);
    else if (typeof map.addAnnotations === "function") map.addAnnotations([ann]);
  };
  if (deviceLoc) setUserLocation(deviceLoc);
  // With no callout, a selected ImageAnnotation looks exactly like every other
  // pin, so nothing on the map showed which pin belonged to the card in view.
  // Paint the pin standard's own selected treatment on whichever pin is
  // selected and restore the plain pin when it is not. Only pins whose state
  // changed are repainted, so swiping never redraws the whole map.
  const lift = (annotation, lifted) => {
    if (!annotation || !annotation.__wayfindFamily || annotation.__wayfindLifted === lifted) return;
    try {
      Object.assign(annotation, applePinOptions(mapkit, annotation.__wayfindFamily, { selected: lifted }));
      annotation.__wayfindLifted = lifted;
    } catch (e) {}
  };

  // Card-to-pin sync selects pins in code, and MapKit answers every such
  // selection with the same select event a tap produces, synchronously inside
  // the `selected` assignment. Reporting those as taps made the card and the
  // map fight: a tapped pin started the rail moving, the first scroll frame
  // re-selected the card still in view, that selection came back as a "tap"
  // and sent the rail home. Tapping a pin never brought its card forward
  // (/guides/florida-fall-festivals-2026, 2026-09-22). Only real taps reach
  // onSelect now.
  let syncing = false;
  const select = event => {
    if (event?.annotation?.__wayfindOrigin) return;
    lift(event?.annotation, true);
    if (!syncing) onSelect?.(event?.annotation?.__wayfindId || null);
  };
  const deselect = event => lift(event?.annotation, false);
  map.addEventListener("select", select);
  map.addEventListener("deselect", deselect);

  // Guide/map parity: selecting a card selects the matching Apple Maps
  // annotation without rebuilding the map or inventing a second marker style.
  const selectById = id => {
    const key = id == null ? "" : String(id);
    const annotation = key ? pins.find(pin => pin.__wayfindId === key) || null : null;
    syncing = true;
    try {
      // MapKit JS annotations own their selected state. Clear the previous one,
      // then select the card's pin.
      for (const pin of pins) {
        try { pin.selected = pin === annotation; } catch (e) {}
      }
    } finally {
      syncing = false;
    }
    for (const pin of pins) lift(pin, pin === annotation);
    return !!annotation;
  };

  return {
    select: selectById,
    setUserLocation,
    destroy() {
      if (dead) return;
      dead = true;
      removeUserAnnotation();
      map.removeEventListener("select", select);
      map.removeEventListener("deselect", deselect);
      map.destroy();
    },
  };
}
