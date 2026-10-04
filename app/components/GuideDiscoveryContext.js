"use client";
import { createContext } from 'react';
// The compact server-built index, never the full guide corpus. Standalone
// collections without this context make no ungrounded guide suggestions.
export const GuideDiscoveryContext = createContext([]);
