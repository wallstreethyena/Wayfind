// CollectionHero — the cinematic chrome every shareable Wayfind collection
// wears (owner, 2026-07-28: "i want these expereince pages all of the pages
// that are shareble to look like the styule from image 1" — image 1 being
// /trending-now). Full-bleed photo, the dark scrim that lets white type sit on
// any image, a centered wordmark, a coral eyebrow, the big editorial headline,
// a prose subtitle, and optional corner controls + a pill CTA.
//
// Lifted VERBATIM out of RankedExperiencePage's <header> so the standalone
// routes that already look right (/trending-now, /date-night, /family,
// /hidden-gems, /best-beaches) render byte-identical markup after the
// extraction: every added prop (topRight, cta, height, radius, bleed,
// maxWidth, wordmarkHref) renders NOTHING at its default, so the only caller
// that changes is the one that opts in.
//
// Pure and hook-free on purpose — server pages and the in-app client screens
// both mount it. Registered in scripts/lib/shellSrc.mjs because
// app/components/screens/Experience.js (a shell file) now renders its header
// through here, and an unregistered file silently drops out of every content
// guardrail's grep set.
const C = { text: "#F1F5F9", gold: "#E8C97A" };

// `wordmark` defaults ON because that is what the standalone share pages need.
// The in-app screens pass wordmark={false}: the app's own topbar carries the
// logo two rows above, and stamping a second one over the photo is the exact
// "curator logo blocking the save button" problem the owner flagged in July.
// `titleSize` / `titleLines` exist because the headline slot took on unbounded
// content. Every original caller passes an AUTHORED collection title ("Great
// Outdoors", "Date night, decided") — short by construction, so a fixed 34px
// over three lines always fit. The single-pick screen puts a PLACE NAME here,
// and those run long: "Basilica of the National Shrine of Mary, Queen of the
// Universe" takes four lines at 34px, and since this block is bottom-anchored
// it grows UPWARD — measured 31px into the Back pill, which then sat on top of
// the eyebrow. Same shape of bug as the mobile intent hero: a fixed size
// against content nobody bounded.
// Defaults keep every existing caller byte-identical: 34px and no clamp.
export default function CollectionHero({ eyebrow, titleTop, titleBottom, subtitle, heroImg, accent, topLeft, topRight, cta, height = 300, radius = 0, bleed = null, maxWidth = 680, wordmarkHref = "/", wordmark = true, titleSize = 34, titleLines = 0 }) {
  return (
    <header style={{ position: "relative", height, overflow: "hidden", ...(radius ? { borderRadius: radius } : null), ...(bleed ? { margin: bleed } : null) }}>
      {heroImg && <img src={heroImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.25) 0%, rgba(4,8,16,.55) 55%, #040810 100%)" }} />
      {topLeft || null}
      {topRight || null}
      {wordmark ? (
        <a href={wordmarkHref} aria-label="Wayfind home" style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", display: "block", width: 118, height: 47, textDecoration: "none" }}>
          <img src="/brand/wayfind-wordmark-transparent-v2.png" alt="Wayfind" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </a>
      ) : null}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 18 }}>
        <div style={{ maxWidth, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: accent || C.gold }}>{eyebrow}</div>
          <h1 style={{ fontSize: titleSize, fontWeight: 800, letterSpacing: "-0.8px", lineHeight: 1.05, margin: "8px 0 6px", textShadow: "0 2px 12px rgba(0,0,0,.6)", color: C.text, ...(titleLines ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: titleLines, overflow: "hidden" } : null) }}>{titleTop}{titleBottom ? <><br />{titleBottom}</> : null}</h1>
          <p style={{ fontSize: 13.5, color: "rgba(241,245,249,.85)", margin: 0, maxWidth: 430 }}>{subtitle}</p>
          {cta || null}
        </div>
      </div>
    </header>
  );
}

// The corner control every collection hero uses for "go back" and the round
// glass buttons beside it. Shared so the back pill on /trending-now and the
// one on the in-app experience screen cannot drift apart.
export function HeroPill({ children, onClick, href, ariaLabel, title, style }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(4,8,16,.55)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, color: "#F1F5F9", fontWeight: 800, fontSize: 13.5, cursor: "pointer", padding: "8px 14px", textDecoration: "none", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", minHeight: 38, ...(style || null) };
  if (href) return <a href={href} aria-label={ariaLabel} title={title} style={base}>{children}</a>;
  return <button type="button" onClick={onClick} aria-label={ariaLabel} title={title} style={base}>{children}</button>;
}

export function HeroIconButton({ children, onClick, ariaLabel, title, active }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} title={title} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: "50%", background: active ? "rgba(249,115,22,.9)" : "rgba(4,8,16,.55)", border: `1px solid ${active ? "rgba(249,115,22,.9)" : "rgba(255,255,255,.18)"}`, color: "#F1F5F9", cursor: "pointer", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", padding: 0 }}>{children}</button>
  );
}

// The coral pill that sits under the subtitle on /trending-now. Same geometry
// everywhere so "the CTA" means one thing across the product.
export function HeroCta({ children, onClick, href, accent = "#F97316", ariaLabel }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "9px 17px", borderRadius: 999, background: accent, border: "none", color: "#0D1117", fontSize: 13, fontWeight: 800, cursor: "pointer", textDecoration: "none", minHeight: 38, boxShadow: "0 8px 20px rgba(0,0,0,.35)" };
  if (href) return <a href={href} aria-label={ariaLabel} style={base}>{children}</a>;
  return <button type="button" onClick={onClick} aria-label={ariaLabel} style={base}>{children}</button>;
}
