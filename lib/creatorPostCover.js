// Guide posters use reviewed local photos of the post's subject. A photo credit
// is required because the poster is separate from the creator's native embed.
const LOCAL_POSTER = /^\/(?:guides\/(?:creator-covers|picks|universal-orlando-christmas-2026)|place-photos)\/(?:[\w-]+\/)*[\w-]+\.(?:avif|jpe?g|png|webp)$/i;

export function creatorPostCover(cover) {
  if (!cover || typeof cover.src !== "string" || !LOCAL_POSTER.test(cover.src)) return null;
  const credit = typeof cover.credit === "string" ? cover.credit.trim() : "";
  const alt = typeof cover.alt === "string" ? cover.alt.trim() : "";
  return credit && alt ? { src: cover.src, credit, alt, ...(cover.preserveFraming === true ? { preserveFraming: true } : {}) } : null;
}
