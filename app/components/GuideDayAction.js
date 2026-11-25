"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "../../lib/track.js";
import { emitCommerce } from "../../lib/commerce.js";
import { mintClickId, withClickId, isEarningGoHref } from "../../lib/hubConversion.js";
import { GuideCommissionLine } from "./GuideCommissionLine";
import styles from "./GuideDayAction.module.css";

export default function GuideDayAction({ action, slug, region }) {
  const hero = useRef(null);
  const clickId = useRef(null);
  const impressed = useRef(false);
  const [hydratedId, setHydratedId] = useState(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const earningGo = action?.monetized && isEarningGoHref(action.href);
  useEffect(() => {
    clickId.current = mintClickId();
    impressed.current = false;
    setHydratedId(clickId.current);
  }, [slug, action?.href]);

  useEffect(() => {
    if (!action || dismissed || !hero.current) return undefined;
    const article = hero.current.closest(".wf-guide-editorial")?.querySelector("#guide");
    const phone = window.matchMedia("(max-width: 699px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!hero.current || !article || !phone.matches) { setVisible(false); return; }
      setVisible(hero.current.getBoundingClientRect().bottom < -12 && article.getBoundingClientRect().bottom > window.innerHeight + 72);
    };
    const listen = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", listen, { passive: true });
    window.addEventListener("resize", listen, { passive: true });
    return () => {
      window.removeEventListener("scroll", listen);
      window.removeEventListener("resize", listen);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [action, dismissed]);

  const heroAnchor = useRef(null);
  const stickyAnchor = useRef(null);
  useEffect(() => {
    const observers = [];
    if (action?.href && hydratedId && typeof IntersectionObserver !== "undefined") {
      for (const [node, placement] of [[heroAnchor.current, "hero"], [visible && !dismissed && stickyAnchor.current, "sticky"]]) {
        if (!node || impressed.current) continue;
        const io = new IntersectionObserver((entries) => {
          if (!entries.some((entry) => entry.intersectionRatio >= .5) || impressed.current) return;
          impressed.current = true;
          try { track("guide_cta_impression", { slug, region, cta_kind: action.kind, exact: !!action.exact, monetized: !!action.monetized, placement }); } catch {}
          if (action.monetized) { try { emitCommerce("commerce_impression", commerceProps(placement)); } catch {} }
          io.disconnect();
        }, { threshold: .5 });
        io.observe(node);
        observers.push(io);
      }
    }
    return () => observers.forEach((io) => io.disconnect());
  // Re-observe when the mobile copy actually mounts, not every scroll.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, slug, hydratedId, visible, dismissed]);

  if (!action?.href || !action?.label) return null;

  function commerceProps(placement) {
    return {
      surface: "guide",
      provider: action.provider || (action.kind === "hotel" ? "stay22" : (action.kind === "deal" ? "deal" : "viator")),
      offer_id: action.offerId || action.place || slug,
      content_id: slug,
      city_id: region || null,
      category: action.kind || null,
      placement,
      click_id: clickId.current,
    };
  }
  const href = earningGo && hydratedId ? withClickId(action.href, hydratedId) : action.href;
  const attributes = action.sponsored
    ? earningGo ? { rel: "noreferrer sponsored" } : { target: "_blank", rel: "noreferrer sponsored" }
    : action.kind === "directions" ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const anchor = (placement, ref) => <a ref={ref} className={styles.link} href={href}
    {...attributes} data-guide-conversion={placement} data-guide-action-kind={action.kind}
    onClick={() => {
      try { track("guide_cta_clicked", { slug, region, cta_kind: action.kind, monetized: !!action.monetized, exact: !!action.exact, place: action.place || null, placement, click_id: clickId.current }); } catch {}
      if (action.monetized) { try { emitCommerce("commerce_cta_clicked", commerceProps(placement)); } catch {} }
    }}
  >{action.label}{action.sponsored ? " ↗" : null}</a>;
  return <div ref={hero} className={styles.hero} data-guide-primary-action>
    {anchor("hero", heroAnchor)}
    {action.sponsored && action.monetized ? <GuideCommissionLine /> : null}
    {visible && !dismissed ? (
      <aside className={styles.sticky} aria-label="Guide action">
        <div className={styles.stickyMain}>
          {anchor("sticky", stickyAnchor)}
          {action.sponsored && action.monetized ? <p className={styles.disclosure}>Wayfind may earn a commission.</p> : null}
        </div>
        <button type="button" className={styles.close} onClick={() => setDismissed(true)} aria-label="Hide guide action">×</button>
      </aside>
    ) : null}
  </div>;
}
