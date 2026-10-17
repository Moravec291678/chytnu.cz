import { useCallback, useEffect, useReducer } from "react";
import { CatchContext } from "./catchContextValue";
import { catchRepository } from "../data/catchRepository";
import { useAuth } from "../../auth/context/authContextValue.js";
import { isRecordVisible } from "../../auth/data/localDataScope.js";
const initialState = {
  catches: [],
  sortBy: "vse",
  loading: true,
  error: "",
};

function catchReducer(state, action) {
  switch (action.type) {
    case "LOAD_CATCHES":
      return { ...state, catches: action.payload, loading: false, error: "" };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "ADD_CATCH":
      return {
        ...state,
        error: "",
        catches: [...state.catches, action.payload],
      };
    case "DELETE_CATCH":
      return {
        ...state,
        error: "",
        catches: state.catches.filter((item) => item.id !== action.payload),
      };
    case "UPDATE_CATCH":
      return {
        ...state,
        error: "",
        catches: state.catches.map((item) => item.id === action.payload.id ? action.payload : item),
      };
    case "TOGGLE_FAVORITE":
      return {
        ...state,
        catches: state.catches.map((item) => {
          return item.id === action.payload
            ? { ...item, isFavorite: !item.isFavorite }
            : item;
        }),
      };
    case "SET_SORT":
      return {
        ...state,
        sortBy: action.payload,
      };
    default:
      return state;
  }
}
export function CatchProvider({ children }) {
  const [state, dispatch] = useReducer(catchReducer, initialState);
  const { user } = useAuth();
  const refresh = useCallback(async () => {
    try {
      const catches = (await catchRepository.list()).filter((record) => isRecordVisible(record, user?.uid));
      catches.sort((a, b) => new Date(b.caughtAt) - new Date(a.caughtAt));
      dispatch({ type: "LOAD_CATCHES", payload: catches });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error.message || "Úlovky se nepodařilo načíst." });
    }
  }, [user?.uid]);

  useEffect(() => {
    refresh();
    window.addEventListener("chytnu:local-data-restored", refresh);
    return () => window.removeEventListener("chytnu:local-data-restored", refresh);
  }, [refresh]);

  const createCatch = useCallback(async (record) => {
    const storedRecord = await catchRepository.put(record, { ownerId: user?.uid ?? null });
    dispatch({ type: "ADD_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
  }, [user?.uid]);
  const updateCatch = useCallback(async (record) => {
    const storedRecord = await catchRepository.put(record, { ownerId: user?.uid ?? null });
    dispatch({ type: "UPDATE_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
  }, [user?.uid]);
  const deleteCatch = useCallback(async (id) => {
    await catchRepository.delete(id);
    dispatch({ type: "DELETE_CATCH", payload: id });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
  }, []);

  return (
    <CatchContext.Provider value={{ state, dispatch, refresh, createCatch, updateCatch, deleteCatch }}>
      {children}
    </CatchContext.Provider>
  );
}
