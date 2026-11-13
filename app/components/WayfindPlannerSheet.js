"use client";

// app/components/WayfindPlannerSheet.js — Grounded Wayfind Planner UI.
//
// Features:
//   1. Reusable Wayfind Planner brain with seasonal Santa voice during
//      Santa season (`voice: "santa"`) and neutral Wayfind voice otherwise.
//   2. Context-aware, session-capped proactive offer pill on place, city,
//      Christmas, and unassigned-save moments (`lib/plannerProactive.js`).
//   3. Multi-day proposed plan preview showing real Wayfind cards, confidence
//      pills (`Confirmed` / `Check hours`), deterministic distance connectors,
//      and explicit `Save itinerary` confirmation before committing.
//   4. Conversational follow-up edits on an active trip with immediate feedback
//      and 1-tap `Undo`.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { siteTodayStr } from "../../lib/siteTime.js";
import { setLocal } from "../../lib/localStore.js";
import { safeLocalStorage } from "../../lib/safeStorage.js";
import { styleHtml } from "../../lib/styleHtml.js";
import { railPhotoSrc } from "../../lib/cardPhotoRequest.js";
import SafeImg from "./SafeImg.js";
import { pickCharacter, santaOffPath } from "./companionCharacter.js";
import {
  PLANNER_OPEN_EVENT,
  broadcastPlannerTripCommit,
  readStoredTripsSnapshot,
} from "../../lib/plannerCompanionBridge.js";
import {
  commitProposedPlanToTrips,
  executePlannerActionBatch,
} from "../../lib/plannerActions.js";
import {
  PLANNER_EVENTS,
  trackPlannerEvent,
} from "../../lib/plannerAnalytics.js";
import { extractCityFromPath } from "../../lib/plannerProactive.js";

const CENTER_KEY = "wf_center";

function defaultVoiceForPath(pathname) {
  try {
    const today = siteTodayStr();
    if (santaOffPath(pathname)) return "wayfind";
    return pickCharacter(pathname, today) === "santa" ? "santa" : "wayfind";
  } catch {
    return "wayfind";
  }
}

function readStoredPoint() {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    const c = JSON.parse(store.getItem(CENTER_KEY) || "null");
    if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
      return { lat: Number(c.lat), lng: Number(c.lng) };
    }
  } catch { /* ignore */ }
  return null;
}

function starterChipsForContext({ pathname, city, hasActiveTrip, voice }) {
  if (hasActiveTrip) {
    return [
      "Optimize route to reduce driving",
      "Make Saturday cheaper",
      "Replace Friday dinner with something nearby",
      "Add breakfast",
      "Add something indoors",
    ];
  }
  if (pathname && pathname.startsWith("/christmas-in-florida")) {
    return [
      "Orlando Nov 20 to 23, two adults, Christmas and food",
      "Tampa Christmas weekend with kids, minimal driving",
      "St. Augustine 2 day holiday lights & dining plan",
    ];
  }
  if (city) {
    return [
      `${city} 3 day trip, great food and minimal driving`,
      `${city} weekend for two adults, hidden gems & dinner`,
      `${city} family day with indoor options and lunch`,
    ];
  }
  return [
    "Orlando Nov 20 to 23, two adults, Christmas and food",
    "Sarasota weekend for two, beaches and great restaurants",
    "Tampa 3 days with kids, fun stops and minimal driving",
    voice === "santa" ? "Best 2 day Florida Christmas lights & dining trip" : "Miami 3 day food and neighborhood itinerary",
  ];
}

function stopThumbSrc(stop) {
  if (!stop) return "";
  return railPhotoSrc({
    id: stop.placeId || stop.id,
    photo: stop.photo,
  }) || "";
}

