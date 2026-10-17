import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/context/authContextValue.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { createFirestoreSyncAdapter } from "../data/firestoreSyncAdapter.js";
import { createFirebasePhotoStorage } from "../data/firebasePhotoStorage.js";
import { createSyncPort } from "../data/syncPort.js";
import { createSyncService } from "../data/syncService.js";
import { readSyncSummary } from "../data/localSyncRepository.js";
import { SyncContext } from "./syncContextValue.js";

const initialState = { status: "idle", sent: 0, applied: 0, conflicts: 0, pending: 0, error: "", nextRetryAt: null };

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function SyncProvider({ children }) {
  const { user, status: authStatus } = useAuth();
  const [state, setState] = useState(initialState);
  const serviceRef = useRef(null);
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const runSyncRef = useRef(null);
  const userId = user?.uid ?? null;

  const updateSummary = useCallback(async (ownerId) => {
    if (!ownerId) return { pending: 0, conflicts: 0, lastError: "", nextRetryAt: null };
    return readSyncSummary(ownerId);
  }, []);

  const runSync = useCallback(async (force = false) => {
    if (authStatus !== "ready" || !userId) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }
    if (!online()) {
      try {
        const summary = await updateSummary(userId);
        setState((previous) => ({ ...previous, ...summary, status: "offline", error: "" }));
      } catch (error) {
        setState((previous) => ({ ...previous, status: "error", error: error?.message || "Místní frontu se nepodařilo načíst." }));
      }
      return;
    }
    runningRef.current = true;
    setState((previous) => ({ ...previous, status: "syncing", error: "" }));
    try {
      if (!serviceRef.current) {
        const port = createSyncPort(createFirestoreSyncAdapter());
        serviceRef.current = createSyncService({ port, photoStorage: createFirebasePhotoStorage(), getCurrentOwnerId: () => {
          try { return firebaseAuth.currentUserId(); } catch { return null; }
        } });
      }
      const result = await serviceRef.current.run(userId, { force });
      const summary = await updateSummary(userId);
      setState({
        ...initialState,
        ...summary,
        status: result.status === "success" ? "success" : result.status,
        sent: result.sent ?? 0,
        applied: result.applied ?? 0,
        conflicts: Math.max(result.conflicts ?? 0, summary.conflicts),
        error: result.error ?? "",
      });
      if ((result.applied ?? 0) > 0) window.dispatchEvent(new Event("chytnu:local-data-restored"));
    } catch (error) {
      const summary = await updateSummary(userId).catch(() => initialState);
      setState((previous) => ({ ...previous, ...summary, status: "error", error: error?.message || "Synchronizaci se nepodařilo dokončit." }));
    } finally {
      runningRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        queueMicrotask(() => runSyncRef.current?.());
      }
    }
  }, [authStatus, updateSummary, userId]);

  runSyncRef.current = runSync;

  useEffect(() => {
    serviceRef.current = null;
    if (authStatus !== "ready" || !userId) {
      setState({ ...initialState, status: authStatus === "loading" ? "idle" : "signed-out" });
      return undefined;
    }
    void runSync();
    const retry = () => void runSync();
    window.addEventListener("online", retry);
    window.addEventListener("chytnu:outbox-changed", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("chytnu:outbox-changed", retry);
    };
  }, [authStatus, runSync, userId]);

  useEffect(() => {
    if (!userId || state.status === "syncing" || !state.nextRetryAt) return undefined;
    const delay = Math.max(0, Date.parse(state.nextRetryAt) - Date.now());
    const timer = window.setTimeout(() => void runSync(), Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [runSync, state.nextRetryAt, state.status, userId]);

  const retry = useCallback(() => runSync(true), [runSync]);
  return <SyncContext.Provider value={{ ...state, retry }}>{children}</SyncContext.Provider>;
}
