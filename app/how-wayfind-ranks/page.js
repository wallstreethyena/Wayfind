// v5.29 — E-E-A-T foundation (SEO audit July 2026): the ranking method,
// stated publicly in plain words. This must track the real engine
// (lib/google.js wayfindScore + the ranking rules in the app).
export const metadata = {
  title: "How Wayfind ranks places · Wayfind",
  description: "The exact method behind every Wayfind list: rating weighted by review volume, distance, live availability — no ads, no paid placement, ever.",
  alternates: { canonical: "https://www.gowayfind.com/how-wayfind-ranks" },
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
      <div style={S.kicker}>How Wayfind ranks</div>
      <h1 style={S.h1}>The method behind every list — no ads, no paid placement</h1>
      <p style={S.p}>Every ranked list on Wayfind — in the app, on city pages, and in guides — comes from the same method:</p>
      <h2 style={S.h2}>1. Proven quality beats a perfect small sample</h2>
      <p style={S.p}>We start from a place&apos;s star rating and weight it by how many people actually rated it, pulling small samples toward the average. A 5.0 from eight reviews can never outrank a 4.7 from thousands — hype can&apos;t fake a track record.</p>
      <h2 style={S.h2}>2. Junk is filtered before ranking</h2>
      <p style={S.p}>Service businesses, parking lots, offices, and stale or unverifiable listings are removed before anything is ranked. A place must be operational and carry real review evidence — or be a genuine outdoor landmark like a park or pier — to appear at all.</p>
      <h2 style={S.h2}>3. Right now matters</h2>
      <p style={S.p}>Distance from you, whether a place is open at this moment, and context like the weather and time of day shape the final order. A great spot that&apos;s closed tonight shouldn&apos;t win tonight.</p>
      <h2 style={S.h2}>4. Real member signals, privately</h2>
      <p style={S.p}>When Wayfind members like a place, it earns a modest ranking lift for everyone once there&apos;s enough signal. We never display private counts, and no member action can be bought.</p>
      <h2 style={S.h2}>What can&apos;t influence a ranking</h2>
      <p style={S.p}>Money. There are no ads and no paid placement. Affiliate booking links never affect what ranks or where — the pick comes first, the link second. Our <a style={S.a} href="/editorial-policy">editorial policy</a> covers this in full.</p>
    </main>
  );
}
