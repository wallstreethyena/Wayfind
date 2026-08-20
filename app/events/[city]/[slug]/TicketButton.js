"use client";
// Event-detail ticket CTA.
//
// Founder P0 (dead money handoffs, 2026-08-19): a Ticketmaster-family URL
// must leave SAME-TAB through /api/ticketmaster/go with a client click_id
// so provider_redirect_started can join. The old path wrapped the official
// URL in Impact (ticketmaster.evyy.net) and window.open'd it — popup-block
// fired commerce_cta_clicked with no leave, and the raw Impact URL sat in
// the DOM.
//
// Official (non-TM) sites are not earning. They stay a native <a> of the
// validated official URL. Maps / directions stay off this button.
//
// Stay22 LinkSwap must not rewrite an event ticket href (data-s22-autopilot
// = false). The go route is same-origin, so LinkSwap has nothing to swap.
import { useEffect, useRef, useState } from "react";
import { safeUrl } from "../../../../lib/links";
import { isTicketmasterFamily, ticketmasterGoUrl } from "../../../../lib/affiliates";
import { emitCommerce, mintClickId } from "../../../../lib/commerce";
import { withClickId } from "../../../../lib/hubConversion";

export default function TicketButton({ url, label, eventId, provider = "event_official" }) {
  const A = "#2EC9A6";
  const safe = safeUrl(url);
  const clickId = useRef(null);
  if (clickId.current === null) clickId.current = mintClickId();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  if (!safe) return null; // no valid ticket URL -> no button (graceful degradation)

  const earning = isTicketmasterFamily(safe);
  const baseHref = earning
    ? ticketmasterGoUrl(safe, { surface: "event_detail", contentId: eventId, offerId: eventId })
    : safe;
  if (!baseHref) return null;
  const href = (earning && hydrated) ? withClickId(baseHref, clickId.current) : baseHref;

  const onClick = () => {
    if (!earning) return;
    emitCommerce("commerce_cta_clicked", {
      surface: "event_detail",
      provider: "ticketmaster",
      offer_id: eventId || "unknown",
      content_id: eventId || null,
      click_id: clickId.current,
    });
  };

  return (
    <a
      href={href}
      onClick={onClick}
      rel={earning ? "noreferrer sponsored" : "noreferrer"}
      data-s22-autopilot="false"
      style={{ display: "block", textAlign: "center", marginTop: 18, background: A, color: "#0D1117", fontWeight: 800, fontSize: 15, borderRadius: 12, padding: "13px 0", textDecoration: "none" }}
    >
      {label}
    </a>
  );
}
