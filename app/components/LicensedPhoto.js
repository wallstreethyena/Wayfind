"use client";
import Image from "next/image";
import { useState } from "react";
import PhotoFallbackTile from "./PhotoFallbackTile.js";

export default function LicensedPhoto({ src, alt, width, height, sizes, className, style, priority = false }) {
  const [failedSource, setFailedSource] = useState(null);
  if (!src || failedSource === src) return <PhotoFallbackTile name={alt} className={className} style={style} />;
  return <Image src={src} alt={alt} width={width} height={height} sizes={sizes} className={className} style={style} priority={priority} quality={85} onError={() => setFailedSource(src)} />;
}
