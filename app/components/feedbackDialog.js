// Feedback uses the same dark surface, orange accents and scrim as Wayfind's
// existing sheets. Native top-layer placement escapes the fixed home header.
export const FEEDBACK_DIALOG_CSS = `
.wf-feedback-dialog{position:fixed;inset:auto 0 calc(var(--wf-feedback-bottom,0px) + max(12px,env(safe-area-inset-bottom)));margin:0 auto;width:min(520px,calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));max-width:100%;max-height:calc(var(--wf-feedback-height,100dvh) - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));box-sizing:border-box;overflow:auto;overscroll-behavior:contain;scroll-padding-block:60px 80px;color:#F1F5F9;font-family:var(--wf-sans,sans-serif);box-shadow:0 -18px 48px rgba(0,0,0,.55)}
.wf-feedback-dialog::backdrop{background:rgba(3,6,10,.62)}
.wf-feedback-dialog .wf-feedback-heading{position:sticky;top:-14px;z-index:1;margin:-14px -14px 10px;padding:8px 14px}
.wf-feedback-dialog .wf-feedback-actions{position:sticky;bottom:-14px;margin:10px -14px -14px;padding:10px 14px;box-shadow:0 -5px 12px rgba(0,0,0,.12)}
.wf-feedback-dialog button:focus-visible{outline:2px solid #F97316;outline-offset:2px}
`;

export function feedbackViewportBounds(viewport, layoutHeight) {
  if (!Number.isFinite(layoutHeight) || layoutHeight <= 0) throw new Error("Invalid layout viewport height");
  const height = Number.isFinite(viewport?.height) && viewport.height > 0 ? Math.min(viewport.height, layoutHeight) : layoutHeight;
  const top = Number.isFinite(viewport?.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
  return { height, bottom: Math.max(0, layoutHeight - height - top) };
}

export function bindFeedbackDialog(dialog, { onClose, opener } = {}) {
  if (!dialog || typeof dialog.showModal !== "function" || typeof onClose !== "function") throw new Error("Feedback dialog cannot be opened");
  const doc = dialog.ownerDocument;
  const win = doc.defaultView;
  const viewport = win.visualViewport;
  const previousFocus = opener || doc.activeElement;
  const roots = [doc.documentElement, doc.body];
  const previousOverflow = roots.map((el) => [el.style.getPropertyValue("overflow"), el.style.getPropertyPriority("overflow")]);
  let frame = null;
  const sync = () => {
    frame = null;
    const { height, bottom } = feedbackViewportBounds(viewport, win.innerHeight);
    dialog.style.setProperty("--wf-feedback-height", `${height}px`);
    dialog.style.setProperty("--wf-feedback-bottom", `${bottom}px`);
  };
  const schedule = () => { if (frame === null) frame = win.requestAnimationFrame(sync); };
  const cancel = (event) => { event.preventDefault(); onClose(); };
  const backdropClick = (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose();
  };
  sync();
  dialog.showModal();
  dialog.querySelector('[data-feedback-close]')?.focus({ preventScroll: true });
  roots.forEach((el) => el.style.setProperty("overflow", "hidden"));
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  win.addEventListener("resize", schedule);
  dialog.addEventListener("cancel", cancel);
  dialog.addEventListener("click", backdropClick);
  return () => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    win.removeEventListener("resize", schedule);
    dialog.removeEventListener("cancel", cancel);
    dialog.removeEventListener("click", backdropClick);
    if (dialog.open) dialog.close();
    roots.forEach((el, i) => {
      const [value, priority] = previousOverflow[i];
      if (value) el.style.setProperty("overflow", value, priority);
      else el.style.removeProperty("overflow");
    });
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
}
