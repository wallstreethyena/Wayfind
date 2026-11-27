"use client";
// The client half of a community guide or itinerary template page: the coded
// 9:16 video preview, and private attribution. Attribution is the page's own
// slug only: on view it is registered as a SESSION property (guide_src) so a
// later ticket or booking click in the same visit carries which guide or
// template led to it. No account id, name or location is involved.
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { captureOrQueue } from "../../lib/browserAnalytics";

const GuideVideoPreview = dynamic(() => import("./GuideVideoPreview"), { ssr: false, loading: () => <div aria-hidden="true" style={{ width: "100%", maxWidth: 360, aspectRatio: "9 / 16", borderRadius: 16, background: "#1C2230" }} /> });

function capture(event, props) {
  try { captureOrQueue(window, event, props); } catch {}
}

export default function CommunityTripClient({ kind, slug, video }) {
  useEffect(() => {
    const src = (kind === "guide" ? "cg:" : "it:") + String(slug || "").slice(0, 90);
    try { if (window.posthog && typeof window.posthog.register_for_session === "function") window.posthog.register_for_session({ guide_src: src }); } catch {}
    capture(kind === "guide" ? "community_guide_view" : "itinerary_template_view", { slug });
    const onClick = (e) => {
      const a = e.target && e.target.closest ? e.target.closest("[data-guide-stop],[data-save-trip]") : null;
      if (!a) return;
      if (a.hasAttribute("data-save-trip")) capture("community_trip_saved", { kind, slug });
      else capture("community_trip_stop_open", { kind, slug });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [kind, slug]);
  if (!video || !Array.isArray(video.stops) || !video.stops.length) return null;
  return (
    <section aria-label="Video preview" style={{ margin: "0 0 8px" }}>
      <GuideVideoPreview slug={slug} title={video.title} city={video.city} days={video.days} stops={video.stops} onEvent={(name, props) => capture(name, { ...props, kind })} />
    </section>
  );
}
