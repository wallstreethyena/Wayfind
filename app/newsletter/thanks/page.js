// /newsletter/thanks — where the no-JavaScript signup form lands (2026-11-27).
import { NEWSLETTER_REGIONS, safeReturnPath } from "../../../lib/newsletter.js";

export const metadata = {
  title: "You're on the list | Wayfind",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const S = {
  page: { background: "#0D1117", color: "#E6EDF3", minHeight: "100dvh", padding: "56px 20px 80px", fontFamily: "var(--wf-sans)" },
  card: { maxWidth: 520, margin: "0 auto", padding: "28px 22px", borderRadius: 18, border: "1px solid #243040", background: "rgba(255,255,255,.03)", textAlign: "center" },
  h1: { fontSize: 26, fontWeight: 800, color: "#F1F5F9", margin: "0 0 10px", lineHeight: 1.2 },
  p: { fontSize: 15, lineHeight: 1.6, color: "#C9D1D9", margin: "0 0 18px" },
  btn: { display: "inline-block", background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, padding: "13px 22px", borderRadius: 12, textDecoration: "none" },
};

export default function Thanks({ searchParams }) {
  const sp = searchParams || {};
  const back = safeReturnPath(sp.back);
  const region = NEWSLETTER_REGIONS.find((r) => r.key === sp.r);
  const err = sp.error;
  if (err) {
    const msg = err === "bad_email" ? "That email address doesn't look right. Please check it and try again."
      : err === "bad_region" ? "Please pick an area so we know which weekend picks to send."
      : "We couldn't save that just now. Please try again in a minute.";
    return (
      <main style={S.page} className="wf-page-canvas">
        <div style={S.card}>
          <h1 style={S.h1}>Almost there</h1>
          <p style={S.p}>{msg}</p>
          <a href={back} style={S.btn}>Go back and try again</a>
        </div>
      </main>
    );
  }
  return (
    <main style={S.page} className="wf-page-canvas">
      <div style={S.card}>
        <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">🎉</div>
        <h1 style={S.h1}>You&apos;re on the list</h1>
        <p style={S.p}>
          Your weekly picks{region ? ` for ${region.name}` : ""} will land in your inbox on Thursdays, right before the weekend.
          Every email has a one click unsubscribe.
        </p>
        <a href={back} style={S.btn}>Keep exploring</a>
      </div>
    </main>
  );
}
