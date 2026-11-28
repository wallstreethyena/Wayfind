// NewsletterSignup — the weekly email signup (owner order 2026-11-27).
//
// A SERVER component and a plain HTML form: no "use client", no JavaScript,
// so the homepage, Christmas, event and city pages that show it add zero
// bytes of client bundle (the homepage sits close to its size cap). The form
// posts to /api/newsletter/subscribe, which answers with the
// /newsletter/thanks page.
//
// Honest promise, one field plus the area, options not orders. The consent
// words under the button are CONSENT_TEXT, stored with every signup.
import { CONSENT_TEXT, NEWSLETTER_REGIONS, normalizeRegion, safeReturnPath } from "../../lib/newsletter.js";

const S = {
  wrap: { margin: "28px auto", maxWidth: 720, padding: "0 16px", boxSizing: "border-box" },
  card: { borderRadius: 18, border: "1px solid #2A3646", background: "linear-gradient(135deg, rgba(249,115,22,.10), rgba(255,255,255,.02) 60%)", padding: "20px 18px" },
  kicker: { fontSize: 11, fontWeight: 900, letterSpacing: "1.6px", textTransform: "uppercase", color: "#F97316", margin: 0 },
  h2: { fontSize: 21, lineHeight: 1.25, fontWeight: 800, color: "#F1F5F9", margin: "6px 0 6px" },
  p: { fontSize: 14, lineHeight: 1.55, color: "#B6C2CF", margin: "0 0 14px" },
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: { flex: "1 1 210px", minWidth: 0, height: 46, padding: "0 14px", borderRadius: 12, border: "1px solid #2A3646", background: "#0D1420", color: "#E7EDF4", fontSize: 16, boxSizing: "border-box" },
  select: { flex: "1 1 170px", minWidth: 0, height: 46, padding: "0 12px", borderRadius: 12, border: "1px solid #2A3646", background: "#0D1420", color: "#E7EDF4", fontSize: 16, boxSizing: "border-box" },
  btn: { flex: "1 1 100%", height: 48, padding: "0 18px", borderRadius: 12, border: "none", background: "#F97316", color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: "pointer" },
  fine: { fontSize: 12, lineHeight: 1.5, color: "#8A97A6", margin: "10px 0 0" },
  link: { color: "#B6C2CF", textDecoration: "underline" },
  hp: { position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" },
};

export default function NewsletterSignup({ source = "site", region = null, back = "/", heading = "Your weekend, sorted", style = null }) {
  // Preselect only when the page knows the area (an event or a city page).
  // Elsewhere the reader picks; a wrong default would send the wrong city.
  const picked = normalizeRegion(region) || "";
  const id = `wf-nl-${String(source).replace(/[^a-z0-9-]/gi, "")}`;
  return (
    <section aria-labelledby={`${id}-h`} style={{ ...S.wrap, ...(style || {}) }} data-newsletter-signup={source}>
      <div style={S.card}>
        <p style={S.kicker}>Free weekly email</p>
        <h2 id={`${id}-h`} style={S.h2}>{heading}</h2>
        <p style={S.p}>Every Thursday, a few great things to do near you this weekend, picked by Wayfind. Events, food and places worth the trip.</p>
        <form method="post" action="/api/newsletter/subscribe">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="back" value={safeReturnPath(back)} />
          <div style={S.hp} aria-hidden="true">
            <label>Leave this empty<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <div style={S.row}>
            <label htmlFor={`${id}-email`} style={S.hp}>Email address</label>
            <input id={`${id}-email`} type="email" name="email" required autoComplete="email" inputMode="email" placeholder="you@email.com" style={S.input} />
            <label htmlFor={`${id}-region`} style={S.hp}>Your area</label>
            <select id={`${id}-region`} name="region" defaultValue={picked} required style={S.select}>
              {picked ? null : <option value="" disabled>Pick your area</option>}
              {NEWSLETTER_REGIONS.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <button type="submit" style={S.btn}>Send me the weekend picks</button>
          </div>
        </form>
        <p style={S.fine}>{CONSENT_TEXT} <a href="/privacy" style={S.link}>Privacy</a></p>
      </div>
    </section>
  );
}
