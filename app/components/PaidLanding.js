"use client";
// A decision concierge for paid traffic. It turns an undifferentiated list
// into one clear choice, two alternatives, and a lightweight local shortlist.
// Attribution and the existing analytics event names intentionally stay intact.
import { useEffect, useMemo, useState } from "react";
import { track } from "../../lib/track";
import { captureAttribution, decorateHref } from "../../lib/attribution";

const INTENTS = [
  { key: "tonight", label: "Tonight", note: "Open and worth leaving for", icon: "moon" },
  { key: "family", label: "Family day", note: "Easy wins for every age", icon: "sun" },
  { key: "outdoors", label: "Outside", note: "Fresh air, no overplanning", icon: "leaf" },
  { key: "must", label: "Orlando icons", note: "The places that earn the hype", icon: "spark" },
];

const COPY = {
  en: {
    eyebrow: "ORLANDO · CURATED FOR THIS MOMENT",
    title: "Your Orlando plan starts here.",
    intro: "Orlando gives you thousands of options. You only need the right three. Tell us the moment and we’ll find the places worth building your day around.",
    prompt: "Choose your moment",
    action: "Show my 3 best matches",
    skip: "Or explore the full Orlando guide",
    proof: "Independent picks · refreshed daily · nobody pays to rank",
    reveal: "YOUR SHORTLIST",
    matchTitle: "Three places. One easy decision.",
    matchIntro: "No filler. Every match earns its place through rating strength, review depth, distance, and what’s open when you need it.",
    best: "BEST MATCH",
    alternate: "ALTERNATIVE",
    why: "Why it fits",
    details: "See the details",
    add: "Add to my plan",
    added: "In my plan",
    open: "Open full details",
    plan: "Your Orlando plan",
    planEmpty: "Choose a place to keep it close while you compare.",
    planCta: "Continue with my top pick",
    all: "See everything in Orlando",
    trustTitle: "Chosen on merit. Never bought.",
    trustBody: "Wayfind weighs real guest ratings, review depth, proximity, and current availability. Nobody can pay to become your best match.",
  },
  es: {
    eyebrow: "ORLANDO · ELEGIDO PARA ESTE MOMENTO",
    title: "Tu plan en Orlando empieza aquí.",
    intro: "Orlando te ofrece miles de opciones. Solo necesitas las tres correctas. Cuéntanos el momento y encontraremos lugares que merecen ser parte de tu día.",
    prompt: "Elige tu momento",
    action: "Muéstrame mis 3 mejores opciones",
    skip: "O explora la guía completa de Orlando",
    proof: "Selección independiente · actualizada a diario · nadie paga por subir",
    reveal: "TU SELECCIÓN",
    matchTitle: "Tres lugares. Una decisión fácil.",
    matchIntro: "Sin relleno. Cada opción se gana su lugar por sus reseñas, popularidad, distancia y disponibilidad.",
    best: "MEJOR OPCIÓN",
    alternate: "ALTERNATIVA",
    why: "Por qué encaja",
    details: "Ver detalles",
    add: "Añadir a mi plan",
    added: "En mi plan",
    open: "Abrir todos los detalles",
    plan: "Tu plan en Orlando",
    planEmpty: "Elige un lugar para guardarlo mientras comparas.",
    planCta: "Continuar con mi primera opción",
    all: "Ver todo en Orlando",
    trustTitle: "Elegido por mérito. Nunca comprado.",
    trustBody: "Wayfind considera reseñas reales, volumen de opiniones, cercanía y disponibilidad. Nadie puede pagar para ser tu mejor opción.",
  },
};

const PHOTO_FALLBACKS = [
  "/cards/date-night-adobestock-190984224.jpeg",
  "/cards/family-adobestock-794890098.jpeg",
  "/cards/hidden-gems-adobestock-321810820.jpeg",
];

const CURATED_CARD_PHOTOS = {
  "lake eola park": "/brand/card-lake-eola-kayaking.jpg",
  "harry p leu gardens": "/brand/card-harry-p-leu-gardens.jpg",
  "the great escape room orlando": "/brand/card-great-escape-room.jpg",
};

