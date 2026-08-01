"use client";

import { useEffect, useState } from "react";

function textName(place) {
  const d = place && place.displayName;
  return String((place && place.name) || (typeof d === "string" ? d : d && d.text) || "").trim();
}

function point(place) {
  const loc = (place && place.location) || {};
  const lat = Number(place && (place.lat ?? loc.latitude));
  const lng = Number(place && (place.lng ?? loc.longitude));
  return isFinite(lat) && isFinite(lng) ? { lat, lng } : null;
}

function reviews(place) {
  return Math.max(0, Number(place && (place.reviews ?? place.userRatingCount)) || 0);
}

function rating(place) {
  return Math.max(0, Number(place && (place.rating ?? place.signals?.rating)) || 0);
}

function milesBetween(a, b) {
  if (!a || !b) return null;
  const rad = (n) => n * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function quality(place) {
  const ownedScore = Number(place && (place.wfScore ?? place.score));
  if (isFinite(ownedScore) && ownedScore > 0) return ownedScore * 10;
  return rating(place) * 20 + Math.min(12, Math.log10(reviews(place) + 1) * 4);
}

function chooseBest(rows, origin, venueName) {
  const venue = String(venueName || "").toLowerCase();
  return (rows || [])
    .filter((p) => p && p.id && textName(p) && textName(p).toLowerCase() !== venue)
    .map((p) => ({ ...p, _name: textName(p), _miles: milesBetween(origin, point(p)) }))
    .filter((p) => p._miles == null || p._miles <= 12)
    .sort((a, b) => quality(b) - quality(a) || reviews(b) - reviews(a) || (a._miles ?? 99) - (b._miles ?? 99))[0] || null;
}

function detailHref(place) {
  return place && place.id ? `/p/${encodeURIComponent(place.id)}` : null;
}

function factLine(place, kind) {
  const parts = [];
  if (rating(place)) parts.push(`${rating(place).toFixed(1)}★`);
  if (place && place._miles != null) parts.push(place._miles < 0.2 ? "Steps away" : `${place._miles.toFixed(1)} mi away`);
  if (!parts.length) parts.push(kind === "stay" ? "A nearby place to stay" : "A nearby Wayfind pick");
  return parts.join(" · ");
}

export default function EventPlan({ lat, lng, city, venue, time }) {
  const [picks, setPicks] = useState(null);

  useEffect(() => {
    const origin = { lat: Number(lat), lng: Number(lng) };
    if (!isFinite(origin.lat) || !isFinite(origin.lng)) return;
    let dead = false;
    const base = `lat=${origin.lat.toFixed(4)}&lng=${origin.lng.toFixed(4)}&radius=12000&n=10`;
    const search = async (q, cat) => {
      try {
        const r = await fetch(`/api/places/search?${base}&q=${encodeURIComponent(q)}&cat=${encodeURIComponent(cat)}`);
        const j = r.ok ? await r.json() : null;
        return j && Array.isArray(j.places) ? j.places : [];
      } catch { return []; }
    };
    (async () => {
      const eventHour = Number(String(time || "").slice(0, 2));
      const afterQuery = isFinite(eventHour) && eventHour < 16 ? "coffee dessert local attraction" : "cocktail bar dessert live music";
      const [foodRows, afterRows, ownedStay] = await Promise.all([
        search("best local restaurant", "food"),
        search(afterQuery, isFinite(eventHour) && eventHour < 16 ? "food" : "nightlife"),
        fetch(`/api/hotels?lat=${origin.lat.toFixed(4)}&lng=${origin.lng.toFixed(4)}&city=${encodeURIComponent(city || "")}&limit=12`)
          .then((r) => r.ok ? r.json() : null).then((j) => j && Array.isArray(j.hotels) ? j.hotels : []).catch(() => []),
      ]);
      let stayRows = ownedStay;
      if (!stayRows.length) stayRows = await search(`best hotel near ${venue || city || "the event"}`, "hotels");
      if (!dead) setPicks([
        { kind: "food", eyebrow: "Eat nearby", benefit: "A strong meal before the event", place: chooseBest(foodRows, origin, venue) },
        { kind: "after", eyebrow: "Keep the night going", benefit: "A well-rated next stop close by", place: chooseBest(afterRows, origin, venue) },
        { kind: "stay", eyebrow: "Stay nearby", benefit: "A top-rated nearby base", place: chooseBest(stayRows, origin, venue) },
      ].filter((x) => x.place && detailHref(x.place)));
    })();
    return () => { dead = true; };
  }, [lat, lng, city, venue, time]);

  if (!picks || !picks.length) return null;
  return (
    <section aria-label="Complete the plan" style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "1.2px", textTransform: "uppercase", color: "#2EC9A6" }}>Complete the plan</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: "#94A3B8", marginTop: 4 }}>Useful nearby choices, ranked from the event—not paid placement.</div>
      <div style={{ display: "grid", gap: 9, marginTop: 11 }}>
        {picks.map(({ kind, eyebrow, benefit, place }) => (
          <a key={kind} href={detailHref(place)} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, border: "1px solid #2A3546", background: "linear-gradient(145deg,#151E2B,#101722)", color: "inherit", textDecoration: "none" }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", color: "#94A3B8", fontSize: 10, lineHeight: 1.2, fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px" }}>{eyebrow}</span>
              <span style={{ display: "block", color: "#F1F5F9", fontSize: 15, lineHeight: 1.25, fontWeight: 850, marginTop: 4 }}>{place._name}</span>
              <span style={{ display: "block", color: "#AAB6C8", fontSize: 11.5, lineHeight: 1.35, marginTop: 4 }}>{benefit} · {factLine(place, kind)}</span>
            </span>
            <span aria-hidden="true" style={{ color: "#2EC9A6", fontSize: 20, fontWeight: 900 }}>›</span>
          </a>
        ))}
      </div>
      {picks.some((x) => x.kind === "stay") && <div style={{ color: "#64748B", fontSize: 10.5, lineHeight: 1.4, marginTop: 8 }}>Hotel booking may earn Wayfind a commission at no extra cost to you. It never changes the ranking.</div>}
    </section>
  );
}
