"use client";

import { useEffect, useState } from "react";
import RailCard, { RailDots, RailNav } from "../../../components/RailCard";
import { WF_PLACE_CARD_CSS } from "../../../components/css";
import { cardImageSrc } from "../../../../lib/placePhoto";
import { toDisplayScore } from "../../../../lib/score";
import { fetchJsonWithDeadline } from "../../../../lib/clientJson";

const EVENT_PLAN_RAILS = [
  { kind: "food", title: "Eat nearby", deck: "Great meals that fit before showtime.", benefit: "A strong meal before the event" },
  { kind: "after", title: "Keep the night going", deck: "The best next stops nearby.", benefit: "A well-rated next stop close by" },
  { kind: "stay", title: "Stay nearby", deck: "Top stays for an easier night.", benefit: "A top-rated nearby base" },
];

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

function chooseBest(rows, origin, venueName, excluded = new Set(), limit = 8) {
  const venue = String(venueName || "").toLowerCase();
  return (rows || [])
    .filter((p) => p && p.id && !excluded.has(p.id) && textName(p) && textName(p).toLowerCase() !== venue)
    .map((p) => ({ ...p, _name: textName(p), _miles: milesBetween(origin, point(p)) }))
    .filter((p) => p._miles == null || p._miles <= 12)
    .sort((a, b) => quality(b) - quality(a) || reviews(b) - reviews(a) || (a._miles ?? 99) - (b._miles ?? 99))
    .slice(0, limit);
}

function detailHref(place) {
  return place && place.id ? `/p/${encodeURIComponent(place.id)}` : null;
}

export default function EventPlan({ lat, lng, city, venue, time }) {
  const [rails, setRails] = useState(null);

  useEffect(() => {
    const origin = { lat: Number(lat), lng: Number(lng) };
    if (!isFinite(origin.lat) || !isFinite(origin.lng)) return;
    let dead = false;
    setRails(EVENT_PLAN_RAILS.map((rail) => ({ ...rail, places: null })));
    const publish = (kind, places) => {
      if (dead) return;
      setRails((current) => current && current.map((rail) => rail.kind === kind ? { ...rail, places } : rail));
    };
    const base = `lat=${origin.lat.toFixed(4)}&lng=${origin.lng.toFixed(4)}&radius=12000&n=10`;
    const search = async (q, cat) => {
      try {
        const j = await fetchJsonWithDeadline(`/api/places/search?${base}&q=${encodeURIComponent(q)}&cat=${encodeURIComponent(cat)}`);
        return j && Array.isArray(j.places) ? j.places : [];
      } catch { return []; }
    };
    (async () => {
      const eventHour = Number(String(time || "").slice(0, 2));
      const afterQuery = isFinite(eventHour) && eventHour < 16 ? "coffee dessert local attraction" : "cocktail bar dessert live music";
      // Launch all three inventory reads together, then paint each rail as its
      // result becomes usable. Hotels can be slower without hiding food and
      // after-event choices or the section itself.
      const foodRequest = search("best local restaurant", "food");
      const afterRequest = search(afterQuery, isFinite(eventHour) && eventHour < 16 ? "food" : "nightlife");
      const stayRequest = fetchJsonWithDeadline(`/api/hotels?lat=${origin.lat.toFixed(4)}&lng=${origin.lng.toFixed(4)}&city=${encodeURIComponent(city || "")}&limit=12`)
        .then((j) => j && Array.isArray(j.hotels) ? j.hotels : []).catch(() => []);
      const used = new Set();

      const foodRows = await foodRequest;
      const food = chooseBest(foodRows, origin, venue, used);
      food.forEach((place) => used.add(place.id));
      publish("food", food);

      const afterRows = await afterRequest;
      const after = chooseBest(afterRows, origin, venue, used);
      after.forEach((place) => used.add(place.id));
      publish("after", after);

      let stayRows = await stayRequest;
      if (!stayRows.length) stayRows = await search(`best hotel near ${venue || city || "the event"}`, "hotels");
      const stay = chooseBest(stayRows, origin, venue, used);
      publish("stay", stay);
    })();
    return () => { dead = true; };
  }, [lat, lng, city, venue, time]);

  if (!rails) return null;
  return (
    <section aria-label="Complete the plan" style={{ marginTop: 32 }}>
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "1.4px", textTransform: "uppercase", color: "#FB923C" }}>Complete the plan</div>
      <h2 style={{ margin: "6px 0 0", color: "#F8FAFC", fontSize: 25, lineHeight: 1.1, letterSpacing: "-.35px" }}>Build the rest of your night.</h2>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: "#94A3B8", marginTop: 7 }}>Ranked from the event location — not paid placement.</div>
      {rails.map(({ kind, title, deck, places }) => {
        const railId = `event-plan-${kind}`;
        return <section key={kind} aria-labelledby={`${railId}-title`} style={{ marginTop: 24 }}>
          <h3 id={`${railId}-title`} style={{ margin: 0, color: "#F8FAFC", fontSize: 19, lineHeight: 1.2 }}>{title}</h3>
          <p className="wf-rail-deck" style={{ marginTop: 4, color: "#A8B2C2" }}>{deck}</p>
          {places === null ? <div role="status" style={{ color: "#7F8A9C", fontSize: 12.5, padding: "14px 0" }}>Finding nearby picks…</div> : !places.length ? <p style={{ color: "#7F8A9C", fontSize: 12.5 }}>No nearby option clears Wayfind&apos;s quality bar yet.</p> : <>
            <RailNav railId={railId} count={places.length} total={places.length} unit="ranked options" />
            <div className="wf-rail" data-rail={railId} tabIndex={0} role="region" aria-label={title}>
              {places.map((place, index) => {
                const href = detailHref(place);
                const score = Number(place.wfScore ?? place.score);
                return <RailCard
                  key={place.id}
                  place={place}
                  photo={place.photoUrl || place.photo_url || place.image || place.photo || cardImageSrc(place, 640)}
                  title={place._name}
                  eyebrow={title}
                  rank={index + 1}
                  score={Number.isFinite(score) && score > 0 ? toDisplayScore(score) : null}
                  facts={[rating(place) ? `${rating(place).toFixed(1)}★` : null, reviews(place) ? `${reviews(place).toLocaleString()} reviews` : null, place._miles != null ? (place._miles < .2 ? "Steps away" : `${place._miles.toFixed(1)} mi`) : null].filter(Boolean)}
                  href={href}
                  ariaLabel={`Open ${place._name}`}
                  eagerMedia={index < 3}
                />;
              })}
            </div>
            <RailDots railId={railId} count={places.length} />
          </>}
        </section>;
      })}
      {rails.some((rail) => rail.kind === "stay" && Array.isArray(rail.places) && rail.places.length) && <div style={{ color: "#64748B", fontSize: 10.5, lineHeight: 1.4, marginTop: 12 }}>Hotel booking may earn Wayfind a commission at no extra cost to you. It never changes the ranking.</div>}
    </section>
  );
}
