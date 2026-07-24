"use client";
// AffiliateChip — the per-card affiliate disclosure (spec §2). Every monetized
// card shows a muted "via {partner}" chip so Gabriel (and users) can see at a
// glance which partner a card earns through. In OWNER AUDIT mode
// (NEXT_PUBLIC_WF_SHOW_AFFILIATE_AUDIT=1) a card with NO affiliate renders a
// "No affiliate" chip so coverage gaps are visible; in production that negative
// chip is hidden (never show users a gap). The chip is a disclosure, not an ad —
// the inline/footer commission copy stays where it is.
import { C } from "./kit";

const AUDIT = (process.env.NEXT_PUBLIC_WF_SHOW_AFFILIATE_AUDIT || "") === "1";

// Static display names so a card can pass just the provider key. wf_deals rails
// pass the DB display_name explicitly (which overrides this); browse cards rely
// on this map.
export const PROVIDER_LABELS = {
  viator: "Viator",
  undercover_tourist: "Undercover Tourist",
  stay22: "Stay22",
  ticketmaster: "Ticketmaster",
  ticketsmarter: "TicketSmarter",
  klook: "Klook",
};

export default function AffiliateChip({ provider, label }) {
  if (!provider) {
    if (!AUDIT) return null; // never surface a gap to real users
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#F0A", background: "rgba(255,0,170,.10)", border: "1px solid rgba(255,0,170,.45)", borderRadius: 999, padding: "2px 8px", letterSpacing: ".2px" }}>
        No affiliate
      </span>
    );
  }
  const name = label || PROVIDER_LABELS[provider] || provider;
  return (
    <span title={"Affiliate partner: " + name} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: C.muted, background: "rgba(255,255,255,.05)", border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px", letterSpacing: ".2px", whiteSpace: "nowrap" }}>
      via {name}
    </span>
  );
}

// Whether owner-audit mode is on — lets a surface show its coverage banner.
export const AFFILIATE_AUDIT = AUDIT;
