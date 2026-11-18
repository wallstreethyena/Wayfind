"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPortrait } from "../../lib/portraitPhoto.js";

// Shows the WHOLE photo when it is portrait: the photo sits object-fit: contain,
// centered, over a blurred, darkened copy of itself that fills the box. The box
// never changes size (no layout shift). Landscape photos render exactly as the
// caller styled them (cover). The caller's style/className/handlers go to the
// real <img>; the backdrop is decoration (alt="", aria-hidden).
export default function PortraitAwareImg({ imgRef, style, onLoad, ...rest }) {
  const inner = useRef(null);
  const [portrait, setPortrait] = useState(false);
  const setRef = useCallback((el) => {
    inner.current = el;
    if (typeof imgRef === "function") imgRef(el);
    else if (imgRef) imgRef.current = el;
  }, [imgRef]);
  const measure = (el) => setPortrait(!!el && el.complete && isPortrait(el.naturalWidth, el.naturalHeight));
  // Covers a server-rendered image that finished before hydration, and src swaps.
  useEffect(() => { measure(inner.current); }, [rest.src]);
  const backdrop = portrait ? (
    <img src={rest.src} alt="" aria-hidden="true" draggable={false} data-portrait-backdrop=""
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "blur(18px) brightness(.55)", transform: "scale(1.15)", pointerEvents: "none", opacity: style?.opacity, transition: style?.transition }} />
  ) : null;
  return (
    <>
      {backdrop}
      <img {...rest} ref={setRef} onLoad={(e) => { measure(e.currentTarget); if (onLoad) onLoad(e); }}
        style={portrait ? { ...style, position: "relative", objectFit: "contain", objectPosition: "center" } : style} />
    </>
  );
}
