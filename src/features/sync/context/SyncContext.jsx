import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/context/authContextValue.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { createSyncPort } from "../data/syncPort.js";
import { createSyncService } from "../data/syncService.js";
import { readSyncSummary } from "../data/localSyncRepository.js";
import { describeSyncFailure } from "../data/syncDiagnostics.js";
import { createPhotoCloudService } from "../../catches/data/photoCloudService.js";
import { getPhotoCloudProvider } from "../../catches/data/photoCloudProvider.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";
import { SyncContext } from "./syncContextValue.js";
import { attachSyncLifecycle } from "./syncLifecycle.js";
import { mergeSyncForce } from "./syncRetry.js";

const initialState = { status: "idle", sent: 0, applied: 0, conflicts: 0, pending: 0, failed: 0, error: "", errorCode: "", errorEndpoint: "", nextRetryAt: null, lastResult: "never" };

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function reportSyncDiagnostic(diagnostic) {
  let mode = "unknown";
  try { mode = getBackendConfiguration().mode; } catch { /* Auth reports invalid configuration separately. */ }
  if (!["emulator", "staging"].includes(mode)) return;
  console.error("[ChytnuCz sync]", diagnostic);
}

export function SyncProvider({ children }) {
  const { user, status: authStatus } = useAuth();
  const [state, setState] = useState(initialState);
  const serviceRef = useRef(null);
  const photoCloudServiceRef = useRef(null);
  const photoCloudProviderRef = useRef(null);
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const rerunForceRef = useRef(false);
  const runSyncRef = useRef(null);
  const userId = user?.uid ?? null;

  const updateSummary = useCallback(async (ownerId) => {
    if (!ownerId) return { pending: 0, conflicts: 0, lastError: "", lastErrorCode: "", lastErrorEndpoint: "", nextRetryAt: null };
    return readSyncSummary(ownerId);
  }, []);

  const runSync = useCallback(async (force = false) => {
    if (authStatus !== "ready" || !userId) return;
    if (runningRef.current) {
      rerunRef.current = true;
      rerunForceRef.current = mergeSyncForce(rerunForceRef.current, force);
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
        const { createFirestoreSyncAdapter } = await import("../data/firestoreSyncAdapter.js");
        const port = createSyncPort(createFirestoreSyncAdapter());
        serviceRef.current = createSyncService({ port, getCurrentOwnerId: () => {
          try { return firebaseAuth.currentUserId(); } catch { return null; }
        }, onDiagnostic: reportSyncDiagnostic });
      }
      await photoCloudServiceRef.current.normalizeLegacyPhotoIds(userId);
      const result = await serviceRef.current.run(userId, { force });
      const photoCloudProvider = getPhotoCloudProvider();
      if (!photoCloudServiceRef.current || photoCloudProviderRef.current !== photoCloudProvider) {
        photoCloudProviderRef.current = photoCloudProvider;
        photoCloudServiceRef.current = createPhotoCloudService({
        provider: photoCloudProvider,
        getCurrentOwnerId: () => {
          try { return firebaseAuth.currentUserId(); } catch { return null; }
        },
        });
      }
      const photoResult = await photoCloudServiceRef.current.run(userId, { force });
      if (photoResult.uploaded > 0) window.dispatchEvent(new Event("chytnu:local-data-restored"));
      const finalResult = photoResult.uploaded > 0
        ? await serviceRef.current.run(userId, { force })
        : result;
      if (photoResult.status === "error" && finalResult.status === "success") {
        finalResult.status = "error";
        finalResult.error = photoResult.error;
        finalResult.errorCode = describeSyncFailure({ code: photoResult.errorCode }).code;
        finalResult.errorEndpoint = photoResult.errorEndpoint ?? "";
      }
      const summary = await updateSummary(userId);
      setState({
        ...initialState,
        ...summary,
        status: finalResult.status === "success" ? "success" : finalResult.status,
        sent: (finalResult.sent ?? 0) + (photoResult.uploaded ?? 0) + (photoResult.deleted ?? 0),
        applied: finalResult.applied ?? 0,
        conflicts: Math.max(finalResult.conflicts ?? 0, summary.conflicts),
        error: finalResult.error ?? "",
        errorCode: finalResult.errorCode ?? "",
        errorEndpoint: finalResult.errorEndpoint ?? summary.lastErrorEndpoint ?? "",
        lastResult: finalResult.status === "success" ? "success" : finalResult.status,
      });
      if ((result.applied ?? 0) > 0) window.dispatchEvent(new Event("chytnu:local-data-restored"));
    } catch (error) {
      const summary = await updateSummary(userId).catch(() => initialState);
      const failure = describeSyncFailure(error);
      reportSyncDiagnostic({ event: "pull-failed", ...failure });
      setState((previous) => ({ ...previous, ...summary, status: "error", error: failure.message, errorCode: failure.code }));
    } finally {
      runningRef.current = false;
      if (rerunRef.current) {
        const rerunForce = rerunForceRef.current;
        rerunRef.current = false;
        rerunForceRef.current = false;
        queueMicrotask(() => runSyncRef.current?.(rerunForce));
      }
    }
  }, [authStatus, updateSummary, userId]);

  runSyncRef.current = runSync;

  useEffect(() => {
    serviceRef.current = null;
    photoCloudServiceRef.current = null;
    photoCloudProviderRef.current = null;
    if (authStatus !== "ready" || !userId) {
      setState({ ...initialState, status: authStatus === "loading" ? "idle" : "signed-out" });
      return undefined;
    }
    void runSync();
    const retry = () => void runSync();
    const detachLifecycle = attachSyncLifecycle({ runSync: retry });
    window.addEventListener("chytnu:outbox-changed", retry);
    return () => {
      detachLifecycle();
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
  const backendMode = (() => { try { return getBackendConfiguration().mode; } catch { return "unavailable"; } })();
  const providerId = getPhotoCloudProvider()?.id ?? "none";
  return <SyncContext.Provider value={{ ...state, retry, backendMode, providerId, syncEnabled: Boolean(userId && authStatus === "ready") }}>{children}</SyncContext.Provider>;
}
