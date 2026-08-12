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
//
// v7.29 PERF: the rules above are unchanged; only WHERE they run moved. This
// file used to import the whole GUIDES corpus to compute read time, which put
// 52.8KB of guide prose into the homepage's JS bundle to render three titles.
// The corpus now stays on the server — app/page.js calls localEditIndex(GUIDES)
// once per revalidation and passes the resulting ~9KB of rows down as `guides`.
// readMinutes and the radius live in lib/localEdit.js so the server index and
// this component share ONE implementation and cannot drift apart.
import { LOCAL_EDIT_MAX, LOCAL_EDIT_RADIUS_MI, localGuides, readMinutes, WORDS_PER_MIN } from "../../lib/localEdit";
import { C, TYPE } from "./kit";

export { LOCAL_EDIT_MAX, LOCAL_EDIT_RADIUS_MI, localGuides, readMinutes, WORDS_PER_MIN };

export default function LocalEdit({ center, guides, onLog }) {
  const rows = localGuides(guides, center, LOCAL_EDIT_MAX);
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
