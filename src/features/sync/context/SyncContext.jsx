import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/context/authContextValue.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { createSyncPort } from "../data/syncPort.js";
import { createSyncService } from "../data/syncService.js";
import { readSyncSummary } from "../data/localSyncRepository.js";
import { describeSyncFailure } from "../data/syncDiagnostics.js";
import { catchRepository } from "../../catches/data/catchRepository.js";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { recordSyncedPhotoTraces } from "../../catches/data/photoUploadTrace.js";
import { createPhotoCloudService } from "../../catches/data/photoCloudService.js";
import { getPhotoCloudProvider } from "../../catches/data/photoCloudProvider.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";
import { SyncContext } from "./syncContextValue.js";
import { attachSyncLifecycle } from "./syncLifecycle.js";
import { getPullRetryAt, mergeSyncForce } from "./syncRetry.js";
import { preparePhotoSyncService } from "./photoSyncPreparation.js";

const initialState = { status: "idle", sent: 0, applied: 0, conflicts: 0, pending: 0, failed: 0, pullPending: 0, error: "", errorCode: "", errorEndpoint: "", nextRetryAt: null, lastResult: "never", showSyncStatus: false };

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function reportSyncDiagnostic(diagnostic) {
  let mode = "unknown";
  try { mode = getBackendConfiguration().mode; } catch { /* Auth reports invalid configuration separately. */ }
  if (!["emulator", "staging", "production"].includes(mode)) return;
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
  const deferredForceRef = useRef(false);
  const runSyncRef = useRef(null);
  const userId = user?.uid ?? null;

  const updateSummary = useCallback(async (ownerId) => {
    if (!ownerId) return { pending: 0, conflicts: 0, lastError: "", lastErrorCode: "", lastErrorEndpoint: "", nextRetryAt: null };
    return readSyncSummary(ownerId);
  }, []);

  const runSync = useCallback(async (force = false, manual = false) => {
    if (authStatus !== "ready" || !userId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      deferredForceRef.current = deferredForceRef.current || force;
      return;
    }
    force = mergeSyncForce(force, deferredForceRef.current);
    deferredForceRef.current = false;
    if (runningRef.current) {
      rerunRef.current = true;
      rerunForceRef.current = mergeSyncForce(rerunForceRef.current, force);
      if (manual) setState((previous) => ({ ...previous, showSyncStatus: true }));
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
    const startingSummary = await updateSummary(userId).catch(() => null);
    setState((previous) => ({ ...previous, ...(startingSummary ?? {}), status: "syncing",
      error: startingSummary?.pullErrorMessage || previous.error,
      errorCode: startingSummary?.pullErrorCode || previous.errorCode,
      showSyncStatus: manual || previous.status === "error" || previous.status === "offline"
        || (startingSummary?.pending ?? previous.pending) > 0 || (startingSummary?.pullPending ?? 0) > 0 }));
    try {
      if (!serviceRef.current) {
        const { createFirestoreSyncAdapter } = await import("../data/firestoreSyncAdapter.js");
        const port = createSyncPort(createFirestoreSyncAdapter({ onDiagnostic: reportSyncDiagnostic }));
        serviceRef.current = createSyncService({ port, getCurrentOwnerId: () => {
          try { return firebaseAuth.currentUserId(); } catch { return null; }
        }, onDiagnostic: reportSyncDiagnostic });
      }
      const photoCloudProvider = getPhotoCloudProvider();
      const photoService = await preparePhotoSyncService({
        serviceRef: photoCloudServiceRef,
        providerRef: photoCloudProviderRef,
        provider: photoCloudProvider,
        ownerId: userId,
        createService: (provider) => createPhotoCloudService({ provider, getCurrentOwnerId: () => {
          try { return firebaseAuth.currentUserId(); } catch { return null; }
        } }),
        });
      await photoService.normalizeLegacyPhotoIds(userId, { force });
      const result = await serviceRef.current.run(userId, { force });
      if (result.status === "error" && result.errorCode) reportSyncDiagnostic({ event: "pull-failed", code: result.errorCode,
        message: result.error, retryable: result.retryable, entityType: result.entityType ?? "sync",
        operation: result.operation ?? "pull", errorName: result.errorName ?? "Error", providerCode: result.providerCode ?? null,
        syncStage: result.syncStage ?? null, firestoreStage: result.firestoreStage ?? null });
      const hiddenBeforePhotoSync = typeof document !== "undefined" && document.visibilityState === "hidden";
      if (hiddenBeforePhotoSync) deferredForceRef.current = deferredForceRef.current || force;
      const photoResult = hiddenBeforePhotoSync
        ? { status: "deferred", uploaded: 0, deleted: 0, queued: 0 }
        : await photoService.run(userId, { force });
      if (photoResult.uploaded > 0) window.dispatchEvent(new Event("chytnu:local-data-restored"));
      const finalResult = photoResult.uploaded > 0
        ? await serviceRef.current.run(userId, { force })
        : result;
      // A successful aggregate run alone cannot prove a particular photo was acknowledged.
      await catchRepository.list({ ownerId: userId, scopeKey: accountScopeKey(userId) }).then((records) => {
        if (firebaseAuth.currentUserId() === userId) recordSyncedPhotoTraces(records);
      }).catch(() => {});
      if (photoResult.status === "error" && finalResult.status === "success") {
        finalResult.status = "error";
        finalResult.error = photoResult.error;
        finalResult.errorCode = describeSyncFailure({ code: photoResult.errorCode }).code;
        finalResult.errorEndpoint = photoResult.errorEndpoint ?? "";
      }
      const summary = await updateSummary(userId);
      const deferredPullFailure = summary.pullPending > 0;
      const finalStatus = finalResult.status === "success" && deferredPullFailure ? "error" : finalResult.status;
      const finalError = finalResult.error || (deferredPullFailure ? summary.pullErrorMessage : "");
      const finalErrorCode = finalResult.errorCode || (deferredPullFailure ? summary.pullErrorCode : "");
      const finalRetryable = finalResult.status === "error" ? finalResult.retryable !== false : summary.pullRetryable;
      const meaningful = manual || result.status === "error" || photoResult.status === "error"
        || (finalResult.sent ?? 0) > 0 || (finalResult.applied ?? 0) > 0
        || (photoResult.uploaded ?? 0) > 0 || (photoResult.deleted ?? 0) > 0
        || summary.pending > 0 || summary.failed > 0 || summary.pullPending > 0;
      setState({
        ...initialState,
        ...summary,
        status: finalStatus,
        sent: (finalResult.sent ?? 0) + (photoResult.uploaded ?? 0) + (photoResult.deleted ?? 0),
        applied: finalResult.applied ?? 0,
        conflicts: Math.max(finalResult.conflicts ?? 0, summary.conflicts),
        error: finalError,
        errorCode: finalErrorCode,
        errorEndpoint: finalResult.errorEndpoint ?? summary.lastErrorEndpoint ?? "",
        nextRetryAt: finalStatus === "error" ? summary.nextRetryAt ?? getPullRetryAt(finalRetryable) : summary.nextRetryAt,
        lastResult: finalStatus,
        showSyncStatus: finalStatus === "error" || finalStatus === "offline" || meaningful,
      });
      if ((result.applied ?? 0) > 0) window.dispatchEvent(new Event("chytnu:local-data-restored"));
    } catch (error) {
      const summary = await updateSummary(userId).catch(() => initialState);
      const failure = describeSyncFailure(error);
      reportSyncDiagnostic({ event: "pull-failed", ...failure });
      setState((previous) => ({ ...previous, ...summary, status: "error", error: failure.message,
        errorCode: failure.code, nextRetryAt: getPullRetryAt(failure.retryable) }));
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

  const retry = useCallback(() => runSync(true, true), [runSync]);
  const syncNow = useCallback(() => runSync(true, true), [runSync]);
  useEffect(() => {
    if (state.status !== "success" || !state.showSyncStatus) return undefined;
    const timer = window.setTimeout(() => setState((previous) => previous.status === "success"
      ? { ...previous, showSyncStatus: false } : previous), 3_500);
    return () => window.clearTimeout(timer);
  }, [state.status, state.showSyncStatus]);
  const backendMode = (() => { try { return getBackendConfiguration().mode; } catch { return "unavailable"; } })();
  const providerId = getPhotoCloudProvider()?.id ?? "none";
  return <SyncContext.Provider value={{ ...state, retry, syncNow, backendMode, providerId, syncEnabled: Boolean(userId && authStatus === "ready") }}>{children}</SyncContext.Provider>;
}
