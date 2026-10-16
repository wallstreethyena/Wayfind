// Node-only image decoding for the private photo store. Metadata readers do
// not import the native decoder; only the server's save path loads this file.
import sharp from "sharp";

export async function validateStoredPhotoImage(body, declared, maxPixels) {
  const types = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const info = await sharp(body, { limitInputPixels: maxPixels, failOn: "warning" }).metadata();
  if (!info.width || !info.height || info.width * info.height > maxPixels || (info.pages || 1) !== 1 || types[info.format] !== declared) throw new Error("invalid_image_dimensions");
  await sharp(body, { limitInputPixels: maxPixels, failOn: "warning" }).stats();
  return { width: info.width, height: info.height };
}
