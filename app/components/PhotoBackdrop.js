"use client";
// A box whose picture is a photo that may be a Google place photo.
//
// A CSS `background-image: url(/api/photo?...)` is a bare image request, which the
// photo route refuses for a Google-only photo (no credit surface), so the box paints
// empty. A /api/photo place src therefore goes through CardPhoto (the credited JSON
// lane, tile when there is no photo); any other src stays an ordinary CSS background,
// as before. The photo sits BEHIND the box's own content (z-index -1 inside an
// isolated stacking context), so children and pseudo-elements keep their order.
import CardPhoto from "./CardPhoto.js";
import { cardPhotoRequest } from "../../lib/cardPhotoRequest.js";

export default function PhotoBackdrop({ src, className, style, compact = true, children, ...rest }) {
  if (src && cardPhotoRequest(src)) {
    return (
      <div {...rest} className={className} style={{ ...style, position: "relative", overflow: "hidden", isolation: "isolate" }}>
        <CardPhoto src={src} alt="" compact={compact} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }} />
        {children}
      </div>
    );
  }
  return <div {...rest} className={className} style={src ? { ...style, backgroundImage: `url("${src}")` } : style}>{children}</div>;
}