// Venue-specific editorial is deliberately hand-curated from primary sources.
// Unknown places keep the quantitative fallback in whyLine; we never fabricate
// a "fun fact" from a venue name or category.
const CURATED_WHY = {
  // City of Orlando: orlando.gov/.../Lake-Eola-History
  "lake eola park": {
    en: "Orlando’s signature downtown park has welcomed swans since 1922; today, its swan boats circle the fountain that became an official symbol of the city.",
    es: "El parque emblemático del centro de Orlando alberga cisnes desde 1922; hoy sus botes con forma de cisne rodean la fuente que se convirtió en símbolo oficial de la ciudad.",
  },
  // Universal Orlando: universalorlando.com/.../universal-studios-florida
  "universal studios florida": {
    en: "Eight themed lands bring movies and television to life—from Diagon Alley and Minion Land to Springfield and DreamWorks Land.",
    es: "Ocho áreas temáticas dan vida al cine y la televisión, desde Diagon Alley y Minion Land hasta Springfield y DreamWorks Land.",
  },
  // Leu Gardens: leugardens.org/Explore/Gardens-Collections
  "harry p leu gardens": {
    en: "This 50-acre living museum holds 15,500 botanical specimens—including one of the largest recorded camellia collections in the United States.",
    es: "Este museo vivo de 50 acres reúne 15,500 ejemplares botánicos, incluida una de las mayores colecciones registradas de camelias en Estados Unidos.",
  },
  // The Great Escape Room: thegreatescaperoom.com/orlando
  "the great escape room orlando": {
    en: "Its nationally recognized, 60-minute rooms are private to your group—no strangers—so the puzzles become a true team challenge.",
    es: "Sus salas de 60 minutos, reconocidas a nivel nacional, son privadas para tu grupo: sin desconocidos, para que los acertijos sean un verdadero reto en equipo.",
  },
};

const ORLANDO_HERO_IMAGES = [
  { src: "/brand/orlando-epcot-portrait.jpg", alt: "EPCOT beneath a clear blue Orlando sky" },
  { src: "/brand/orlando-roller-coaster-portrait.jpg", alt: "A roller coaster climbing beneath a clear Orlando sky" },
  { src: "/brand/orlando-paddleboard-portrait.jpg", alt: "A paddleboarder exploring a calm Florida spring" },
  { src: "/brand/orlando-night-wheel-portrait.jpg", alt: "An illuminated Orlando observation wheel and amusement park at night" },
];

