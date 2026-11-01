import assert from "node:assert/strict";
import { dedupePhotos, normalizePhotoUrl } from "../lib/photoDedupe.js";
const B = "https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/X/a.jpg";
assert.equal(normalizePhotoUrl(B + "?v=2"), normalizePhotoUrl(B));
assert.equal(normalizePhotoUrl("/_next/image?url=" + encodeURIComponent(B) + "&w=640"), normalizePhotoUrl(B));
assert.equal(normalizePhotoUrl(B.replace("/object/public/", "/render/image/public/")), normalizePhotoUrl(B));
const out = dedupePhotos([{ src: B }, { src: B + "?w=1" }, { src: B.replace("a.jpg", "b.jpg"), phash: "ffff0000ffff0000" }, { src: B.replace("a.jpg", "c.jpg"), phash: "FFFF0000FFFF0000" }, { src: B.replace("a.jpg", "d.jpg") }]);
assert.deepEqual(out.map((p) => p.src.split("/").pop()), ["a.jpg", "b.jpg", "d.jpg"]);
console.log("photo dedupe ok");
