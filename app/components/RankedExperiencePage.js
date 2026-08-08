// RankedExperiencePage — THE standard shell for hero-card destination pages
// (owner, 2026-07-21: /best-beaches is the visual standard; date-night,
// family, and everything after stamp from this). Pure presentational, no
// hooks — usable from server and client pages alike. No logo box over the
// photo (a quiet wordmark link instead); medals top-3; green Scores;
// metric-honest why-lines arrive from the caller.
//
// The beach landing remains the visual reference but not an implementation
// dependency. EditorialLandingHero is the shared, subject-neutral extraction;
// this page gives it a separate class namespace so changing an intent sheet
// cannot restyle /best-beaches.
import EditorialLandingHero, { editorialHeroCss } from "./EditorialLandingHero";
import { WF_PLACE_CARD_CSS } from "./css";

const C = { bg: "#040810", card: "#0B0E15", border: "rgba(255,255,255,.08)", text: "#F1F5F9", muted: "#8b93a1", accent: "#F97316", gold: "#E8C97A", green: "#3ee08a" };
const MEDAL = ["#E8C97A", "#C7CCD6", "#B8804A"];

export function Trophy({ i }) {
  if (i > 2) return <span style={{ fontSize: 14, fontWeight: 800, color: C.muted }}>{i + 1}</span>;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MEDAL[i]} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={"Rank " + (i + 1)}>
      <path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4" /><path d="M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" />
    </svg>
  );
}

// `onClick` and `rank` exist for surfaces that are not ranked lists — the
// in-app Surprise screen offers ALTERNATIVES to one pick, so its rows swap the
// pick in place (no href to navigate to) and carry no medal (an alternative is
// not a rank). Both follow CollectionHero's rule: the default renders the
// byte-identical anchor-with-trophy the nine ranked routes already ship, so a
// caller that does not opt in cannot be restyled by this.
// Exported so a caller supplying its own <img> element (see imgEl) cannot let
// the thumbnail geometry drift away from the nine ranked routes.
export const ROW_IMG_STYLE = { width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid " + C.border };

export function RankedRow({ i, href, onClick, img, imgEl, title, score, why, editorial, badge, rank = true }) {
  const inner = (
    <>
        {rank ? <div style={{ width: 30, flexShrink: 0, textAlign: "center", paddingTop: 2 }}><Trophy i={i} /></div> : null}
        {/* imgEl is the same caller-supplied-node escape hatch as `badge`: the
            in-app screens need their FallbackImg (icon on a missing or broken
            photo), and building that here would drag app state into this
            pure shell. Geometry stays shared via ROW_IMG_STYLE. */}
        {imgEl || (img ? <img src={img} alt="" loading="lazy" style={ROW_IMG_STYLE} /> : null)}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 750, color: C.text }}>{title}</span>
            {score != null ? <span style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{score}</span> : null}
            {/* v6.71 (Wave 2): caller-supplied node (e.g. the beach popularity/
                water-quality chips) — kept as a prop, not built here, so this
                stays the pure/no-hooks shell the file's header promises. */}
            {badge || null}
          </div>
          {why ? <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "4px 0 0" }}>{why}</p> : null}
          {editorial ? <p style={{ fontSize: 12.5, color: "rgba(241,245,249,.75)", lineHeight: 1.5, margin: "5px 0 0" }}>{editorial}</p> : null}
        </div>
        <span aria-hidden="true" style={{ alignSelf: "center", color: "rgba(255,255,255,.3)", fontSize: 18, flexShrink: 0 }}>›</span>
    </>
  );
  const box = { display: "flex", gap: 14, padding: "16px 0", alignItems: "flex-start", textDecoration: "none", color: "inherit" };
  return (
    <li style={{ borderTop: "1px solid " + C.border }}>
      {href ? (
        <a href={href} style={box}>{inner}</a>
      ) : (
        // A row that swaps state is a button, not a link to nowhere: an <a>
        // without href is not keyboard-focusable and reads as plain text to a
        // screen reader. Resets keep it visually identical to the anchor.
        <button type="button" onClick={onClick} style={{ ...box, width: "100%", background: "none", border: 0, font: "inherit", textAlign: "left", cursor: "pointer" }}>{inner}</button>
      )}
    </li>
  );
}

export default function RankedExperiencePage({
  eyebrow,
  titleTop,
  titleBottom,
  subtitle,
  heroImg,
  children,
  footNote,
  footerSlot = null,
  topLeft,
  location,
  imageKicker = "THE WAYFIND LOCAL EDITION",
  imageTitle = "A better plan starts with the right shortlist.",
  dekLead = "Know what earns the stop.",
  actionSlot = null,
  trustLines = ["Ranked from real evidence, never paid placement.", "The Wayfind Score does not change for advertisers."],
}) {
  const title = titleBottom ? <>{titleTop}<br />{titleBottom}</> : titleTop;
  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--wf-sans)" }}>
      <style dangerouslySetInnerHTML={{ __html: editorialHeroCss("wf-intent-editorial") + WF_PLACE_CARD_CSS }} />
      <EditorialLandingHero
        prefix="wf-intent-editorial"
        backControl={topLeft}
        heroImg={heroImg}
        imageKicker={imageKicker}
        imageTitle={imageTitle}
        toplineLeft={eyebrow}
        toplineRight={location}
        headlineId="wf-intent-title"
        headline={title}
        dekLead={dekLead}
        dekBody={subtitle}
        actionSlot={actionSlot}
        trustLines={trustLines}
      />
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "22px 20px 60px" }}>
        {children}
        {footNote ? <p style={{ fontSize: 11, color: C.muted, marginTop: 26, lineHeight: 1.5 }}>{footNote}</p> : null}
        {footerSlot}
      </div>
    </main>
  );
}
