import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth musí být použit uvnitř AuthProvider.");
  return value;
}
