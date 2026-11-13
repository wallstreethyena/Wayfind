"use client";

// app/components/WayfindPlannerSheet.js — Grounded Wayfind Planner UI.
//
// Features:
//   1. Reusable Wayfind Planner brain with seasonal Santa voice during
//      Santa season (`voice: "santa"`) and neutral Wayfind voice otherwise.
//   2. Context-aware, session-capped proactive offer pill on place, city,
//      Christmas, and unassigned-save moments (`lib/plannerProactive.js`).
//   3. Multi-day proposed plan written as one iMessage style text bubble
//      (owner reference recording 2026-11-13): emoji bullet per real Wayfind
//      stop, "Check hours" when not confirmed, and explicit
//      `Add to my itinerary` confirmation before committing.
//   4. Conversational follow-up edits on an active trip with immediate feedback
//      and 1-tap `Undo`.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { siteTodayStr } from "../../lib/siteTime.js";
import { setLocal } from "../../lib/localStore.js";
import { safeLocalStorage } from "../../lib/safeStorage.js";
import { styleHtml } from "../../lib/styleHtml.js";
import { SantaSvg } from "./santaArt.js";
import { plannerPersona, plannerVoiceForCharacter, pickLine, stopEmoji } from "../../lib/plannerPersona.js";
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
    // The host on the page owns the chat: Santa in Santa season, Boo in October.
    return plannerVoiceForCharacter(pickCharacter(pathname, today));
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