const css = `
  :root{--wf-ink:#101724;--wf-paper:#f5efe5;--wf-orange:#f36b21;--wf-night:#06101c;--wf-panel:#0d1928;--wf-line:rgba(255,255,255,.13);--wf-muted:#93a1b5}
  *{box-sizing:border-box}
  .paid{min-height:100dvh;background:radial-gradient(circle at 78% 0,rgba(24,72,112,.24),transparent 34%),#050c15;color:#f8f4ed;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  .paid button,.paid a{font:inherit}
  .shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:24px 0 88px}
  .brandbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
  .brandLogo{display:block;width:132px;height:auto}
  .locale{display:flex;align-items:center;gap:8px;color:#a9b6c7;font-size:12px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
  .locale i{display:block;width:5px;height:5px;border-radius:50%;background:var(--wf-orange);box-shadow:0 0 0 5px rgba(243,107,33,.12)}
  .hero{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(370px,.94fr);min-height:620px;border:1px solid rgba(255,255,255,.17);border-radius:30px;overflow:hidden;background:#0c1725;box-shadow:0 38px 100px rgba(0,0,0,.46)}
  .heroCopy{position:relative;z-index:2;padding:64px 64px 50px;background:linear-gradient(145deg,#faf5eb 0%,#f1e8da 100%);color:var(--wf-ink);display:flex;flex-direction:column}
  .eyebrow{font-size:11px;font-weight:850;letter-spacing:.2em;color:#9a4c24;margin-bottom:22px}
  .hero h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(45px,5vw,70px);font-weight:500;line-height:.98;letter-spacing:-.055em;max-width:650px;margin:0 0 22px}
  .lede{font-size:18px;line-height:1.52;color:#566174;max-width:580px;margin:0 0 32px}
  .prompt{font-size:12px;font-weight:850;letter-spacing:.14em;color:#475367;margin-bottom:13px}
  .intents{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(16,23,36,.17)}
  .intent{appearance:none;border:0;border-bottom:1px solid rgba(16,23,36,.17);background:transparent;color:var(--wf-ink);min-height:86px;padding:15px 14px 15px 0;text-align:left;cursor:pointer;display:grid;grid-template-columns:38px 1fr 18px;align-items:center;gap:10px;transition:.2s ease}
  .intent:nth-child(odd){margin-right:18px}.intent:nth-child(even){padding-left:18px}
  .intent:hover{color:#be4b12}.intent.selected{color:#b84610}
  .intentIcon{width:34px;height:34px;border:1px solid rgba(16,23,36,.18);border-radius:50%;display:grid;place-items:center;color:var(--wf-orange);font-size:16px}
  .intent.selected .intentIcon{background:var(--wf-orange);border-color:var(--wf-orange);color:#fff;box-shadow:0 7px 16px rgba(243,107,33,.24)}
  .intent b{display:block;font-size:15px}.intent small{display:block;color:#778092;font-size:11px;margin-top:3px;line-height:1.25}.radio{width:14px;height:14px;border:1px solid #aab0b7;border-radius:50%;position:relative}.selected .radio:after{content:"";position:absolute;inset:3px;background:var(--wf-orange);border-radius:50%}
  .primary{border:0;border-radius:999px;min-height:58px;padding:0 25px;background:var(--wf-orange);color:#121721;font-weight:850;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:14px;box-shadow:0 12px 28px rgba(243,107,33,.24);margin-top:26px;transition:.2s}
  .primary:hover{transform:translateY(-1px);background:#ff7a30;box-shadow:0 16px 34px rgba(243,107,33,.32)}.primary:disabled{background:#d8d4ca;color:#8c908d;box-shadow:none;cursor:default}
  .underCta{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:15px;font-size:11px;color:#727b89;text-align:center}.underCta a{color:#475367;text-underline-offset:3px}
  .visual{position:relative;min-height:620px;background:#10233a;overflow:hidden}
  .visualSlides{position:absolute;inset:0;overflow:hidden;background:#14243a}
  .visualSlide{position:absolute;inset:-1px;margin:0;opacity:0;transform:translateX(5%) scale(1.025);transition:opacity .9s ease,transform 1.1s cubic-bezier(.2,.7,.2,1);pointer-events:none}
  .visualSlide.active{opacity:1;transform:translateX(0) scale(1);z-index:1}
  .visualSlide img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;filter:saturate(.95) contrast(1.03)}
  .visualSlide:first-child img{object-position:52% center}
  .visual:after{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(180deg,rgba(3,10,18,.28),transparent 22%,transparent 78%,rgba(3,10,18,.18));pointer-events:none}
  .visualControls{position:absolute;z-index:3;right:27px;bottom:29px;display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(4,11,19,.44);backdrop-filter:blur(12px)}
  .visualDot{appearance:none;width:6px;height:6px;border:0;border-radius:50%;padding:0;background:rgba(255,255,255,.5);cursor:pointer;transition:width .25s ease,background .25s ease}
  .visualDot.active{width:22px;border-radius:99px;background:#ff7a30}
  .results{padding:90px 0 30px;scroll-margin-top:20px}
  .resultsHead{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;margin-bottom:28px}
  .resultsHead .eyebrow{color:#f99a61;margin-bottom:12px}.results h2{font-family:Georgia,"Times New Roman",serif;font-size:43px;font-weight:500;letter-spacing:-.035em;margin:0}.resultsHead p{max-width:480px;margin:0;color:#98a6b8;line-height:1.55;font-size:14px}
  .matches{display:grid;grid-template-columns:1.35fr .825fr .825fr;gap:15px;align-items:stretch}
  .match{position:relative;min-width:0;background:#0c1725;border:1px solid rgba(255,255,255,.13);border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.23)}
  .match.best{border-color:rgba(243,107,33,.55);box-shadow:0 24px 70px rgba(0,0,0,.36),0 0 0 1px rgba(243,107,33,.10)}
  .photo{height:210px;position:relative;background:linear-gradient(135deg,#18304c,#0d1c2d);overflow:hidden}.best .photo{height:270px}.photo img{width:100%;height:100%;object-fit:cover;display:block;transition:.5s}.match:hover .photo img{transform:scale(1.025)}
  .photo:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 46%,rgba(5,12,21,.9))}
  .rank{position:absolute;z-index:2;left:18px;top:16px;border:1px solid rgba(255,255,255,.45);background:rgba(5,12,21,.7);backdrop-filter:blur(12px);border-radius:999px;padding:7px 11px;font-size:9px;font-weight:900;letter-spacing:.15em}
  .score{position:absolute;z-index:2;right:14px;top:14px;background:#f5efe5;color:#111a28;border-radius:12px;padding:8px 9px;text-align:center;line-height:1}.score b{font-family:Georgia,serif;font-size:20px}.score small{font-size:8px;font-weight:850;display:block;margin-top:4px;letter-spacing:.1em}
  .matchBody{padding:20px;display:flex;flex-direction:column;flex:1}.best .matchBody{padding:24px}
  .category{font-size:9px;font-weight:900;letter-spacing:.16em;color:#ff8a48;text-transform:uppercase}.match h3{font-size:21px;line-height:1.15;letter-spacing:-.03em;margin:8px 0 9px}.best h3{font-family:Georgia,"Times New Roman",serif;font-size:31px;font-weight:500}
  .meta{display:flex;flex-wrap:wrap;gap:7px;color:#9ba9ba;font-size:11px}.meta .open{color:#50d5a5;font-weight:800}.meta .star{color:#f5c65b;font-weight:800}.meta i{font-style:normal;color:#526174}
  .why{border-left:2px solid var(--wf-orange);padding-left:12px;color:#dbe2ea;font-size:13px;line-height:1.48;margin:18px 0}.why b{display:block;color:#75849a;font-size:9px;letter-spacing:.14em;margin-bottom:5px;text-transform:uppercase}
  .actions{margin-top:auto;display:flex;gap:8px}.actions button,.actions a{min-height:44px;border-radius:12px;padding:0 13px;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer;white-space:nowrap}
  .match:not(.best) .actions{display:grid;grid-template-columns:1fr}.match:not(.best) .actions button{width:100%}
  .detailBtn{flex:1;color:#fff;background:#172437;border:1px solid rgba(255,255,255,.16)}.planBtn{color:#ff9b62;background:rgba(243,107,33,.08);border:1px solid rgba(243,107,33,.38)}.planBtn.on{color:#07111e;background:#ff7a30;border-color:#ff7a30}
  .trust{margin-top:72px;padding:31px 34px;border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);display:grid;grid-template-columns:.8fr 1.2fr;gap:70px;align-items:center}.trust h3{font-family:Georgia,serif;font-size:27px;font-weight:500;margin:0}.trust p{margin:0;color:#98a6b8;line-height:1.65;font-size:13px}
  .planDock{position:fixed;z-index:20;left:50%;bottom:18px;transform:translateX(-50%);width:min(760px,calc(100% - 28px));background:rgba(14,25,39,.94);border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 70px rgba(0,0,0,.5);backdrop-filter:blur(18px);border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:13px}
  .planCount{width:39px;height:39px;display:grid;place-items:center;border-radius:12px;background:var(--wf-orange);color:#111722;font-weight:900}.planCopy{min-width:0;flex:1}.planCopy b{display:block;font-size:13px}.planCopy span{display:block;color:#91a0b3;font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.planDock a{min-height:42px;border-radius:11px;padding:0 16px;background:#f5efe5;color:#101724;text-decoration:none;font-size:11px;font-weight:850;display:flex;align-items:center}
  .drawerShade{position:fixed;z-index:30;inset:0;background:rgba(2,7,13,.72);backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px}
  .drawer{width:min(900px,100%);max-height:min(720px,calc(100dvh - 40px));overflow:auto;background:#f5efe5;color:#101724;border-radius:28px;display:grid;grid-template-columns:.82fr 1.18fr;box-shadow:0 35px 120px rgba(0,0,0,.65);position:relative}
  .drawerPhoto{min-height:520px;background:#12233a}.drawerPhoto img{width:100%;height:100%;object-fit:cover;display:block}.drawerCopy{padding:48px;display:flex;flex-direction:column}.close{position:absolute;right:18px;top:18px;border:1px solid rgba(16,23,36,.18);background:rgba(245,239,229,.9);width:42px;height:42px;border-radius:50%;font-size:22px;cursor:pointer}.drawer h2{font-family:Georgia,serif;font-size:42px;line-height:1.02;font-weight:500;letter-spacing:-.04em;margin:14px 0}.drawer .meta{color:#667185}.drawer .why{color:#384456;font-size:15px;margin-top:28px}.drawerActions{display:flex;gap:9px;margin-top:auto;padding-top:28px}.drawerActions a,.drawerActions button{min-height:52px;border-radius:999px;padding:0 20px;text-decoration:none;font-size:13px;font-weight:850;display:flex;align-items:center;justify-content:center}.drawerActions a{background:var(--wf-orange);color:#101724;flex:1}.drawerActions button{border:1px solid rgba(16,23,36,.2);background:transparent;color:#101724}
  @media(max-width:900px){
    .shell{width:min(100% - 24px,680px);padding-top:15px}.brandbar{margin:0 4px 12px}.hero{grid-template-columns:1fr;min-height:0;border-radius:24px}.heroCopy{padding:34px 24px 27px}.hero h1{font-size:46px;max-width:500px}.lede{font-size:15px;margin-bottom:23px}.visual{min-height:280px;order:-1}.matches{grid-template-columns:1fr 1fr}.match.best{grid-column:1/3}.results{padding-top:68px}.resultsHead{align-items:flex-start;flex-direction:column;gap:12px}.trust{grid-template-columns:1fr;gap:12px}.drawer{grid-template-columns:1fr}.drawerPhoto{min-height:230px;height:230px}.drawerCopy{padding:30px 25px}.drawer h2{font-size:34px}
  }
  @media(max-width:560px){
    .shell{width:100%;padding:0 0 86px}.brandbar{padding:14px 18px 11px;margin:0}.brandLogo{width:118px}.hero{border-radius:0;border-left:0;border-right:0;box-shadow:none}.visual{min-height:250px}.visualControls{right:16px;bottom:16px}.heroCopy{padding:27px 20px 24px}.eyebrow{font-size:9px;margin-bottom:15px}.hero h1{font-size:42px}.lede{font-size:14px;line-height:1.45}.intent{grid-template-columns:31px 1fr 14px;min-height:74px;padding-right:4px;gap:7px}.intent:nth-child(odd){margin-right:10px}.intent:nth-child(even){padding-left:10px}.intentIcon{width:29px;height:29px}.intent b{font-size:13px}.intent small{font-size:9px}.primary{min-height:54px;margin-top:21px}.underCta{flex-direction:column;gap:5px}.results{padding:58px 15px 20px}.results h2{font-size:35px}.resultsHead p{font-size:12px}.matches{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 1px 16px;gap:12px}.match,.match.best{min-width:88%;scroll-snap-align:center}.photo,.best .photo{height:225px}.best h3{font-size:27px}.trust{margin:42px 15px 0;padding:25px 4px}.planDock{bottom:10px}.planDock a{padding:0 12px}.drawerShade{align-items:end;padding:0}.drawer{border-radius:24px 24px 0 0;max-height:92dvh}.drawerPhoto{height:210px;min-height:210px}.drawerCopy{padding:25px 21px 30px}.drawerActions{flex-direction:column}.locale{font-size:10px}
  }
  @media(prefers-reduced-motion:reduce){.intent,.primary,.photo img,.visualSlide,.visualDot{transition:none}}
`;

