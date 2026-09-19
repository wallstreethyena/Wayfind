"use client";
import Image from "next/image";
import { useState } from "react";

export default function LicensedPhoto({ src, alt, width, height, sizes, className, style, priority = false }) {
  const [failedSource, setFailedSource] = useState(null);
  if (failedSource === src) return <div className={className} role="img" aria-label={alt} style={{ ...style, background: "#17353b", display: "grid", placeItems: "center", padding: 16 }}>Photo unavailable</div>;
  return <Image src={src} alt={alt} width={width} height={height} sizes={sizes} className={className} style={style} priority={priority} quality={85} onError={() => setFailedSource(src)} />;
}