const PLANNER_CSS = `
.wfp-proactive{position:fixed;right:14px;bottom:88px;z-index:935;max-width:300px;background:#0F172A;border:1px solid rgba(249,115,22,.45);border-radius:16px;padding:11px 13px;color:#F8FAFC;font-family:var(--wf-sans),system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.48);display:flex;flex-direction:column;gap:8px;animation:wfp-in .24s ease-out both}
@media (max-width:640px){.wfp-proactive{left:12px;right:12px;bottom:82px;max-width:none}}
@keyframes wfp-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.wfp-pro-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.wfp-pro-msg{font-size:13.5px;font-weight:700;line-height:1.35;color:#F8FAFC}
.wfp-pro-x{all:unset;cursor:pointer;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#94A3B8;font-size:18px;flex:none}
.wfp-pro-cta{all:unset;box-sizing:border-box;cursor:pointer;min-height:40px;padding:8px 14px;border-radius:10px;background:#F97316;color:#0D1117;font-size:13px;font-weight:800;text-align:center}
.wfp-back{position:fixed;inset:0;z-index:99500;background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;animation:wfp-fade .2s ease-out both}
@media (min-width:720px){.wfp-back{align-items:center;padding:20px}}
@keyframes wfp-fade{from{opacity:0}to{opacity:1}}
@keyframes wfp-up{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
.wfp-modal{box-sizing:border-box;width:100%;max-width:520px;height:92dvh;max-height:92dvh;display:flex;flex-direction:column;background:#000;border-radius:14px 14px 0 0;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",var(--wf-sans),system-ui,sans-serif;box-shadow:0 24px 64px rgba(0,0,0,.7);overflow:hidden;animation:wfp-up .28s cubic-bezier(.2,.85,.3,1) both}
@media (min-width:720px){.wfp-modal{border-radius:22px;height:84dvh;max-height:760px}}
.wfp-head{flex:none;position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 56px 8px;background:rgba(28,28,30,.94);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-bottom:.5px solid rgba(84,84,88,.65)}
.wfp-grab{width:36px;height:5px;border-radius:3px;background:#48484A;margin-bottom:5px}
.wfp-av{flex:none;width:30px;height:30px;border-radius:50%;background:linear-gradient(180deg,#A2A2A7,#7C7C82);overflow:hidden;display:grid;place-items:center}
.wfp-av{position:relative}
.wfp-av svg{position:absolute;width:170%!important;height:224%!important;left:-32%;top:-34%}
.wfp-av.wf{background:#F97316;color:#fff;font-weight:800;font-size:14px}
.wfp-head .wfp-av{width:46px;height:46px}
.wfp-head .wfp-av.wf{font-size:20px}
.wfp-name{font-size:12px;font-weight:500;color:#fff;display:flex;align-items:center;gap:2px}
.wfp-name small{color:#8E8E93;font-size:12px}
.wfp-close{all:unset;position:absolute;left:4px;top:22px;cursor:pointer;min-width:44px;min-height:44px;display:grid;place-items:center;color:#0A84FF}
.wfp-close:focus-visible,.wfp-send:focus-visible,.wfp-save-btn:focus-visible{outline:2px solid #0A84FF;outline-offset:2px}
.wfp-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:10px 12px 14px;display:flex;flex-direction:column;gap:2px}
.wfp-stamp{align-self:center;text-align:center;font-size:11px;color:#8E8E93;margin:4px 0 10px;line-height:1.35}
.wfp-stamp b{font-weight:600}
.wfp-row{display:flex;align-items:flex-end;gap:7px;animation:wfp-pop .22s cubic-bezier(.2,.9,.3,1.15) both}
.wfp-row.user{justify-content:flex-end}
.wfp-row.gap{margin-top:9px}
.wfp-host{flex:none;width:46px;height:60px;margin-bottom:-2px;visibility:hidden}
.wfp-host img{width:100%;height:100%;object-fit:contain;display:block}
.wfp-host.wf{width:28px;height:28px;border-radius:50%;background:#F97316;color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center}
.wfp-row.last .wfp-host{visibility:visible}
.wfp-row.assistant .wfp-host{animation:wfp-hop .5s cubic-bezier(.3,.7,.35,1.4) both}
@keyframes wfp-hop{0%{transform:translateY(6px) scale(.9)}60%{transform:translateY(-3px) scale(1.04)}100%{transform:none}}
@keyframes wfp-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
.wfp-msg{position:relative;max-width:76%;padding:7px 12px 8px;border-radius:18px;font-size:16px;line-height:1.3;word-wrap:break-word;white-space:pre-wrap}
.wfp-msg.assistant{background:#26252A;color:#fff}
.wfp-msg.user{background:linear-gradient(180deg,#2B8CFF,#0A6CFF);color:#fff}
.wfp-tail{position:absolute;bottom:0;width:17px;height:21px;display:none}
.wfp-row.last .wfp-tail{display:block}
.wfp-msg.assistant .wfp-tail{left:-6px}
.wfp-msg.user .wfp-tail{right:-6px;transform:scaleX(-1)}
.wfp-read{align-self:flex-end;font-size:11px;color:#8E8E93;margin:2px 4px 0 0}
.wfp-typing{display:inline-flex;align-items:center;gap:4px;padding:12px 14px}
.wfp-typing i{width:8px;height:8px;border-radius:50%;background:#8E8E93;animation:wfp-dot 1.3s ease-in-out infinite}
.wfp-typing i:nth-child(2){animation-delay:.18s}
.wfp-typing i:nth-child(3){animation-delay:.36s}
@keyframes wfp-dot{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
.wfp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wfp-plan{margin:2px 0 2px 53px;max-width:min(84%,calc(100% - 53px));align-self:flex-start;background:#26252A;border-radius:18px;padding:9px 13px 10px;display:flex;flex-direction:column;gap:6px;font-size:15px;line-height:1.32;animation:wfp-pop .25s ease-out both}
.wfp-plan a{color:#fff;text-decoration:none}
.wfp-li{display:flex;gap:6px}
.wfp-li-e{flex:none;width:20px;text-align:center}
.wfp-li small{display:block;color:#AEAEB2;font-size:12.5px;line-height:1.3}
.wfp-day{display:flex;flex-direction:column;gap:6px}
.wfp-day-hdr{font-weight:700;padding-top:4px}
.wfp-save-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-top:6px}
.wfp-save-btn{all:unset;box-sizing:border-box;cursor:pointer;min-height:44px;padding:0 20px;border-radius:999px;background:#0A84FF;color:#fff;font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.wfp-foot{flex:none;display:flex;align-items:flex-end;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(28,28,30,.94);border-top:.5px solid rgba(84,84,88,.65)}
.wfp-field{flex:1;min-width:0;display:flex;align-items:center;min-height:36px;border:1px solid #3A3A3C;border-radius:18px;padding:0 3px 0 13px;background:#000}
.wfp-in{flex:1;min-width:0;height:34px;border:0;outline:0;background:transparent;color:#fff;font:400 16px -apple-system,BlinkMacSystemFont,var(--wf-sans),system-ui,sans-serif}
.wfp-in::placeholder{color:#8E8E93}
.wfp-modal .wfp-in:focus,.wfp-modal .wfp-in:focus-visible{outline:none!important;box-shadow:none!important}
.wfp-field:focus-within{border-color:#48484A}
.wfp-send{all:unset;box-sizing:border-box;cursor:pointer;flex:none;width:30px;height:30px;border-radius:50%;background:#0A84FF;color:#fff;display:grid;place-items:center}
.wfp-send:disabled{background:#3A3A3C;color:#8E8E93;cursor:default}
@media (prefers-reduced-motion:reduce){.wfp-back,.wfp-modal,.wfp-row,.wfp-plan,.wfp-typing i{animation:none!important}}
`;

