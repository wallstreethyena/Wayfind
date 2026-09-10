#!/usr/bin/env python3
from pathlib import Path


def text(path):
    return Path(path).read_text()


def save(path, value):
    Path(path).write_text(value)


def replace_once(path, old, new):
    src = text(path)
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:100]!r}")
    save(path, src.replace(old, new, 1))


def replace_between(path, start, end, new):
    src = text(path)
    a = src.find(start)
    if a < 0:
        raise RuntimeError(f"{path}: start marker missing: {start!r}")
    b0 = src.find(end, a + len(start))
    if b0 < 0:
        raise RuntimeError(f"{path}: end marker missing: {end!r}")
    b = b0 + len(end)
    save(path, src[:a] + new + src[b:])


def replace_all(path, old, new, minimum=1):
    src = text(path)
    count = src.count(old)
    if count < minimum:
        raise RuntimeError(f"{path}: expected >= {minimum} matches, found {count}: {old!r}")
    save(path, src.replace(old, new))


KIT_INSERT = r'''export const TARGET = 44;

// Reader-facing degraded state. This does not resolve the upstream outage; it
// keeps a transient service miss from looking like an empty town or an endless
// skeleton. This is the same tiny Critter already used by Wayfind's loader.
function RailCritter({ size = 70 }) {
  return (
    <svg width={size} height={Math.round((size * 38) / 40)} viewBox="28 22 40 38" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }} aria-hidden="true">
      <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
      <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
      <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
    </svg>
  );
}

export function RailMascotBusy({ failure = null, rail = "", onRetry = null, onVisible = null }) {
  const seen = useRef("");
  const eventKey = failure?.requestId ? rail + "|" + failure.requestId : "";
  useEffect(() => {
    if (!eventKey || seen.current === eventKey) return;
    seen.current = eventKey;
    try { onVisible?.(); } catch {}
  }, [eventKey, onVisible]);
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", border: "1px solid " + C.border, borderRadius: 16, background: "linear-gradient(145deg,rgba(22,27,34,.98),rgba(9,13,20,.98))" }}>
      <div style={{ flex: "0 0 auto" }}><RailCritter /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TYPE.title, color: C.text, marginBottom: 4 }}>Wayfind hit a snag</div>
        <p style={{ ...TYPE.meta, color: C.light, margin: 0 }}>We tried these picks again, but the service still did not answer. Please come back in a little bit.</p>
        {onRetry ? <button type="button" onClick={onRetry} style={{ marginTop: 10, minHeight: 38, padding: "0 13px", borderRadius: 999, border: "1px solid " + C.accent, background: "transparent", color: C.text, fontWeight: 700, cursor: "pointer" }}>Try again</button> : null}
      </div>
    </div>
  );
}

// A 4xx/malformed contract is our bug, not an upstream outage. Do not put the
// mascot on it and do not imply that retrying the provider is the answer.
export function RailDevError() {
  return (
    <div role="status" aria-live="polite" style={{ padding: "13px 15px", border: "1px solid " + C.border, borderRadius: 14, background: C.panel }}>
      <div style={{ ...TYPE.title, color: C.text, marginBottom: 4 }}>This rail isn’t available right now.</div>
      <p style={{ ...TYPE.meta, color: C.muted, margin: 0 }}>Wayfind needs to fix this one. Please come back later.</p>
    </div>
  );
}
'''
replace_once("app/components/kit.js", "export const TARGET = 44;\n", KIT_INSERT)

HELPER_IMPORT = 'import { emitRailDegraded, fetchRailJson, isRailCancelled, railDeveloperFailure } from "../../lib/railFailure.js";'

