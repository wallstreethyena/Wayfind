// v5.32 — the homepage is now a SERVER component (audit #2): the interactive
// app (app/home.js, unchanged) renders exactly as before, and BELOW it we
// server-render real recommendation proof — an actual ranked answer in the
// initial HTML, before JavaScript, geolocation, or sign-in. Crawlers and
// link previews see the decision engine's output, not just its description.
// Data comes cache-first from the same ranked/gated engine as the landing
// pages (lib/landing.js); if no data is cached the block simply doesn't
// render and the page is byte-identical to the old client-only homepage.
import { Suspense } from "react";
import Home from "./home";
import ProofVeil from "./components/ProofVeil";
import { rankedFor, whyLine } from "../lib/landing";
import { TOWN_HUBS, TOWN_PROFILES } from "../lib/culture";

export const revalidate = 3600;

const S = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "26px 18px 6px", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h2: { fontSize: 22, fontWeight: 800, color: "#FFFFFF", margin: "8px 0 4px" },
  sub: { fontSize: 13.5, color: "#8B949E", margin: "0 0 14px" },
  card: { background: "#161B22", borderRadius: 12, padding: "12px 14px", margin: "0 0 10px" },
  name: { fontSize: 15.5, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  why: { fontSize: 13, color: "#8B949E", margin: "3px 0 6px" },
  a: { color: "#F97316", fontWeight: 700, textDecoration: "none", fontSize: 13 },
  links: { fontSize: 13.5, color: "#C9D1D9", margin: "12px 0 0" },
};

async function HomeProof() {
  // Sarasota is the flagship market with the deepest verified coverage; the
  // in-app answer personalizes to the visitor's real location and moment.
  const top = ((await rankedFor("things-to-do", "sarasota").catch(() => null)) || []).slice(0, 5);
  if (top.length < 3) return null;
  return (
    <section style={S.wrap} aria-label="Example Wayfind picks">
      <div style={S.kicker}>What Wayfind answers with</div>
      <h2 style={S.h2}>Near Sarasota right now — the short answer, not fifty options</h2>
      <p style={S.sub}>Ranked by rating weighted by review volume, distance, and what&apos;s genuinely worth your time — no ads, no paid placement. Open the app and this answer adapts to your exact location, the weather, and the time of day.</p>
      {top.map((p, i) => (
        <div key={p.id || i} style={S.card}>
          <p style={S.name}>{i + 1}. {p.name}</p>
          <p style={S.why}>{whyLine(p, "spot")}</p>
          <a style={S.a} href={"/?q=" + encodeURIComponent(p.name + " Sarasota FL")}>Open in Wayfind ›</a>
        </div>
      ))}
      <p style={S.links}>
        <b style={{ color: "#FFFFFF" }}>Go deeper:</b>{" "}
        <a style={S.a} href="/things-to-do/sarasota">Things to do in Sarasota</a> · <a style={S.a} href="/restaurants/sarasota">Restaurants</a> · <a style={S.a} href="/beaches/sarasota">Beaches</a> · <a style={S.a} href="/culture/sarasota">What Sarasota is known for</a>
        {" "}· <b style={{ color: "#FFFFFF" }}>Nearby towns:</b>{" "}
        {Object.entries(TOWN_HUBS).slice(0, 5).map(([k, slug], i) => (<span key={slug}><a style={S.a} href={"/florida/" + slug}>{TOWN_PROFILES[k].title}</a>{i < 4 ? " · " : ""}</span>))}
      </p>
    </section>
  );
}

export default function Page() {
  return (
    <>
      {/* v5.38 a11y/SEO: one descriptive server-rendered H1, always present
          (the proof block below is conditional on cached data and stays an
          h2 under it). Visually hidden so the app design is untouched. */}
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
        Wayfind — find the best things to do near you, right now
      </h1>
      <Home />
      {/* Suspense so the app shell streams immediately; the proof block
          follows without adding a byte to time-to-first-paint. ProofVeil keeps
          it in the DOM for crawlers but removes it from the interactive view
          once JS mounts, so it never bleeds in as a "loose footer" (v6.26). */}
      <Suspense fallback={null}><ProofVeil><HomeProof /></ProofVeil></Suspense>
    </>
  );
}
