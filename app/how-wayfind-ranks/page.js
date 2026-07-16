// v5.29 — E-E-A-T foundation (SEO audit July 2026); v6.35 — glass-box framing:
// the Wayfind Score is stated as Wayfind's documented editorial opinion, with the
// model shown and the money layer held explicitly separate. Every sentence here
// must stay TRUE of the real engine (lib/google.js wayfindScore = a Bayesian,
// review-weighted rating scaled to 0–100; distance / open-now / weather shape
// ORDER only; lib/monetize.js keeps any paid layer sort-only, capped, and labeled
// and out of the Score). [OWNER/COUNSEL] the "editorial opinion" characterization
// below is drafted to industry standard — have counsel confirm before relying on it.
export const metadata = {
  title: "How Wayfind ranks places · Wayfind",
  description: "The exact method behind every Wayfind list, published in full: the Wayfind Score is our editorial opinion — a rating weighted by review volume, on a documented model — with no ads and no paid placement, ever.",
  alternates: { canonical: "https://www.gowayfind.com/how-wayfind-ranks" },
};

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.65 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 14px", fontWeight: 800, color: "#FFFFFF" },
  h2: { fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 8px" },
  p: { fontSize: 15, color: "#C9D1D9", margin: "0 0 12px" },
  a: { color: "#F97316", fontWeight: 700, textDecoration: "none" },
  lede: { fontSize: 16.5, color: "#E6EDF3", margin: "0 0 14px", lineHeight: 1.6 },
};

export default function Page() {
  return (
    <main style={S.page}>
      <div style={S.kicker}>How Wayfind ranks</div>
      <h1 style={S.h1}>The method behind every list — published, not hidden</h1>
      <p style={S.lede}>Most apps keep their ranking a secret and blur the line between what earned a spot and what paid for one. We do the opposite. Every ranked list on Wayfind comes from one documented method, and the number at its center — the <b>Wayfind Score</b> — is our editorial opinion, shown in full below.</p>

      <h2 style={S.h2}>The Wayfind Score is our editorial opinion</h2>
      <p style={S.p}>The Wayfind Score is a single 0–100 number that reflects our considered judgment of a place&apos;s proven quality. It is an <b>opinion</b> — our editorial assessment, expressed through a fixed model we publish — not a claim of objective fact about any business, and not a statement that one place is &quot;better&quot; than another for you. It means the same thing wherever you see it — the app, city pages, and guides. A business cannot buy it, argue it upward, or pay to change it, because there is nothing to buy — no ad slot, no premium tier, no paid ranking. For most places the Score is computed from the model below; for a small, hand-vetted set (such as the hotels in Stay Tonight) it reflects our team&apos;s direct editorial rating instead. Either way it is merit, and merit only.</p>

      <h2 style={S.h2}>1. Proven quality beats a perfect small sample</h2>
      <p style={S.p}>The Score starts from a place&apos;s star rating and weights it by how many people actually rated it, pulling small samples toward a category baseline. A 5.0 from eight reviews can never outrank a 4.7 from thousands — hype can&apos;t fake a track record. That review-weighted rating <b>is</b> the Score; distance, open-now status, price, and weather are separate signals that can shape the <i>order</i> of a list or filter it, but they are never baked into the Score itself.</p>

      <h2 style={S.h2}>2. Junk is filtered before ranking</h2>
      <p style={S.p}>Service businesses, parking lots, offices, and stale or unverifiable listings are removed before anything is ranked. A place must be operational and carry real review evidence — or be a genuine outdoor landmark like a park or pier — to appear at all.</p>

      <h2 style={S.h2}>3. Right now matters</h2>
      <p style={S.p}>Distance from you, whether a place is open at this moment, and context like the weather and time of day shape the final order. A great spot that&apos;s closed tonight shouldn&apos;t win tonight. These affect where a place lands in a list — never its Score.</p>

      <h2 style={S.h2}>4. Real member signals, privately</h2>
      <p style={S.p}>When Wayfind members like a place, it earns a modest ranking lift for everyone once there&apos;s enough signal. We never display private counts, and no member action can be bought.</p>

      <h2 style={S.h2}>Money lives in a separate, labeled layer</h2>
      <p style={S.p}>There are no ads and no paid placement on Wayfind. Anything we can earn a commission on — the &quot;Book it&quot;, tickets, and tours &amp; experiences links — lives in a distinct layer that is <b>clearly labeled and disclosed</b>, and it appears only <i>after</i> a place has already been ranked on merit. Affiliate potential never changes what ranks or where. We will never quietly raise a Score for money or dress a paid placement up as a merit pick; if a sponsored slot ever appears, it is labeled as one. Our <a style={S.a} href="/editorial-policy">editorial policy</a> covers this in full.</p>

      <h2 style={S.h2}>Our opinion, held openly</h2>
      <p style={S.p}>We publish our method because a recommendation you can inspect is one you can trust — and because we&apos;d rather show our work than ask you to take it on faith. The Wayfind Score is our editorial judgment, and like any honest opinion it can be wrong. If a pick disappoints or a fact is off, tell us at <a style={S.a} href="mailto:hello@gowayfind.com">hello@gowayfind.com</a> and we&apos;ll verify and correct it.</p>
    </main>
  );
}
