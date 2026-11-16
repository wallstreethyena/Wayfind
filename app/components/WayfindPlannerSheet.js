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
//   5. Unsaved draft revisions with bounded conversation history, pre-save
//      Undo stack (`draftHistory`), 4 visual plan states, and visitor session isolation.

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { siteTodayStr } from "../../lib/siteTime.js";
import { setLocal } from "../../lib/localStore.js";
import { safeLocalStorage } from "../../lib/safeStorage.js";
import { styleHtml } from "../../lib/styleHtml.js";
import { SantaSvg } from "./santaArt.js";
import { plannerPersona, plannerVoiceForCharacter, pickLine, stopEmoji, sortStopsByTime } from "../../lib/plannerPersona.js";
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
import { classifySantaMessage, TRIP_WORDS } from "../../lib/santaIntent.js";
import { resolveSearchArea } from "../../lib/santaArea.js";
import { parsePlannerCity } from "../../lib/plannerParse.js";
import { resolveOrganizeTrip, organizePreview } from "../../lib/organizeTrips.js";

// Reserve lives inside this one Santa thread (owner 2026-11-14). The existing, proven concierge and picks are
// loaded on demand and drawn as bubbles and tool cards here; none of it ships until a table is asked for.
const ReserveConcierge = lazy(() => import("./ReserveConcierge.js"));
const ReservePicks = lazy(() => import("./ReservePicks.js"));

// "Organize my saved stops" (typed or from the offer) needs a real trip: which one, or why there is none.
const ORGANIZE_SAVED_RX = /\borgani[sz]e\s+(?:my|these|our)\b[\s\S]{0,40}\b(?:saved|stops|days|places|trip)\b/i;


const CENTER_KEY = "wf_center";
const UNDO_CMD_REGEX = /^\s*(?:actually\s+)?undo(?:\s+(?:that|it|(?:the\s+)?last\s+(?:change|edit|revision)))?[.!?\s]*$/i;

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

// wf_center as stored (lat, lng, loc, ts): santaArea decides whether it is fresh and consistent enough to use.
function readStoredCenter() {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    const c = JSON.parse(store.getItem(CENTER_KEY) || "null");
    if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
      return { lat: Number(c.lat), lng: Number(c.lng), loc: typeof c.loc === "string" ? c.loc : null, ts: Number(c.ts) };
    }
  } catch { /* ignore */ }
  return null;
}

/** "Tables in Tampa" / "Tables near you": the label always names the area the server was asked to search. */
function picksTitle(area) {
  if (!area || !area.label) return "Tables to look at";
  return /^near /.test(area.label) ? "Tables " + area.label : "Tables in " + area.label;
}

