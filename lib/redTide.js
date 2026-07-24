// lib/redTide.js — FWC red tide (Karenia brevis) status for beach chips.
// Source: FWC-FWRI's own "most recent 8 days" categorical-abundance layer —
// the SAME data behind myfwc.com's Red Tide Current Status map. Keyless,
// public, exported daily by FWC.
//
// DATA HONESTY: we show FWC's OWN category verbatim-mapped (never a number we
// invented), we always carry the sample date and distance, and a beach with
// no sample within RED_TIDE_MAX_MI simply shows NO chip — silence over guess.
// K. brevis is the Gulf's actual "is the water gross" signal (fish kills,
// respiratory irritation, murky blooms) — the clarity/seaweed ask, sourced.
import { siteTodayStr } from "./siteTime.js";

export const FWC_HAB_URL = "https://services2.arcgis.com/z6TmTIyYXEYhuNM0/arcgis/rest/services/HAB_Current_Web_Layer/FeatureServer/0/query";
export const RED_TIDE_MAX_MI = 10;

// FWC's categorical abundance strings → one honest chip level.
export function rtLevel(abundance) {
  const a = String(abundance || "").toLowerCase();
  if (!a) return null;
  if (a.includes("not present") || a.includes("background")) return { level: "none", label: "not present", tone: "good" };
  if (a.includes("very low")) return { level: "very_low", label: "very low", tone: "good" };
  if (a.includes("medium")) return { level: "medium", label: "medium", tone: "bad" };
  if (a.includes("high")) return { level: "high", label: "high", tone: "bad" };
  if (a.includes("low")) return { level: "low", label: "low", tone: "warn" };
  return null;
}

const R = 3958.8;
export function rtDistMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Nearest usable sample within the cap; ties broken by freshest SAMPLE_DATE.
export function nearestSample(features, lat, lng, maxMi = RED_TIDE_MAX_MI) {
  let best = null;
  for (const f of features || []) {
    const a = f && f.attributes;
    if (!a || !isFinite(a.LATITUDE) || !isFinite(a.LONGITUDE)) continue;
    const lv = rtLevel(a.Abundance);
    if (!lv) continue;
    const d = rtDistMi(lat, lng, a.LATITUDE, a.LONGITUDE);
    if (d > maxMi) continue;
    if (!best || d < best.mi - 0.05 || (Math.abs(d - best.mi) <= 0.05 && (a.SAMPLE_DATE || 0) > best.sampleMs)) {
      best = { ...lv, mi: d, sampleMs: a.SAMPLE_DATE || null, location: a.LOCATION || null };
    }
  }
  if (!best) return null;
  return {
    level: best.level, label: best.label, tone: best.tone,
    mi: Math.round(best.mi * 10) / 10,
    sampledAt: best.sampleMs ? siteTodayStr(new Date(best.sampleMs)) : null, // ET day of the sample, not UTC
  };
}

// One bbox fetch around the point (8-day layer is small); fail-soft to null.
export async function getRedTide(lat, lng) {
  try {
    const pad = 0.35; // ~24 mi box, then the true distance cap applies
    const qs = new URLSearchParams({
      where: "1=1", outFields: "LATITUDE,LONGITUDE,Abundance,SAMPLE_DATE,LOCATION",
      geometry: `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`,
      geometryType: "esriGeometryEnvelope", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects", f: "json", resultRecordCount: "200",
    });
    const r = await fetch(FWC_HAB_URL + "?" + qs.toString(), { next: { revalidate: 21600 } });
    if (!r.ok) return null;
    const d = await r.json();
    return nearestSample(d && d.features, lat, lng);
  } catch (e) { return null; }
}
