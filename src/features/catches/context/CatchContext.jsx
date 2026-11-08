import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createQuickCapture, prepareQuickCatch, persistQuickCatch, quickCaptureError, wasQuickCatchPersisted } from "../data/quickCatch.js";
import { subscribeQuickCaptureInvalidation } from "../data/quickCaptureLifecycle.js";
import { createQuickCatchEnrichmentCoordinator } from "../data/quickCatchEnrichment.js";
import { QUICK_CATCH_FEATURES } from "../../../product/config/quickCatchFlags.js";
import { CatchContext } from "./catchContextValue";
import { catchRepository, retainSessionPhotoBlob } from "../data/catchRepository";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { getCatchRewardEventIds, progressionLedger } from "../../progression/data/progressionLedger.js";
import { serverProgressionClaimRepository } from "../../progression/data/serverProgressionClaimRepository.js";
import { preserveSyncedPhotoMetadata } from "../data/photoMetadata.js";
import { requestPhotoStorageDurability } from "../data/photoStorageDurability.js";
import { sha256Blob } from "../data/photoCloudProvider.js";
import { verifyPhotoBlobReadback } from "../data/photoLocalBlob.js";
import { userFacingErrorMessage } from "../../../shared/errors/userFacingError.js";
import { recordPhotoUploadTrace } from "../data/photoUploadTrace.js";
import { createAiClient, AI_CONSENT_CHANGED_EVENT } from "../../ai/aiClient.js";
import { createAutomaticSpeciesCoordinator, readAutomaticSpecies, AUTOMATIC_SPECIES_CHANGED } from "../../ai/automaticSpecies.js";
import { privacyRepository } from "../../privacy/data/privacyRepository.js";
const initialState = {
  catches: [],
  sortBy: "vse",
  loading: true,
  error: "",
};

