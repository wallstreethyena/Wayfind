"use client";
import { useSyncExternalStore } from "react";
let stamp = Date.now();
let timer = null;
const listeners = new Set();
const refresh = () => { stamp = Date.now(); for (const listener of listeners) listener(); };
function subscribe(listener) {
  listeners.add(listener);
  if (!timer && typeof window !== 'undefined') {
    timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', refresh); }
  };
}
// One shared clock snapshot keeps a parent's expiry filter and its children in
// the same render, rather than leaving an empty titled rail after midnight.
const emptySubscribe = () => () => {};
const getStamp = () => stamp;
const serverStamp = () => null;
export default function useEventClock(active = true) {
  const value = useSyncExternalStore(active ? subscribe : emptySubscribe, active ? getStamp : serverStamp, serverStamp);
  return value == null ? new Date() : new Date(value);
}
