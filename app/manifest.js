export default function manifest() {
  return {
    name: "Wayfind",
    short_name: "Wayfind",
    // The app's identity line, shown on the install prompt and the home screen.
    // Was "Discover the best places, anywhere." — the exact directory voice the
    // 2026-08-04 brand brief objected to, and the only place in the product it
    // actually existed: "Discover" is the mechanism verb, "the best places" is a
    // ranking claim with no method shown, and "anywhere" is the opposite of the
    // local specificity Wayfind is built on.
    //
    // The replacement is the owner's own line. It is emotional and aspirational
    // and makes ZERO factually unbackable claim — which is the whole doctrine:
    // emotion in the promise, specificity as the proof.
    description: "Find the places you'll be telling your friends about tomorrow.",
    start_url: "/",
    display: "standalone",
    background_color: "#0D1117",
    theme_color: "#0D1117",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