# Fall
p = "app/components/FallIntentRails.js"
replace_once(p, 'import { directionsUrl } from "./kit";', 'import { directionsUrl, RailDevError, RailMascotBusy } from "./kit.js";')
replace_once(p, 'import { fetchJsonWithDeadline } from "../../lib/clientJson.js";', HELPER_IMPORT)
replace_once(p, '  const [failed, setFailed] = useState(false);', '  const [failure, setFailure] = useState(null);')
replace_between(p, r'''  useEffect(() => {
    const requestKey = `${key}|${retry}`;''', '  }, [key, retry]);', r'''  useEffect(() => {
    const requestKey = key + "|" + retry;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailure(null);
    let cancelled = false;
    const controller = new AbortController();
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, v: "2" });
    fetchRailJson("/api/events/fall?" + query.toString(), { timeoutMs: FALL_LOAD_TIMEOUT_MS, signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        if (!result || !Array.isArray(result.rails) || result.rails.length !== 10) {
          setFailure(railDeveloperFailure("invalid_payload", { route: "/api/events/fall" }));
          return;
        }
        setPayload(result);
        try { onTrack?.("fall_intent_collection_open", { city, phase: result.phase, rails: result.rails.map((rail) => rail.id).join(","), cards: result.rails.reduce((sum, rail) => sum + rail.cards.length, 0) }); } catch {}
      })
      .catch((error) => {
        if (cancelled || isRailCancelled(error)) return;
        if (error?.kind === "developer") console.error("[FallIntentRails] request contract failure", error);
        setFailure(error);
      });
    return () => { cancelled = true; controller.abort(); asked.current = ""; };
    // The parent's inline telemetry callback is not request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);''')
replace_once(p,
'''  if (!payload && !failed) return <div role="status" aria-busy="true" aria-label="Ranking Florida fall experiences">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#140C12" }} />)}</div>;
  if (failed) return <div><p style={{ color: COLORS.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s verified fall inventory. That is a service miss, not an empty city.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: COLORS.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;''',
'''  if (!payload && !failure) return <div role="status" aria-busy="true" aria-label="Ranking Florida fall experiences">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#140C12" }} />)}</div>;
  if (failure) return failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="fall" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "fall" }); }} />;''')

# Night Out
p = "app/components/NightOutRails.js"
replace_once(p, 'import { directionsUrl } from "./kit";', 'import { directionsUrl, RailDevError, RailMascotBusy } from "./kit.js";')
replace_once(p, 'import { fetchJsonWithDeadline } from "../../lib/clientJson.js";', HELPER_IMPORT)
replace_once(p, '  const [failed, setFailed] = useState(false);', '  const [failure, setFailure] = useState(null);')
replace_between(p, '''  useEffect(() => {
    if (!key) return;''', '  }, [key]);', '''  useEffect(() => {
    if (!key) return;
    let dead = false;
    const controller = new AbortController();
    setRemote(null);
    setFailure(null);
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng });
    fetchRailJson("/api/night-out?" + query.toString(), { timeoutMs: 10000, signal: controller.signal })
      .then((value) => {
        if (dead) return;
        if (!Array.isArray(value?.rails)) {
          setFailure(railDeveloperFailure("invalid_payload", { route: "/api/night-out" }));
          return;
        }
        setRemote({ key, value });
      })
      .catch((error) => {
        if (dead || isRailCancelled(error)) return;
        if (error?.kind === "developer") console.error("[NightOutRails] request contract failure", error);
        setFailure(error);
      });
    return () => { dead = true; controller.abort(); };
  }, [key]);''')
replace_once(p, '  if (!remote && !failed && !payload.rails.some((rail) => rail.places.length)) {', '  if (!remote && !failure && !payload.rails.some((rail) => rail.places.length)) {')
replace_once(p,
'''  if (failed && !payload.rails.some((rail) => rail.places.length)) {
    return <div><p style={{ color: C.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s Night Out inventory. That is a service miss, not an empty town.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #4B5563", borderRadius: 999, background: "#111827", color: C.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;
  }''',
'''  if (failure && !payload.rails.some((rail) => rail.places.length)) {
    return failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="night-out" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "night-out" }); }} />;
  }''')

