import { createContext, useContext } from "react";

export const ProgressionContext = createContext(null);

export function useProgression() {
  const value = useContext(ProgressionContext);
  if (!value) throw new Error("useProgression musí být použit uvnitř ProgressionProvider.");
  return value;
}
