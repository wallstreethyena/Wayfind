// Accessible fallback UI for lib/shareOut.js, loaded only when Web Share is unavailable.

const CHOOSER_ID = "wf-share-out-chooser";
let activeChooserClose = null;

function legacyCopy(url) {
  let ta = null;
  try {
    ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    return document.execCommand("copy") === true;
  } catch (e) { return false; }
  finally {
    try { if (ta && ta.parentNode) ta.parentNode.removeChild(ta); } catch (e) {}
  }
}

function copyLink(url, onCopied) {
  const done = () => {
    try { if (onCopied) onCopied(); } catch (e) {}
    return true;
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(
        done,
        () => legacyCopy(url) ? done() : false,
      );
    }
  } catch (e) {}
  return Promise.resolve(legacyCopy(url) ? done() : false);
}

export function shareMessage(payload) {
  const p = payload || {};
  const text = String(p.text || "").trim();
  const url = String(p.url || "").trim();
  return text && url && !text.includes(url) ? text + " " + url : (text || url);
}

/**
 * Give browsers without Web Share a real choice instead of doing a clipboard
 * write the user did not ask for. This is plain DOM so every shareOut caller —
 * React or otherwise — gets the same fallback.
 */
export function openShareChooser(payload, onCopied) {
  if (typeof document === "undefined" || !document.body) return false;
  const p = payload || {};
  const url = String(p.url || "");
  if (!url) return false;
  try {
    if (activeChooserClose) activeChooserClose();
    const old = document.getElementById(CHOOSER_ID);
    if (old) old.remove();
    const returnFocus = document.activeElement;
    const wrap = document.createElement("div");
    wrap.id = CHOOSER_ID;
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", CHOOSER_ID + "-title");
    wrap.setAttribute("style", "position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;justify-content:center;padding:0");

    const scrim = document.createElement("button");
    scrim.type = "button";
    scrim.setAttribute("aria-label", "Close share options");
    scrim.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;border:0;background:rgba(3,6,10,.66);cursor:default");
    const card = document.createElement("div");
    card.setAttribute("style", "position:relative;width:100%;max-width:520px;background:#0D1218;border:1px solid #30363D;border-bottom:0;border-radius:16px 16px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -18px 48px rgba(0,0,0,.55)");
    const heading = document.createElement("h2");
    heading.id = CHOOSER_ID + "-title";
    heading.textContent = p.title ? "Share " + String(p.title) : "Share this";
    heading.setAttribute("style", "margin:0 0 4px;color:#F8F5EE;font-size:18px;line-height:1.25");
    card.appendChild(heading);
    const help = document.createElement("p");
    help.textContent = "Choose how you want to send it.";
    help.setAttribute("style", "margin:0 0 15px;color:#AAB4C2;font-size:14px");
    card.appendChild(help);

    const choiceStyle = "display:block;width:100%;box-sizing:border-box;margin:0 0 9px;padding:13px 15px;border-radius:12px;border:1px solid #30363D;background:rgba(255,255,255,.045);color:#F8F5EE;text-align:left;text-decoration:none;font:inherit;font-size:15px;font-weight:800;cursor:pointer";
    const message = shareMessage(p);
    const addLink = (label, href) => {
      const a = document.createElement("a");
      a.textContent = label;
      a.href = href;
      a.setAttribute("style", choiceStyle);
      a.addEventListener("click", close);
      card.appendChild(a);
      return a;
    };
    const close = () => {
      document.removeEventListener("keydown", onKey);
      try { wrap.remove(); } catch (e) {}
      if (activeChooserClose === close) activeChooserClose = null;
      try {
        if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus({ preventScroll: true });
      } catch (e) {}
    };
    const focusables = () => Array.from(card.querySelectorAll("a[href],button:not([disabled])"));
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    addLink("Text message", "sms:?&body=" + encodeURIComponent(message));
    addLink("Email", "mailto:?subject=" + encodeURIComponent(String(p.title || "Shared from Wayfind")) + "&body=" + encodeURIComponent(message));
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy link";
    copy.setAttribute("style", choiceStyle);
    const copyStatus = document.createElement("p");
    copyStatus.setAttribute("role", "status");
    copyStatus.setAttribute("aria-live", "polite");
    copyStatus.setAttribute("style", "min-height:20px;margin:0 0 4px;color:#FCA5A5;font-size:13px;line-height:1.45");
    copy.addEventListener("click", (event) => {
      event.preventDefault();
      copy.disabled = true;
      copy.textContent = "Copying…";
      copyStatus.textContent = "";
      copyLink(url, onCopied).then((copied) => {
        if (copied) { close(); return; }
        copy.disabled = false;
        copy.textContent = "Copy link";
        copyStatus.textContent = "Couldn’t copy the link. Try Text message or Email.";
      });
    });
    card.appendChild(copy);
    card.appendChild(copyStatus);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.setAttribute("style", "display:block;width:100%;padding:11px;border:0;background:transparent;color:#AAB4C2;font:inherit;font-size:14px;font-weight:700;cursor:pointer");
    cancel.addEventListener("click", close);
    card.appendChild(cancel);
    scrim.addEventListener("click", close);
    wrap.appendChild(scrim);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);
    activeChooserClose = close;
    try { focusables()[0].focus({ preventScroll: true }); } catch (e) {}
    return true;
  } catch (e) { return false; }
}