# Today
p = "app/components/TodayDiscoveryRails.js"
replace_once(p, 'import { directionsUrl } from "./kit";', 'import { directionsUrl, RailDevError, RailMascotBusy } from "./kit.js";')
replace_once(p, 'import { fetchJsonWithDeadline } from "../../lib/clientJson.js";', HELPER_IMPORT)
replace_once(p, '  const [failed, setFailed] = useState(false);', '  const [failure, setFailure] = useState(null);')
replace_between(p, r'''  useEffect(() => {
    const requestKey = `${key}|${city}|${retry}`;''', '  }, [key, city, retry]);', '''  useEffect(() => {
    const requestKey = key + "|" + city + "|" + retry;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailure(null);
    let dead = false;
    const controller = new AbortController();
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, city, v: "1" });
    fetchRailJson("/api/today-discovery?" + query.toString(), { timeoutMs: 10000, signal: controller.signal })
      .then((result) => {
        if (dead) return;
        if (!result || !Array.isArray(result.rails)) {
          setFailure(railDeveloperFailure("invalid_payload", { route: "/api/today-discovery" }));
          return;
        }
        setPayload(result);
        try { onTrack?.("today_discovery_open", { city, rails: result.rails.map((rail) => rail.id).join(","), places: result.rails.reduce((sum, rail) => sum + rail.places.length, 0) }); } catch {}
      })
      .catch((error) => {
        if (dead || isRailCancelled(error)) return;
        if (error?.kind === "developer") console.error("[TodayDiscoveryRails] request contract failure", error);
        setFailure(error);
      });
    return () => { dead = true; controller.abort(); asked.current = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, city, retry]);''')
replace_once(p,
'''  if (!payload && !failed) return <div role="status" aria-busy="true" aria-label="Ranking today's best discoveries">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}</div>;
  if (failed) return <div><p style={{ color: COLORS.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s discovery inventory. That is a service miss, not an empty town.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #4B5563", borderRadius: 999, background: "#111827", color: COLORS.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;''',
'''  if (!payload && !failure) return <div role="status" aria-busy="true" aria-label="Ranking today's best discoveries">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}</div>;
  if (failure) return failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="today" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "today" }); }} />;''')

# Birthday
p = "app/components/BirthdayRails.js"
replace_once(p, 'import { directionsUrl } from "./kit";', 'import { directionsUrl, RailDevError, RailMascotBusy } from "./kit.js";')
replace_once(p, 'import { fetchJsonWithDeadline } from "../../lib/clientJson.js";', HELPER_IMPORT)
replace_once(p, '  const [failed, setFailed] = useState(false);', '  const [failure, setFailure] = useState(null);')
replace_between(p, '''  useEffect(() => {
    const requestKey = key + "|" + retry;''', '  }, [key, retry]);', '''  useEffect(() => {
    const requestKey = key + "|" + retry;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setPayload(null);
    setFailure(null);
    let dead = false;
    const controller = new AbortController();
    const [queryLat, queryLng] = key.split("|");
    const query = new URLSearchParams({ lat: queryLat, lng: queryLng, v: "2" });
    fetchRailJson("/api/birthday?" + query.toString(), { timeoutMs: 10000, signal: controller.signal })
      .then((result) => {
        if (dead) return;
        if (!result || !Array.isArray(result.rails)) {
          setFailure(railDeveloperFailure("invalid_payload", { route: "/api/birthday" }));
          return;
        }
        setPayload(result);
        if (onTrack) {
          try { onTrack("birthday_intent_open", { city, rails: result.rails.map((rail) => rail.id).join(","), places: result.rails.reduce((sum, rail) => sum + rail.places.length, 0) }); } catch {}
        }
      })
      .catch((error) => {
        if (dead || isRailCancelled(error)) return;
        if (error?.kind === "developer") console.error("[BirthdayRails] request contract failure", error);
        setFailure(error);
      });
    return () => { dead = true; controller.abort(); asked.current = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);''')
