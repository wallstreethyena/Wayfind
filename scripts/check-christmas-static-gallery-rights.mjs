#!/usr/bin/env node
// Licensed Christmas static gallery photos (batch 2026-11p onward) carry their
// rights with them: every CHRISTMAS_STATIC_GALLERY entry that declares a
// `license` must be a free licence (CC0, CC BY, CC BY-SA, public domain), name
// its author, link a Commons file page, exist on disk at a sane size, decode,
// and have a provenance row (data/christmas-static-gallery-provenance.json)
// that agrees on file, licence and source. Owner rule (2026-11-01): real photos
// only with permission or appropriate licensing. Asserted on the CALL.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { CHRISTMAS_STATIC_GALLERY, christmasStaticPhotos } from "../lib/christmasPlacePhotos.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const root = process.cwd();
const FREE = /^(?:CC0(?: 1\.0)?|CC BY(?:-SA)?(?: \d(?:\.\d)?)?|Public domain|PD)$/i;
ok(FREE.test("CC BY-SA 4.0") && FREE.test("CC0") && FREE.test("CC BY 2.0"), "licence pattern accepts the free licences (control)");
ok(!FREE.test("CC BY-NC 4.0") && !FREE.test("CC BY-ND 2.0") && !FREE.test("All rights reserved"), "licence pattern rejects NC, ND and all rights reserved (control)");

const prov = JSON.parse(fs.readFileSync(path.join(root, "data/christmas-static-gallery-provenance.json"), "utf8"));
ok(Array.isArray(prov.photos) && prov.photos.length >= 13, "provenance file lists the batch (" + (prov.photos || []).length + " rows)");
const provByFile = new Map(prov.photos.map((p) => [p.file, p]));

const licensed = [];
for (const [id, list] of Object.entries(CHRISTMAS_STATIC_GALLERY)) for (const e of list) if ("license" in e) licensed.push({ id, ...e });
ok(licensed.length >= 13, "licensed gallery entries exist (" + licensed.length + ")");
const bad = [];
const seen = new Map();
for (const e of licensed) {
  const where = e.id + " " + e.src;
  if (!FREE.test(String(e.license || ""))) bad.push(where + ": licence not free: " + e.license);
  if (!/^https:\/\/creativecommons\.org\//.test(String(e.license_url || "")) && !/^PD|^Public domain/i.test(e.license)) bad.push(where + ": licence url missing");
  if (!e.author) bad.push(where + ": author missing");
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(String(e.href || ""))) bad.push(where + ": href is not a Commons file page");
  if (!String(e.credit || "").includes("via Wikimedia Commons") || !String(e.credit).includes(String(e.license))) bad.push(where + ": credit does not name the licence and Commons");
  if (!["event", "venue"].includes(e.subject)) bad.push(where + ": subject must be event or venue");
  if (e.subject === "event" && !/^\d{4}$/.test(String(e.photo_year || ""))) bad.push(where + ": an event photo records its year");
  const p = provByFile.get(e.src);
  if (!p) bad.push(where + ": no provenance row");
  else if (p.license !== e.license || p.source_url !== e.href || p.event_id !== e.id) bad.push(where + ": provenance disagrees (file, licence, source or event)");
  const abs = path.join(root, "public", e.src);
  if (!fs.existsSync(abs)) { bad.push(where + ": file missing on disk"); continue; }
  const buf = fs.readFileSync(abs);
  if (buf.length > 300 * 1024) bad.push(where + ": over 300KB");
  const h = crypto.createHash("sha256").update(buf).digest("hex");
  // The same bytes may serve two ids for one event (the Fort Myers stroll twins); never three.
  seen.set(h, (seen.get(h) || 0) + 1);
  if (seen.get(h) > 2) bad.push(where + ": the same photo serves more than two cards");
}
for (const e of licensed) {
  const abs = path.join(root, "public", e.src);
  if (!fs.existsSync(abs)) continue;
  const md = await sharp(abs).metadata().catch(() => null);
  if (!md || !(md.width >= 640 && md.height >= 400 && md.width <= 1280 && md.height <= 1280)) bad.push(e.src + ": odd dimensions " + (md ? md.width + "x" + md.height : "undecodable"));
}
ok(bad.length === 0, "licensed gallery rules: " + bad.join("; "));
for (const p of prov.photos) if (!licensed.some((e) => e.src === p.file)) bad.push(p.file + ": provenance row without a gallery entry");
ok(bad.length === 0, "every provenance row is wired: " + bad.join("; "));

// Call test: the resolver serves the licensed cover with its credit, and a waterfront stand in never landed on a boat parade.
const boat = christmasStaticPhotos("madeira-beach-festival-of-lights-boat-parade-2026", "Madeira Beach boat parade");
ok(boat.length === 1 && /batch-2026-11p/.test(boat[0].src) && /CC BY 3\.0, via Wikimedia Commons$/.test(boat[0].credit), "Madeira Beach boat parade resolves to its licensed photo with credit");
ok(licensed.filter((e) => /boat-parade/.test(e.id)).every((e) => e.subject === "event"), "every licensed boat parade photo is of the parade itself, never a venue stand in");
console.log("check-christmas-static-gallery-rights: OK, " + checks + " assertions (" + licensed.length + " licensed entries, " + prov.photos.length + " provenance rows)");