function icon(kind) {
  return kind === "moon" ? "☾" : kind === "sun" ? "☀" : kind === "leaf" ? "⌁" : "✦";
}

function categoryOf(place) {
  const name = String(place?.name || "").toLowerCase();
  const t = Array.isArray(place?.types) ? place.types : [];
  if (/ghost|tour|cruise|boat/.test(name)) return "Tour & experience";
  if (/escape room/.test(name)) return "Escape room";
  if (/garden/.test(name)) return "Gardens";
  if (t.some((x) => /museum|art_gallery/.test(x))) return "Museum";
  if (t.some((x) => /amusement_park|water_park/.test(x))) return "Theme park";
  if (t.some((x) => /zoo|aquarium/.test(x))) return "Zoo & aquarium";
  if (t.some((x) => /park|natural_feature/.test(x))) return "Outdoors";
  if (t.some((x) => /restaurant|cafe|bar/.test(x))) return "Food & drink";
  return "Orlando experience";
}

function fit(place, intent) {
  const haystack = `${place?.name || ""} ${(place?.types || []).join(" ")}`.toLowerCase();
  let n = Number(place?.rating || 0) * 8 + Math.log10(Number(place?.reviews || 0) + 1) * 5;
  if (place?.openNow === true) n += intent === "tonight" ? 28 : 7;
  if (place?.openNow === false) n -= 24;
  if (intent === "family" && /park|zoo|aquarium|garden|museum|theme|attraction/.test(haystack)) n += 18;
  if (intent === "outdoors" && /park|garden|natural|outdoor|lake/.test(haystack)) n += 25;
  if (intent === "tours" && /tour|boat|cruise|ghost/.test(haystack)) n += 30;
  if (intent === "must" && Number(place?.reviews || 0) > 5000) n += 12;
  return n - Math.min(Number(place?.distMi || 0), 20) * .35;
}

