import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/context/authContextValue.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { createSyncPort } from "../data/syncPort.js";
import { createSyncService } from "../data/syncService.js";
import { readSyncSummary } from "../data/localSyncRepository.js";
import { describeSyncFailure } from "../data/syncDiagnostics.js";
import { catchRepository } from "../../catches/data/catchRepository.js";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { pendingPhotoAcknowledgments, recordSyncedPhotoTraces } from "../../catches/data/photoUploadTrace.js";
import { createPhotoCloudService } from "../../catches/data/photoCloudService.js";
import { getPhotoCloudProvider } from "../../catches/data/photoCloudProvider.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";
import { SyncContext } from "./syncContextValue.js";
import { readWithDeadline, createLatestSyncSnapshot } from "./syncRunGuard.js";
import { attachSyncLifecycle } from "./syncLifecycle.js";
import { finishSyncCycle, isSyncAuthError, manualSyncAllowed, nextSyncRetryAt } from "./syncRetry.js";
import { withAccountSyncLock, writeSyncControl } from "../data/syncControlRepository.js";
import { completedSyncState, SYNC_LIFECYCLE_STATE } from "../data/syncLifecycleState.js";
import { preparePhotoSyncService } from "./photoSyncPreparation.js";
import { serverProgressionClaimService } from "../../progression/data/serverProgressionClaimService.js";
import { publishNewSyncedCatches } from "../../social/data/automaticPublication.js";