function catchReducer(state, action) {
  switch (action.type) {
    case "LOAD_CATCHES":
      return { ...state, catches: action.payload, loading: false, error: "" };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "RESET_SCOPE":
      return { ...initialState };
    case "ADD_CATCH":
      return {
        ...state,
        error: "",
        catches: [...state.catches.filter(item => item.id !== action.payload.id), action.payload],
      };
    case "DELETE_CATCH":
      return {
        ...state,
        error: "",
        catches: state.catches.filter((item) => item.id !== action.payload),
      };
    case "UPDATE_CATCH":
      return {
        ...state,
        error: "",
        catches: state.catches.map((item) => item.id === action.payload.id ? action.payload : item),
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
export function CatchProvider({ children }) {
  const [state, dispatch] = useReducer(catchReducer, initialState);
  const scope = useDataScope();
  const activeScopeKey = useRef(null);
  const pendingQuickCapture = useRef(null);
  const quickSaving = useRef(false);
  const completedQuickFiles = useRef(new WeakSet());
  const [quickCaptureState, setQuickCaptureState] = useState({ status: "idle" });
  const persistAndVerifyPhotos = useCallback(async (record, storedRecord) => {
    for (const photo of record.photos ?? []) {
      if (!(photo.blob instanceof Blob)) continue;
      try {
        const readback = await catchRepository.get(record.id, scope);
        const storedPhoto = readback?.photos?.find((item) => item.id === photo.id);
        if (!(storedPhoto?.blob instanceof Blob)) throw Object.assign(new Error("Fotografii se po uložení nepodařilo znovu načíst."), {
          name: "NotFoundError", code: "photo_local_blob_unreadable", photoStage: "photo-readback-local-blob",
        });
        const expectedHash = photo.contentSha256 || await sha256Blob(photo.blob);
        const verified = await verifyPhotoBlobReadback(photo.blob, storedPhoto.blob, expectedHash, sha256Blob);
        recordPhotoUploadTrace(photo.id, "indexeddb_saved", { bytes: verified.size, mimeType: photo.type || photo.blob.type });
        await catchRepository.setPhotoLocalError?.(record.id, photo.id, null, scope);
      } catch (error) {
        retainSessionPhotoBlob(scope.scopeKey, record.id, photo.id, photo.blob);
        recordPhotoUploadTrace(photo.id, "local_blob_failure", { errorCode: error.code === "photo_local_blob_unreadable" || error.name === "NotFoundError"
          ? "photo_local_blob_unreadable" : error.code, errorName: error.name,
        operationStage: error.photoStage || "photo-readback-local-blob", retryable: false });
        await catchRepository.setPhotoLocalError?.(record.id, photo.id, { code: error.code === "photo_local_blob_unreadable" || error.name === "NotFoundError"
          ? "photo_local_blob_unreadable" : "photo_local_blob_readback_failed", errorName: error.name,
        stage: error.photoStage || "photo-readback-local-blob" }, scope).catch(() => {});
      }
    }
    return storedRecord;
  }, [scope]);
  const refresh = useCallback(async () => {
    if (scope.status !== "ready") return;
    const requestedScopeKey = scope.scopeKey;
    try {
      const catches = await catchRepository.list(scope);
      if (activeScopeKey.current !== requestedScopeKey) return;
      if (catches.some((record) => (record.photos ?? []).some((photo) => photo.blob instanceof Blob))) {
        void requestPhotoStorageDurability();
      }
      catches.sort((a, b) => new Date(b.caughtAt) - new Date(a.caughtAt));
      const displayed = await readAutomaticSpecies(catches, scope).catch(() => catches);
      if (activeScopeKey.current !== requestedScopeKey) return;
      dispatch({ type: "LOAD_CATCHES", payload: displayed });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: userFacingErrorMessage(error, "Úlovky se nepodařilo načíst. Zkus to znovu.") });
    }
  }, [scope]);

  const saveQuickCapture = useCallback(async (file, inputSource, context = {}) => {
    if (!QUICK_CATCH_FEATURES.capture) return;
    if (quickSaving.current) return;
    if (scope.status !== "ready") return;
    if (file && completedQuickFiles.current.has(file)) return;
    let pending = pendingQuickCapture.current;
    if (pending && pending.scope.scopeKey !== scope.scopeKey) {
      setQuickCaptureState({ status: "error", error: "Fotografie patří k předchozímu profilu. Vrať se do něj a zopakuj uložení." });
      return;
    }
    if (file && pending && file !== pending.file) {
      // Explicitly selecting a replacement keeps the old photo until a new one is returned.
      pending = null;
    }
    if (!pending) {
      if (!file) return;
      pending = { file, capture: createQuickCapture(inputSource), scope, context };
      pendingQuickCapture.current = pending;
    }
    quickSaving.current = true;
    setQuickCaptureState({ status: "saving" });
    try {
      if (!Object.hasOwn(pending.scope, "quickCaptureGeneration")) {
        pending.scope = { ...pending.scope, quickCaptureGeneration: await catchRepository.getQuickCaptureGeneration(pending.scope) };
      }
      if (!pending.record) {
        const privacyDefaults = await privacyRepository.get(pending.scope).catch(() => null);
        pending.record = await prepareQuickCatch(pending.file, pending.capture, { ...pending.context, ownerId: pending.scope.ownerId, privacyDefaults });
      }
      if (pendingQuickCapture.current !== pending) return;
      await persistQuickCatch(pending.record, pending.scope, catchRepository);
      if (pendingQuickCapture.current !== pending) return;
      completedQuickFiles.current.add(pending.file);
      pendingQuickCapture.current = null;
      // Local durability is the entire success gate. Network and rewards are independent.
      if (activeScopeKey.current === pending.scope.scopeKey) {
        setQuickCaptureState({ status: "saved", id: pending.record.id });
        await refresh();
      }
      window.dispatchEvent(new Event("chytnu:outbox-changed"));
      void requestPhotoStorageDurability();
      void progressionLedger.reconcile(pending.scope).then(() => {
        window.dispatchEvent(new Event("chytnu:progression-changed"));
      }).catch(() => {});
    } catch (error) {
      if (pendingQuickCapture.current === pending) setQuickCaptureState({ status: "error", error: quickCaptureError(error),
        canReplace: !pending.record || !wasQuickCatchPersisted(pending.record) });
    } finally {
      quickSaving.current = false;
      if (pending.cancelled && activeScopeKey.current === pending.scope.scopeKey) setQuickCaptureState({ status: "idle" });
    }
  }, [scope, refresh]);

  useEffect(() => {
    if (scope.status !== "ready" || !scope.ownerId) return undefined;
    const client = createAiClient({ ownerId: scope.ownerId });
    const start = () => createAutomaticSpeciesCoordinator({ scope, repository: catchRepository, client,
      changed: () => window.dispatchEvent(new Event(AUTOMATIC_SPECIES_CHANGED)) });
    let coordinator = start();
    const run = () => { if (document.visibilityState !== "hidden") void coordinator.run(); };
    const consentChanged = () => { coordinator.stop(); coordinator = start(); run(); };
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("chytnu:outbox-changed", run);
    window.addEventListener("chytnu:local-data-restored", run);
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, consentChanged);
    window.addEventListener(AUTOMATIC_SPECIES_CHANGED, refresh);
    run();
    return () => {
      coordinator.stop();
      window.removeEventListener("online", run); window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("chytnu:outbox-changed", run);
      window.removeEventListener("chytnu:local-data-restored", run);
      window.removeEventListener(AI_CONSENT_CHANGED_EVENT, consentChanged);
      window.removeEventListener(AUTOMATIC_SPECIES_CHANGED, refresh);
    };
  }, [scope, refresh]);

  useEffect(() => {
    const invalidate = scopeKey => {
      if (pendingQuickCapture.current?.scope.scopeKey === scopeKey) {
        pendingQuickCapture.current.cancelled = true;
        pendingQuickCapture.current = null;
      }
      if (scope.scopeKey === scopeKey) setQuickCaptureState({ status: quickSaving.current ? "canceling" : "idle" });
    };
    return subscribeQuickCaptureInvalidation(invalidate);
  }, [scope.scopeKey]);

  useEffect(() => {
    activeScopeKey.current = scope.status === "ready" ? scope.scopeKey : null;
    dispatch({ type: "RESET_SCOPE" });
    if (scope.status !== "ready") return undefined;
    refresh();
    window.addEventListener("chytnu:local-data-restored", refresh);
    return () => {
      window.removeEventListener("chytnu:local-data-restored", refresh);
      if (activeScopeKey.current === scope.scopeKey) activeScopeKey.current = null;
    };
  }, [refresh, scope.status, scope.scopeKey]);

  useEffect(() => {
    if (scope.status !== "ready" || !QUICK_CATCH_FEATURES.metadata) return undefined;
    const coordinator = createQuickCatchEnrichmentCoordinator({ repository: catchRepository, scope,
      applyPatch: catchRepository.patchQuickCatchEnrichment,
      onChange: () => {
        void refresh();
        window.dispatchEvent(new Event("chytnu:outbox-changed"));
      } });
    const run = async () => {
      try { await coordinator.run(await catchRepository.listMetadata(scope)); } catch { /* Retry on next app wake. */ }
    };
    void run();
    const timer = window.setInterval(run, 30_000);
    window.addEventListener("online", run);
    window.addEventListener("chytnu:outbox-changed", run);
    return () => {
      coordinator.dispose();
      window.clearInterval(timer);
      window.removeEventListener("online", run);
      window.removeEventListener("chytnu:outbox-changed", run);
    };
  }, [scope, refresh]);

  const createCatch = useCallback(async (record) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const storedRecord = await catchRepository.put(record, scope);
    if (storedRecord.ownerId) await serverProgressionClaimRepository.enqueue(storedRecord.id, {
      ownerId: storedRecord.ownerId, scopeKey: scope.scopeKey,
    }).catch(() => {});
    await persistAndVerifyPhotos(record, storedRecord);
    if ((storedRecord.photos ?? []).some((photo) => photo.blob instanceof Blob)) void requestPhotoStorageDurability();
    const progression = await progressionLedger.reconcile(scope);
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "ADD_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return { record: storedRecord, progressionEventIds: getCatchRewardEventIds(progression.events, storedRecord.id) };
  }, [persistAndVerifyPhotos, scope]);
  const updateCatch = useCallback(async (record, { expectedRevision, expectedServerRevision } = {}) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const latestRecord = await catchRepository.get(record.id, scope);
    const safeRecord = latestRecord ? await preserveSyncedPhotoMetadata(record, latestRecord) : record;
    const storedRecord = await catchRepository.put(safeRecord, expectedRevision === undefined ? scope
      : { ...scope, expectedRevision, expectedServerRevision });
    if (storedRecord.ownerId) await serverProgressionClaimRepository.enqueue(storedRecord.id, {
      ownerId: storedRecord.ownerId, scopeKey: scope.scopeKey,
    }).catch(() => {});
    await persistAndVerifyPhotos(safeRecord, storedRecord);
    if ((storedRecord.photos ?? []).some((photo) => photo.blob instanceof Blob)) void requestPhotoStorageDurability();
    await progressionLedger.reconcileCatch(storedRecord, scope);
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "UPDATE_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return storedRecord;
  }, [persistAndVerifyPhotos, scope]);
  const approveAiStoryDraft = useCallback(async (id, draft) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const storedRecord = await catchRepository.approveAiStoryDraft(id, draft, scope);
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "UPDATE_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    return storedRecord;
  }, [scope]);
  const toggleFavorite = useCallback(async (id) => {
    const record = state.catches.find((item) => item.id === id);
    if (!record) throw new Error("Úlovek už není dostupný. Obnov deník a zkus to znovu.");
    const latestRecord = await catchRepository.get(id, scope);
    const safeRecord = latestRecord ? await preserveSyncedPhotoMetadata(record, latestRecord) : record;
    const storedRecord = await catchRepository.put({
      ...safeRecord,
      isFavorite: !record.isFavorite,
      sync: {
        ...(safeRecord.sync ?? {}),
        status: "local",
        revision: (record.sync?.revision ?? 0) + 1,
      },
    }, scope);
    await progressionLedger.reconcileCatch(storedRecord, scope);
    if (activeScopeKey.current !== scope.scopeKey) return storedRecord;
    dispatch({ type: "UPDATE_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return storedRecord;
  }, [scope, state.catches]);
  const deleteCatch = useCallback(async (id) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    await catchRepository.delete(id, scope);
    if (scope.ownerId) await serverProgressionClaimRepository.remove(id, scope.ownerId).catch(() => {});
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "DELETE_CATCH", payload: id });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
  }, [scope]);

  return (
    <CatchContext.Provider value={{ state, dispatch, refresh, createCatch, updateCatch, approveAiStoryDraft, toggleFavorite, deleteCatch, quickCaptureState, saveQuickCapture }}>
      {children}
    </CatchContext.Provider>
  );
}
