import { createContext, useContext } from "react";

export const DataScopeContext = createContext(null);

export function useDataScope() {
  const value = useContext(DataScopeContext);
  if (!value) throw new Error("useDataScope musí být použit uvnitř DataScopeProvider.");
  return value;
}
