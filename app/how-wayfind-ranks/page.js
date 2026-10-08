// v5.29 — E-E-A-T foundation; v6.35 — editorial-opinion framing.
// Owner 2026-10-08: the scoring model is proprietary. This page states the
// PRINCIPLES readers can rely on (merit only, no paid placement, money kept in a
// labeled layer, corrections welcome) and never the formula, thresholds, weights
// or signal list. Every sentence must stay TRUE of the real engine
// (lib/wayfindScore.js, lib/monetize.js keeps any paid layer sort-only, labeled,
// and out of the Score). [OWNER/COUNSEL] the "editorial opinion" characterization
// below is drafted to industry standard; have counsel confirm before relying on it.
const _ogRanks = "https://www.gowayfind.com/api/og?t=" + encodeURIComponent("How Wayfind ranks: merit only, never paid");
export const metadata = {
  title: "How Wayfind ranks places | Wayfind",
  description: "Every Wayfind list is ranked on merit. The Wayfind Score is our editorial opinion, there are no ads and no paid placement, and anything we earn a commission on is clearly labeled.",
  openGraph: { title: "How Wayfind ranks places", description: "Ranked on merit. No ads, no paid placement, ever.", url: "https://www.gowayfind.com/how-wayfind-ranks", siteName: "Wayfind", images: [{ url: _ogRanks, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "How Wayfind ranks places", images: [_ogRanks] },
  alternates: { canonical: "https://www.gowayfind.com/how-wayfind-ranks" },
};

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.65 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#CBD5E1" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 14px", fontWeight: 800, color: "#FFFFFF" },
  h2: { fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 8px" },
  p: { fontSize: 15, color: "#C9D1D9", margin: "0 0 12px" },
  a: { color: "#CBD5E1", fontWeight: 700, textDecoration: "none" },
  lede: { fontSize: 16.5, color: "#E6EDF3", margin: "0 0 14px", lineHeight: 1.6 },
};

export default function Page() {
  return (
    <article style={S.page}>
      <div style={S.kicker}>How Wayfind ranks</div>
      <h1 style={S.h1}>Ranked on merit, never for money</h1>
      <p style={S.lede}>Every list on Wayfind is ordered by one thing: how good we think a place is for what you want right now. Nobody can pay to be on a list or to move up one.</p>

      <h2 style={S.h2}>The Wayfind Score is our editorial opinion</h2>
      <p style={S.p}>The Wayfind Score is our considered judgment of a place&apos;s proven quality. It is an <b>opinion</b>, not a claim of objective fact about any business, and not a statement that one place is &quot;better&quot; than another for you. It means the same thing wherever you see it: the app, city pages, and guides. A business cannot buy it, argue it upward, or pay to change it, because there is nothing to buy: no ad slot, no premium tier, no paid ranking.</p>

      <h2 style={S.h2}>Proven quality, then what fits right now</h2>
      <p style={S.p}>A track record built by many real visitors counts for more than a handful of perfect ratings. Closed, stale, and unverifiable listings are removed before anything is ranked, and things like distance, opening hours, and the weather shape the order you see, so a great spot that is closed tonight does not win tonight.</p>

      <h2 style={S.h2}>Money lives in a separate, labeled layer</h2>
      <p style={S.p}>There are no ads and no paid placement on Wayfind. Anything we can earn a commission on, such as booking, ticket, and tour links, is <b>clearly labeled and disclosed</b> and appears only <i>after</i> a place has already been ranked on merit. Commission never changes what ranks or where. If a sponsored slot ever appears, it is labeled as one. Our <a style={S.a} href="/editorial-policy">editorial policy</a> covers this in full.</p>

      <h2 style={S.h2}>Tell us when we get it wrong</h2>
      <p style={S.p}>Like any honest opinion, ours can be wrong. If a pick disappoints or a fact is off, tell us at <a style={S.a} href="mailto:hello@gowayfind.com">hello@gowayfind.com</a> and we&apos;ll verify and correct it.</p>
    </article>
  );
}
