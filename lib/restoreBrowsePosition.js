// Restore after lazy rails mount, without fighting a reader's next gesture.
export function horizontalPositions(root) {
  return Array.from(root.querySelectorAll('[data-rail], [data-wf-scroll-key]')).map((el) => ({
    key: el.getAttribute('data-rail') || el.getAttribute('data-wf-scroll-key'), left: el.scrollLeft,
  })).filter((p) => p.key);
}

const anchorSelector = '[data-wf-position-key], [data-rail], [data-wf-scroll-key], a[href]';
const anchorAttributes = ['data-wf-position-key', 'data-rail', 'data-wf-scroll-key', 'href'];
export function browsePosition(root) {
  const bounds = root.getBoundingClientRect();
  const nodes = Array.from(root.querySelectorAll(anchorSelector));
  const visible = nodes.find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
  });
  let anchor = null;
  if (visible) {
    const attr = anchorAttributes.find((name) => visible.getAttribute(name));
    const key = visible.getAttribute(attr);
    const matches = nodes.filter((el) => el.getAttribute(attr) === key);
    anchor = { attr, key, index: matches.indexOf(visible), offset: visible.getBoundingClientRect().top - bounds.top };
  }
  return { top: root.scrollTop, horizontal: horizontalPositions(root), anchor };
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
    let top = Number(position.top) || 0;
    if (position.anchor) {
      const attr = position.anchor.attr || 'data-rail';
      const nodes = Array.from(root.querySelectorAll(anchorSelector));
      const matches = nodes.filter((el) => el.getAttribute(attr) === position.anchor.key);
      const anchor = matches[position.anchor.index || 0];
      // Wait for the saved content, rather than clamping a loading page to its footer.
      if (anchor && anchor.getBoundingClientRect().height > 0) {
        top = root.scrollTop + anchor.getBoundingClientRect().top - root.getBoundingClientRect().top - position.anchor.offset;
        root.scrollTop = Math.max(0, top);
      }
    } else root.scrollTop = Math.max(0, top);
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