const PLANNER_CSS = `
.wfp-proactive{position:fixed;right:14px;bottom:88px;z-index:935;max-width:300px;background:#0F172A;border:1px solid rgba(249,115,22,.45);border-radius:16px;padding:11px 13px;color:#F8FAFC;font-family:var(--wf-sans),system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.48);display:flex;flex-direction:column;gap:8px;animation:wfp-in .24s ease-out both}
@media (max-width:640px){.wfp-proactive{left:12px;right:12px;bottom:82px;max-width:none}}
@keyframes wfp-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.wfp-pro-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.wfp-pro-msg{font-size:13.5px;font-weight:700;line-height:1.35;color:#F8FAFC}
.wfp-pro-x{all:unset;cursor:pointer;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#94A3B8;font-size:18px;flex:none}
.wfp-pro-cta{all:unset;box-sizing:border-box;cursor:pointer;min-height:40px;padding:8px 14px;border-radius:10px;background:#F97316;color:#0D1117;font-size:13px;font-weight:800;text-align:center}
.wfp-back{position:fixed;inset:0;z-index:99500;background:rgba(4,8,16,.72);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center}
@media (min-width:720px){.wfp-back{align-items:center;padding:20px}}
.wfp-modal{box-sizing:border-box;width:100%;max-width:640px;max-height:88dvh;display:flex;flex-direction:column;background:#0B111E;border:1px solid #1E293B;border-radius:22px 22px 0 0;color:#F8FAFC;font-family:var(--wf-sans),system-ui,sans-serif;box-shadow:0 24px 64px rgba(0,0,0,.6);overflow:hidden}
@media (min-width:720px){.wfp-modal{border-radius:22px;max-height:84dvh}}
.wfp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #1E293B;background:#0F172A}
.wfp-title-wrap{min-width:0}
.wfp-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#F97316}
.wfp-title{margin:2px 0 0;font-size:17px;font-weight:800;color:#F8FAFC}
.wfp-close{all:unset;cursor:pointer;min-width:44px;min-height:44px;border-radius:12px;display:grid;place-items:center;color:#94A3B8;font-size:22px}
.wfp-close:focus-visible,.wfp-pro-cta:focus-visible,.wfp-send:focus-visible,.wfp-save-btn:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.wfp-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.wfp-msg{max-width:90%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45}
.wfp-msg.assistant{align-self:flex-start;background:#131C2E;border:1px solid #1E293B;color:#E2E8F0}
.wfp-msg.user{align-self:flex-end;background:#F97316;color:#0D1117;font-weight:700}
.wfp-plan{background:#0F172A;border:1px solid rgba(249,115,22,.35);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:12px}
.wfp-plan-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #1E293B;padding-bottom:10px}
.wfp-day{display:flex;flex-direction:column;gap:8px}
.wfp-day-hdr{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-top:4px}
.wfp-stop{display:flex;gap:10px;padding:10px;border-radius:12px;background:#131C2E;border:1px solid #1E293B;align-items:flex-start}
.wfp-thumb{width:56px;height:56px;border-radius:10px;object-fit:cover;flex:none;background:#1E293B}
.wfp-conn{margin-left:22px;padding:2px 0 2px 10px;border-left:2px dashed #334155;font-size:11.5px;color:#94A3B8;font-weight:600}
.wfp-save-bar{position:sticky;bottom:-14px;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 0 4px;background:rgba(15,23,42,.96);backdrop-filter:blur(6px);border-top:1px solid #1E293B}
.wfp-save-btn{all:unset;box-sizing:border-box;cursor:pointer;min-height:46px;padding:0 20px;border-radius:12px;background:#F97316;color:#0D1117;font-size:14.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.wfp-chips{display:flex;flex-wrap:wrap;gap:6px}
.wfp-chip{all:unset;box-sizing:border-box;cursor:pointer;min-height:38px;padding:6px 12px;border-radius:999px;background:#131C2E;border:1px solid #334155;color:#CBD5E1;font-size:12.5px;font-weight:600}
.wfp-foot{display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #1E293B;background:#0F172A}
.wfp-in{flex:1;min-width:0;height:46px;border-radius:12px;border:1px solid #334155;background:#0B111E;color:#F8FAFC;padding:0 12px;font:500 15px var(--wf-sans),system-ui,sans-serif}
.wfp-send{all:unset;box-sizing:border-box;cursor:pointer;height:46px;padding:0 18px;border-radius:12px;background:#F97316;color:#0D1117;font-size:14px;font-weight:800;display:grid;place-items:center}
.wfp-send:disabled{opacity:.5;cursor:default}
`;