replace_once(p, '  if (!payload && !failed) {', '  if (!payload && !failure) {')
replace_once(p,
'''  if (failed) {
    return (
      <div>
        <p style={{ color: COLORS.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s Birthday inventory. That is a service miss, not an empty town.</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #4B5563", borderRadius: 999, background: "#111827", color: COLORS.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button>
      </div>
    );
  }''',
'''  if (failure) {
    return failure.kind === "developer"
      ? <RailDevError />
      : <RailMascotBusy rail="birthday" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "birthday" }); }} />;
  }''')

# Summer Intent
p = "app/components/SummerIntentRails.js"
replace_once(p, 'import SummerPicksRails from "./SummerPicksRails";', 'import SummerPicksRails from "./SummerPicksRails";\nimport { RailDevError, RailMascotBusy } from "./kit.js";')
replace_once(p, 'import { fetchJsonWithDeadline } from "../../lib/clientJson.js";', HELER if False else HELPER_IMPORT)
replace_once(p, '  const [failed, setFailed] = useState(false);', '  const [failure, setFailure] = useState(null);')
replace_between(p, r'''  useEffect(() => {
    const requestKey = `${key}|${retry}`;''', '  }, [key, retry]);', '''  useEffect(() => {
    const requestKey = key + "|" + retry;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setRails(null);
    setFailure(null);
    let cancelled = false;
    const controller = new AbortController();
    const [queryLat, queryLng] = key.split("|");
    const location = { lat: queryLat, lng: queryLng };
    const tourQ = new URLSearchParams({ ...location, mi: "120", cat: "all", limit: "100", page: "0" });
    Promise.allSettled([
      fetchRailJson("/api/summer/places?" + new URLSearchParams(location).toString(), { timeoutMs: SUMMER_LOAD_TIMEOUT_MS, signal: controller.signal }),
      fetchRailJson("/api/experiences?" + tourQ.toString(), { timeoutMs: SUMMER_LOAD_TIMEOUT_MS, signal: controller.signal }),
    ]).then(([placeResult, tourResult]) => {
      if (cancelled) return;
      const placePayload = placeResult.status === "fulfilled" ? placeResult.value : null;
      const tourPayload = tourResult.status === "fulfilled" ? tourResult.value : null;
      const problems = [];
      if (placeResult.status === "rejected" && !isRailCancelled(placeResult.reason)) problems.push(placeResult.reason);
      if (tourResult.status === "rejected" && !isRailCancelled(tourResult.reason)) problems.push(tourResult.reason);
      if (placeResult.status === "fulfilled" && !Array.isArray(placePayload?.places)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/summer/places" }));
      if (tourResult.status === "fulfilled" && !Array.isArray(tourPayload?.items)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/experiences" }));
      for (const problem of problems) if (problem?.kind === "developer") console.error("[SummerIntentRails] request contract failure", problem);
      const places = (Array.isArray(placePayload?.places) ? placePayload.places : []).filter(photoSrc);
      const tours = homeAffiliateActivities(Array.isArray(tourPayload?.items) ? tourPayload.items : [], 100);
      const composed = composeSummerPickRails(places, tours);
      if (composed.some((rail) => rail.cards.length)) {
        setRails(composed);
        try { onTrack?.("summer_intent_collection_open", { city, rails: composed.length, cards: composed.reduce((sum, rail) => sum + rail.cards.length, 0) }); } catch {}
        return;
      }
      if (!problems.length) { setRails([]); return; }
      setFailure(problems.find((problem) => problem?.kind === "developer") || problems[0]);
    }).catch((error) => {
      if (cancelled || isRailCancelled(error)) return;
      console.error("[SummerIntentRails] aggregation failure", error);
      setFailure(railDeveloperFailure("aggregation_failure", { route: "/summer", cause: error }));
    });
    return () => { cancelled = true; controller.abort(); asked.current = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);''')