function whyLine(place, intent, language = "en") {
  const cat = categoryOf(place);
  const reviews = Number(place?.reviews || 0);
  const distance = Number(place?.distMi || 0);
  const curated = CURATED_WHY[String(place?.name || "").trim().toLowerCase()];
  if (curated) return curated[language] || curated.en;
  if (intent === "tonight" && place?.openNow === true) return `Open now, ${distance.toFixed(1)} miles away, with ${reviews.toLocaleString()} guest reviews behind it.`;
  if (intent === "family" && /park|zoo|aquarium|garden|museum|theme/.test(cat.toLowerCase())) return `${cat} appeal backed by a ${place.rating || "high"}★ rating and ${reviews.toLocaleString()} reviews.`;
  if (intent === "outdoors" && /outdoors|garden/.test(cat.toLowerCase())) return `An outdoor reset just ${distance.toFixed(1)} miles away, validated by ${reviews.toLocaleString()} reviews.`;
  if (intent === "tours" && /tour/.test(cat.toLowerCase())) return `A bookable Orlando experience with ${reviews.toLocaleString()} reviews and a ${place.rating || "high"}★ rating.`;
  if (reviews >= 50000) return `One of Orlando’s most proven crowd favorites — ${place.rating || "highly rated"}★ across ${reviews.toLocaleString()} guest reviews.`;
  if (distance > 0) return `A consistently strong choice: ${place.rating || "highly rated"}★ across ${reviews.toLocaleString()} reviews, just ${distance.toFixed(1)} miles away.`;
  return `${place.rating || "Highly rated"}★ across ${reviews.toLocaleString()} reviews — a place with enough proof to earn your time.`;
}

