"use client";
import { useState } from "react";
import CommunityFooter from "./CommunityFooter";
import { track } from "../../lib/track";

/**
 * Inquiry link for /partners packages and direct inquiries.
 * Opens the visitor's mail client via a pre-encoded mailto: href while
 * recording categorical package interest through lib/track.js — never
 * capturing personal message contents and never firing revenue/affiliate
 * conversion events (partner_click / sponsor_out).
 */
export function PartnerInquiryLink({
  href,
  packageId = "general",
  packageName = null,
  priceUsd = null,
  billingPeriod = null,
  placement = "pricing_card",
  className,
  ariaLabel,
  children,
}) {
  const onClick = () => {
    try {
      track("partner_inquiry_clicked", {
        surface: "partners_index",
        package_id: packageId || "general",
        package_name: packageName || null,
        price_usd: typeof priceUsd === "number" ? priceUsd : null,
        billing_period: billingPeriod || null,
        placement: placement || "pricing_card",
      });
    } catch (err) {}
  };

  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      data-wf-inquiry-package={packageId || "general"}
      data-wf-inquiry-placement={placement || "pricing_card"}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

/**
 * Accessible fallback for visitors without a configured mail application.
 * Displays hello@gowayfind.com clearly and reuses the existing working
 * in-page contact route (CommunityFooter -> POST /api/feedback -> wf_feedback
 * + team notification) so visitors without a mail app can message the team directly.
 */
export function PartnerEmailFallback({
  email = "hello@gowayfind.com",
  placement = "pricing_section",
}) {
  const [formOpen, setFormOpen] = useState(false);

  const toggleForm = () => {
    const next = !formOpen;
    setFormOpen(next);
    if (next) {
      try {
        track("partner_inquiry_fallback_opened", {
          surface: "partners_index",
          placement,
        });
      } catch (err) {}
    }
  };

  return (
    <div className="wfp-email-fallback" role="region" aria-label="Direct email and web message fallback">
      <div className="wfp-email-fallback-row">
        <div className="wfp-email-fallback-text">
          <strong style={{ color: "#F1F5F9" }}>No mail app configured?</strong>{" "}
          Email us directly at{" "}
          <code className="wfp-email-code">{email}</code>{" "}
          with your selected package (<strong>$99/week</strong>, <strong>$199/month</strong>, or{" "}
          <strong>$299/quarter Holiday Promo</strong>), your business name, city/address, and booking link — or send a note right here on the page.
        </div>
        <button
          type="button"
          onClick={toggleForm}
          aria-expanded={formOpen}
          className="wfp-copy-email-btn"
          data-wf-fallback-toggle={placement}
        >
          <span>{formOpen ? "Close message form" : "Send note without a mail app"}</span>
        </button>
      </div>
      {formOpen ? (
        <div style={{ width: "100%", marginTop: 12 }}>
          <CommunityFooter
            compact
            initialOpen
            hideTrigger
            path="/partners"
            onClose={() => setFormOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
