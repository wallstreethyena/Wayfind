"use client";

import { useCallback, useState } from "react";
import GuideFigure from "./GuideFigure.js";

function FigureForSources({ image, fallbackImage, ...props }) {
  const [useFallback, setUseFallback] = useState(false);
  const canRecover = Boolean(fallbackImage?.src && fallbackImage.src !== image?.src);
  const recover = useCallback(() => {
    if (canRecover) setUseFallback(true);
  }, [canRecover]);
  // Photo, alt, caption, photographer and licence change as one React render.
  // A failed venue URL must never leave its credit attached to a stock photo.
  return <GuideFigure {...props} image={useFallback ? fallbackImage : image} onPhotoError={recover} />;
}

export default function GuideFigureWithFallback(props) {
  const identity = `${props.image?.src || ""}:${props.fallbackImage?.src || ""}`;
  return <FigureForSources key={identity} {...props} />;
}