const TAIL_PATH = "M17 0v21H4.5C2 21 .6 20.6 0 20.2 4 18.8 6.5 15 6.5 9V0z";

function BubbleTail({ fill }) {
  return (
    <svg className="wfp-tail" viewBox="0 0 17 21" aria-hidden="true">
      <path d={TAIL_PATH} fill={fill} />
    </svg>
  );
}

const BOO_POSE = "/boo/poses/01-pointing-right-star-wink-128.webp";

// The contact photo in the header: the season's host.
function PlannerAvatar({ voice }) {
  if (voice === "santa") {
    return (
      <span className="wfp-av" aria-hidden="true">
        <SantaSvg face="happy" arm="rest" glow={false} />
      </span>
    );
  }
  if (voice === "boo") {
    return (
      <span className="wfp-av" aria-hidden="true" style={{ background: "#2C2C2E" }}>
        <img src={BOO_POSE} alt="" width={46} height={46} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </span>
    );
  }
  return <span className="wfp-av wf" aria-hidden="true">W</span>;
}

// The host standing next to his own bubbles, full body, like the owner's
// reference recording (2026-11-13): Santa with his wand beside the dots.
function HostFigure({ voice }) {
  if (voice === "santa") {
    return (
      <span className="wfp-host" aria-hidden="true">
        <SantaSvg face="happy" arm="wand" glow={false} />
      </span>
    );
  }
  if (voice === "boo") {
    return (
      <span className="wfp-host" aria-hidden="true">
        <img src={BOO_POSE} alt="" width={46} height={60} />
      </span>
    );
  }
  return <span className="wfp-host wf" aria-hidden="true">W</span>;
}

