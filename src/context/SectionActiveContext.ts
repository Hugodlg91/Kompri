import { createContext, useContext } from "react";

/**
 * False for a converter that stays mounted but is hidden behind another
 * section, so it keeps its state without reacting to window-level events.
 */
export const SectionActiveContext = createContext(true);

export function useSectionActive(): boolean {
  return useContext(SectionActiveContext);
}
