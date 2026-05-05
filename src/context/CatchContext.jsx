import { createContext, useReducer, useContext } from "react";
import { TEST_CATCHES } from "../utils/mockData";
const initialState = {
  catches: TEST_CATCHES,
  sortBy: "vse",
};

function catchReducer(state, action) {
  switch (action.type) {
    case "ADD_CATCH":
      return {
        ...state,
        catches: [...state.catches, action.payload],
      };
    case "DELETE_CATCH":
      return {
        ...state,
        catches: state.catches.filter((item) => item.id !== action.payload),
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
export const CatchContext = createContext();

export function CatchProvider({ children }) {
  const [state, dispatch] = useReducer(catchReducer, initialState);
  return (
    <CatchContext.Provider value={{ state, dispatch }}>
      {children}
    </CatchContext.Provider>
  );
}

export const useCatches = () => useContext(CatchContext);
