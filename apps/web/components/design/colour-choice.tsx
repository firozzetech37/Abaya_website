'use client';

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

type ColourChoice = { colourId: string | null; setColourId: (id: string | null) => void };

const Context = createContext<ColourChoice>({ colourId: null, setColourId: () => undefined });

/**
 * The colour picked in the redesign panel, shared with the gallery so the photos follow it.
 * Starts on the design's default colour.
 */
export function ColourChoiceProvider({ initial, children }: { initial: string | null; children: ReactNode }) {
  const [colourId, setColourId] = useState<string | null>(initial);
  const value = useMemo(() => ({ colourId, setColourId }), [colourId]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useColourChoice = () => useContext(Context);
