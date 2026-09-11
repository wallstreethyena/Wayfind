"use client";

export default function ReturnToWayfind({ style }) {
  const back = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      if (document.referrer && new URL(document.referrer).origin === window.location.origin && window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    } catch {}
  };
  return <a style={style} href="/" onClick={back}>‹ Back to Wayfind</a>;
}
