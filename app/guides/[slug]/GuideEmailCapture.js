"use client";
// Email capture on guides (2026-08-07).
//
// WHY THIS EXISTS. Guides are ~46% of external entry sessions and convert 0%
// of them into app usage (measured 14d: 389 guide entries, 0 detail opens);
// D+1 return across the whole site is 2.2%. Guide readers are trip planners
// acting weeks before the trip — the only realistic way this visitor comes
// back is a channel we own. One field, one honest promise, inline (never a
// modal — the guide's content stays the hero).
//
// FALSIFIABLE. Instrumented like GuideConversion so the bet can be judged
// within a week:
//   guide_email_impression   the form was actually seen (IO, once)
//   guide_email_submit       the API accepted a valid email
//   guide_email_error        the API refused / network failed
//
// The POST goes to /api/signup, which now writes a durable row to
// wf_email_signups (service-role only) in addition to its existing log +
// optional webhook forward.
import { useEffect, useRef, useState } from "react";
import { track } from "../../../lib/track";

export default function GuideEmailCapture({ slug, region }) {
  const ref = useRef(null);
  const seen = useRef(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | done | error

  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !seen.current) {
          seen.current = true;
          try { track("guide_email_impression", { slug, region }); } catch (err) {}
          io.disconnect();
        }
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [slug, region]);

  async function submit(e) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !em.includes("@") || state === "sending" || state === "done") return;
    setState("sending");
    try {
      const r = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: em, source: "guide", slug, region }),
      });
      if (!r.ok) throw new Error("bad status " + r.status);
      setState("done");
      try { track("guide_email_submit", { slug, region }); } catch (err) {}
    } catch (err) {
      setState("error");
      try { track("guide_email_error", { slug, region }); } catch (e2) {}
    }
  }

  if (state === "done") {
    return (
      <section ref={ref} aria-label="Guide by email" style={{ margin: "26px 0 0", padding: "16px 18px", borderRadius: 14, border: "1px solid #2E4B33", background: "rgba(46,204,113,.06)", color: "#A7E3B4", fontSize: 13.5, fontWeight: 700 }}>
        Sent. Check your inbox — and your picks will be waiting in Wayfind.
      </section>
    );
  }

  return (
    <section ref={ref} aria-label="Guide by email" style={{ margin: "26px 0 0", padding: "18px", borderRadius: 14, border: "1px dashed #243040", background: "rgba(255,255,255,.02)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", color: "#F97316" }}>Take this guide with you</div>
      <p style={{ margin: "7px 0 12px", fontSize: 13.5, lineHeight: 1.55, color: "#8A97A6" }}>
        One email with these picks, plus what changes in {region || "Orlando"} — new openings, closures, and what locals are actually doing. No spam, unsubscribe anytime.
      </p>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
          style={{ flex: "1 1 200px", minWidth: 0, height: 44, padding: "0 14px", borderRadius: 12, border: "1px solid #243040", background: "#0D1420", color: "#E7EDF4", fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          style={{ flexShrink: 0, height: 44, padding: "0 18px", borderRadius: 12, border: "none", background: "#F97316", color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer", opacity: state === "sending" ? 0.6 : 1 }}
        >
          {state === "sending" ? "Sending…" : "Send me the guide"}
        </button>
      </form>
      {state === "error" ? <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#E88" }}>That didn&apos;t go through — try again in a moment.</p> : null}
    </section>
  );
}
