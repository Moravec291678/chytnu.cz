import { createContext, useContext } from "react";

export const NotificationContext = createContext(null);

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications musí být použit uvnitř NotificationProvider.");
  return value;
}
