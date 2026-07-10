// v5.29 — E-E-A-T foundation (SEO audit July 2026). This page is a promise;
// keep every sentence true of the actual process.
export const metadata = {
  title: "Editorial policy · Wayfind",
  description: "How Wayfind researches, verifies, and corrects its guides and rankings — and how affiliate links are handled.",
  alternates: { canonical: "https://www.gowayfind.com/editorial-policy" },
};

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.65 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 14px", fontWeight: 800, color: "#FFFFFF" },
  h2: { fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 8px" },
  p: { fontSize: 15, color: "#C9D1D9", margin: "0 0 12px" },
  a: { color: "#F97316", fontWeight: 700, textDecoration: "none" },
};

export default function Page() {
  return (
    <main style={S.page}>
      <div style={S.kicker}>Wayfind editorial policy</div>
      <h1 style={S.h1}>How our recommendations are made — and corrected</h1>
      <h2 style={S.h2}>Research</h2>
      <p style={S.p}>Guides are researched from local sources, official venue information (websites, posted hours, park and county pages), and verified visitor data — ratings and review volumes from major review platforms. Where a page reflects first-hand experience, it says so explicitly; we do not imply personal visits that didn&apos;t happen.</p>
      <h2 style={S.h2}>Verification</h2>
      <p style={S.p}>Every guide carries an updated date, which is when its facts — hours, prices, status — were last checked against official listings. Inside the app, hours and open-now status are computed live from current venue data rather than copied from articles.</p>
      <h2 style={S.h2}>Rankings</h2>
      <p style={S.p}>List order is produced by the same public method the app uses — rating weighted by review volume, distance, and availability — with no ads and no paid placement. Read <a style={S.a} href="/how-wayfind-ranks">how Wayfind ranks</a>.</p>
      <h2 style={S.h2}>Affiliate links</h2>
      <p style={S.p}>Some links go to booking partners (for example Viator or hotel sites) and may earn Wayfind a commission at no cost to you. Affiliate potential never changes what we recommend or where it ranks, and pages with partner links say so. If something isn&apos;t worth your money, we say that too.</p>
      <h2 style={S.h2}>Corrections</h2>
      <p style={S.p}>Errors get fixed, not defended. Email <a style={S.a} href="mailto:hello@gowayfind.com">hello@gowayfind.com</a> with anything wrong — hours, closures, a pick that disappointed — and we&apos;ll verify and correct it promptly.</p>
      <h2 style={S.h2}>Who is responsible</h2>
      <p style={S.p}>Wayfind content is produced by the Wayfind team and reviewed under the direction of founder <b>Gabriel Pereira</b>, a Sarasota–Bradenton-area resident. More on <a style={S.a} href="/about">the about page</a>.</p>
    </main>
  );
}
