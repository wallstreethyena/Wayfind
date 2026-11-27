// /unsubscribe — the link in every weekly email (2026-11-27).
//
// Opening this page changes nothing: mail scanners pre-open links, and a GET
// that unsubscribed would drop real readers. The reader presses one button
// (a plain form post to /api/newsletter/unsubscribe, no JavaScript). Mail apps
// that support one-click use the List-Unsubscribe header instead and never
// need this page.
import { isUnsubscribeToken } from "../../lib/newsletter.js";

export const metadata = {
  title: "Unsubscribe | Wayfind",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const S = {
  page: { background: "#0D1117", color: "#E6EDF3", minHeight: "100dvh", padding: "56px 20px 80px", fontFamily: "var(--wf-sans)" },
  card: { maxWidth: 520, margin: "0 auto", padding: "28px 22px", borderRadius: 18, border: "1px solid #243040", background: "rgba(255,255,255,.03)", textAlign: "center" },
  h1: { fontSize: 24, fontWeight: 800, color: "#F1F5F9", margin: "0 0 10px", lineHeight: 1.25 },
  p: { fontSize: 15, lineHeight: 1.6, color: "#C9D1D9", margin: "0 0 18px" },
  btn: { display: "inline-block", background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, padding: "13px 22px", borderRadius: 12, border: "none", cursor: "pointer", textDecoration: "none" },
  link: { color: "#F0883E", fontWeight: 700 },
};

export default function Unsubscribe({ searchParams }) {
  const sp = searchParams || {};
  const done = sp.done;
  if (done === "1") {
    return (
      <main style={S.page} className="wf-page-canvas"><div style={S.card}>
        <h1 style={S.h1}>You&apos;re unsubscribed</h1>
        <p style={S.p}>You won&apos;t get the weekly email anymore. Changed your mind? You can sign up again anytime on Wayfind.</p>
        <a href="/" style={S.btn}>Back to Wayfind</a>
      </div></main>
    );
  }
  if (done === "invalid" || done === "error" || !isUnsubscribeToken(sp.t)) {
    return (
      <main style={S.page} className="wf-page-canvas"><div style={S.card}>
        <h1 style={S.h1}>{done === "error" ? "Something went wrong" : "This link didn't work"}</h1>
        <p style={S.p}>
          {done === "error" ? "Please try the link again in a minute." : "Use the unsubscribe link at the bottom of any Wayfind email."}{" "}
          Or email <a href="mailto:hello@gowayfind.com?subject=Unsubscribe" style={S.link}>hello@gowayfind.com</a> and we&apos;ll take you off the list.
        </p>
        <a href="/" style={S.btn}>Back to Wayfind</a>
      </div></main>
    );
  }
  return (
    <main style={S.page} className="wf-page-canvas"><div style={S.card}>
      <h1 style={S.h1}>Stop the weekly email?</h1>
      <p style={S.p}>You&apos;ll stop getting Wayfind&apos;s weekend picks. You can sign up again anytime.</p>
      <form method="post" action="/api/newsletter/unsubscribe">
        <input type="hidden" name="t" value={sp.t} />
        <button type="submit" style={S.btn}>Unsubscribe</button>
      </form>
    </div></main>
  );
}