export default function WayfindPlannerSheet() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState("wayfind");
  const [surface, setSurface] = useState("direct");
  const [contextCity, setContextCity] = useState(null);
  const [seedPlace, setSeedPlace] = useState(null);
  const [activeTripKey, setActiveTripKey] = useState(null);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposedPlan, setProposedPlan] = useState(null);
  const [candidateCatalog, setCandidateCatalog] = useState({});
  const [savedTripKey, setSavedTripKey] = useState(null);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [lastEditSummary, setLastEditSummary] = useState(null);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const proposedRef = useRef(null);
  proposedRef.current = proposedPlan;
  const savedRef = useRef(null);
  savedRef.current = savedTripKey;
  const savingRef = useRef(false);

  const submitPlannerPrompt = useCallback(async (rawPrompt, overrideOpts = {}) => {
    const text = String(rawPrompt || "").trim().slice(0, 500);
    if (!text || loading) return;

    const effVoice = overrideOpts.voice || voice || defaultVoiceForPath(pathname);
    const effCity = overrideOpts.contextCity !== undefined ? overrideOpts.contextCity : contextCity;
    const effSeed = overrideOpts.seedPlace !== undefined ? overrideOpts.seedPlace : seedPlace;
    const tripsSnap = readStoredTripsSnapshot();
    const effTripKey = overrideOpts.activeTripKey !== undefined ? overrideOpts.activeTripKey : (savedRef.current || activeTripKey);
    const currentActiveTrip = effTripKey && tripsSnap[effTripKey] ? tripsSnap[effTripKey] : null;

    setDraft("");
    setLoading(true);
    setLastEditSummary(null);
    setMessages((prev) => [...prev, { role: "user", text }]);

    trackPlannerEvent(PLANNER_EVENTS.REQUEST, {
      surface: overrideOpts.surface || surface,
      voice: effVoice,
      has_active_trip: Boolean(currentActiveTrip),
    });

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => { try { controller.abort(); } catch {} }, 16000) : null;

    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        ...(controller ? { signal: controller.signal } : {}),
        body: JSON.stringify({
          message: text,
          voice: effVoice,
          contextCity: effCity,
          point: readStoredPoint(),
          activeTrip: currentActiveTrip,
          seedPlace: effSeed,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "I ran into a snag checking Wayfind's listings right now. Your manual Itinerary tools are still completely ready to use.",
          },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: data.reply || "Here is what I found." }]);

      if (data.mode === "propose_trip" && data.proposedPlan) {
        savingRef.current = false;
        setProposedPlan(data.proposedPlan);
        setCandidateCatalog(data.candidateCatalog || {});
        setSavedTripKey(null);
        trackPlannerEvent(PLANNER_EVENTS.PLAN_GENERATED, {
          surface: overrideOpts.surface || surface,
          voice: effVoice,
          source_mode: data.source || "deterministic",
          trip_length: data.metrics?.tripLength || data.proposedPlan.days?.length || 0,
          candidate_count: data.metrics?.candidateCount || 0,
          saved_stop_count: data.metrics?.proposedStopCount || 0,
        });
      } else if (data.mode === "edit_trip" && Array.isArray(data.actions) && currentActiveTrip) {
        const currentTrips = readStoredTripsSnapshot();
        const batchRes = executePlannerActionBatch(currentTrips, data.actions, {
          verifiedCatalog: data.candidateCatalog || {},
        });
        if (batchRes.ok) {
          setUndoSnapshot(batchRes.undoSnapshot);
          setLastEditSummary(batchRes.summary || data.reply);
          setLocal("wayfind_trips", JSON.stringify(batchRes.nextTrips));
          broadcastPlannerTripCommit({
            nextTrips: batchRes.nextTrips,
            tripKey: batchRes.tripKey || currentActiveTrip.key,
            openItinerary: false,
            toast: data.reply,
          });
          // Emit specific edit analytics
          for (const act of data.actions) {
            if (act.type === "ADD_STOP") {
              trackPlannerEvent(PLANNER_EVENTS.STOP_ADDED, { trip_key: currentActiveTrip.key, voice: effVoice });
            } else if (act.type === "REMOVE_STOP") {
              trackPlannerEvent(PLANNER_EVENTS.STOP_REMOVED, { trip_key: currentActiveTrip.key, voice: effVoice });
            } else if (act.type === "REPLACE_STOP") {
              trackPlannerEvent(PLANNER_EVENTS.STOP_REPLACED, { trip_key: currentActiveTrip.key, voice: effVoice });
            } else if (act.type === "OPTIMIZE_DAY") {
              trackPlannerEvent(PLANNER_EVENTS.DAY_OPTIMIZED, { trip_key: currentActiveTrip.key, voice: effVoice });
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Wayfind Planner couldn't reach the server right now. You can still manage your trips manually anytime.",
        },
      ]);
    } finally {
      if (timeoutId != null) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [activeTripKey, contextCity, loading, pathname, seedPlace, surface, voice]);

  // Listen for `wf:planner-open` from any surface
  useEffect(() => {
    const onOpen = (e) => {
      try { delete window.__wfPendingPlannerOpen; } catch {}
      const detail = (e && e.detail) || {};
      const nextVoice = detail.voice || defaultVoiceForPath(detail.pathname || pathname);
      const nextSurface = detail.surface || "button";
      const pathCity = extractCityFromPath(detail.pathname || pathname);
      const nextCity = detail.city || (pathCity && pathCity.name) || null;

      setVoice(nextVoice);
      setSurface(nextSurface);
      setContextCity(nextCity);
      setSeedPlace(detail.seedPlace || null);
      setActiveTripKey(detail.activeTripKey || null);
      setOpen(true);

      trackPlannerEvent(PLANNER_EVENTS.OPENED, {
        surface: nextSurface,
        voice: nextVoice,
        city_slug: pathCity ? pathCity.slug : undefined,
      });

      if (!detail.prompt) {
        setMessages((prev) =>
          prev.length
            ? prev
            : [
                {
                  role: "assistant",
                  text: nextVoice === "santa"
                    ? "Tell me where in Florida you are going, your dates, and what you love (lights, great food, kids, minimal driving) and I will build your itinerary from real Wayfind spots."
                    : "Tell me where you're heading, your dates, and what matters most (great food, Christmas lights, kid-friendly, minimal driving). I'll build a grounded day-by-day Wayfind itinerary.",
                },
              ]
        );
      } else {
        // Trigger immediate planning turn when opened with a prompt
        window.setTimeout(() => {
          submitPlannerPrompt(detail.prompt, {
            voice: nextVoice,
            surface: nextSurface,
            contextCity: nextCity,
            seedPlace: detail.seedPlace || null,
            activeTripKey: detail.activeTripKey || null,
          });
        }, 20);
      }
    };
    window.addEventListener(PLANNER_OPEN_EVENT, onOpen);
    try {
      if (window.__wfPendingPlannerOpen) {
        const pending = window.__wfPendingPlannerOpen;
        delete window.__wfPendingPlannerOpen;
        onOpen({ detail: pending });
      }
    } catch {}
    return () => window.removeEventListener(PLANNER_OPEN_EVENT, onOpen);
  }, [pathname, submitPlannerPrompt]);

  const handleClose = useCallback(() => {
    if (proposedRef.current && !savedRef.current) {
      trackPlannerEvent(PLANNER_EVENTS.PLAN_ABANDONED, {
        surface,
        voice,
        trip_length: proposedRef.current.days?.length || 0,
      });
    }
    setOpen(false);
  }, [surface, voice]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const t = window.setTimeout(() => {
      try {
        if (inputRef.current) inputRef.current.focus({ preventScroll: true });
      } catch { /* ignore */ }
    }, 60);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const planEl = proposedPlan ? bodyRef.current.querySelector('[data-wf-proposed-plan="1"]') : null;
    if (planEl && !loading) {
      planEl.scrollIntoView({ block: "start" });
    } else {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [open, messages, proposedPlan, loading, lastEditSummary]);

  const handleSaveProposedPlan = () => {
    if (!proposedPlan || savingRef.current || savedRef.current) return;
    savingRef.current = true;
    const currentTrips = readStoredTripsSnapshot();
    const res = commitProposedPlanToTrips(currentTrips, proposedPlan, candidateCatalog, {
      overwriteTripKey: activeTripKey || null,
    });
    if (!res.ok) {
      savingRef.current = false;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Could not validate one of the stops in this plan. Please try generating again." },
      ]);
      return;
    }
    setLocal("wayfind_trips", JSON.stringify(res.nextTrips));
    setSavedTripKey(res.tripKey);
    setActiveTripKey(res.tripKey);
    setUndoSnapshot(res.undoSnapshot);

    trackPlannerEvent(PLANNER_EVENTS.PLAN_SAVED, {
      surface,
      voice,
      trip_key: res.tripKey,
      trip_length: proposedPlan.days?.length || 0,
      saved_stop_count: res.savedStopCount || 0,
    });

    const onHomeApp = pathname === "/" || pathname === "/itinerary";
    broadcastPlannerTripCommit({
      nextTrips: res.nextTrips,
      tripKey: res.tripKey,
      openItinerary: onHomeApp,
      toast: `Saved "${proposedPlan.title}" to your Itinerary`,
    });

    if (onHomeApp) {
      trackPlannerEvent(PLANNER_EVENTS.ITINERARY_OPENED_AFTER_PLAN, {
        trip_key: res.tripKey,
        saved_stop_count: res.savedStopCount || 0,
      });
      setOpen(false);
    }
  };

  const handleUndo = () => {
    if (!undoSnapshot) return;
    setLocal("wayfind_trips", JSON.stringify(undoSnapshot));
    broadcastPlannerTripCommit({
      nextTrips: undoSnapshot,
      tripKey: activeTripKey,
      openItinerary: false,
      toast: "Undid last planner change",
    });
    setUndoSnapshot(null);
    setLastEditSummary("Reverted the last change.");
  };

  const chips = starterChipsForContext({
    pathname,
    city: contextCity,
    hasActiveTrip: Boolean(activeTripKey || savedTripKey),
    voice,
  });

  return (
    <>
      <style dangerouslySetInnerHTML={styleHtml(PLANNER_CSS)} />
      {open && (
        <div
          className="wfp-back"
          data-wf-planner-sheet="1"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="wfp-modal" role="dialog" aria-modal="true" aria-label="Wayfind Trip Planner">
            <div className="wfp-head">
              <div className="wfp-title-wrap">
                <span className="wfp-badge">
                  ✨ {voice === "santa" ? "Wayfind Planner · Holiday Edition" : "Wayfind Planner"}
                </span>
                <h2 className="wfp-title">
                  {activeTripKey || savedTripKey ? "Refine Your Itinerary" : "Build a Trip with Wayfind"}
                </h2>
              </div>
              <button type="button" className="wfp-close" aria-label="Close Wayfind Planner" onClick={handleClose}>
                ×
              </button>
            </div>

            <div className="wfp-body" ref={bodyRef} aria-live="polite">
              {messages.map((m, idx) => (
                <div key={idx} className={`wfp-msg ${m.role === "user" ? "user" : "assistant"}`}>
                  {m.text}
                </div>
              ))}

              {loading && (
                <div className="wfp-msg assistant" style={{ color: "#94A3B8", fontStyle: "italic" }}>
                  {voice === "santa"
                    ? "Checking Wayfind's verified places, dates, and neighborhood clusters..."
                    : "Searching Wayfind inventory and grouping stops by area..."}
                </div>
              )}

              {proposedPlan && (
                <div className="wfp-plan" data-wf-proposed-plan="1">
                  <div className="wfp-plan-head">
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#F8FAFC" }}>{proposedPlan.title}</div>
                      <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 2 }}>
                        {proposedPlan.city}, {proposedPlan.state}
                        {proposedPlan.startDate ? ` · ${proposedPlan.startDate}${proposedPlan.endDate && proposedPlan.endDate !== proposedPlan.startDate ? ` to ${proposedPlan.endDate}` : ""}` : ""}
                        {` · ${proposedPlan.days.reduce((s, d) => s + d.stops.length, 0)} stops`}
                      </div>
                    </div>
                    {proposedPlan.confidenceSummary && (
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: "4px 9px",
                          borderRadius: 999,
                          background: "rgba(16,185,129,.14)",
                          border: "1px solid rgba(16,185,129,.35)",
                          color: "#6EE7B7",
                        }}
                      >
                        {proposedPlan.confidenceSummary.confirmedCount} confirmed
                        {proposedPlan.confidenceSummary.checkHoursCount > 0
                          ? ` · ${proposedPlan.confidenceSummary.checkHoursCount} check hours`
                          : ""}
                      </span>
                    )}
                  </div>

                  {proposedPlan.days.map((day, dIdx) => (
                    <div key={day.date || dIdx} className="wfp-day" data-wf-proposed-day={day.date || String(dIdx)}>
                      <div className="wfp-day-hdr">
                        <strong style={{ fontSize: 13.5, color: "#F97316", textTransform: "uppercase", letterSpacing: ".04em" }}>
                          {day.label}
                        </strong>
                        {day.areaSummary && (
                          <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{day.areaSummary}</span>
                        )}
                      </div>

                      {day.stops.map((stop, sIdx) => {
                        const thumb = stopThumbSrc(stop);
                        const isConfirmed = stop.confidence && stop.confidence.level === "confirmed";
                        return (
                          <div key={stop.id}>
                            <div className="wfp-stop" data-wf-proposed-stop={stop.id}>
                              {thumb ? (
                                <SafeImg
                                  src={thumb}
                                  alt=""
                                  compact
                                  category={stop.category}
                                  className="wfp-thumb"
                                  loading="lazy"
                                  style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
                                />
                              ) : (
                                <div className="wfp-thumb" style={{ display: "grid", placeItems: "center", color: "#F97316", fontWeight: 800, fontSize: 18 }}>
                                  {String(stop.name || "W").charAt(0)}
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                                  {stop.slotLabel && (
                                    <span style={{ fontSize: 11, fontWeight: 800, color: "#F97316" }}>{stop.slotLabel}</span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      padding: "2px 7px",
                                      borderRadius: 999,
                                      background: isConfirmed ? "rgba(16,185,129,.14)" : "rgba(245,158,11,.14)",
                                      color: isConfirmed ? "#6EE7B7" : "#FCD34D",
                                    }}
                                    title={stop.confidence?.detail || ""}
                                  >
                                    {stop.confidence?.label || "Verified"}
                                  </span>
                                  {stop.price && (
                                    <span style={{ fontSize: 11, color: "#CBD5E1", fontWeight: 700 }}>{stop.price}</span>
                                  )}
                                  {(stop.wfScore || stop.rating) && (
                                    <span style={{ fontSize: 11, color: "#94A3B8" }}>
                                      ★ {stop.wfScore ? `${Math.round(stop.wfScore)} WF` : stop.rating.toFixed(1)}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 14.5, fontWeight: 700, color: "#F8FAFC", marginTop: 2 }}>
                                  {stop.detailHref ? (
                                    <a
                                      href={stop.detailHref}
                                      style={{ color: "#F8FAFC", textDecoration: "underline", textUnderlineOffset: 2 }}
                                    >
                                      {stop.name}
                                    </a>
                                  ) : (
                                    stop.name
                                  )}
                                </div>
                                {stop.why && (
                                  <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 2 }}>{stop.why}</div>
                                )}
                              </div>
                            </div>
                            {stop.travelToNext && sIdx < day.stops.length - 1 && (
                              <div className="wfp-conn">↓ {stop.travelToNext.label}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <div className="wfp-save-bar">
                    {!savedTripKey ? (
                      <>
                        <span style={{ fontSize: 12.5, color: "#94A3B8" }}>
                          Saves to your Itinerary — edit days, notes, or stops anytime.
                        </span>
                        <button
                          type="button"
                          className="wfp-save-btn"
                          data-wf-planner-save="1"
                          onClick={handleSaveProposedPlan}
                        >
                          Save itinerary
                        </button>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#6EE7B7" }}>
                          ✓ Saved to your Itinerary
                        </span>
                        <a
                          href="/?go=itinerary"
                          className="wfp-save-btn"
                          data-wf-open-itinerary-after-plan="1"
                          onClick={() => {
                            trackPlannerEvent(PLANNER_EVENTS.ITINERARY_OPENED_AFTER_PLAN, {
                              trip_key: savedTripKey,
                            });
                          }}
                          style={{ textDecoration: "none" }}
                        >
                          Open in Itinerary ›
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {lastEditSummary && (
                <div
                  data-wf-planner-edit-status="1"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(16,185,129,.12)",
                    border: "1px solid rgba(16,185,129,.35)",
                    fontSize: 13,
                    color: "#D1FAE5",
                  }}
                >
                  <span>{lastEditSummary}</span>
                  {undoSnapshot && (
                    <button
                      type="button"
                      data-wf-planner-sheet-undo="1"
                      onClick={handleUndo}
                      style={{
                        minHeight: 36,
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid rgba(209,250,229,.4)",
                        background: "transparent",
                        color: "#F8FAFC",
                        fontWeight: 700,
                        fontSize: 12.5,
                        cursor: "pointer",
                      }}
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}

              {!loading && (
                <div className="wfp-chips" role="group" aria-label="Suggested trip requests">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="wfp-chip"
                      onClick={() => submitPlannerPrompt(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              className="wfp-foot"
              onSubmit={(e) => {
                e.preventDefault();
                submitPlannerPrompt(draft);
              }}
            >
              <input
                ref={inputRef}
                className="wfp-in"
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  activeTripKey || savedTripKey
                    ? "Ask to move a stop, make a day cheaper, or add food..."
                    : "e.g. Orlando Nov 20 to 23, two adults, Christmas and food"
                }
                aria-label="Tell Wayfind what trip to build or edit"
              />
              <button type="submit" className="wfp-send" disabled={loading || !draft.trim()}>
                {loading ? "..." : "Plan"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
