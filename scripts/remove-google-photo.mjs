// Operator tool: mark removed first, then delete private bytes. A tombstone
// prevents a visitor from silently purchasing and restoring the removed image.
import { readStoredGooglePhoto, removeStoredGooglePhoto } from "../lib/googlePhotoStore.js";
const args = process.argv.slice(2);
const placeId = args.find(x => !x.startsWith("--"));
if (!/^[A-Za-z0-9_-]{16,}$/.test(placeId || "") || args.some(x => x.startsWith("--") && x !== "--apply")) {
  console.error("Usage: node scripts/remove-google-photo.mjs PLACE_ID [--apply]");
  process.exitCode = 1;
} else if (args.includes("--apply")) {
  const removed = await removeStoredGooglePhoto(placeId);
  console.log(JSON.stringify({ placeId, removed }));
  if (!removed) process.exitCode = 1;
} else {
  const photo = await readStoredGooglePhoto(placeId);
  console.log(JSON.stringify({ placeId, found: !!photo, apply: false }));
}
