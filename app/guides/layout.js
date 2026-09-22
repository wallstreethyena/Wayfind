// app/guides/layout.js — mounts CommerceClickBeacon once for every /guides/*
// route (the index, every [slug] guide, and every dedicated guide route such
// as /guides/florida-fall-festivals-2026).
//
// WHY A LAYOUT AND NOT A PER-PAGE IMPORT. /guides pages are server components
// on purpose (crawlable HTML, no client JS required to render the content),
// and BookingCTA/GuideDealCards/IntentPartnerPick/GuideConversion/IconicPlace-
// Card/HubConversion already instrument the clicks THEY render — but nothing
// on these pages was forwarding a verified partner click to Google Ads (see
// lib/analytics.js's PARTNER_CLICK_EVENT comment for the full story). A
// layout adds the one client island every guide route needs without turning
// any of them into a client component itself: this file has no "use client"
// directive, stays a server component, and simply renders its children plus
// the beacon — it adds no markup, no metadata and no styling of its own, so
// every guide page's own <title>/description/OG tags are untouched.
import CommerceClickBeacon from "../components/CommerceClickBeacon";

export default function GuidesLayout({ children }) {
  return (
    <>
      {children}
      <CommerceClickBeacon surface="guide" />
    </>
  );
}
