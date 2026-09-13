"use client";

import { useState } from "react";

function PhotoForSource({
  src,
  alt = "",
  width,
  height,
  sizes,
  loading,
  fetchpriority,
  decoding = "async",
  className,
  fallbackClassName,
  fallbackText = "Explore the guide",
  style,
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={fallbackClassName} data-guide-photo-fallback>
        <span>{fallbackText}</span>
      </div>
    );
  }

  function handleLoad(event) {
    const image = event.currentTarget;
    if (typeof image.decode !== "function") return;
    image.decode().catch(() => {
      // A decode may settle after navigation. Only update the still-mounted,
      // still-current image so an old request cannot blank the next guide.
      if (image.isConnected && image.getAttribute("src") === src) setFailed(true);
    });
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      loading={loading}
      fetchpriority={fetchpriority}
      decoding={decoding}
      style={style}
      onLoad={handleLoad}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A single-attempt editorial image. The source identity keys its error state,
 * so route changes recover cleanly without effects or fallback request loops.
 */
export default function GuidePhoto(props) {
  const identity = `${props.src || "unavailable"}:${props.width || ""}x${props.height || ""}`;
  return <PhotoForSource key={identity} {...props} />;
}
