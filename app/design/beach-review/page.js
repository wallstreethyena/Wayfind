import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Beach responsive review', robots: { index: false, follow: false } };

// Preview-only QA: each frame loads the real page with its own CSS viewport.
// The review is intentionally unavailable on the production deployment.
export default function BeachResponsiveReview() {
  if (process.env.VERCEL_ENV !== 'preview') notFound();
  return <div style={{ padding: 20, background: '#080b11', color: '#f1f5f9' }}>
    <h1>Beach responsive review</h1>
    <p>Real page at three phone widths. This checks responsive layout, not a physical iPhone or Safari.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      {[320, 390, 430].map(width => <section key={width}>
        <h2>{width}px viewport</h2>
        <iframe title={`Beach page at ${width}px`} src="/beach-conditions" width={width} height={900}
          style={{ display: 'block', width, height: 900, border: 0 }} />
      </section>)}
    </div>
  </div>;
}
