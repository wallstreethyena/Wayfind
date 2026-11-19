// Restore after lazy rails mount, without fighting a reader's next gesture.
const RAIL_Q = '[data-rail], [data-wf-scroll-key]';
const railKey = (el) => el?.getAttribute?.('data-rail') || el?.getAttribute?.('data-wf-scroll-key');
const trackedHorizontalRoots = typeof WeakMap === 'function' ? new WeakMap() : null;
export function trackHorizontalScrolls(root) {
  if (!trackedHorizontalRoots || !root?.addEventListener) return () => {};
  const map = new Map();
  trackedHorizontalRoots.set(root, map);
  const onScroll = ({ target: el }) => {
    const key = el !== root && railKey(el);
    if (key) map.set(key, el.scrollLeft || 0);
  };
  root.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => { root.removeEventListener('scroll', onScroll, true); trackedHorizontalRoots.delete(root); };
}

export function horizontalPositions(root) {
  const tracked = trackedHorizontalRoots?.get(root);
  if (tracked) return Array.from(tracked, ([key, left]) => ({ key, left }));
  return Array.from(root.querySelectorAll(RAIL_Q)).map((el) => ({
    key: railKey(el), left: el.scrollLeft,
  })).filter((p) => p.key);
}

const anchorSelector = '[data-wf-position-key], [data-rail], [data-wf-scroll-key], a[href]';
const anchorAttributes = ['data-wf-position-key', 'data-rail', 'data-wf-scroll-key', 'href'];
export function browsePosition(root) {
  if (Number(root.scrollTop || 0) <= 2) return { top: root.scrollTop, horizontal: horizontalPositions(root), anchor: null };
  const bounds = root.getBoundingClientRect();
  const nodes = root.querySelectorAll(anchorSelector);
  let visible = null, visibleRect = null;
  for (let i = 0; i < nodes.length; i++) {
    const rect = nodes[i].getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom) { visible = nodes[i]; visibleRect = rect; break; }
  }
  let anchor = null;
  if (visible) {
    const attr = anchorAttributes.find((name) => visible.getAttribute(name));
    const key = visible.getAttribute(attr);
    let index = 0;
    for (let i = 0; i < nodes.length && nodes[i] !== visible; i++) if (nodes[i].getAttribute(attr) === key) index += 1;
    anchor = { attr, key, index, offset: visibleRect.top - bounds.top };
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
      const nodes = Array.from(root.querySelectorAll(attr === 'href' ? 'a[href]' : `[${attr}]`));
      const anchor = nodes.filter((el) => el.getAttribute(attr) === position.anchor.key)[position.anchor.index || 0];
      // Wait for the saved content, rather than clamping a loading page to its footer.
      const anchorRect = anchor?.getBoundingClientRect();
      if (anchorRect && anchorRect.height > 0) {
        top = root.scrollTop + anchorRect.top - root.getBoundingClientRect().top - position.anchor.offset;
        root.scrollTop = Math.max(0, top);
      }
    } else root.scrollTop = Math.max(0, top);
    const horizontal = position.horizontal;
    if (horizontal?.length) {
      const tracked = trackedHorizontalRoots?.get(root);
      const railsByKey = new Map();
      for (const el of root.querySelectorAll(RAIL_Q)) {
        const key = railKey(el);
        if (key) (railsByKey.get(key) || (railsByKey.set(key, []), railsByKey.get(key))).push(el);
      }
      for (const p of horizontal) {
        tracked?.set(p.key, p.left);
        const bucket = railsByKey.get(p.key);
        if (bucket) for (const el of bucket) el.scrollLeft = p.left;
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
