import { useContext } from "react";
import { TripContext } from "./tripContextValue";

export function useTrips() {
  const context = useContext(TripContext);
  if (!context) throw new Error("useTrips musí být použit uvnitř TripProvider.");
  return context;
}
