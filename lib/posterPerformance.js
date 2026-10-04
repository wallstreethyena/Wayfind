// One stopwatch for every in-page poster, including local and networked lists.
// Measures a real card intersecting the viewport, not HTTP 200 or a skeleton.
export function observePosterPerformance(root, { startedAt, report, timeoutMs = 30000 } = {}) {
  if (!root || typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return () => {};
  const now = () => performance.now();
  const start = Number.isFinite(startedAt) ? startedAt : now();
  let stopped = false, firstCard = false, frame = null;
  const seen = new WeakSet();
  const emit = (outcome, extra = {}) => {
    try { report?.({ outcome, elapsed_ms: Math.max(0, Math.round(now() - start)), ...extra }); } catch {}
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    mutations.disconnect();
    if (frame != null) cancelAnimationFrame(frame);
  };
  const observer = new IntersectionObserver((entries) => {
    if (stopped || firstCard || !entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0)) return;
    if (frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (stopped || document.visibilityState === "hidden" || root.getAttribute("aria-hidden") === "true") return;
      firstCard = true;
      emit("first_card_visible");
      stop();
    });
  }, { threshold: 0.01 });
  const scan = () => {
    root.querySelectorAll(".wf-place-card, .wf8-gcard").forEach((card) => {
      if (seen.has(card)) return;
      seen.add(card);
      observer.observe(card);
    });
  };
  const mutations = new MutationObserver(scan);
  mutations.observe(root, { childList: true, subtree: true });
  const timer = setTimeout(() => { if (!stopped) { emit("no_card_observed"); stop(); } }, timeoutMs);
  scan();
  return () => { if (!stopped) emit("abandoned"); stop(); };
}
