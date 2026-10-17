import { useContext } from "react";
import { CatchContext } from "./catchContextValue";

export function useCatches() {
  return useContext(CatchContext);
}
