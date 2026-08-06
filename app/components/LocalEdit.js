"use client";
// app/components/LocalEdit.js — "Read the local edit".
//
// v6.97. THE MISSING BRIDGE (owner's own annotation on the approved mockup):
// the guides pull real traffic from Google every month and every one of those
// readers dead-ends there. Nothing on the home screen has ever linked to them,
// so the traffic flows one way into a cul-de-sac. This is the cheapest section
// in the whole redesign — a list of links to pages that already exist, already
// rank, and already convert — and it is the only one with a measurable funnel
// on the other side of it.
//
// HONESTY RULES, because "local" is a claim:
//   • Guides are shown only when the reader is actually NEAR the region they
//     cover. A Miami visitor is not shown Orlando guides under a heading that
//     says "local"; they are shown nothing, and the section does not render.
//   • The teaser is the guide's OWN teaser (lib/guides.js), which
//     scripts/check-guide-teasers.mjs already proves is grounded in that
//     guide's own picks and tips. No new copy is written here, so there is
//     nothing new that can drift away from what the article delivers.
//   • Read time is COMPUTED from the guide's real body text, not typed in by
//     hand. A hand-typed "5 min" is a number nobody ever updates.
import { GUIDES } from "../../lib/guides";
import { C, TYPE } from "./kit";

// Region centroids for the four regions lib/guides.js actually covers. Public
// city centres, used ONLY to decide whether a guide is near enough to call
// local — never shown, never presented as a venue's position.
const REGION_COORDS = {
  Orlando: { lat: 28.5384, lng: -81.3789 },
  Tampa: { lat: 27.9506, lng: -82.4572 },
  Sarasota: { lat: 27.3364, lng: -82.5307 },
  Bradenton: { lat: 27.4989, lng: -82.5748 },
};

// How far "local" reaches. 60 miles is a day trip in Florida and roughly the
// gap between these regions, so a reader in Parrish gets Bradenton and Sarasota
// and does NOT get Orlando — which is exactly the call a person would make.
export const LOCAL_EDIT_RADIUS_MI = 60;
export const LOCAL_EDIT_MAX = 3;
const WORDS_PER_MIN = 200;

function haversineMi(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7554;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Minutes to read, from the guide's REAL body: intro + every pick + every answer. */
export function readMinutes(g) {
  if (!g) return null;
  const parts = [g.intro || ""];
  for (const p of g.picks || []) parts.push(p.blurb || "", p.tip || "");
  for (const f of g.faq || []) parts.push(f.q || "", f.a || "");
  const words = parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  return Math.max(1, Math.round(words / WORDS_PER_MIN));
}

/**
 * The guides worth showing at `center`, nearest region first, newest first
 * within a region. Empty when nothing is near — the caller renders nothing
 * rather than a "local" heading over guides from three hours away.
 */
export function localGuides(center, max = LOCAL_EDIT_MAX) {
  if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return [];
  const rows = [];
  for (const [slug, g] of Object.entries(GUIDES || {})) {
    const rc = REGION_COORDS[g && g.region];
    if (!rc) continue;
    const distMi = haversineMi(center.lat, center.lng, rc.lat, rc.lng);
    if (distMi > LOCAL_EDIT_RADIUS_MI) continue;
    rows.push({ slug, distMi, title: g.title, teaser: g.teaser, region: g.region, updated: g.updated || "", mins: readMinutes(g) });
  }
  rows.sort((a, b) => a.distMi - b.distMi || String(b.updated).localeCompare(String(a.updated)));
  return rows.slice(0, max);
}

export default function LocalEdit({ center, onLog }) {
  const rows = localGuides(center);
  if (!rows.length) return null;
  return (
    <section aria-label="Read the local edit" style={{ marginBottom: 12 }}>
      <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 8 }}>Read the local edit</div>
      <div style={{ border: "1px solid " + C.line, borderRadius: 14, background: "#0B0E15", overflow: "hidden" }}>
        {rows.map((r, i) => (
          <a key={r.slug} href={"/guides/" + r.slug}
            onClick={() => { try { onLog && onLog("local_edit_open", null, { slug: r.slug, region: r.region, pos: i }); } catch (e) {} }}
            style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 13px", textDecoration: "none", borderTop: i ? "1px solid rgba(255,255,255,.06)" : "none" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{r.title}</span>
              {r.teaser ? <span style={{ display: "block", fontSize: 12, color: "#8D9AAB", lineHeight: 1.4, marginTop: 3 }}>{r.teaser}</span> : null}
            </span>
            {r.mins ? <span style={{ flexShrink: 0, fontSize: 11, color: C.muted, whiteSpace: "nowrap", paddingTop: 2 }}>{r.mins} min</span> : null}
          </a>
        ))}
      </div>
    </section>
  );
}
