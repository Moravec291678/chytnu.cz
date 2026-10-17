import { useCallback, useEffect, useReducer } from "react";
import { TripContext } from "./tripContextValue";
import { tripRepository } from "../data/tripRepository";
import { endTripRecord } from "../data/tripModel";
import { useAuth } from "../../auth/context/authContextValue.js";
import { isRecordVisible } from "../../auth/data/localDataScope.js";
import { updateTripRecord } from "../data/tripModel.js";

const initialState = { trips: [], loading: true, error: "" };

function reducer(state, action) {
  switch (action.type) {
    case "LOAD": return { ...state, trips: action.trips, loading: false, error: "" };
    case "ERROR": return { ...state, loading: false, error: action.message };
    case "UPSERT": return { ...state, error: "", trips: [action.trip, ...state.trips.filter((trip) => trip.id !== action.trip.id)] };
    case "DELETE": return { ...state, trips: state.trips.filter((trip) => trip.id !== action.id) };
    default: return state;
  }
}

export function TripProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { user } = useAuth();
  const refresh = useCallback(async () => {
    try {
      const trips = (await tripRepository.list()).filter((record) => isRecordVisible(record, user?.uid));
      trips.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      dispatch({ type: "LOAD", trips });
    } catch (error) {
      dispatch({ type: "ERROR", message: error.message || "Výpravy se nepodařilo načíst." });
    }
  }, [user?.uid]);
  useEffect(() => {
    refresh();
    window.addEventListener("chytnu:local-data-restored", refresh);
    return () => window.removeEventListener("chytnu:local-data-restored", refresh);
  }, [refresh]);

  const startTrip = useCallback(async (trip) => {
    const stored = await tripRepository.start(trip, { ownerId: user?.uid ?? null });
    dispatch({ type: "UPSERT", trip: stored });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    return stored;
  }, [user?.uid]);
  const endTrip = useCallback(async (trip) => {
    const ended = endTripRecord(trip);
    const stored = await tripRepository.put(ended, { ownerId: user?.uid ?? null });
    dispatch({ type: "UPSERT", trip: stored });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    return stored;
  }, [user?.uid]);
  const updateTrip = useCallback(async (trip, values) => {
    const stored = await tripRepository.put(updateTripRecord(trip, values), { ownerId: user?.uid ?? null });
    dispatch({ type: "UPSERT", trip: stored });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    return stored;
  }, [user?.uid]);
  const deleteTrip = useCallback(async (id) => {
    await tripRepository.delete(id);
    dispatch({ type: "DELETE", id });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
  }, []);

  return <TripContext.Provider value={{ state, startTrip, endTrip, updateTrip, deleteTrip, refresh }}>{children}</TripContext.Provider>;
}
