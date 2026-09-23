"use client";
// app/components/NativeOfflineOverlay.js — mounted once in app/layout.js,
// right next to NativeShellInit. A no-op on the regular website: every
// branch below is gated on isNative() (lib/native.js), same pattern as the
// rest of the native shell.
//
// 2026-09-23 launch hardening. This covers the case www/offline.html cannot:
// the app already loaded once and the connection drops LATER, mid-session
// (a subway, a dead elevator). Capacitor's server.errorPath only fires on a
// failed navigation, and a remote-URL SPA rarely re-navigates once it has
// loaded — so a mid-session drop would otherwise just leave every button a
// silent dead tap with no explanation.
//
// Kept deliberately tiny: this file's only jobs are (1) know whether the
// device is offline right now, (2) remember the last path so a reconnect can
// return the user to it, and (3) decide WHETHER to render the heavy overlay.
// The overlay's markup, animation and probe/retry logic live in
// ./native/OfflineOverlay.js, loaded through next/dynamic so none of it ships
// in the main bundle for a visitor who is never offline.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { isNative } from "../../lib/native";

const OfflineOverlay = dynamic(() => import("./native/OfflineOverlay"), { ssr: false });

const LAST_PATH_KEY = "wf_last_path";

// Only a same-origin absolute path is ever accepted from storage — never a
// scheme, never a protocol-relative "//host" that would leave the app.
function validResumePath(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length >= 2048) return false;
  if (raw.charAt(0) !== "/" || raw.charAt(1) === "/") return false;
  return true;
}

export default function NativeOfflineOverlay() {
  const pathname = usePathname();
  const router = useRouter();
  const [offline, setOffline] = useState(false);

  // www/offline.html runs on capacitor://localhost; the app runs on
  // https://www.gowayfind.com. Different origins mean the sessionStorage
  // write above is invisible from offline.html, so the handoff crosses the
  // origin boundary through the URL instead: offline.html navigates here
  // with ?wf_resume=1, and THIS component (same origin as the write) reads
  // its own wf_last_path and finishes the trip with router.replace().
  useEffect(() => {
    if (!isNative()) return;
    if (typeof window === "undefined" || !window.location) return;
    const search = window.location.search || "";
    if (!/(?:^|[?&])wf_resume=1(?:&|$)/.test(search)) return;

    let target = null;
    try {
      const raw = sessionStorage.getItem(LAST_PATH_KEY);
      if (validResumePath(raw)) target = raw;
    } catch (e) {}

    if (!target) {
      // No usable saved path — stay put, just drop wf_resume so it cannot
      // re-trigger this effect or leak into a shared link.
      const params = new URLSearchParams(search);
      params.delete("wf_resume");
      const qs = params.toString();
      target = (pathname || "/") + (qs ? "?" + qs : "");
    }
    try { router.replace(target); } catch (e) {}
    // Runs once, on mount, against the URL the app was launched with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record where the user was, on every route change, so a reconnect (here
  // or on www/offline.html after a harder failure) can return them to it
  // instead of dumping them on the homepage.
  useEffect(() => {
    if (!isNative()) return;
    try {
      const search = typeof window !== "undefined" && window.location ? window.location.search : "";
      // Never record the resume hop itself: it would overwrite the very path
      // the resume effect above is about to read (effects run in order, and
      // this one used to run first; Playwright caught the resume landing on
      // /?wf_resume=1 instead of the saved page, 2026-09-23).
      if (/(?:^|[?&])wf_resume=1(?:&|$)/.test(search || "")) return;
      sessionStorage.setItem(LAST_PATH_KEY, (pathname || "/") + (search || ""));
    } catch (e) {}
  }, [pathname]);

  useEffect(() => {
    if (!isNative()) return;
    // WARM THE CHUNK WHILE ONLINE. The overlay is lazy (bundle budget), but a
    // lazy chunk requested only AFTER the connection drops can never download,
    // so the overlay would silently never appear. Proven 2026-09-23 in a
    // Playwright offline run: the first version showed nothing. Importing the
    // same module path here puts it in the module cache, so next/dynamic
    // below resolves it with no network. Native only, after first paint.
    const warm = setTimeout(() => { import("./native/OfflineOverlay").catch(() => {}); }, 1500);
    try {
      if (navigator && navigator.onLine === false) setOffline(true);
    } catch (e) {}
    const goOffline = () => setOffline(true);
    // 'online' is intentionally NOT what hides the overlay here — a browser
    // can report 'online' while still on captive-portal wifi with no real
    // route out. The overlay itself probes before it will hide; this shim
    // only ever flips offline TRUE, on the one signal that is never a false
    // positive.
    window.addEventListener("offline", goOffline);
    return () => { clearTimeout(warm); window.removeEventListener("offline", goOffline); };
  }, []);

  if (!offline) return null;
  return <OfflineOverlay onRecovered={() => setOffline(false)} />;
}