replace_once(p,
'''  if (!rails && !failed) return <div role="status" aria-busy="true" aria-label="Ranking summer picks">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12 }} />)}</div>;
  if (failed) return <div><p style={{ color: "#A8B0BE", fontSize: 13 }}>We could not reach Wayfind&apos;s photo-verified summer inventory. That is a service miss, not an empty town.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #F97316", borderRadius: 999, background: "#111827", color: "#F8FAFC", padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;''',
'''  if (!rails && !failure) return <div role="status" aria-busy="true" aria-label="Ranking summer picks">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12 }} />)}</div>;
  if (failure) return failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="summer" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "summer" }); }} />;''')

# Standalone Summer Picks
p = "app/summer-picks/client.js"
replace_once(p, 'import SummerPicksRails from "../components/SummerPicksRails";', 'import SummerPicksRails from "../components/SummerPicksRails";\nimport { RailDevError, RailMascotBusy } from "../components/kit.js";')
replace_once(p, 'import { fetchJsonWithDeadline } from "../../lib/clientJson.js";', 'import { emitRailDegraded, fetchRailJson, isRailCancelled, railDeveloperFailure } from "../../lib/railFailure.js";')
replace_once(p, '  const [failed, setFailed] = useState(false);', '  const [failure, setFailure] = useState(null);')
replace_between(p, '''  useEffect(() => {
    if (!key || !center) return;''', '  }, [key]);', '''  useEffect(() => {
    if (!key || !center) return;
    let cancelled = false;
    const controller = new AbortController();
    setFailure(null);
    setRails(null);
    const location = { lat: center.lat.toFixed(2), lng: center.lng.toFixed(2) };
    const summerQ = new URLSearchParams(location);
    const tourQ = new URLSearchParams({ ...location, mi: "120", cat: "all", limit: "100", page: "0" });
    Promise.allSettled([
      fetchRailJson("/api/summer/places?" + summerQ.toString(), { timeoutMs: LOAD_TIMEOUT_MS, signal: controller.signal }),
      fetchRailJson("/api/experiences?" + tourQ.toString(), { timeoutMs: LOAD_TIMEOUT_MS, signal: controller.signal }),
    ]).then((results) => {
      if (cancelled) return;
      const summer = results[0].status === "fulfilled" ? results[0].value : null;
      const experiences = results[1].status === "fulfilled" ? results[1].value : null;
      const problems = [];
      if (results[0].status === "rejected" && !isRailCancelled(results[0].reason)) problems.push(results[0].reason);
      if (results[1].status === "rejected" && !isRailCancelled(results[1].reason)) problems.push(results[1].reason);
      if (results[0].status === "fulfilled" && !Array.isArray(summer?.places)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/summer/places" }));
      if (results[1].status === "fulfilled" && !Array.isArray(experiences?.items)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/experiences" }));
      for (const problem of problems) if (problem?.kind === "developer") console.error("[SummerPicksClient] request contract failure", problem);
      const placeMap = new Map();
      for (const place of Array.isArray(summer?.places) ? summer.places : []) placeMap.set(place.id, place);
      const tours = homeAffiliateActivities(Array.isArray(experiences?.items) ? experiences.items : [], 100);
      const composed = composeSummerPickRails([...placeMap.values()], tours);
      if (composed.some((rail) => rail.cards.length > 0)) { setRails(composed); return; }
      if (!problems.length) { setRails([]); return; }
      setFailure(problems.find((problem) => problem?.kind === "developer") || problems[0]);
    }).catch((error) => {
      if (cancelled || isRailCancelled(error)) return;
      console.error("[SummerPicksClient] aggregation failure", error);
      setFailure(railDeveloperFailure("aggregation_failure", { route: "/summer-picks", cause: error }));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [key]);''')
