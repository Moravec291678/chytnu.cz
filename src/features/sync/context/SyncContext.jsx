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
import { completedSyncState, SYNC_LIFECYCLE_STATE } from "../data/syncLifecycleState.js";
import { preparePhotoSyncService } from "./photoSyncPreparation.js";
import { serverProgressionClaimService } from "../../progression/data/serverProgressionClaimService.js";
import { userFacingErrorMessage } from "../../../shared/errors/userFacingError.js";

const initialState = { status: "idle", sent: 0, applied: 0, conflicts: 0, pending: 0, failed: 0, pullPending: 0, error: "", errorCode: "", errorEndpoint: "", nextRetryAt: null, lastResult: "never", showSyncStatus: false, presentationId: null };

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function reportSyncDiagnostic(diagnostic) {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("debug") !== "1") return;
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
      if (manual) setState((previous) => ({ ...previous, showSyncStatus: true, presentationId: Date.now() }));
      return;
    }
    if (!online()) {
      try {
        if (!photoCloudServiceRef.current) {
          const localPhotoProvider = getPhotoCloudProvider();
          await preparePhotoSyncService({ serviceRef: photoCloudServiceRef, providerRef: photoCloudProviderRef,
            provider: localPhotoProvider, ownerId: userId,
            createService: (provider) => createPhotoCloudService({ provider,
          onPhotoReady: async () => {
            await serviceRef.current?.run(userId);
            window.dispatchEvent(new Event("chytnu:local-data-restored"));
          }, getCurrentOwnerId: () => {
              try { return firebaseAuth.currentUserId(); } catch { return null; }
            } }),
          });
        }
        await photoCloudServiceRef.current?.reconcileLocalQueue(userId);
      } catch { /* Offline local Catch data remains durable; this pass only queues eligible photo work. */ }
      try {
        const summary = await updateSummary(userId);
        setState((previous) => ({ ...previous, ...summary, status: SYNC_LIFECYCLE_STATE.LOCAL_PENDING, error: "", showSyncStatus: false }));
      } catch (error) {
        setState((previous) => ({ ...previous, status: SYNC_LIFECYCLE_STATE.RETRY_WAIT, error: userFacingErrorMessage(error, "Místní frontu se nepodařilo načíst. Zkus synchronizaci znovu."), showSyncStatus: false }));
      }
      return;
    }
    runningRef.current = true;
    if (manual) {
      setState((previous) => ({ ...previous, status: "syncing", error: "", errorCode: "", errorEndpoint: "",
        nextRetryAt: null, showSyncStatus: true, presentationId: Date.now() }));
    }
    const startingSummary = await updateSummary(userId).catch(() => null);
    setState((previous) => ({ ...previous, ...(startingSummary ?? {}), status: "syncing", presentationId: Date.now(),
      error: "", errorCode: "", errorEndpoint: "",
      showSyncStatus: true }));
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
        createService: (provider) => createPhotoCloudService({ provider,
          onPhotoReady: async () => {
            await serviceRef.current?.run(userId);
            window.dispatchEvent(new Event("chytnu:local-data-restored"));
          }, getCurrentOwnerId: () => {
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
      await photoService.finalizeNativeUploads(userId).catch(() => {});
      void serverProgressionClaimService.process(userId).catch(() => {});
      // A successful aggregate run alone cannot prove a particular photo was acknowledged.
      await catchRepository.list({ ownerId: userId, scopeKey: accountScopeKey(userId) }).then((records) => {
        if (firebaseAuth.currentUserId() === userId) recordSyncedPhotoTraces(records);
      }).catch(() => {});
      if (photoResult.status === "error" && finalResult.status === "success") {
        finalResult.status = "error";
        finalResult.error = photoResult.error;
        const photoFailure = describeSyncFailure({ code: photoResult.errorCode });
        finalResult.errorCode = photoFailure.code;
        finalResult.retryable = photoFailure.retryable;
        finalResult.errorEndpoint = photoResult.errorEndpoint ?? "";
      }
      const summary = await updateSummary(userId);
      const finalError = finalResult.error || summary.pullErrorMessage || summary.lastError || photoResult.error || "";
      const finalErrorCode = finalResult.errorCode || summary.pullErrorCode || summary.lastErrorCode || photoResult.errorCode || "";
      const finalRetryable = finalResult.status === "error" ? finalResult.retryable !== false : summary.pullPending > 0 ? summary.pullRetryable : true;
      const finalStatus = completedSyncState({ result: finalResult, photoResult, summary, retryable: finalRetryable });
      setState({
        ...initialState,
        ...summary,
        status: finalStatus,
        sent: (finalResult.sent ?? 0) + (photoResult.uploaded ?? 0) + (photoResult.deleted ?? 0),
        applied: finalResult.applied ?? 0,
        conflicts: Math.max(finalResult.conflicts ?? 0, summary.conflicts),
        error: finalStatus === SYNC_LIFECYCLE_STATE.SYNCED ? "" : finalError,
        errorCode: finalStatus === SYNC_LIFECYCLE_STATE.SYNCED ? "" : finalErrorCode,
        errorEndpoint: finalResult.errorEndpoint ?? summary.lastErrorEndpoint ?? "",
        nextRetryAt: finalStatus === SYNC_LIFECYCLE_STATE.RETRY_WAIT ? summary.nextRetryAt ?? getPullRetryAt(true) : summary.nextRetryAt,
        lastResult: finalStatus,
        showSyncStatus: false,
      });
      if ((result.applied ?? 0) > 0) window.dispatchEvent(new Event("chytnu:local-data-restored"));
    } catch (error) {
      const summary = await updateSummary(userId).catch(() => initialState);
      const failure = describeSyncFailure(error);
      reportSyncDiagnostic({ event: "pull-failed", ...failure });
      setState((previous) => ({ ...previous, ...summary, status: failure.retryable ? SYNC_LIFECYCLE_STATE.RETRY_WAIT : SYNC_LIFECYCLE_STATE.USER_ACTION_REQUIRED,
        error: failure.message, errorCode: failure.code, nextRetryAt: failure.retryable ? getPullRetryAt(true) : null, showSyncStatus: false }));
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

  // Keep the presentation count current without changing sync scheduling or operation handling.
  useEffect(() => {
    if (state.status !== "syncing" || !state.showSyncStatus || !userId) return undefined;
    let active = true;
    let timer;
    const refreshProgress = async () => {
      const summary = await updateSummary(userId).catch(() => null);
      if (!active) return;
      if (summary) setState((previous) => previous.status === "syncing" ? { ...previous, ...summary } : previous);
      timer = window.setTimeout(refreshProgress, 10_000);
    };
    timer = window.setTimeout(refreshProgress, 2_000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [state.status, state.showSyncStatus, updateSummary, userId]);

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
    const detachLifecycle = attachSyncLifecycle({ runSync: retry, intervalMs: 0 });
    let disposed = false;
    let unsubscribe = null;
    let fallback = null;
    const startFallback = () => {
      if (!disposed && !fallback) fallback = attachSyncLifecycle({ runSync: retry });
    };
    import("../data/firestoreSyncAdapter.js").then(({ subscribeToOwnerSyncChanges }) => {
      if (!disposed) unsubscribe = subscribeToOwnerSyncChanges(userId, retry, startFallback);
    }).catch(startFallback);
    window.addEventListener("chytnu:outbox-changed", retry);
    window.addEventListener("chytnu:native-photo-upload-changed", retry);
    return () => {
      disposed = true;
      unsubscribe?.();
      fallback?.();
      detachLifecycle();
      window.removeEventListener("chytnu:outbox-changed", retry);
      window.removeEventListener("chytnu:native-photo-upload-changed", retry);
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
  const hideStatus = useCallback(() => setState((previous) => ({ ...previous, showSyncStatus: false })), []);
  const backendMode = (() => { try { return getBackendConfiguration().mode; } catch { return "unavailable"; } })();
  const providerId = getPhotoCloudProvider()?.id ?? "none";
  return <SyncContext.Provider value={{ ...state, retry, syncNow, hideStatus, backendMode, providerId, syncEnabled: Boolean(userId && authStatus === "ready") }}>{children}</SyncContext.Provider>;
}
