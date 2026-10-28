import { useCallback, useEffect, useReducer, useRef } from "react";
import { TripContext } from "./tripContextValue";
import { tripRepository } from "../data/tripRepository";
import { endTripRecord } from "../data/tripModel";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { updateTripRecord } from "../data/tripModel.js";
import { progressionLedger } from "../../progression/data/progressionLedger.js";

const initialState = { trips: [], loading: true, error: "" };

function reducer(state, action) {
  switch (action.type) {
    case "LOAD": return { ...state, trips: action.trips, loading: false, error: "" };
    case "ERROR": return { ...state, loading: false, error: action.message };
    case "RESET_SCOPE": return { ...initialState };
    case "UPSERT": return { ...state, error: "", trips: [action.trip, ...state.trips.filter((trip) => trip.id !== action.trip.id)] };
    case "DELETE": return { ...state, trips: state.trips.filter((trip) => trip.id !== action.id) };
    default: return state;
  }
}

export function TripProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const scope = useDataScope();
  const activeScopeKey = useRef(null);
  const refresh = useCallback(async () => {
    if (scope.status !== "ready") return;
    const requestedScopeKey = scope.scopeKey;
    try {
      const trips = await tripRepository.list(scope);
      if (activeScopeKey.current !== requestedScopeKey) return;
      trips.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      dispatch({ type: "LOAD", trips });
    } catch (error) {
      dispatch({ type: "ERROR", message: error.message || "Vycházky se nepodařilo načíst." });
    }
  }, [scope]);
  useEffect(() => {
    activeScopeKey.current = scope.status === "ready" ? scope.scopeKey : null;
    dispatch({ type: "RESET_SCOPE" });
    if (scope.status !== "ready") return undefined;
    refresh();
    window.addEventListener("chytnu:local-data-restored", refresh);
    return () => {
      window.removeEventListener("chytnu:local-data-restored", refresh);
      if (activeScopeKey.current === scope.scopeKey) activeScopeKey.current = null;
    };
  }, [refresh, scope.status, scope.scopeKey]);

  const startTrip = useCallback(async (trip) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const stored = await tripRepository.start(trip, scope);
    await progressionLedger.reconcile(scope);
    if (activeScopeKey.current !== scope.scopeKey) return stored;
    dispatch({ type: "UPSERT", trip: stored });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return stored;
  }, [scope]);
  const endTrip = useCallback(async (trip) => {
    const ended = endTripRecord(trip);
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const stored = await tripRepository.put(ended, scope);
    await progressionLedger.reconcile(scope);
    if (activeScopeKey.current !== scope.scopeKey) return stored;
    dispatch({ type: "UPSERT", trip: stored });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return stored;
  }, [scope]);
  const updateTrip = useCallback(async (trip, values) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const stored = await tripRepository.put(updateTripRecord(trip, values), scope);
    await progressionLedger.reconcile(scope);
    if (activeScopeKey.current !== scope.scopeKey) return stored;
    dispatch({ type: "UPSERT", trip: stored });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return stored;
  }, [scope]);
  const deleteTrip = useCallback(async (id) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    await tripRepository.delete(id, scope);
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "DELETE", id });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
  }, [scope]);

  return <TripContext.Provider value={{ state, startTrip, endTrip, updateTrip, deleteTrip, refresh }}>{children}</TripContext.Provider>;
}