function Photo({ place, width = 900, eager = false }) {
  const photoKey = String(place?.id || place?.name || "");
  const curatedPhoto = CURATED_CARD_PHOTOS[String(place?.name || "").trim().toLowerCase()];
  const placeCategory = categoryOf(place).toLowerCase();
  const fallback = /outdoors|garden/.test(placeCategory)
    ? "/cards/outdoors.jpg"
    : /theme|zoo|aquarium/.test(placeCategory)
      ? "/cards/family-adobestock-794890098.jpeg"
      : PHOTO_FALLBACKS[[...photoKey].reduce((sum, char) => sum + char.charCodeAt(0), 0) % PHOTO_FALLBACKS.length];
  if (curatedPhoto) return <img src={curatedPhoto} alt="" loading={eager ? "eager" : "lazy"} />;
  return place?.photoRef ? (
    <img src={`/api/photo?ref=${encodeURIComponent(place.photoRef)}&w=${width}`} alt="" loading={eager ? "eager" : "lazy"} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = fallback; }} />
  ) : <img src={fallback} alt="" loading={eager ? "eager" : "lazy"} />;
}

function Meta({ place }) {
  return (
    <div className="meta">
      {place?.rating != null ? <span className="star">{place.rating} ★</span> : null}
      {place?.reviews ? <span>{Number(place.reviews).toLocaleString()} reviews</span> : null}
      {place?.openNow === true ? <><i>·</i><span className="open">Open now</span></> : null}
      {place?.openNow === false ? <><i>·</i><span>Hours vary</span></> : null}
      {place?.distMi != null ? <><i>·</i><span>{Number(place.distMi).toFixed(1)} mi</span></> : null}
    </div>
  );
}

