import { useEffect, useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useDataScope } from "../../features/auth/context/dataScopeContextValue.js";
import { createNavigationMemory, NavigationMemory } from "./navigationMemory.js";

export default function NavigationMemoryProvider({ children }) {
  const { scopeKey } = useDataScope();
  const location = useLocation();
  const action = useNavigationType();
  const memory = useMemo(() => createNavigationMemory(scopeKey), [scopeKey]);
  useLayoutEffect(() => {
    const changedPage = memory.record(location, action);
    if (action !== "POP" && changedPage && !location.hash) window.scrollTo(0, 0);
  }, [action, location, memory]);
  useEffect(() => {
    const saveScroll = () => memory.saveScroll(window.scrollY);
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("click", saveScroll, true);
    return () => {
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("click", saveScroll, true);
    };
  }, [memory]);
  return <NavigationMemory.Provider key={scopeKey ?? "loading"} value={memory}>{children}</NavigationMemory.Provider>;
}
