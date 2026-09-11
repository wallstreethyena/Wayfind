"use client";
import { canReturnToWayfind } from "../../lib/documentPosition";

export default function ReturnToWayfind({ style }) {
  const back = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      if (canReturnToWayfind(window)) {
        event.preventDefault();
        window.history.back();
      }
    } catch {}
  };
  return <a style={style} href="/" onClick={back}>‹ Back to Wayfind</a>;
}