export default function PaidLanding({ city, places }) {
  // Mount-gated attribution is required: decorateHref reads localStorage, so
  // using it on the first client render would mismatch the server.
  const [attr, setAttr] = useState(null);
  const [intent, setIntent] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [language, setLanguage] = useState("en");
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroCycle, setHeroCycle] = useState(0);
  const [active, setActive] = useState(null);
  const [plan, setPlan] = useState([]);
  const list = Array.isArray(places) ? places : [];
  const cityLabel = city?.name || "Orlando";
  const t = COPY[language] || COPY.en;

  useEffect(() => {
    let a = {};
    try { a = captureAttribution(window.location.search) || {}; } catch (e) { a = {}; }
    setAttr(a);
    try {
      const q = new URLSearchParams(window.location.search);
      const requested = q.get("intent");
      if (["tonight", "family", "outdoors", "must", "tours"].includes(requested)) setIntent(requested);
      if (q.get("lang") === "es") setLanguage("es");
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (cityLabel.toLowerCase() !== "orlando") return undefined;
    let reduceMotion = false;
    try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    if (reduceMotion) return undefined;
    const timer = window.setInterval(() => setHeroIndex((current) => (current + 1) % ORLANDO_HERO_IMAGES.length), 5000);
    return () => window.clearInterval(timer);
  }, [cityLabel, heroCycle]);

  const dh = (href) => {
    if (!attr) return href;
    try { return decorateHref(href, attr); } catch (e) { return href; }
  };

  const picks = useMemo(() => {
    const chosen = intent || "must";
    return [...list].sort((a, b) => fit(b, chosen) - fit(a, chosen)).slice(0, 3);
  }, [list, intent]);

  function seedCity() {
    try {
      if (!city || !isFinite(city.lat) || !isFinite(city.lng)) return;
      localStorage.setItem("wf_center", JSON.stringify({ lat: city.lat, lng: city.lng, loc: `${city.name}, ${city.state}` }));
    } catch (e) {}
  }

  function go(event, params) {
    seedCity();
    try { track(event, params); } catch (e) {}
  }

  function choose(key) {
    setIntent(key);
    go("intent_chip", { surface: "paid_landing", kind: key, city: cityLabel });
  }

  function reveal() {
    if (!intent) return;
    setRevealed(true);
    go("cta_open_app", { surface: "paid_landing_shortlist", city: cityLabel, intent });
    window.setTimeout(() => document.getElementById("matches")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  function openDetails(place, position) {
    setActive(place);
    go("detail_open", { place_id: place.id, place_name: place.name, surface: "paid_landing", position, city: cityLabel, category: categoryOf(place), intent: intent || "must" });
  }

  function togglePlan(place) {
    setPlan((current) => current.some((x) => x.id === place.id) ? current.filter((x) => x.id !== place.id) : [...current, place]);
    go("save", { place_id: place.id, place_name: place.name, surface: "paid_landing_plan", city: cityLabel, action: plan.some((x) => x.id === place.id) ? "remove" : "add" });
  }

  const photoReady = list.filter((p) => p?.photoRef);
  const heroPhotos = cityLabel.toLowerCase() === "orlando"
    ? ORLANDO_HERO_IMAGES
    : (photoReady.length >= 3 ? photoReady : list).slice(0, 3);
  const firstPlan = plan[0] || picks[0];

  return (
    <div className="paid">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main className="shell">
        <header className="brandbar">
          <img className="brandLogo" src="/brand/wayfind-official-white.png" alt="Wayfind" />
          <div className="locale"><i />{cityLabel}, {city?.state || "FL"}</div>
        </header>

        <section className="hero" aria-labelledby="paid-title">
          <div className="heroCopy">
            <div className="eyebrow">{t.eyebrow}</div>
            <h1 id="paid-title">{t.title}</h1>
            <p className="lede">{t.intro}</p>
            <div className="prompt">{t.prompt}</div>
            <div className="intents">
              {INTENTS.map((item) => (
                <button className={`intent ${intent === item.key ? "selected" : ""}`} key={item.key} onClick={() => choose(item.key)} aria-pressed={intent === item.key}>
                  <span className="intentIcon" aria-hidden="true">{icon(item.icon)}</span>
                  <span><b>{item.label}</b><small>{item.note}</small></span>
                  <span className="radio" aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="primary" disabled={!intent} onClick={reveal}>{t.action} <span aria-hidden="true">→</span></button>
            <div className="underCta">
              <span>{t.proof}</span>
              <a href={dh("/")} onClick={() => go("cta_open_app", { surface: "paid_landing_skip", city: cityLabel })}>{t.skip}</a>
            </div>
          </div>

          <div className="visual" role="region" aria-label={`${cityLabel} highlights`}>
            <div className="visualSlides" aria-live="off">
              {(heroPhotos.length ? heroPhotos : [{}, {}, {}]).map((place, i) => (
                <figure className={`visualSlide ${i === heroIndex ? "active" : ""}`} key={place?.src || place.id || i} aria-hidden={i !== heroIndex}>
                  {place?.src
                    ? <img src={place.src} alt={place.alt || ""} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} />
                    : <Photo place={place} eager={i === 0} />}
                </figure>
              ))}
            </div>
            {heroPhotos.length > 1 ? (
              <div className="visualControls" aria-label="Choose Orlando highlight">
                {heroPhotos.map((place, i) => (
                  <button className={`visualDot ${i === heroIndex ? "active" : ""}`} key={place?.src || place.id || i} onClick={() => { setHeroIndex(i); setHeroCycle((cycle) => cycle + 1); }} aria-label={`Show image ${i + 1}`} aria-pressed={i === heroIndex} />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {revealed ? (
          <section className="results" id="matches" aria-labelledby="matches-title">
            <div className="resultsHead">
              <div><div className="eyebrow">{t.reveal}</div><h2 id="matches-title">{t.matchTitle}</h2></div>
              <p>{t.matchIntro}</p>
            </div>
            <div className="matches">
              {picks.map((place, index) => {
                const inPlan = plan.some((x) => x.id === place.id);
                return (
                  <article className={`match ${index === 0 ? "best" : ""}`} key={place.id || index}>
                    <div className="photo">
                      <Photo place={place} eager={index === 0} />
                      <span className="rank">{index === 0 ? t.best : `${t.alternate} 0${index}`}</span>
                      {place.rating != null ? <span className="score"><b>{place.rating}</b><small>WAYFIND</small></span> : null}
                    </div>
                    <div className="matchBody">
                      <span className="category">{categoryOf(place)}</span>
                      <h3>{place.name}</h3>
                      <Meta place={place} />
                      <p className="why"><b>{t.why}</b>{whyLine(place, intent || "must", language)}</p>
                      <div className="actions">
                        <button className="detailBtn" onClick={() => openDetails(place, index + 1)}>{t.details} →</button>
                        <button className={`planBtn ${inPlan ? "on" : ""}`} onClick={() => togglePlan(place)} aria-pressed={inPlan}>{inPlan ? "✓" : "+"} {inPlan ? t.added : t.add}</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="trust">
              <h3>{t.trustTitle}</h3>
              <p>{t.trustBody} <a href={dh("/")} onClick={() => go("cta_open_app", { surface: "paid_landing_all", city: cityLabel })} style={{ color: "#ff8a48" }}>{t.all} →</a></p>
            </div>
          </section>
        ) : null}

        <noscript><p><a href="/">Open Wayfind</a> to browse {cityLabel}.</p></noscript>
        <span data-wf-paid-ready={attr !== null ? "1" : "0"} style={{ display: "none" }} />
      </main>

      {plan.length ? (
        <aside className="planDock" aria-label={t.plan}>
          <span className="planCount">{plan.length}</span>
          <span className="planCopy"><b>{t.plan}</b><span>{plan.map((p) => p.name).join(" · ")}</span></span>
          <a href={dh(`/?place=${encodeURIComponent(firstPlan.id)}`)} onClick={() => go("detail_open", { place_id: firstPlan.id, place_name: firstPlan.name, surface: "paid_landing_plan", city: cityLabel })}>{t.planCta} →</a>
        </aside>
      ) : null}

      {active ? (
        <div className="drawerShade" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setActive(null); }}>
          <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <button className="close" onClick={() => setActive(null)} aria-label="Close">×</button>
            <div className="drawerPhoto"><Photo place={active} eager /></div>
            <div className="drawerCopy">
              <span className="category">{categoryOf(active)}</span>
              <h2 id="drawer-title">{active.name}</h2>
              <Meta place={active} />
              <p className="why"><b>{t.why}</b>{whyLine(active, intent || "must", language)}</p>
              <div className="drawerActions">
                <a href={dh(`/?place=${encodeURIComponent(active.id)}`)} onClick={() => go("detail_open", { place_id: active.id, place_name: active.name, surface: "paid_landing_drawer", city: cityLabel, category: categoryOf(active) })}>{t.open} →</a>
                <button onClick={() => togglePlan(active)}>{plan.some((x) => x.id === active.id) ? `✓ ${t.added}` : `+ ${t.add}`}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
