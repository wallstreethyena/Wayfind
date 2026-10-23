// Image-load recovery for CardPhoto. This module is loaded only after an
// <img> error, so the homepage route does not ship the retry ladder up front.
// The rendered photo guards eval CardPhoto as a classic script and inject this
// module as window.__cardPhotoRecovery; production uses the dynamic import.
import { forgetPlacePhoto, getPlacePhoto } from "../../lib/photoAnswers.js";

// The JSON answer can be fine while the image load fails: the saved-photo
// route answers 404 for a storage blip, and for a photo re-saved under a new
// version while this tab was open. Re-ask with nospend=1 (already saved or
// cached only, never a purchase), at most twice, showing the loading tile
// meanwhile. Never a loop.
export const IMAGE_RECOVERY_DELAYS_MS = [1500, 5000];

const placeOf = (request) => { try { return new URL(request, "https://www.gowayfind.com").searchParams.get("place"); } catch { return null; } };
const withRetryMark = (src, n) => typeof src === "string" && src.startsWith("/") && !src.startsWith("//") ? src + (src.includes("?") ? "&" : "?") + "retry=" + n : src;

export function recoverCardImage({ request, photo, inLink, recovery, setAnswer, setFailed }) {
  const r = recovery.current.request === request ? recovery.current : { request, tries: 0, timer: null };
  const id = placeOf(request);
  if (!id || r.tries >= IMAGE_RECOVERY_DELAYS_MS.length) { setFailed(request); return; }
  const tries = r.tries + 1, failedSrc = photo?.src;
  setAnswer({ request, photo: null });
  recovery.current = { request, tries, timer: setTimeout(() => {
    forgetPlacePhoto(id);
    getPlacePhoto(id, { surface: "card", nospend: true }).then((next) => {
      if (recovery.current.request !== request) return;
      const usable = next && !(inLink && next.source === "google" && !next.src?.startsWith("/api/photo/stored/")) ? next : null;
      if (!usable) { setFailed(request); return; }
      const base = (s) => String(s || "").split(/[?&]retry=/)[0];
      const retried = base(usable.src) === base(failedSrc) ? { ...usable, src: withRetryMark(base(usable.src), tries) } : usable;
      setFailed(null);
      setAnswer({ request, photo: retried });
    });
  }, IMAGE_RECOVERY_DELAYS_MS[tries - 1]) };
}
