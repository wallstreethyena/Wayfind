// Public description of the supervised booking agent. Not linked from navigation.
// Noindex: this is a notice for guests and for sites, not a marketing page.

export const metadata = {
  title: "Booking agent | Wayfind",
  description: "What Wayfind's supervised booking agent does, the browser name it uses, and how a site can ask us to stop.",
  robots: { index: false, follow: false },
};

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.65 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#CBD5E1" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 14px", fontWeight: 800, color: "#FFFFFF" },
  h2: { fontSize: 20, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 8px" },
  p: { fontSize: 15, color: "#C9D1D9", margin: "0 0 12px" },
  code: { fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#F0B98A" },
};

export default function Page() {
  return (
    <article style={S.page}>
      <div style={S.kicker}>Wayfind booking agent</div>
      <h1 style={S.h1}>A supervised helper for OpenTable's own form</h1>
      <p style={S.p}>When a guest asks, and only when they tap the button, Wayfind can open OpenTable's guest booking page for the restaurant, date, time and party they chose. It types the guest's own name, phone and email from their Booking Profile and submits that form once. If OpenTable shows a confirmation that matches the request, we say so. Otherwise we stop.</p>
      <h2 style={S.h2}>What it will not do</h2>
      <p style={S.p}>It does not sign in, store a password, or keep a browser session. It does not type a card, a security code, or a text message code. It does not solve a check that asks whether a visitor is human. It does not pretend to be a normal browser. Wayfind does not have an agreement with OpenTable, and OpenTable's terms apply to the guest.</p>
      <h2 style={S.h2}>The browser name</h2>
      <p style={S.p}>The browser identifies itself as <span style={S.code}>WayfindBookingAgent/0.1 (+https://www.gowayfind.com/booking-agent)</span>. That string is the whole user agent. We do not rotate addresses or hide the automation.</p>
      <h2 style={S.h2}>How a site can ask us to stop</h2>
      <p style={S.p}>Email hello@gowayfind.com with the subject "Stop the booking agent" and the site name. We turn that site's switch off. One block from the site also pauses the agent for a day, and repeated blocks turn it off until a person switches it back on.</p>
      <p style={S.p}>The agent is off unless three separate switches are on. This page does not turn them on.</p>
    </article>
  );
}
