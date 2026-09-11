// Restore after lazy rails mount, without fighting a reader's next gesture.
export function horizontalPositions(root) {
  return Array.from(root.querySelectorAll('[data-rail], [data-wf-scroll-key]')).map((el) => ({
    key: el.getAttribute('data-rail') || el.getAttribute('data-wf-scroll-key'), left: el.scrollLeft,
  })).filter((p) => p.key && p.left > 0);
}

export function restoreBrowsePosition(root, position, done = () => {}) {
  let stopped = false, frame = 0;
  const interactionTarget = root.ownerDocument || root;
  const stop = (complete = true) => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame); clearTimeout(deadline);
    observer?.disconnect(); resize?.disconnect();
    for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown']) interactionTarget.removeEventListener(event, stop);
    if (complete) done();
  };
  const apply = () => {
    if (stopped) return;
    root.scrollTop = Math.max(0, Number(position.top) || 0);
    for (const p of position.horizontal || []) {
      for (const el of root.querySelectorAll('[data-rail], [data-wf-scroll-key]')) {
        if ((el.getAttribute('data-rail') || el.getAttribute('data-wf-scroll-key')) === p.key) el.scrollLeft = p.left;
      }
    }
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(apply); };
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  observer?.observe(root, { childList: true, subtree: true });
  resize?.observe(root);
  for (const child of root.children) resize?.observe(child);
  for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown']) interactionTarget.addEventListener(event, stop, { passive: true });
  const deadline = setTimeout(stop, 20000);
  frame = requestAnimationFrame(() => { frame = requestAnimationFrame(apply); });
  return () => stop(false);
}
