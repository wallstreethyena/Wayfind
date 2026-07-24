"use client";
// lib/placeProduct.js — usePlaceProduct(placeId): does this place have a VERIFIED
// booking product? (Cowork's wf_place_products, rn = 1, surfaced via
// /api/place-products.) The place-card booking button renders ONLY when this
// returns a product — "no verified product, no button" (owner: kill the generic
// 'Search Viator' fallback). Lookups are BATCHED: many cards mounting in one
// frame collapse into a single POST, and every verdict is cached for the session
// so re-renders never re-fetch. Fail-soft: any error → null → no button.
import { useEffect, useState } from "react";

const mem = new Map(); // place_id -> product | null
let pending = new Map(); // place_id -> [resolve, ...]
let timer = null;

function flush() {
  timer = null;
  const ids = Array.from(pending.keys()).slice(0, 80);
  const waiters = pending;
  pending = new Map();
  if (!ids.length) return;
  fetch("/api/place-products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) })
    .then((r) => (r.ok ? r.json() : { products: {} }))
    .then((j) => {
      const products = (j && j.products) || {};
      ids.forEach((id) => {
        const prod = products[id] || null;
        mem.set(id, prod);
        (waiters.get(id) || []).forEach((res) => res(prod));
      });
    })
    .catch(() => {
      ids.forEach((id) => {
        mem.set(id, null);
        (waiters.get(id) || []).forEach((res) => res(null));
      });
    });
}

function lookup(id) {
  if (mem.has(id)) return Promise.resolve(mem.get(id));
  return new Promise((resolve) => {
    if (!pending.has(id)) pending.set(id, []);
    pending.get(id).push(resolve);
    if (!timer) timer = setTimeout(flush, 60); // coalesce a frame's worth of cards
  });
}

export function usePlaceProduct(placeId) {
  const [prod, setProd] = useState(() => (placeId && mem.has(placeId) ? mem.get(placeId) : null));
  useEffect(() => {
    if (!placeId) { setProd(null); return; }
    if (mem.has(placeId)) { setProd(mem.get(placeId)); return; }
    let dead = false;
    lookup(placeId).then((p) => { if (!dead) setProd(p); });
    return () => { dead = true; };
  }, [placeId]);
  return prod;
}
