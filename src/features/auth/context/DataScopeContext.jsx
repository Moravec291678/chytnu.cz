import { useEffect, useMemo, useState } from "react";
import { accountScopeKey } from "../data/localDataScope.js";
import { getActiveGuestScopeKey } from "../../catches/data/catchRepository.js";
import { useAuth } from "./authContextValue.js";
import { userFacingErrorMessage } from "../../../shared/errors/userFacingError.js";
import { DataScopeContext } from "./dataScopeContextValue.js";

const loadingState = Object.freeze({ status: "loading", scopeKey: null, kind: null, ownerId: null, error: "" });

export function DataScopeProvider({ children }) {
  const { user, status: authStatus } = useAuth();
  const [guestState, setGuestState] = useState(loadingState);
  const userId = user?.uid ?? null;

  useEffect(() => {
    let active = true;
    if (authStatus === "loading" || userId) return () => { active = false; };
    getActiveGuestScopeKey().then((scopeKey) => {
      if (active) setGuestState({ status: "ready", scopeKey, kind: "guest", ownerId: null, error: "" });
    }).catch((error) => {
      if (active) setGuestState({ ...loadingState, status: "error", error: userFacingErrorMessage(error, "Místní profil se nepodařilo načíst. Zkus to znovu.") });
    });
    return () => { active = false; };
  }, [authStatus, userId]);

  const value = useMemo(() => {
    if (authStatus === "loading") return loadingState;
    if (userId) return { status: "ready", scopeKey: accountScopeKey(userId), kind: "account", ownerId: userId, error: "" };
    return guestState;
  }, [authStatus, guestState, userId]);
  return <DataScopeContext.Provider value={value}>{children}</DataScopeContext.Provider>;
}
