import { shareCardResponse, SHARE_CACHE } from "./card.jsx";
import { shareCardFor, wcRotation } from "../../../lib/shareCards";
import {
  placeModel, listModel, weatherModel, couponModel, experienceModel, defaultModel, inviteModel,
} from "../../../lib/shareCardCopy.js";
import { decodeInvite, curiousLine, curiousFoot } from "../../../lib/dateInvite.js";

export const runtime = "edge";

// The 1200x630 share card for every link that is not an intent page, a beach
// ranking or a generated snapshot. It used to hold five hand-drawn layouts and
// a base64 photograph; it now resolves PARAMS -> MODEL and hands the model to
// the one renderer in ./card.jsx.
//
// THE PHOTOGRAPH IS GONE, and it is worth recording where it was hiding. Owner:
// "I HATE the text message design, delete every image we have used for text
// share." Deleting the files under public/ was necessary and not sufficient —
// the sunset-palm street scene that appeared on EVERY card was a base64 JPEG
// pasted into lib/ogbg.js, so it survived the file deletion untouched and kept
// rendering. That file is deleted with this commit.
//
// Kinds: coupon | place | weather | list (default). ?card= names an experience
// card, ?v=2 is the old picks layout and now resolves to the same card, and
// ?rot= still rotates the World Cup copy.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const get = (k, max) => {
    const v = searchParams.get(k);
    return v == null ? "" : String(v).slice(0, max || 120);
  };
  try {
    const kind = get("kind", 12) || "list";

    if (kind === "coupon") {
      return shareCardResponse(couponModel({
        pay: get("pay", 8), get: get("get", 8), pct: get("pct", 5),
        biz: get("biz", 48), what: get("what", 36),
        exp: get("exp", 10).replace(/[^0-9-]/g, ""), area: get("loc", 30),
      }));
    }

    // AN INVITATION. Everything it is allowed to say comes from lib/dateInvite.js
    // so the card, the page title and the /ask page cannot drift into revealing
    // different amounts.
    if (kind === "invite") {
      const inv = decodeInvite(searchParams.get("d"));
      const line = curiousLine(inv);
      return shareCardResponse(inviteModel(inv, {
        head: line.head, accent: line.accent, foot: curiousFoot(inv),
      }));
    }

    if (kind === "place") {
      return shareCardResponse(placeModel({
        name: get("t", 80), city: get("loc", 40), mi: get("mi", 6),
        sc: get("sc", 5), r: get("r", 4), rev: get("rev", 9).replace(/[^0-9]/g, ""),
        cat: get("cat", 30), hook: get("hk", 110),
      }));
    }

    if (kind === "weather") {
      return shareCardResponse(weatherModel({
        temp: get("temp", 4).replace(/[^0-9-]/g, ""), cond: get("cond", 30),
        loc: get("loc", 40), take: get("take", 110),
      }));
    }

    // An experience card (?card=datenight, ?card=worldcup, …). The World Cup
    // entry still rotates its copy; what it no longer gets is a bespoke
    // in-route illustration nobody could maintain.
    const cardKey = get("card", 24);
    const card = shareCardFor(cardKey);
    if (card) {
      const rot = card.custom === "worldcup" ? wcRotation(get("rot", 3)) : null;
      const c = rot ? { ...card, shareLine: rot.title, cta: rot.cta } : card;
      return shareCardResponse(experienceModel(c, { loc: get("loc", 32) }));
    }

    // Everything else is a titled list or page. ?v=2 used to select a second
    // layout with three pick cards and a blurred photo panel; those picks were
    // 27px type inside an image most people see 258pt wide, so they are not
    // carried over. The title, the count and the CTA are.
    const title = get("t", 120);
    if (!title) return shareCardResponse(defaultModel());
    return shareCardResponse(listModel({
      title, loc: get("loc", 60), n: get("n", 3).replace(/[^0-9]/g, ""),
      cta: get("cta", 22), foot: get("sub", 70),
    }));
  } catch (e) {
    // Never blank. A share that renders nothing is worse than a plain one, and
    // this branch is also why the cache header is set explicitly: a fallback
    // must not be pinned as if it were the real card.
    return shareCardResponse(defaultModel(), { cache: SHARE_CACHE.live });
  }
}