function readCurrentAuthUserId() {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k.startsWith("sb-") || k.includes("auth-token")) && k.endsWith("-auth-token")) {
        const parsed = JSON.parse(store.getItem(k) || "null");
        if (parsed?.user?.id) return parsed.user.id;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// Pure helper: Filters messages to { role: "user" | "assistant", text },
// skipping the initial static assistant welcome greeting if no user message has occurred yet,
// trims text to <= 280 chars, and returns at most the last 4 messages (last 2 turns).
export function buildBoundedConversationHistory(messages) {
  if (!Array.isArray(messages)) return [];
  const firstUserIdx = messages.findIndex((m) => m && m.role === "user");
  if (firstUserIdx === -1) return [];
  const relevant = [];
  for (let i = firstUserIdx; i < messages.length; i++) {
    const m = messages[i];
    if (m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string") {
      relevant.push({
        role: m.role,
        text: m.text.slice(0, 280),
      });
    }
  }
  return relevant.slice(-4);
}

// Pure helper: Serializes compact draft representation for revision requests.
export function serializeDraftForRevision(proposedPlan) {
  if (!proposedPlan || !Array.isArray(proposedPlan.days)) return null;
  return {
    title: proposedPlan.title || null,
    city: proposedPlan.city || null,
    state: proposedPlan.state || null,
    startDate: proposedPlan.startDate || null,
    endDate: proposedPlan.endDate || null,
    days: proposedPlan.days.slice(0, 10).map((d) => ({
      date: d && d.date ? d.date : null,
      areaSummary: d && d.areaSummary ? d.areaSummary : null,
      stops: Array.isArray(d && d.stops)
        ? d.stops.slice(0, 8).map((s) => ({
            id: s.id,
            slotLabel: s.slotLabel || null,
            why: s.why || null,
          }))
        : [],
    })),
  };
}

// Pure helper: Determines whether to reset planner session between openings.
export function shouldResetPlannerSession(prevMeta, nextOpenDetail) {
  if (nextOpenDetail?.resetSession === true) return true;
  if (!prevMeta) return false;

  const prevAuth = prevMeta.authUserId ?? null;
  const nextAuth = nextOpenDetail?.authUserId ?? null;
  // Signing IN mid-conversation (guest -> account, e.g. to finish a booking) keeps the thread; signing out or
  // switching accounts never carries one visitor's thread to another.
  if (prevAuth !== nextAuth && prevAuth !== null) return true;

  if (nextOpenDetail?.activeTripKey && prevMeta.activeTripKey && nextOpenDetail.activeTripKey !== prevMeta.activeTripKey) {
    return true;
  }

  const nextCity = nextOpenDetail?.city || nextOpenDetail?.contextCity || null;
  const prevCity = prevMeta.city || null;
  if (
    Boolean(nextOpenDetail?.prompt) &&
    Boolean(nextCity) &&
    Boolean(prevCity) &&
    String(nextCity).trim().toLowerCase() !== String(prevCity).trim().toLowerCase()
  ) {
    return true;
  }

  return false;
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
.wfp-tool{margin:4px 0 6px 53px;max-width:calc(100% - 53px);color:#fff;animation:wfp-pop .22s ease-out both}
.wfp-tool [data-reserve-card],.wfp-tool [data-reserve-picks]{margin-top:2px}
.wfp-choices{display:flex;flex-direction:column;gap:6px}
.wfp-choice{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:2px;padding:10px 14px;border-radius:16px;background:#1C1C1E;border:1px solid #0A84FF;color:#fff;font-size:15px}
.wfp-choice small{color:#AEAEB2;font-size:12.5px}
.wfp-choice[aria-pressed="true"]{background:#0A84FF}
.wfp-choice:disabled{cursor:default;opacity:.7}
.wfp-choice[aria-pressed="true"]:disabled{opacity:1}
.wfp-choice-link{all:unset;cursor:pointer;color:#0A84FF;font-size:15px;font-weight:600;padding:10px 6px;min-height:24px}
.wfp-choice:focus-visible,.wfp-choice-link:focus-visible{outline:2px solid #0A84FF;outline-offset:2px}
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
  const [planState, setPlanState] = useState("draft"); // "draft" | "revised" | "saved" | "revision_failed"
  const [draftHistory, setDraftHistory] = useState([]);
  const [changedStopIds, setChangedStopIds] = useState([]);
  const [revisionNotice, setRevisionNotice] = useState(null);
  const [candidateCatalog, setCandidateCatalog] = useState({});
  const [savedTripKey, setSavedTripKey] = useState(null);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [lastEditSummary, setLastEditSummary] = useState(null);
  const [openedAt, setOpenedAt] = useState("");
  // One booking state for the whole thread: the concierge mounts once and stays mounted (even while the sheet
  // is closed, e.g. during sign in), so the place, day, time, party and idempotency keys survive.
  const [reserveSeed, setReserveSeed] = useState(null); // { initialMessage, initialPlace } once a table is asked for
  const [reserveTick, setReserveTick] = useState(0);
  const conciergeRef = useRef(null);
  const reserveSnapRef = useRef({ items: [], busy: false, renderCard: null });
  const reserveSeenRef = useRef(new Set());
  const reserveActiveRef = useRef(false);
  const lastReserveTextRef = useRef("");
  const resumeAfterSignInRef = useRef(false);
  const pendingEditRef = useRef(null);
  const pendingPickRef = useRef(null);
  const pendingPicksRef = useRef(null);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const proposedRef = useRef(null);
  proposedRef.current = proposedPlan;
  const planStateRef = useRef("draft");
  planStateRef.current = planState;
  const draftHistoryRef = useRef([]);
  draftHistoryRef.current = draftHistory;
  const changedStopIdsRef = useRef([]);
  changedStopIdsRef.current = changedStopIds;
  const candidateCatalogRef = useRef({});
  candidateCatalogRef.current = candidateCatalog;
  const savedRef = useRef(null);
  savedRef.current = savedTripKey;
  const activeTripKeyRef = useRef(activeTripKey);
  activeTripKeyRef.current = activeTripKey;
  const savingRef = useRef(false);
  const submittingRef = useRef(false);
  const recentRef = useRef([]);
  const messagesRef = useRef([]);
  messagesRef.current = messages;
  const sessionMetaRef = useRef({
    authUserId: readCurrentAuthUserId(),
    activeTripKey: null,
    city: null,
  });

  // The phone keyboard shrinks the visual viewport, not the layout one: size the
  // sheet to what is actually visible so the composer and newest reply stay up.
  const [vv, setVv] = useState(null);

  const resetSession = useCallback(() => {
    messagesRef.current = [];
    proposedRef.current = null;
    candidateCatalogRef.current = {};
    draftHistoryRef.current = [];
    planStateRef.current = "draft";
    changedStopIdsRef.current = [];
    savedRef.current = null;
    activeTripKeyRef.current = null;

    setMessages([]);
    setDraft("");
    setLoading(false);
    setReserveSeed(null);
    pendingPickRef.current = null;
    pendingPicksRef.current = null;
    reserveSnapRef.current = { items: [], busy: false, renderCard: null };
    reserveSeenRef.current = new Set();
    reserveActiveRef.current = false;
    lastReserveTextRef.current = "";
    pendingEditRef.current = null;
    setProposedPlan(null);
    setCandidateCatalog({});
    setSavedTripKey(null);
    setUndoSnapshot(null);
    setLastEditSummary(null);
    setPlanState("draft");
    setChangedStopIds([]);
    setRevisionNotice(null);
  }, []);

  // ---- Reserve inside the thread -------------------------------------------------------------------------
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const seedPlaceRef = useRef(seedPlace);
  seedPlaceRef.current = seedPlace;
  const areaCtxRef = useRef({ pathname, contextCity });
  areaCtxRef.current = { pathname, contextCity };
  const awaitingAreaRef = useRef(null); // a "find me a table" waiting for the city Santa asked for

  /** Where to look, from the newest, strongest signal (lib/santaArea.js). Unknown means ask, never "nearby". */
  const areaFor = useCallback((text) => {
    const { pathname: path, contextCity: cityName } = areaCtxRef.current;
    const pageCity = extractCityFromPath(path) || (cityName ? parsePlannerCity(String(cityName)) : null);
    return resolveSearchArea({ text, selectedPlace: seedPlaceRef.current, storedPoint: readStoredCenter(), pageCity, nowMs: Date.now() });
  }, []);

  /** Hand a table request (or a "find me a restaurant") to the one concierge, in this thread. */
  const routeToReserve = useCallback((text, routed, { showUser }) => {
    const v = voiceRef.current || "wayfind";
    const p = plannerPersona(v);
    const details = (routed && routed.details) || {};
    const clean = (routed && routed.text) || text;
    const entries = [];
    if (showUser) entries.push({ role: "user", text });
    reserveActiveRef.current = true;
    if (routed.kind === "find_food") {
      // Discovery is not permission to book: picks first, a tap starts the booking, Confirm books.
      const intent = { cuisine: undefined, date: details.date || undefined, time: details.time || undefined, partySize: details.partySize || undefined };
      const area = areaFor(clean);
      if (area.source === "unknown") {
        // No reliable area: ask for the city first, never a statewide list dressed up as "nearby".
        awaitingAreaRef.current = intent;
        entries.push({ role: "assistant", text: p.askCity });
      } else {
        entries.push({ role: "assistant", text: p.findFood });
        entries.push({ role: "picks", k: Date.now(), intent, area });
      }
      setMessages((prev) => [...prev, ...entries]);
      trackPlannerEvent(PLANNER_EVENTS.REQUEST, { surface: "reserve_find", voice: v, has_active_trip: false });
      return;
    }
    lastReserveTextRef.current = clean;
    const seedPl = seedPlaceRef.current && seedPlaceRef.current.id && seedPlaceRef.current.name ? { id: String(seedPlaceRef.current.id), name: String(seedPlaceRef.current.name) } : null;
    const named = Boolean(details.venue) || Boolean(details.again);
    if (!conciergeRef.current) {
      entries.push({ role: "assistant", text: p.reserveIntro });
      setMessages((prev) => [...prev, ...entries]);
      // The newest words win: a named restaurant beats the page the visitor happens to be on.
      setReserveSeed({ initialMessage: clean, initialPlace: named ? null : seedPl, k: Date.now() });
    } else {
      setMessages((prev) => [...prev, ...entries]);
      conciergeRef.current.send(clean);
    }
    // No restaurant named and none on screen: offer grounded picks alongside the one question the concierge asks.
    // They land right under Santa's answer (the concierge's reply), not above it.
    // Only with a known area: unknown means the concierge's own question stands alone.
    const area = !named && !seedPl && !(reserveSnapRef.current && reserveSnapRef.current.placeKnown) ? areaFor(clean) : null;
    if (area && area.source !== "unknown") {
      pendingPicksRef.current = { role: "picks", k: Date.now() + 1, intent: { date: details.date || undefined, time: details.time || undefined, partySize: details.partySize || undefined }, area };
    }
    trackPlannerEvent(PLANNER_EVENTS.REQUEST, { surface: "reserve", voice: v, has_active_trip: false });
  }, [areaFor]);

  /** A restaurant tapped in the thread: start or continue the one booking with it. Not a booking yet. */
  const pickRestaurant = useCallback((pick) => {
    if (!pick || !pick.placeId) return;
    // Tapped while Santa is still answering: hold the tap and apply it the moment he is done (never dropped,
    // never a second request in flight).
    if (reserveSnapRef.current.busy) { pendingPickRef.current = pick; return; }
    reserveActiveRef.current = true;
    setMessages((prev) => [...prev, { role: "user", text: pick.name }]);
    if (conciergeRef.current) conciergeRef.current.choose(pick);
    else setReserveSeed({ initialMessage: lastReserveTextRef.current || ("A table at " + pick.name), initialPlace: { id: pick.placeId, name: pick.name }, k: Date.now() });
  }, []);

  const pickRef = useRef(null);
  pickRef.current = pickRestaurant;

  /** Concierge items become thread entries, in the order they happen. */
  const onReserveSnapshot = useCallback((snap) => {
    const prev = reserveSnapRef.current || {};
    const items = Array.isArray(snap.items) ? snap.items : [];
    reserveSnapRef.current = { ...snap, placeKnown: items.some((it) => it && it.card && ["times", "confirm", "request", "handoff", "booked", "requested"].includes(it.card.type)) || prev.placeKnown };
    const fresh = items.filter((it) => it && !reserveSeenRef.current.has(it.id));
    if (fresh.length) {
      for (const it of fresh) reserveSeenRef.current.add(it.id);
      const picks = !snap.busy && pendingPicksRef.current ? pendingPicksRef.current : null;
      if (picks) pendingPicksRef.current = null;
      setMessages((m) => [...m, ...fresh.map((it) => ({ role: "reserve", rid: it.id })), ...(picks ? [picks] : [])]);
    }
    if (fresh.length || prev.items !== snap.items || prev.busy !== snap.busy || prev.who !== snap.who) setReserveTick((n) => n + 1);
    if (!snap.busy && pendingPickRef.current) {
      const held = pendingPickRef.current;
      pendingPickRef.current = null;
      window.setTimeout(() => pickRef.current && pickRef.current(held), 0);
    }
  }, []);

  // Sign in from inside the thread: the sheet steps aside for the site's sign in, then comes back to the same thread.
  useEffect(() => {
    const onSignin = () => { resumeAfterSignInRef.current = true; setOpen(false); };
    window.addEventListener("wf:reserve-signin", onSignin);
    return () => window.removeEventListener("wf:reserve-signin", onSignin);
  }, []);

  const chooseTrip = useCallback((entryIdx, trip, prompt) => {
    setMessages((prev) => prev.map((m, i) => (i === entryIdx ? { ...m, chosen: trip.key } : m)));
    activeTripKeyRef.current = trip.key;
    setActiveTripKey(trip.key);
    window.setTimeout(() => submitRef.current && submitRef.current(prompt, { activeTripKey: trip.key, tripResolved: true }), 0);
  }, []);

  const applyOrganize = useCallback((entryIdx, apply) => {
    const pend = pendingEditRef.current;
    pendingEditRef.current = null;
    setMessages((prev) => prev.map((m, i) => (i === entryIdx ? { ...m, state: apply ? "applied" : "dismissed" } : m)));
    if (!apply || !pend) return;
    const batchRes = executePlannerActionBatch(readStoredTripsSnapshot(), pend.actions, { verifiedCatalog: pend.catalog });
    if (!batchRes.ok) {
      setMessages((prev) => [...prev, { role: "assistant", text: plannerPersona(pend.voice).noChange }]);
      return;
    }
    setUndoSnapshot(batchRes.undoSnapshot);
    setLastEditSummary(batchRes.summary || pend.reply);
    setLocal("wayfind_trips", JSON.stringify(batchRes.nextTrips));
    broadcastPlannerTripCommit({ nextTrips: batchRes.nextTrips, tripKey: batchRes.tripKey || pend.tripKey, openItinerary: false, toast: pend.reply });
    trackPlannerEvent(PLANNER_EVENTS.DAY_OPTIMIZED, { trip_key: pend.tripKey, voice: pend.voice });
    setMessages((prev) => [...prev, { role: "assistant", text: pend.reply || "Done." }]);
  }, []);
  const submitRef = useRef(null);

  const submitPlannerPrompt = useCallback(async (rawPrompt, overrideOpts = {}) => {
    const text = String(rawPrompt || "").trim().slice(0, 500);
    if (!text || loading) return;
    if (submittingRef.current) return;
    if (reserveSnapRef.current.busy) return; // one request chain at a time

    // ---- the city Santa asked for: "Tampa" answers the open question, it is not a new trip
    if (awaitingAreaRef.current) {
      const held = awaitingAreaRef.current;
      awaitingAreaRef.current = null;
      // Only a short city answer ("Tampa", "in St. Pete please"). "Plan my Tampa weekend" is a new request.
      const answer = classifySantaMessage(text, { today: siteTodayStr(), reserveActive: false, hasActiveTrip: false });
      const city = answer.kind === "none" && !TRIP_WORDS.test(text) && text.split(/\s+/).length <= 5 ? parsePlannerCity(text) : null;
      const area = city ? resolveSearchArea({ text, nowMs: Date.now() }) : null;
      if (area && area.source === "message_city") {
        setDraft("");
        const pv = plannerPersona(voiceRef.current || "wayfind");
        setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: pv.findFood }, { role: "picks", k: Date.now(), intent: held, area }]);
        return;
      }
    }

    // ---- one dispatcher for every Santa turn: a table goes to Reserve, a trip goes to the planner
    const routed = classifySantaMessage(text, {
      today: siteTodayStr(),
      reserveActive: reserveActiveRef.current,
      hasActiveTrip: Boolean(activeTripKeyRef.current),
    });
    if (routed.kind === "reserve" || routed.kind === "find_food") {
      setDraft("");
      routeToReserve(text, routed, { showUser: true });
      return;
    }
    if (routed.kind === "plan") reserveActiveRef.current = false;

    // ---- "organize my saved stops": find the real trip first, never answer from an empty context
    const tripKeyGiven = overrideOpts.activeTripKey !== undefined ? overrideOpts.activeTripKey : (savedRef.current || activeTripKeyRef.current);
    if (ORGANIZE_SAVED_RX.test(text) && !overrideOpts.tripResolved) {
      let snap = readStoredTripsSnapshot();
      if (!Object.keys(snap).length && readCurrentAuthUserId()) {
        // Signed in but the synced trips may still be landing: wait once before calling it empty.
        await new Promise((r) => window.setTimeout(r, 1200));
        snap = readStoredTripsSnapshot();
      }
      const pick = resolveOrganizeTrip(snap, tripKeyGiven && snap[tripKeyGiven] ? tripKeyGiven : null);
      if (pick.kind === "choose") {
        setDraft("");
        setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: plannerPersona(overrideOpts.voice || voice).whichTrip }, { role: "tripchoice", trips: pick.trips, prompt: text }]);
        return;
      }
      if (pick.kind === "empty") {
        setDraft("");
        setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: plannerPersona(overrideOpts.voice || voice).noSavedStops }]);
        return;
      }
      if (pick.key !== tripKeyGiven) {
        activeTripKeyRef.current = pick.key;
        setActiveTripKey(pick.key);
      }
      overrideOpts = { ...overrideOpts, activeTripKey: pick.key, tripResolved: true };
    }
    submittingRef.current = true;

    // Client-side pre-save Undo: if user types "undo" / "actually undo that"
    if (UNDO_CMD_REGEX.test(text) && proposedRef.current && !savedRef.current) {
      if (draftHistoryRef.current.length > 0) {
        const prevStack = [...draftHistoryRef.current];
        const previousPlan = prevStack.pop();
        setDraftHistory(prevStack);
        setProposedPlan(previousPlan);
        const nextState = prevStack.length > 0 ? "revised" : "draft";
        setPlanState(nextState);
        setRevisionNotice(null);
        setDraft("");
        setMessages((prev) => [
          ...prev,
          { role: "user", text },
          { role: "assistant", text: "Undid your last draft change." },
        ]);
        submittingRef.current = false;
        return;
      }
    }

    const effVoice = overrideOpts.voice || voice || defaultVoiceForPath(pathname);
    const effCity = overrideOpts.contextCity !== undefined ? overrideOpts.contextCity : contextCity;
    const effSeed = overrideOpts.seedPlace !== undefined ? overrideOpts.seedPlace : seedPlace;
    const tripsSnap = readStoredTripsSnapshot();
    const effTripKey = overrideOpts.activeTripKey !== undefined ? overrideOpts.activeTripKey : (savedRef.current || activeTripKey);
    const currentActiveTrip = effTripKey && tripsSnap[effTripKey] ? tripsSnap[effTripKey] : null;

    setDraft("");
    setLoading(true);
    // What the visitor already told the host this session (newest last), so a
    // follow up like "Tampa" after "this weekend, two adults" keeps both.
    recentRef.current = messagesRef.current.filter((m) => m.role === "user").map((m) => m.text).slice(-3);
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
          recent: recentRef.current,
          conversationHistory: buildBoundedConversationHistory(messagesRef.current),
          proposedPlan: !currentActiveTrip && !savedRef.current && proposedRef.current
            ? serializeDraftForRevision(proposedRef.current)
            : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        if (proposedRef.current && !savedRef.current) {
          setPlanState("revision_failed");
          setRevisionNotice((data && data.reply) || "Could not make that change. Your draft was kept intact.");
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: plannerPersona(effVoice).snag,
          },
        ]);
        return;
      }

      if (data.mode === "reserve") {
        // The server's reader says this is a table: same dispatcher, the visitor's bubble is already shown.
        routeToReserve(text, { kind: data.kind === "find_food" ? "find_food" : "reserve", text: data.text || text, details: data.reserve || {} }, { showUser: false });
        return;
      }

      const organizing = data.mode === "edit_trip" && Array.isArray(data.actions) && data.actions.some((a) => a && a.type === "OPTIMIZE_DAY" && a.organizeIntoDays);
      if (!organizing) setMessages((prev) => [...prev, { role: "assistant", text: data.reply || "Here is what I found." }]);

      if (data.mode === "propose_trip" && data.proposedPlan) {
        savingRef.current = false;
        setProposedPlan(data.proposedPlan);
        setPlanState("draft");
        setDraftHistory([]);
        setRevisionNotice(null);
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
      } else if (data.mode === "revise_plan" || data.revisionStatus === "revised") {
        if (data.proposedPlan) {
          if (proposedRef.current) {
            setDraftHistory((prev) => [...prev, proposedRef.current]);
          }
          setProposedPlan(data.proposedPlan);
          setPlanState("revised");
          setRevisionNotice(null);
          if (data.candidateCatalog) {
            setCandidateCatalog((prev) => ({ ...prev, ...data.candidateCatalog }));
          }
        }
      } else if (data.mode === "no_change" || data.revisionStatus === "unchanged") {
        setPlanState("revision_failed");
        setRevisionNotice(data.reply || "Could not make that change.");
      } else if (data.mode === "clarify") {
        setRevisionNotice(null);
      } else if (organizing && currentActiveTrip) {
        // Show the organized days first; nothing is written until "Apply to my trip" (owner 2026-11-14).
        const preview = executePlannerActionBatch(readStoredTripsSnapshot(), data.actions, { verifiedCatalog: data.candidateCatalog || {} });
        const tripKey = preview.ok ? (preview.tripKey || currentActiveTrip.key) : null;
        const nothingPlaced = preview.ok && preview.nextTrips && preview.nextTrips[tripKey] && !(preview.nextTrips[tripKey].items || []).some((it) => it && it.day && !(currentActiveTrip.items || []).some((o) => String(o.id) === String(it.id) && o.day === it.day));
        if (nothingPlaced) {
          // Nothing would move (no dates to place them on): say so instead of offering an empty change.
          setMessages((prev) => [...prev, { role: "assistant", text: plannerPersona(effVoice).organizeNeedsDates }]);
        } else if (preview.ok && preview.nextTrips && preview.nextTrips[tripKey]) {
          pendingEditRef.current = { actions: data.actions, catalog: data.candidateCatalog || {}, tripKey, reply: data.reply, voice: effVoice };
          setMessages((prev) => [...prev,
            { role: "assistant", text: plannerPersona(effVoice).organizeReady },
            { role: "editproposal", tripKey, title: String(preview.nextTrips[tripKey].title || currentActiveTrip.title || "Your trip"), days: organizePreview(preview.nextTrips[tripKey]), state: "pending" },
          ]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", text: plannerPersona(effVoice).noChange }]);
        }
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
      submittingRef.current = false;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [activeTripKey, contextCity, loading, pathname, seedPlace, surface, voice, routeToReserve]);
  submitRef.current = submitPlannerPrompt;

  // Handle visitor session isolation / auth reset
  useEffect(() => {
    const onAuthChanged = (e) => {
      const nextAuth = (e && e.detail && e.detail.userId) !== undefined ? e.detail.userId : readCurrentAuthUserId();
      const prevAuth = sessionMetaRef.current.authUserId ?? null;
      if (prevAuth !== (nextAuth ?? null)) {
        sessionMetaRef.current.authUserId = nextAuth;
        if (prevAuth !== null) resetSession();
        else if (nextAuth && resumeAfterSignInRef.current) {
          // Back from sign in: the same thread, and the booking picks up where it stopped.
          resumeAfterSignInRef.current = false;
          setOpen(true);
          try { if (conciergeRef.current && conciergeRef.current.resume) conciergeRef.current.resume(); } catch { /* ignore */ }
        }
      }
    };
    const onStorage = (e) => {
      if (e.key === "wayfind_trips" && !e.newValue) {
        resetSession();
      }
    };
    window.addEventListener("wf:auth-changed", onAuthChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("wf:auth-changed", onAuthChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [resetSession]);

  // Listen for `wf:planner-open` from any surface
  useEffect(() => {
    const onOpen = (e) => {
      try { delete window.__wfPendingPlannerOpen; } catch {}
      const detail = (e && e.detail) || {};
      const nextVoice = detail.voice || defaultVoiceForPath(detail.pathname || pathname);
      const nextSurface = detail.surface || "button";
      const pathCity = extractCityFromPath(detail.pathname || pathname);
      const nextCity = detail.city || (pathCity && pathCity.name) || null;
      const currentAuthId = readCurrentAuthUserId();

      const reset = shouldResetPlannerSession(sessionMetaRef.current, { ...detail, authUserId: currentAuthId, city: nextCity });
      if (reset) {
        resetSession();
      }
      // Reopening from the dock keeps the selected trip; a new trip key (or a reset) replaces it.
      const keepTrip = reset ? null : activeTripKeyRef.current;
      const nextTripKey = detail.activeTripKey || keepTrip || null;

      sessionMetaRef.current = {
        authUserId: currentAuthId,
        activeTripKey: nextTripKey,
        city: nextCity,
      };

      setVoice(nextVoice);
      setSurface(nextSurface);
      setContextCity(nextCity);
      setSeedPlace(detail.seedPlace || null);
      setActiveTripKey(nextTripKey);
      activeTripKeyRef.current = nextTripKey;
      setOpenedAt((t) => t || stampTime());
      setOpen(true);

      trackPlannerEvent(PLANNER_EVENTS.OPENED, {
        surface: nextSurface,
        voice: nextVoice,
        city_slug: pathCity ? pathCity.slug : undefined,
      });

      if (Array.isArray(detail.chooseTrips) && detail.chooseTrips.length > 1 && detail.choosePrompt) {
        const v = plannerPersona(nextVoice);
        setMessages((prev) => [...prev, { role: "user", text: String(detail.choosePrompt) }, { role: "assistant", text: v.whichTrip }, { role: "tripchoice", trips: detail.chooseTrips.slice(0, 6), prompt: String(detail.choosePrompt) }]);
      } else if (!detail.prompt) {
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
            activeTripKey: nextTripKey,
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
  }, [pathname, resetSession, submitPlannerPrompt]);

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
    if (!open || typeof window === "undefined" || !window.visualViewport) return undefined;
    const v = window.visualViewport;
    const sync = () => {
      const kb = window.innerHeight - v.height > 120;
      setVv(kb ? { h: Math.round(v.height), top: Math.round(v.offsetTop) } : null);
    };
    sync();
    v.addEventListener("resize", sync);
    v.addEventListener("scroll", sync);
    return () => {
      v.removeEventListener("resize", sync);
      v.removeEventListener("scroll", sync);
    };
  }, [open]);

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
    setPlanState("saved");
    planStateRef.current = "saved";
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

  const handleDraftUndo = () => {
    if (draftHistoryRef.current.length === 0) return;
    const prevStack = [...draftHistoryRef.current];
    const previousPlan = prevStack.pop();
    setDraftHistory(prevStack);
    setProposedPlan(previousPlan);
    const nextState = prevStack.length > 0 ? "revised" : "draft";
    setPlanState(nextState);
    planStateRef.current = nextState;
    setRevisionNotice(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "Undid your last draft change." },
    ]);
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

  const effPlanState = savedTripKey ? "saved" : (planState || "draft");
  void reserveTick; // re-render when the concierge's items, busy state or review card change
  const rsnap = reserveSnapRef.current || { items: [] };
  const busyNow = loading || Boolean(rsnap.busy);
  const reserveItem = (rid) => (Array.isArray(rsnap.items) ? rsnap.items.find((it) => it && it.id === rid) : null);
  // Every entry is a visitor bubble, a host bubble, a tool card (picks, review, trip choice) or nothing.
  const threadRole = (m) => {
    if (!m) return "skip";
    if (m.role === "user" || m.role === "assistant") return m.role;
    if (m.role === "reserve") {
      const it = reserveItem(m.rid);
      if (!it) return "skip";
      if (it.role === "user") return "user";
      if (it.text) return "assistant";
      return it.card && rsnap.renderCard ? "tool" : "skip";
    }
    return "tool";
  };
  const entryText = (m) => {
    if (m.role === "reserve") { const it = reserveItem(m.rid); return it ? it.text : ""; }
    return m.text;
  };
  const renderToolEntry = (m, idx) => {
    if (m.role === "reserve") {
      const it = reserveItem(m.rid);
      const i = rsnap.items.indexOf(it);
      return it && rsnap.renderCard ? <div data-wf-thread-reserve="1">{rsnap.renderCard(it, i)}</div> : null;
    }
    if (m.role === "picks") {
      return (
        <Suspense fallback={null}>
          <ReservePicks key={m.k} intent={m.intent} area={m.area || null} title={picksTitle(m.area)} onPick={pickRestaurant} />
        </Suspense>
      );
    }
    if (m.role === "tripchoice") {
      return (
        <div className="wfp-choices" data-wf-trip-choice="1" role="group" aria-label="Which trip">
          {m.trips.map((t) => (
            <button key={t.key} type="button" className="wfp-choice" data-wf-trip-choice-key={t.key} disabled={Boolean(m.chosen) || busyNow} aria-pressed={m.chosen === t.key} onClick={() => chooseTrip(idx, t, m.prompt)}>
              <b>{t.title}</b>
              <small>{t.count} {t.count === 1 ? "stop" : "stops"} without a day</small>
            </button>
          ))}
        </div>
      );
    }
    if (m.role === "editproposal") {
      return (
        <div className="wfp-plan" data-wf-organize-proposal={m.state}>
          <div style={{ fontWeight: 700 }}>{m.title}</div>
          {m.days.map((d) => (
            <div key={d.day} className="wfp-day">
              <div className="wfp-day-hdr">{d.day}</div>
              {d.names.map((n, j) => <div key={j} className="wfp-li"><span className="wfp-li-e" aria-hidden="true">📍</span><span>{n}</span></div>)}
            </div>
          ))}
          {m.state === "pending" ? (
            <div className="wfp-save-bar">
              <button type="button" className="wfp-save-btn" data-wf-organize-apply="1" onClick={() => applyOrganize(idx, true)}>Apply to my trip</button>
              <button type="button" className="wfp-choice-link" data-wf-organize-dismiss="1" onClick={() => applyOrganize(idx, false)}>Not now</button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: m.state === "applied" ? "#30D158" : "#8E8E93", fontWeight: 600 }}>{m.state === "applied" ? "✓ Applied to your trip" : "Kept your trip as it was"}</div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={styleHtml(PLANNER_CSS)} />
      {reserveSeed && (
        <Suspense fallback={null}>
          <ReserveConcierge
            key={reserveSeed.k}
            thread
            controlRef={conciergeRef}
            onSnapshot={onReserveSnapshot}
            initialMessage={reserveSeed.initialMessage}
            initialPlace={reserveSeed.initialPlace}
          />
        </Suspense>
      )}
      {open && (
        <div
          className="wfp-back"
          data-wf-planner-sheet="1"
          style={vv ? { top: vv.top, bottom: "auto", height: vv.h } : undefined}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="wfp-modal" style={vv ? { height: vv.h, maxHeight: vv.h, borderRadius: 0 } : undefined} role="dialog" aria-modal="true" aria-label={`Chat with ${persona.name}, Wayfind trip planner`}>
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
                const role = threadRole(m);
                if (role === "skip") return null;
                const prev = messages[idx - 1];
                const next = messages[idx + 1];
                const prevRole = prev ? threadRole(prev) : null;
                const nextRole = next ? threadRole(next) : null;
                if (role === "tool") {
                  return <div key={idx} className="wfp-tool">{renderToolEntry(m, idx)}</div>;
                }
                // A concierge answer can carry words AND a card (times, review, result): bubble, then the card.
                const withCard = m.role === "reserve" && role === "assistant" && (() => { const it = reserveItem(m.rid); return Boolean(it && it.card && rsnap.renderCard); })();
                const isUser = role === "user";
                const text = entryText(m);
                if (!text) return null;
                const firstOfGroup = !prev || prevRole !== role;
                // The typing dots continue Santa's group, so his last bubble keeps no tail then.
                const lastOfGroup = next ? nextRole !== role : !(busyNow && !isUser);
                const cls = `wfp-row ${isUser ? "user" : "assistant"}${firstOfGroup && idx ? " gap" : ""}${lastOfGroup ? " last" : ""}`;
                const bubble = (
                  <div key={idx} className={cls}>
                    {!isUser && <HostFigure voice={host} />}
                    <div className={`wfp-msg ${isUser ? "user" : "assistant"}`}>
                      <BubbleTail fill={isUser ? "#0A84FF" : "#26252A"} />
                      {text}
                    </div>
                  </div>
                );
                if (!withCard) return bubble;
                const card = renderToolEntry(m, idx);
                return card ? [bubble, <div key={idx + "c"} className="wfp-tool">{card}</div>] : bubble;
              })}

              {lastUserIdx === messages.length - 1 && lastUserIdx >= 0 && !busyNow && (
                <div className="wfp-read">Delivered</div>
              )}

              {busyNow && (
                <div className={`wfp-row assistant last${messages.length && threadRole(messages[messages.length - 1]) === "assistant" ? "" : " gap"}`} data-wf-planner-typing="1">
                  <HostFigure voice={host} />
                  <div className="wfp-msg assistant wfp-typing" role="status">
                    <BubbleTail fill="#26252A" />
                    <i /><i /><i />
                    <span className="wfp-sr">{persona.typing}</span>
                  </div>
                </div>
              )}

              {proposedPlan && (
                <div className="wfp-plan" data-wf-proposed-plan="1" data-wf-plan-state={effPlanState}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>
                      {proposedPlan.title}
                    </div>
                    {draftHistory.length > 0 && !savedTripKey && (
                      <button
                        type="button"
                        data-wf-draft-undo="1"
                        onClick={handleDraftUndo}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#0A84FF",
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: "rgba(10,132,255,0.12)",
                        }}
                      >
                        Undo
                      </button>
                    )}
                  </div>

                  {revisionNotice && !savedTripKey && (
                    <div
                      data-wf-revision-notice="1"
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(239,68,68,0.15)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        fontSize: 12.5,
                        color: "#FCA5A5",
                      }}
                    >
                      {revisionNotice}
                    </div>
                  )}

                  {proposedPlan.days.map((day, dIdx) => (
                    <div key={day.date || dIdx} className="wfp-day" data-wf-proposed-day={day.date || String(dIdx)}>
                      <div className="wfp-day-hdr">{day.label}</div>
                      {sortStopsByTime(day.stops).map((stop) => (
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
                  aria-label={`Message ${persona.name}: plan a trip or book a table`}
                  enterKeyHint="send"
                />
                {draft.trim() ? (
                <button type="submit" className="wfp-send" aria-label="Send" disabled={busyNow}>
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
