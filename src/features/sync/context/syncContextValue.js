import { createContext, useContext } from "react";

export const SyncContext = createContext(null);

export function useOptionalSync() {
  return useContext(SyncContext);
}

export function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync musí být použit uvnitř SyncProvider.");
  return value;
}
