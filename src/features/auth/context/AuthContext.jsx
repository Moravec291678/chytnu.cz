import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContextValue.js";
import { firebaseAuth } from "../data/firebaseAuth.js";
import { getAuthErrorMessage, isInvalidAuthConfiguration } from "../data/authErrors.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => firebaseAuth.observe((nextUser) => {
    setUser(nextUser);
    setStatus("ready");
    setError("");
  }, (authError) => {
    setUser(null);
    setStatus(isInvalidAuthConfiguration(authError) ? "unavailable" : "error");
    setError(getAuthErrorMessage(authError));
  }), []);

  const run = useCallback(async (operation) => {
    setError("");
    try {
      const result = await operation();
      return result;
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
      throw authError;
    }
  }, []);

  const register = useCallback((email, password) => run(() => firebaseAuth.register(email, password)), [run]);
  const signIn = useCallback((email, password) => run(() => firebaseAuth.signIn(email, password)), [run]);
  const resetPassword = useCallback((email) => run(() => firebaseAuth.resetPassword(email)), [run]);
  const resendVerification = useCallback((currentUser) => run(() => firebaseAuth.resendVerification(currentUser)), [run]);
  const logOut = useCallback(() => run(() => firebaseAuth.signOut()), [run]);

  const value = useMemo(() => ({
    user,
    status,
    error,
    clearError: () => setError(""),
    register,
    signIn,
    resetPassword,
    resendVerification,
    logOut,
  }), [user, status, error, register, signIn, resetPassword, resendVerification, logOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
