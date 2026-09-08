"use client";

export default function EventRouteJump({ children }) {
  const jump = (event) => {
    event.preventDefault();
    const target = document.getElementById("event-route");
    if (!target) return;
    target.focus({ preventScroll: true });
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  return <a className="wfw-btn wfw-dir" href="#event-route" onClick={jump}>{children}</a>;
}
