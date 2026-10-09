"use client";
import { createContext } from "react";

// railId -> { guide, matched } for the collection the rails belong to. Filled by
// GuideRailCollection; read by RailGuideSlot inside each rail's own track.
export const RailGuideContext = createContext(null);
