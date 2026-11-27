// A simple list of community guides or itinerary templates (server component).
import Link from "next/link";
import GuidePhoto from "./GuidePhoto";
import { railPhotoSrc } from "../../lib/cardPhotoRequest";

const CARD = "#1C2230", HAIR = "#2D3748", TEXT = "#F1F5F9", MUTE = "#94A3B8", LIGHT = "#CBD5E1";

function cover(stops) {
  for (const s of stops || []) {
    if (s.photo && s.photo.url) return s.photo.url;
    if (s.kind === "place") { const src = railPhotoSrc({ id: s.ref_id }); if (src) return src; }
  }
  return null;
}

export default function CommunityTripList({ items, base, empty }) {
  if (!items || !items.length) return <p style={{ color: MUTE, fontSize: 15, lineHeight: 1.5 }}>{empty}</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
      {items.map((it) => {
        const img = cover(it.stops);
        return (
          <li key={it.slug} style={{ background: CARD, border: `1px solid ${HAIR}`, borderRadius: 16, overflow: "hidden", minWidth: 0 }}>
            <Link href={`${base}/${it.slug}`} style={{ display: "block", color: TEXT, textDecoration: "none" }}>
              {img ? <div style={{ aspectRatio: "16 / 9", background: "#11161F", overflow: "hidden" }}><GuidePhoto src={img} alt="" width={600} height={338} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} fallbackText={it.city} /></div> : null}
              <div style={{ padding: "12px 14px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: MUTE, textTransform: "uppercase", letterSpacing: ".4px" }}>{it.city} · {(it.stops || []).length} stops{it.days > 1 ? ` · ${it.days} days` : ""}</div>
                <div style={{ fontSize: 17, fontWeight: 800, margin: "4px 0 4px", lineHeight: 1.25, overflowWrap: "anywhere" }}>{it.title}</div>
                {it.intro ? <div style={{ fontSize: 14, color: LIGHT, lineHeight: 1.45, overflowWrap: "anywhere" }}>{it.intro}</div> : null}
                {it.author ? <div style={{ fontSize: 12.5, color: MUTE, marginTop: 6 }}>By {it.author}</div> : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
