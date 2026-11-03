// The not-eligible /badge/{id} view. The find-us block renders only when the
// caller passes an embed string, which it does only with badge_find_us on.
// With embed null, this is the same view the page showed before that block.
import BadgeCopyBox from "../../components/BadgeCopyBox";

const S = {
  wrap: { maxWidth: 640, margin: "0 auto", padding: "28px 18px 64px", color: "#F1F5F9", fontFamily: "system-ui, -apple-system, sans-serif" },
  crumb: { fontSize: 12.5, color: "#94A3B8", marginBottom: 14 },
  crumbLink: { color: "#94A3B8", textDecoration: "none" },
  h1: { fontSize: 26, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.4px", margin: "0 0 10px" },
  p: { fontSize: 15, color: "#E2E8F0", lineHeight: 1.6, margin: "0 0 14px" },
  link: { color: "#F97316", fontWeight: 700, textDecoration: "none" },
};

export default function NotEligible({ name, placeHref, embed, imgSrc, alt }) {
  return (
    <div style={S.wrap}>
      <div style={S.crumb}><a href={placeHref} style={S.crumbLink}>‹ {name}</a></div>
      <h1 style={S.h1}>The Top Rated badge isn&apos;t available for this place yet</h1>
      <p style={S.p}>The badge goes to places with a top Wayfind score. Scores update as new reviews come in, so check back later.</p>
      <p style={S.p}><a href={placeHref} style={S.link}>See {name} on Wayfind ›</a></p>
      {embed ? (
        <section data-find-us="1">
          <BadgeCopyBox
            title="Find us on Wayfind"
            theme="dark"
            imgSrc={imgSrc}
            alt={alt}
            code={embed}
          />
        </section>
      ) : null}
    </div>
  );
}
