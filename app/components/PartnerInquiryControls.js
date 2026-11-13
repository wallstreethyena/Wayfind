"use client";
import { useEffect, useId, useRef, useState } from "react";
import { track } from "../../lib/track";

const PACKAGE_OPTIONS = [
  { id: "quarterly", label: "Quarterly Sponsorship — $299 / quarter (Holiday Promo · ~$3.32/day)", shortLabel: "Quarterly ($299/quarter Holiday Promo)" },
  { id: "monthly", label: "Monthly Sponsorship — $199 / month (~$6.63/day)", shortLabel: "Monthly ($199/month)" },
  { id: "weekly", label: "Weekly Sponsorship — $99 / week (~$14.14/day)", shortLabel: "Weekly ($99/week)" },
  { id: "general", label: "General question — help me choose the right flight", shortLabel: "General sponsorship question" },
];

/**
 * Funnel beacon for /partners:
 *   1. partners_view — fired once per mount on /partners
 *   2. partners_pricing_engaged — fired once when #partner-packages enters view
 * Uses lib/track.js (PostHog pre-ready queue + GA4 bridge; never an Ads conversion).
 */
export function PartnersFunnelBeacon({ pricingSectionId = "partner-packages" }) {
  useEffect(() => {
    try {
      track("partners_view", { surface: "partners_index" });
    } catch (err) {}

    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return undefined;
    const target = document.getElementById(pricingSectionId);
    if (!target) return undefined;

    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            fired = true;
            try {
              track("partners_pricing_engaged", {
                surface: "partners_index",
                trigger: "scroll_into_view",
              });
            } catch (err) {}
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [pricingSectionId]);

  return null;
}

/**
 * Tracked anchor jump link for product/pricing engagement CTAs.
 */
export function PartnerSectionJumpLink({
  href = "#partner-packages",
  placement = "hero_primary",
  targetSection = "partner_packages",
  className,
  ariaLabel,
  children,
}) {
  const onClick = () => {
    try {
      track("partners_pricing_engaged", {
        surface: "partners_index",
        trigger: "anchor_click",
        target_section: targetSection,
        placement,
      });
    } catch (err) {}
  };

  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      data-wf-partners-jump={targetSection}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

/**
 * Tracked link to a live shipped /partners/[slug] placement so we can measure
 * `partners_view -> live partner example opened -> inquiry`.
 */
export function PartnerLiveExampleLink({
  href,
  partnerSlug,
  placement = "live_proof_card",
  className,
  ariaLabel,
  children,
}) {
  const onClick = () => {
    try {
      track("partners_live_example_opened", {
        surface: "partners_index",
        partner_slug: partnerSlug || "unknown",
        placement,
      });
    } catch (err) {}
  };

  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      data-wf-live-partner={partnerSlug || "unknown"}
      data-wf-live-partner-placement={placement}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

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
    const safePkg = packageId || "general";
    try {
      const payload = {
        surface: "partners_index",
        package_id: safePkg,
        package_name: packageName || null,
        price_usd: typeof priceUsd === "number" ? priceUsd : null,
        billing_period: billingPeriod || null,
        placement: placement || "pricing_card",
        channel: "mailto",
      };
      track("partner_inquiry_clicked", payload);
      track("partner_inquiry_initiated", payload);
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("wf:partner-package-selected", { detail: { packageId: safePkg } }));
      }
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

const CATEGORY_OPTIONS = [
  { value: "", label: "Select category (optional)" },
  { value: "Ticketed Attraction / Museum / Garden", label: "Ticketed Attraction / Museum / Botanical Garden" },
  { value: "Boat Charter / Kayak / Eco-Tour", label: "Boat Charter / Sunset Cruise / Kayak / Eco-Tour" },
  { value: "Christmas / Holiday Attraction", label: "Holiday / Seasonal Light Event or Excursion" },
  { value: "Experiential Restaurant / Date Night", label: "Restaurant / Cocktail Bar / Date-Night Venue" },
  { value: "Boutique Spa / Wellness Studio", label: "Boutique Spa / Wellness / Fitness Studio" },
  { value: "Boutique Hotel / Resort", label: "Independent / Boutique Hotel or Inn" },
  { value: "Other Local Experience", label: "Other Local Florida Experience" },
];

/**
 * Server-witnessed outbound link for /partners/[slug].
 * Preserves canonical UTM href on SSR static markup (satisfying SEO & static
 * link guards) and upgrades on hydration to /api/partner/outbound so real
 * visitor clicks are server-witnessed and protected by live kill-switches.
 */
export function PartnerOutboundLink({
  canonicalHref,
  trackHref,
  sponsorId,
  medium = "partner_page",
  style,
  className,
  ariaLabel,
  children,
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const onClick = () => {
    try {
      track("partner_outbound_clicked", {
        surface: medium,
        sponsor_id: sponsorId || "unknown",
      });
    } catch (err) {}
  };

  return (
    <a
      href={hydrated && trackHref ? trackHref : canonicalHref}
      target="_blank"
      rel="sponsored nofollow noopener"
      data-wf-partner-outbound={sponsorId || "unknown"}
      aria-label={ariaLabel}
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

/**
 * Accessible in-page business inquiry form & direct email fallback for visitors
 * without a configured mail app (or owners on mobile who prefer submitting in 20s
 * right on the page). Submits to the dedicated commercial lead endpoint
 * (POST /api/partner/inquire) with qualification, synthetic QA isolation, and
 * zero PII leaked into client analytics.
 */
export function PartnerEmailFallback({
  email = "hello@gowayfind.com",
  placement = "pricing_section",
  defaultPackageId = "quarterly",
}) {
  const id = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState(defaultPackageId);
  const [businessName, setBusinessName] = useState("");
  const [cityMarket, setCityMarket] = useState("");
  const [category, setCategory] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [notes, setNotes] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [leadReceipt, setLeadReceipt] = useState(null);
  const initiatedRef = useRef(false);
  const inflightRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onSelect = (e) => {
      const next = e && e.detail && e.detail.packageId;
      if (next && PACKAGE_OPTIONS.some((o) => o.id === next)) {
        setSelectedPkg(next);
      }
    };
    window.addEventListener("wf:partner-package-selected", onSelect);
    return () => window.removeEventListener("wf:partner-package-selected", onSelect);
  }, []);

  useEffect(() => () => {
    if (inflightRef.current) inflightRef.current.abort();
  }, []);

  const noteInitiated = (pkgOverride) => {
    if (initiatedRef.current) return;
    initiatedRef.current = true;
    try {
      track("partner_inquiry_initiated", {
        surface: "partners_index",
        package_id: pkgOverride || selectedPkg || "general",
        placement,
        channel: "inline_form",
      });
    } catch (err) {}
  };

  const toggleForm = () => {
    const next = !formOpen;
    setFormOpen(next);
    if (next) {
      try {
        track("partner_inquiry_fallback_opened", {
          surface: "partners_index",
          package_id: selectedPkg || "general",
          placement,
          channel: "inline_form",
        });
      } catch (err) {}
    }
  };

  const pkgOption = PACKAGE_OPTIONS.find((o) => o.id === selectedPkg) || PACKAGE_OPTIONS[0];

  const normalizeBookingUrl = (raw) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
    if (trimmed.includes(".") && !trimmed.includes(" ")) return "https://" + trimmed;
    return trimmed;
  };

  const buildBackupMailto = () => {
    const subj = `Sponsored Partner Inquiry — ${pkgOption.shortLabel}`;
    const body = [
      "Hi Wayfind team,",
      "",
      `Package: ${pkgOption.shortLabel}`,
      `Business name: ${businessName.trim() || "(not entered)"}`,
      `City / Florida market: ${cityMarket.trim() || "(not entered)"}`,
      category ? `Category: ${category}` : null,
      `Website or booking link: ${bookingUrl.trim() || "(not entered)"}`,
      `Reply email or phone: ${contactInfo.trim() || "(not entered)"}`,
      notes.trim() ? `Details / preferred start: ${notes.trim()}` : null,
      "",
      "Thanks!",
    ].filter((line) => line !== null).join("\n");
    return `mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const biz = businessName.trim();
    const city = cityMarket.trim();
    const reply = contactInfo.trim();
    if (!biz || !city || !reply || status === "sending" || inflightRef.current) return;

    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(reply);
    const phoneDigits = reply.replace(/\D+/g, "");
    if (!looksLikeEmail && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
      setErrorMsg("Please enter a valid business email address or 10-digit phone number so we can reply.");
      setStatus("error");
      return;
    }

    const normalizedUrl = normalizeBookingUrl(bookingUrl);
    noteInitiated(selectedPkg);

    const controller = new AbortController();
    inflightRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    setStatus("sending");
    setErrorMsg("");

    const isUrlTest =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("wf_test") === "1";

    try {
      const r = await fetch("/api/partner/inquire", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessName: biz,
          cityMarket: city,
          contact: reply,
          packageId: selectedPkg,
          category: category || undefined,
          bookingUrl: normalizedUrl || undefined,
          notes: notes.trim() || undefined,
          companyWebsiteFax: honeypot || undefined,
          isTest: isUrlTest || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok === true && (j.stored === true || j.synthetic === true)) {
        setLeadReceipt({
          leadId: j.lead && j.lead.leadId ? j.lead.leadId : null,
          synthetic: Boolean(j.synthetic),
        });
        setStatus("done");
        if (!j.synthetic) {
          try {
            track("partner_inquiry_completed", {
              surface: "partners_index",
              package_id: selectedPkg || "general",
              placement,
              channel: "inline_form",
            });
          } catch (err) {}
        }
      } else {
        setErrorMsg(
          r.status === 429 || j.error === "rate_limited"
            ? "Too many submissions right now. Your details are still filled below — please try again in a few minutes or use the direct email link."
            : j.detail || "We couldn't save your inquiry automatically right now. Your details are preserved below — please retry or open a pre-filled email to hello@gowayfind.com."
        );
        setStatus("error");
      }
    } catch (err) {
      setErrorMsg(
        controller.signal.aborted
          ? "Request timed out before we could confirm receipt. Your details are still here — please retry or email hello@gowayfind.com."
          : "Connection interrupted. Your details are still here — please retry or email hello@gowayfind.com."
      );
      setStatus("error");
    } finally {
      clearTimeout(timer);
      if (inflightRef.current === controller) inflightRef.current = null;
    }
  }

  const canSubmit = Boolean(businessName.trim() && cityMarket.trim() && contactInfo.trim()) && status !== "sending";
  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "#0B101B",
    color: "#F8FAFC",
    border: "1px solid #2D3748",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 16,
    lineHeight: 1.4,
    fontFamily: "inherit",
    minWidth: 0,
  };
  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "#CBD5E1",
    marginBottom: 5,
  };

  return (
    <div className="wfp-email-fallback" role="region" aria-label="Direct email and on-page partner inquiry">
      <div className="wfp-email-fallback-row">
        <div className="wfp-email-fallback-text">
          <strong style={{ color: "#F8FAFC" }}>Prefer to message us right here — or no mail app configured?</strong>{" "}
          Email{" "}
          <code className="wfp-email-code">{email}</code>{" "}
          directly with your package (<strong>$99/week</strong>, <strong>$199/month</strong>, or{" "}
          <strong>$299/quarter Holiday Promo</strong>), business name, city, and booking link — or send your inquiry on this page in 20 seconds.
        </div>
        <button
          type="button"
          onClick={toggleForm}
          aria-expanded={formOpen}
          aria-controls={`${id}-inquiry-panel`}
          className="wfp-copy-email-btn"
          data-wf-fallback-toggle={placement}
        >
          <span>{formOpen ? "Close inquiry form" : "Send note without a mail app"}</span>
        </button>
      </div>

      {formOpen ? (
        <div
          id={`${id}-inquiry-panel`}
          style={{
            width: "100%",
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid #26303B",
          }}
        >
          {status === "done" ? (
            <div
              role="status"
              data-wf-inquiry-done="true"
              data-wf-inquiry-synthetic={leadReceipt && leadReceipt.synthetic ? "true" : "false"}
              style={{
                padding: "16px 18px",
                borderRadius: 14,
                background: "rgba(13, 148, 136, 0.14)",
                border: "1px solid rgba(45, 212, 191, 0.35)",
                color: "#F0FDFA",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
                {leadReceipt && leadReceipt.synthetic
                  ? "Synthetic QA check verified (excluded from sales metrics)"
                  : "Inquiry received by the Wayfind team"}
              </div>
              <p style={{ fontSize: 13.5, color: "#CCFBF1", margin: "0 0 12px", lineHeight: 1.5 }}>
                Thank you — we logged your inquiry for <strong>{pkgOption.shortLabel}</strong> for{" "}
                <strong>{businessName.trim()}</strong>
                {leadReceipt && leadReceipt.leadId ? <> (ref <code>{leadReceipt.leadId}</code>)</> : null}.{" "}
                Next step: our team verifies local fit within 1 business day, builds your draft{" "}
                <strong>Sponsored &middot; Paid partner</strong> preview, and shares it for your approval before any invoice is sent.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setLeadReceipt(null);
                  setBusinessName("");
                  setCityMarket("");
                  setCategory("");
                  setBookingUrl("");
                  setContactInfo("");
                  setNotes("");
                  setHoneypot("");
                  initiatedRef.current = false;
                  setFormOpen(false);
                }}
                style={{
                  minHeight: 40,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "#1E293B",
                  border: "1px solid #334155",
                  color: "#F8FAFC",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} aria-busy={status === "sending"} data-wf-partner-inline-form="true">
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor={`${id}-fax`}>Leave this field empty</label>
                <input
                  id={`${id}-fax`}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor={`${id}-pkg`} style={labelStyle}>Package of interest</label>
                  <select
                    id={`${id}-pkg`}
                    value={selectedPkg}
                    disabled={status === "sending"}
                    onChange={(e) => {
                      setSelectedPkg(e.target.value);
                      noteInitiated(e.target.value);
                    }}
                    style={inputStyle}
                  >
                    {PACKAGE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`${id}-biz`} style={labelStyle}>Business name *</label>
                  <input
                    id={`${id}-biz`}
                    type="text"
                    required
                    maxLength={140}
                    disabled={status === "sending"}
                    placeholder="e.g. Sunset Catamaran Charters"
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      noteInitiated();
                    }}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor={`${id}-city`} style={labelStyle}>Florida city / neighborhood *</label>
                  <input
                    id={`${id}-city`}
                    type="text"
                    required
                    maxLength={100}
                    disabled={status === "sending"}
                    placeholder="e.g. Sarasota, Tampa, Orlando, Miami"
                    value={cityMarket}
                    onChange={(e) => {
                      setCityMarket(e.target.value);
                      noteInitiated();
                    }}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor={`${id}-cat`} style={labelStyle}>Business category (optional)</label>
                  <select
                    id={`${id}-cat`}
                    value={category}
                    disabled={status === "sending"}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      noteInitiated();
                    }}
                    style={inputStyle}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`${id}-contact`} style={labelStyle}>Your email or phone for our reply *</label>
                  <input
                    id={`${id}-contact`}
                    type="text"
                    required
                    maxLength={140}
                    disabled={status === "sending"}
                    placeholder="you@yourbusiness.com or (813) 555-0199"
                    value={contactInfo}
                    onChange={(e) => {
                      setContactInfo(e.target.value);
                      noteInitiated();
                    }}
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor={`${id}-url`} style={labelStyle}>Website or direct booking link (optional)</label>
                  <input
                    id={`${id}-url`}
                    type="text"
                    maxLength={240}
                    disabled={status === "sending"}
                    placeholder="https://yourbusiness.com/book"
                    value={bookingUrl}
                    onChange={(e) => {
                      setBookingUrl(e.target.value);
                      noteInitiated();
                    }}
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor={`${id}-notes`} style={labelStyle}>Preferred start window or questions (optional)</label>
                  <textarea
                    id={`${id}-notes`}
                    rows={2}
                    maxLength={800}
                    disabled={status === "sending"}
                    placeholder="Tell us about your venue, charter, tour, event dates, or anything you'd like featured."
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      noteInitiated();
                    }}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>
              </div>

              {status === "error" ? (
                <div
                  role="alert"
                  style={{
                    marginBottom: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(248, 113, 113, 0.35)",
                    color: "#FCA5A5",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  {errorMsg}{" "}
                  <a href={buildBackupMailto()} style={{ color: "#5EEAD4", fontWeight: 700 }}>
                    Open pre-filled email →
                  </a>
                </div>
              ) : null}

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.45, flex: "1 1 220px" }}>
                  Sent straight to our partnerships inbox. No payment collected on this form — you review your draft placement before launch.
                </span>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  data-wf-partner-inline-submit="true"
                  style={{
                    minHeight: 46,
                    padding: "11px 22px",
                    borderRadius: 999,
                    border: "none",
                    background: canSubmit ? "linear-gradient(180deg, #14B8A6 0%, #0D9488 100%)" : "#1E293B",
                    color: canSubmit ? "#FFFFFF" : "#64748B",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: canSubmit ? "pointer" : "default",
                    opacity: status === "sending" ? 0.75 : 1,
                  }}
                >
                  {status === "sending" ? "Sending inquiry…" : "Send Partner Inquiry →"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