const initialState = { status: "idle", sent: 0, applied: 0, conflicts: 0, pending: 0, failed: 0, pullPending: 0, error: "", errorCode: "", errorEndpoint: "", nextRetryAt: null, lastResult: "never", manualAttempts: 0, lastSuccessAt: null, retryAfterAt: null, photoPending: 0 };

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
  const [snapshot, setState] = useState(initialState);
  const serviceRef = useRef(null);
  const photoCloudServiceRef = useRef(null);
  const photoCloudProviderRef = useRef(null);
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const runSyncRef = useRef(null);
  const sessionRecoveryRef = useRef(false);
  const userId = user?.uid ?? null;
  const state = snapshot.ownerId === userId && authStatus === "ready" ? snapshot : initialState;
  const activeOwnerRef = useRef(userId);
  const snapshotsRef = useRef(createLatestSyncSnapshot());
  useLayoutEffect(() => {
    activeOwnerRef.current = authStatus === "ready" ? userId : null;
    snapshotsRef.current.invalidate();
  }, [authStatus, userId]);

  const updateSummary = useCallback(async (ownerId) => {
    if (!ownerId) return { pending: 0, conflicts: 0, lastError: "", lastErrorCode: "", lastErrorEndpoint: "", nextRetryAt: null };
    return readWithDeadline(() => readSyncSummary(ownerId));
  }, []);

  const runSync = useCallback(async (force = false, manual = false, recoveredSession = false) => {
    if (authStatus !== "ready" || !userId || globalThis.document?.visibilityState === "hidden") return;
    if (runningRef.current) {
      if (!manual) rerunRef.current = true;
      return;
    }
    runningRef.current = true;
    const isOwnerActive = () => activeOwnerRef.current === userId;
    const currentOwner = () => firebaseAuth.currentUserId();
    const getPhotoService = () => preparePhotoSyncService({
      serviceRef: photoCloudServiceRef, providerRef: photoCloudProviderRef,
      provider: getPhotoCloudProvider(), ownerId: userId, force,
      createService: provider => createPhotoCloudService({
        provider, getCurrentOwnerId: currentOwner,
        onPhotoReady: () => window.dispatchEvent(new Event("chytnu:local-data-restored")),
      }),
    });
    const ticket = snapshotsRef.current.next();
    const publish = (update) => setState(previous => {
      if (!isOwnerActive() || !snapshotsRef.current.current(ticket)) return previous;
      const current = previous.ownerId === userId ? previous : initialState;
      return { ...(typeof update === "function" ? update(current) : update), ownerId: userId };
    });
    let control = {};
    const applyOutcome = async (outcome, summary) => {
      if (!isOwnerActive()) return;
      const next = finishSyncCycle(control, outcome);
      await writeSyncControl(userId, next);
      publish(previous => ({
        ...previous, ...summary, ...next, ...outcome,
        retryAfterAt: next.retryAfterAt,
        nextRetryAt: nextSyncRetryAt(outcome.status, { ...summary, ...next, nextPhotoProbeAt: outcome.nextPhotoProbeAt }),
        lastResult: outcome.status,
      }));
    };
    try {
      const claimed = await withAccountSyncLock(userId, async () => {
        if (!isOwnerActive() || globalThis.document?.visibilityState === "hidden") return;
        if (!online()) {
          try { await (await getPhotoService()).reconcileLocalQueue(userId); }
          catch { /* The queue can be prepared again after reconnect. */ }
        }
        const startingSummary = await updateSummary(userId);
        control = startingSummary.control;
        const cachedStatus = control.status ?? (startingSummary.pending ? "local-pending" : "idle");
        const held = !manual && !recoveredSession && (Date.parse(control.retryAt) > Date.now() || control.paused);
        if (!online() || held || (manual && !manualSyncAllowed(control)) || control.retryAfterAt > Date.now()) {
          const status = online() ? cachedStatus : SYNC_LIFECYCLE_STATE.LOCAL_PENDING;
          publish(previous => ({ ...previous, ...startingSummary, ...control, status,
            nextRetryAt: online() ? nextSyncRetryAt(status, { ...startingSummary, ...control }) : null }));
          return;
        }
        if (manual && cachedStatus === "retry-wait") {
          control = { ...control, manualAttempts: (control.manualAttempts ?? 0) + 1 };
          await writeSyncControl(userId, control);
        }
        if (manual) window.dispatchEvent(new Event("chytnu:photo-delivery-retry"));
        publish(previous => ({ ...previous, ...startingSummary, ...control, status: "syncing", nextRetryAt: null }));
        if (manual && isSyncAuthError(control.errorCode)) {
          sessionRecoveryRef.current = true;
          try { await firebaseAuth.currentIdToken(true); }
          catch (error) {
            const code = error?.code === "auth/network-request-failed" ? "network" : "unauthenticated";
            const failure = describeSyncFailure({ code });
            await applyOutcome({ status: failure.retryable ? "retry-wait" : "user-action-required",
              errorCode: code, error: failure.message, backoff: failure.retryable, paused: !failure.retryable }, startingSummary);
            return;
          } finally { sessionRecoveryRef.current = false; }
        }
        if (!isOwnerActive()) return;
        if (!serviceRef.current) {
          const { createFirestoreSyncAdapter } = await import("../data/firestoreSyncAdapter.js");
          const port = createSyncPort(createFirestoreSyncAdapter({ onDiagnostic: reportSyncDiagnostic }));
          serviceRef.current = createSyncService({ port, getCurrentOwnerId: () => {
            try { return firebaseAuth.currentUserId(); } catch { return null; }
          }, onDiagnostic: reportSyncDiagnostic,
          onRemoteApplied: () => window.dispatchEvent(new Event("chytnu:local-data-restored")) });
        }
        const photoService = await getPhotoService();
        if (!isOwnerActive()) return;
        const metadataService = serviceRef.current;
        const result = await metadataService.run(userId, { force });
        if (result.status === "error" && result.errorCode) reportSyncDiagnostic({ event: "pull-failed", code: result.errorCode,
          message: result.error, retryable: result.retryable, entityType: result.entityType ?? "sync",
          operation: result.operation ?? "pull", errorName: result.errorName ?? "Error", providerCode: result.providerCode ?? null,
          syncStage: result.syncStage ?? null, firestoreStage: result.firestoreStage ?? null });
        if (!isOwnerActive()) return;
        const hiddenBeforePhotoSync = typeof document !== "undefined" && document.visibilityState === "hidden";
        const photoResult = hiddenBeforePhotoSync || ["permission_denied", "unauthenticated"].includes(result.errorCode)
          ? { status: "deferred", uploaded: 0, deleted: 0, queued: 0 }
          : await photoService.run(userId, { force });
        if (photoResult.uploaded > 0) window.dispatchEvent(new Event("chytnu:local-data-restored"));
        if (!isOwnerActive()) return;
        const finalResult = photoResult.uploaded > 0
          ? await metadataService.run(userId)
          : result;
        await photoService.finalizeNativeUploads(userId).catch(() => {});
        void serverProgressionClaimService.process(userId).catch(() => {});
        if (isOwnerActive()) void publishNewSyncedCatches(userId);
        // A successful aggregate run alone cannot prove a particular photo was acknowledged.
        const pendingAcks = pendingPhotoAcknowledgments();
        if (pendingAcks.size) {
          await catchRepository.list({ ownerId: userId, scopeKey: accountScopeKey(userId) }).then((records) => {
            if (firebaseAuth.currentUserId() === userId) recordSyncedPhotoTraces(records, pendingAcks);
          }).catch(() => {});
        }
        if (photoResult.status === "error" && finalResult.status === "success") {
          finalResult.status = "error";
          const photoFailure = describeSyncFailure({ code: photoResult.errorCode, status: photoResult.httpStatus,
            retryable: photoResult.retryable, retryAfterAt: photoResult.retryAfterAt });
          finalResult.error = photoFailure.message;
          finalResult.retryAfterAt = photoFailure.retryAfterAt;
          finalResult.errorCode = photoFailure.code;
          finalResult.retryable = photoFailure.retryable;
          finalResult.errorEndpoint = photoResult.errorEndpoint ?? "";
        }
        const summary = await updateSummary(userId);
        const finalErrorCode = summary.attentionErrorCode || (summary.pullPending > 0 && !summary.pullRetryable ? summary.pullErrorCode : "")
          || finalResult.errorCode || summary.pullErrorCode || summary.lastErrorCode || "";
        const failure = describeSyncFailure({ code: finalErrorCode });
        const finalRetryable = finalResult.status === "error" ? finalResult.retryable !== false : summary.pullPending > 0 ? summary.pullRetryable : true;
        const finalStatus = completedSyncState({ result: finalResult, photoResult, summary, retryable: finalRetryable });
        const rootFailure = finalResult.status === "error" && finalResult.operation === "pull";
        await applyOutcome({
          status: finalStatus,
          sent: (finalResult.sent ?? 0) + (photoResult.uploaded ?? 0) + (photoResult.deleted ?? 0),
          applied: finalResult.applied ?? 0,
          conflicts: Math.max(finalResult.conflicts ?? 0, summary.conflicts),
          error: finalErrorCode ? failure.message : "",
          errorCode: finalErrorCode ? failure.code : "",
          errorEndpoint: finalResult.errorEndpoint || summary.lastErrorEndpoint || "",
          retryAfterAt: Math.max(finalResult.retryAfterAt ?? 0, photoResult.retryAfterAt ?? 0),
          nextPhotoProbeAt: photoResult.nextPhotoProbeAt,
          backoff: (rootFailure || photoResult.preflightFailed) && finalRetryable,
          paused: rootFailure && !finalRetryable,
        }, summary);
      });
      if (claimed === false) {
        const summary = await updateSummary(userId);
        publish(previous => ({ ...previous, ...summary, ...summary.control, status: "paused",
          nextRetryAt: new Date(Date.now() + 10_000).toISOString() }));
      }
    } catch (error) {
      const summary = await updateSummary(userId).catch(() => ({}));
      const failure = describeSyncFailure(error);
      reportSyncDiagnostic({ event: "pull-failed", ...failure });
      const status = failure.retryable ? SYNC_LIFECYCLE_STATE.RETRY_WAIT : SYNC_LIFECYCLE_STATE.USER_ACTION_REQUIRED;
      const outcome = { status, error: failure.message, errorCode: failure.code, backoff: failure.retryable };
      const next = finishSyncCycle(control, outcome);
      publish(previous => ({ ...previous, ...summary, ...next,
        nextRetryAt: nextSyncRetryAt(status, { ...summary, ...next }) }));
    } finally {
      runningRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        queueMicrotask(() => runSyncRef.current?.());
      } else if (!isOwnerActive()) {
        queueMicrotask(() => runSyncRef.current?.());
      }
    }
  }, [authStatus, updateSummary, userId]);

  // Keep the presentation count current without changing sync scheduling or operation handling.
  useEffect(() => {
    if (state.status !== "syncing" || !userId) return undefined;
    let active = true;
    let timer;
    const refreshProgress = async () => {
      const summary = await updateSummary(userId).catch(() => null);
      if (!active || activeOwnerRef.current !== userId) return;
      if (summary) setState((previous) => previous.status === "syncing" ? { ...previous, ...summary } : previous);
      timer = window.setTimeout(refreshProgress, 10_000);
    };
    timer = window.setTimeout(refreshProgress, 2_000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [state.status, updateSummary, userId]);

  useLayoutEffect(() => { runSyncRef.current = runSync; }, [runSync]);

  useEffect(() => {
    serviceRef.current = null;
    photoCloudServiceRef.current = null;
    photoCloudProviderRef.current = null;
    if (authStatus !== "ready" || !userId) return undefined;
    void runSync();
    const retry = () => void runSync();
    const detachLifecycle = attachSyncLifecycle({
      runSync: () => {
        window.dispatchEvent(new Event("chytnu:photo-delivery-retry"));
        void runSync();
      },
      intervalMs: 0,
    });
    let disposed = false;
    let unsubscribe = null;
    let fallback = null;
    const startFallback = () => {
      if (!disposed && !fallback) fallback = attachSyncLifecycle({ runSync: retry, listenEvents: false });
    };
    import("../data/firestoreSyncAdapter.js").then(({ subscribeToOwnerSyncChanges }) => {
      if (!disposed) unsubscribe = subscribeToOwnerSyncChanges(userId, retry, startFallback);
    }).catch(startFallback);
    let observedToken = false;
    const detachToken = firebaseAuth.observeToken(async current => {
      const initial = !observedToken;
      observedToken = true;
      if (initial || disposed || sessionRecoveryRef.current || current?.uid !== userId) return;
      const summary = await updateSummary(userId).catch(() => null);
      if (!disposed && isSyncAuthError(summary?.control?.errorCode)) void runSync(true, false, true);
    });
    window.addEventListener("offline", retry);
    window.addEventListener("chytnu:photo-metadata-refresh", retry);
    window.addEventListener("chytnu:outbox-changed", retry);
    window.addEventListener("chytnu:native-photo-upload-changed", retry);
    return () => {
      disposed = true;
      unsubscribe?.();
      fallback?.();
      detachLifecycle();
      detachToken();
      window.removeEventListener("offline", retry);
      window.removeEventListener("chytnu:photo-metadata-refresh", retry);
      window.removeEventListener("chytnu:outbox-changed", retry);
      window.removeEventListener("chytnu:native-photo-upload-changed", retry);
    };
  }, [authStatus, runSync, updateSummary, userId]);

  useEffect(() => {
    if (!userId || !online() || state.status === "syncing" || !state.nextRetryAt) return undefined;
    const delay = Math.max(1_000, Date.parse(state.nextRetryAt) - Date.now());
    const timer = window.setTimeout(() => void runSync(), Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [runSync, state.nextRetryAt, state.status, userId]);

  const retry = useCallback(() => runSync(true, true), [runSync]);

  const backendMode = (() => { try { return getBackendConfiguration().mode; } catch { return "unavailable"; } })();
  const providerId = getPhotoCloudProvider()?.id ?? "none";
  return <SyncContext.Provider value={{ ...state, ownerId: userId, retry, syncNow: retry, backendMode, providerId, syncEnabled: Boolean(userId && authStatus === "ready") }}>{children}</SyncContext.Provider>;
}
