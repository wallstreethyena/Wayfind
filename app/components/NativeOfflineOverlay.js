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
import { usePathname } from "next/navigation";
import { isNative } from "../../lib/native";

const OfflineOverlay = dynamic(() => import("./native/OfflineOverlay"), { ssr: false });

const LAST_PATH_KEY = "wf_last_path";

export default function NativeOfflineOverlay() {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);

  // Record where the user was, on every route change, so a reconnect (here
  // or on www/offline.html after a harder failure) can return them to it
  // instead of dumping them on the homepage.
  useEffect(() => {
    if (!isNative()) return;
    try {
      const search = typeof window !== "undefined" && window.location ? window.location.search : "";
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
