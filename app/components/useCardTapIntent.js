"use client";

import { useRef } from "react";

// A horizontal rail is primarily a scroll surface. Mobile browsers may emit a
// click after a finger moves across a card, so the card must distinguish an
// intentional tap from a drag before it opens detail.
export const CARD_TAP_SLOP_PX = 10;
const NESTED_CONTROL = "a,button,input,select,textarea";

export function useCardTapIntent() {
  const gesture = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    suppressNextClick: false,
  });

  const onPointerDown = (event) => {
    const target = event && event.target;
    if ((event?.pointerType === "mouse" && event.button !== 0)
      || (target && typeof target.closest === "function" && target.closest(NESTED_CONTROL))) {
      gesture.current = { ...gesture.current, active: false, pointerId: null, moved: false, suppressNextClick: false };
      return;
    }
    gesture.current = {
      active: true,
      pointerId: event?.pointerId ?? null,
      startX: Number(event?.clientX || 0),
      startY: Number(event?.clientY || 0),
      moved: false,
      suppressNextClick: false,
    };
  };

  const onPointerMove = (event) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== (event?.pointerId ?? null) || current.moved) return;
    const dx = Number(event?.clientX || 0) - current.startX;
    const dy = Number(event?.clientY || 0) - current.startY;
    if (Math.hypot(dx, dy) >= CARD_TAP_SLOP_PX) current.moved = true;
  };

  const onPointerUp = (event) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== (event?.pointerId ?? null)) return;
    current.suppressNextClick = current.moved;
    current.active = false;
    current.pointerId = null;
  };

  const onPointerCancel = (event) => {
    const current = gesture.current;
    if (current.pointerId !== (event?.pointerId ?? null)) return;
    current.active = false;
    current.pointerId = null;
    current.moved = false;
    current.suppressNextClick = false;
  };

  const shouldOpen = () => {
    if (!gesture.current.suppressNextClick) return true;
    gesture.current.suppressNextClick = false;
    return false;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, shouldOpen };
}