function stampTime() {
  try {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  } catch {
    return "";
  }
}

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
  const [openedAt, setOpenedAt] = useState("");

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
            text: plannerPersona(effVoice).snag,
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
          text: plannerPersona(effVoice).offline,
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
      setOpenedAt((t) => t || stampTime());
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
                  text: pickLine(plannerPersona(nextVoice).greet, siteTodayStr()),
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

  const host = voice || "wayfind";
  const persona = plannerPersona(host);
  let lastUserIdx = -1;
  messages.forEach((m, i) => { if (m.role === "user") lastUserIdx = i; });


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
          <div className="wfp-modal" role="dialog" aria-modal="true" aria-label={`Chat with ${persona.name}, Wayfind trip planner`}>
            <div className="wfp-head">
              <span className="wfp-grab" aria-hidden="true" />
              <button type="button" className="wfp-close" aria-label="Close chat" onClick={handleClose}>
                <svg width="13" height="22" viewBox="0 0 13 22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 2 2 11l9 9" /></svg>
              </button>
              <PlannerAvatar voice={host} />
              <span className="wfp-name">
                {persona.name} <small aria-hidden="true">›</small>
              </span>
            </div>

            <div className="wfp-body" ref={bodyRef} aria-live="polite">
              <div className="wfp-stamp">
                <b>iMessage</b>
                <br />
                Today {openedAt}
              </div>

              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                const prev = messages[idx - 1];
                const next = messages[idx + 1];
                const firstOfGroup = !prev || prev.role !== m.role;
                // The typing dots continue Santa's group, so his last bubble keeps no tail then.
                const lastOfGroup = next ? next.role !== m.role : !(loading && !isUser);
                const cls = `wfp-row ${isUser ? "user" : "assistant"}${firstOfGroup && idx ? " gap" : ""}${lastOfGroup ? " last" : ""}`;
                return (
                  <div key={idx} className={cls}>
                    {!isUser && <HostFigure voice={host} />}
                    <div className={`wfp-msg ${isUser ? "user" : "assistant"}`}>
                      <BubbleTail fill={isUser ? "#0A84FF" : "#26252A"} />
                      {m.text}
                    </div>
                  </div>
                );
              })}

              {lastUserIdx === messages.length - 1 && lastUserIdx >= 0 && !loading && (
                <div className="wfp-read">Delivered</div>
              )}

              {loading && (
                <div className={`wfp-row assistant last${messages.length && messages[messages.length - 1].role === "assistant" ? "" : " gap"}`} data-wf-planner-typing="1">
                  <HostFigure voice={host} />
                  <div className="wfp-msg assistant wfp-typing" role="status">
                    <BubbleTail fill="#26252A" />
                    <i /><i /><i />
                    <span className="wfp-sr">{persona.typing}</span>
                  </div>
                </div>
              )}

              {proposedPlan && (
                <div className="wfp-plan" data-wf-proposed-plan="1">
                  <div style={{ fontWeight: 700 }}>
                    {proposedPlan.title}
                  </div>
                  {proposedPlan.days.map((day, dIdx) => (
                    <div key={day.date || dIdx} className="wfp-day" data-wf-proposed-day={day.date || String(dIdx)}>
                      <div className="wfp-day-hdr">{day.label}</div>
                      {day.stops.map((stop) => (
                        <div key={stop.id} className="wfp-li" data-wf-proposed-stop={stop.id} title={stop.confidence?.detail || ""}>
                          <span className="wfp-li-e" aria-hidden="true">{stopEmoji(stop, host)}</span>
                          <span>
                            {stop.slotLabel ? `${stop.slotLabel} ` : ""}
                            {stop.detailHref ? <a href={stop.detailHref}>{stop.name}</a> : stop.name}
                            {stop.confidence && stop.confidence.level !== "confirmed" ? <small>{stop.confidence.label || "Check hours"}</small> : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="wfp-save-bar">
                    {!savedTripKey ? (
                      <button
                        type="button"
                        className="wfp-save-btn"
                        data-wf-planner-save="1"
                        onClick={handleSaveProposedPlan}
                      >
                        Add to my itinerary
                      </button>
                    ) : (
                      <>
                        <span style={{ fontSize: 14, color: "#30D158", fontWeight: 600 }}>✓ Saved to your Itinerary</span>
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
                          Open Itinerary
                        </a>
                      </>
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

            </div>

            <form
              className="wfp-foot"
              onSubmit={(e) => {
                e.preventDefault();
                submitPlannerPrompt(draft);
              }}
            >
              <div className="wfp-field">
                <input
                  ref={inputRef}
                  className="wfp-in"
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="iMessage"
                  aria-label="Tell Wayfind what trip to build or edit"
                  enterKeyHint="send"
                />
                {draft.trim() ? (
                <button type="submit" className="wfp-send" aria-label="Send" disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
