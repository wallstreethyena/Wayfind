"use client";

// app/components/WayfindPlannerLoader.js — Lazy on-demand loader & calm
// proactive trigger boundary for Wayfind Planner.
//
// Keeps the full planner modal (`WayfindPlannerSheet` + `plannerActions` +
// `plannerGeo` + `plannerParse`) completely out of first-paint and idle JS
// until the user explicitly opens the planner or taps a proactive offer.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { safeSessionStorage } from "../../lib/safeStorage.js";
import { styleHtml } from "../../lib/styleHtml.js";
import {
  PLANNER_OPEN_EVENT,
  openWayfindPlanner,
  readStoredTripsSnapshot,
} from "../../lib/plannerCompanionBridge.js";
import {
  selectProactivePlannerOffer,
  recordProactiveShown,
  dismissProactiveOffers,
} from "../../lib/plannerProactive.js";

const WayfindPlannerSheet = dynamic(() => import("./WayfindPlannerSheet"), {
  ssr: false,
  loading: () => (
    <div
      data-wf-planner-loading="1"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 960,
        background: "rgba(2,6,23,.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#F8FAFC",
        fontFamily: "var(--wf-sans),system-ui,sans-serif",
        fontSize: 13.5,
        fontWeight: 700,
      }}
    >
      <div
        style={{
          background: "#0B1120",
          border: "1px solid rgba(148,163,184,.25)",
          borderRadius: 16,
          padding: "16px 22px",
          boxShadow: "0 20px 44px rgba(0,0,0,.55)",
        }}
      >
        ✨ Opening Wayfind Planner…
      </div>
    </div>
  ),
});

const PROACTIVE_CSS = `
.wfp-proactive{position:fixed;right:14px;bottom:88px;z-index:935;max-width:300px;background:#0F172A;border:1px solid rgba(249,115,22,.45);border-radius:16px;padding:11px 13px;color:#F8FAFC;font-family:var(--wf-sans),system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.48);display:flex;flex-direction:column;gap:8px}
@media (max-width:640px){.wfp-proactive{left:12px;right:12px;bottom:82px;max-width:none}}
.wfp-pro-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.wfp-pro-msg{font-size:13px;line-height:1.4;color:#E2E8F0;font-weight:600}
.wfp-pro-cta{align-self:flex-start;min-height:36px;padding:7px 14px;border-radius:999px;border:none;background:#F97316;color:#0D1117;font-size:12.5px;font-weight:800;cursor:pointer}
.wfp-pro-x{background:none;border:none;color:#94A3B8;font-size:16px;line-height:1;padding:2px 4px;cursor:pointer}
`;

function countUnassignedStops(trips) {
  let count = 0;
  for (const t of Object.values(trips || {})) {
    for (const it of (t && t.items) || []) {
      if (it && !it.day) count += 1;
    }
  }
  return count;
}

export default function WayfindPlannerLoader() {
  const pathname = usePathname() || "/";
  const [sheetMounted, setSheetMounted] = useState(false);
  const [proactiveOffer, setProactiveOffer] = useState(null);
  const [ctxTick, setCtxTick] = useState(0);

  useEffect(() => {
    const onOpen = (e) => {
      try {
        if (e && e.detail && !window.__wfPendingPlannerOpen) {
          window.__wfPendingPlannerOpen = e.detail;
        }
      } catch { /* ignore */ }
      setProactiveOffer(null);
      setSheetMounted(true);
    };
    const onContext = () => setCtxTick((n) => n + 1);

    window.addEventListener(PLANNER_OPEN_EVENT, onOpen);
    window.addEventListener("wf:planner-context", onContext);
    try {
      if (window.__wfPendingPlannerOpen) {
        setSheetMounted(true);
      }
    } catch { /* ignore */ }

    return () => {
      window.removeEventListener(PLANNER_OPEN_EVENT, onOpen);
      window.removeEventListener("wf:planner-context", onContext);
    };
  }, []);

  useEffect(() => {
    if (sheetMounted) {
      setProactiveOffer(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      try {
        const sess = safeSessionStorage();
        const trips = readStoredTripsSnapshot();
        const unassignedSaveCount = countUnassignedStops(trips);
        const appCtx = (typeof window !== "undefined" && window.__wfPlannerContext) || {};
        const offer = selectProactivePlannerOffer({
          pathname,
          screen: appCtx.screen || "",
          activePlace: appCtx.activePlace || null,
          activeTrip: appCtx.activeTrip || null,
          unassignedSaveCount,
          storage: sess,
        });
        if (offer) {
          recordProactiveShown(sess, offer.kind);
          setProactiveOffer(offer);
        } else {
          setProactiveOffer(null);
        }
      } catch {
        setProactiveOffer(null);
      }
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [pathname, sheetMounted, ctxTick]);

  return (
    <>
      {proactiveOffer && !sheetMounted && (
        <>
          <style dangerouslySetInnerHTML={styleHtml(PROACTIVE_CSS)} />
          <aside
            className="wfp-proactive"
            data-wf-planner-proactive={proactiveOffer.kind}
            aria-label="Wayfind trip planner suggestion"
          >
            <div className="wfp-pro-top">
              <div className="wfp-pro-msg">{proactiveOffer.message}</div>
              <button
                type="button"
                className="wfp-pro-x"
                data-wf-proactive-dismiss="1"
                aria-label="Dismiss trip planner suggestion"
                onClick={() => {
                  dismissProactiveOffers(safeSessionStorage(), proactiveOffer.kind);
                  setProactiveOffer(null);
                }}
              >
                ×
              </button>
            </div>
            <button
              type="button"
              className="wfp-pro-cta"
              onClick={() => {
                const offer = proactiveOffer;
                setProactiveOffer(null);
                const appCtx = (typeof window !== "undefined" && window.__wfPlannerContext) || {};
                openWayfindPlanner({
                  surface: `proactive_${offer.kind}`,
                  city: offer.city || "",
                  activeTripKey: offer.activeTripKey || "",
                  seedPlace: offer.kind === "place" ? appCtx.activePlace || null : null,
                  prompt: offer.seedPrompt,
                  pathname,
                });
              }}
            >
              ✨ {proactiveOffer.ctaLabel}
            </button>
          </aside>
        </>
      )}
      {sheetMounted ? <WayfindPlannerSheet /> : null}
    </>
  );
}