replace_once(p,
'''    {center && !rails && !failed ? <div role="status" aria-busy="true" aria-label="Ranking Florida summer picks">{[0, 1, 2].map((n) => <div key={n} className="wf-sk" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />)}</div> : null}
    {failed ? <div style={{ color: "#A8B0BE" }}><p>Wayfind could not reach enough photo-verified summer inventory. This is a loading failure, not an empty Florida.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #F97316", borderRadius: 999, background: "#111827", color: "#F8FAFC", padding: "9px 14px", fontWeight: 800 }}>Try again</button></div> : null}
    {rails ? <SummerPicksRails rails={rails} city={headingCity} /> : null}''',
'''    {center && !rails && !failure ? <div role="status" aria-busy="true" aria-label="Ranking Florida summer picks">{[0, 1, 2].map((n) => <div key={n} className="wf-sk" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />)}</div> : null}
    {failure ? (failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="summer-picks" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "summer-picks" }); }} />) : null}
    {Array.isArray(rails) && rails.length === 0 ? <div style={{ color: "#A8B0BE" }}>No summer picks are available yet for this area. Try another location or come back soon.</div> : null}
    {Array.isArray(rails) && rails.length > 0 ? <SummerPicksRails rails={rails} city={headingCity} /> : null}''')

# Source-shape guards follow the stronger helper by name. Their invariant — a
# bounded dedicated endpoint — is unchanged.
for path in [
    "scripts/check-augtober-rail.mjs",
    "scripts/check-intent-rail-inventory-fed.mjs",
    "scripts/fall-intent-rails-regression-core.mjs",
]:
    replace_all(path, "fetchJsonWithDeadline", "fetchRailJson")

# Existing component harness gets the new helper and UI stubs while Date Night
# deliberately keeps testing the generic clientJson helper.
p = "scripts/test-poster-recovery.mjs"
replace_once(p,
"    '../../lib/clientJson.js':{fetchJsonWithDeadline:(_url,opts)=>new Promise((resolve,reject)=>pending.push({resolve,reject,opts}))},",
"""    '../../lib/clientJson.js':{fetchJsonWithDeadline:(_url,opts)=>new Promise((resolve,reject)=>pending.push({resolve,reject,opts}))},
    '../../lib/railFailure.js':{
      fetchRailJson:(_url,opts)=>new Promise((resolve,reject)=>pending.push({resolve,reject,opts})),
      railDeveloperFailure:(reason,meta={})=>Object.assign(new Error(reason),{kind:'developer',reason,requestId:'fixture-dev',route:meta.route||'/fixture',retryAttempts:0}),
      isRailCancelled:error=>error?.kind==='cancelled', emitRailDegraded:()=>true,
    },
    './kit':{directionsUrl:()=>null,RailDevError:()=>react.createElement('p',null,'This rail isn’t available right now.'),RailMascotBusy:()=>react.createElement('p',null,'Wayfind hit a snag Try again')},
    './kit.js':{directionsUrl:()=>null,RailDevError:()=>react.createElement('p',null,'This rail isn’t available right now.'),RailMascotBusy:()=>react.createElement('p',null,'Wayfind hit a snag Try again')},""")
replace_once(p,
"ok(n.pending.length === 1 && n.pending[0].opts.retries === 1, 'Night Out opts into bounded read recovery');",
"ok(n.pending.length === 1 && n.pending[0].opts.signal instanceof AbortSignal, 'Night Out uses cancellable bounded rail recovery');")
replace_once(p,
"ok(JSON.stringify(n.render(other)).includes('Try again'), 'malformed Night Out success reaches a recoverable error instead of eternal loading');",
"ok(JSON.stringify(n.render(other)).includes('isn’t available'), 'malformed Night Out success is a developer state, not a mascot or eternal loading');")
replace_once(p,
"summerDown.pending[0].reject(new Error('db down'));",
"summerDown.pending[0].reject(Object.assign(new Error('db down'),{kind:'degraded',reason:'network',requestId:'fixture-down',route:'/api/summer/places',retryAttempts:1}));")

# Register the new behavioural guard beside the existing poster-recovery guard.
p = "scripts/guards.txt"
replace_once(p, "node scripts/test-poster-recovery.mjs\n", "node scripts/test-poster-recovery.mjs\nnode scripts/test-rail-failure.mjs\n")

print("apply-graceful-outage-state.py: transformations complete")
