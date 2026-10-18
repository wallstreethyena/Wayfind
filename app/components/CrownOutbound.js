"use client";

import { useEffect } from "react";
import { captureOrQueue } from "../../lib/browserAnalytics";
import { isQaClick, outboundTicketEvent } from "../../lib/crownCampaign";

/** One listener for ticket and official-site hops on a Crown contender's event page. */
export default function CrownOutbound({ slug }) {
  useEffect(() => {
    const onClick = (event) => {
      const target = event.target;
      const link = target && typeof target.closest === "function" ? target.closest("a[data-wf-ticket]") : null;
      if (!link) return;
      let tracked = null;
      try {
        tracked = outboundTicketEvent(link.href, slug, {
          qa: isQaClick(window.sessionStorage),
          storage: window.sessionStorage,
          kind: link.getAttribute("data-wf-ticket-kind") || "",
        });
      } catch { tracked = null; }
      if (tracked) captureOrQueue(window, tracked.event, tracked.properties);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [slug]);
  return null;
}
