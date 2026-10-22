import { useCallback, useEffect, useReducer, useRef } from "react";
import { CatchContext } from "./catchContextValue";
import { catchRepository, retainSessionPhotoBlob } from "../data/catchRepository";
import { useDataScope } from "../../auth/context/dataScopeContextValue.js";
import { getCatchRewardEventIds, progressionLedger } from "../../progression/data/progressionLedger.js";
import { preserveSyncedPhotoMetadata } from "../data/photoMetadata.js";
import { requestPhotoStorageDurability } from "../data/photoStorageDurability.js";
import { sha256Blob } from "../data/photoCloudProvider.js";
import { verifyPhotoBlobReadback } from "../data/photoLocalBlob.js";
import { recordPhotoUploadTrace } from "../data/photoUploadTrace.js";
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
        catches: [...state.catches, action.payload],
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
      dispatch({ type: "LOAD_CATCHES", payload: catches });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error.message || "Úlovky se nepodařilo načíst." });
    }
  }, [scope]);

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

  const createCatch = useCallback(async (record) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const storedRecord = await catchRepository.put(record, scope);
    await persistAndVerifyPhotos(record, storedRecord);
    if ((storedRecord.photos ?? []).some((photo) => photo.blob instanceof Blob)) void requestPhotoStorageDurability();
    const progression = await progressionLedger.reconcile(scope);
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "ADD_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return { record: storedRecord, progressionEventIds: getCatchRewardEventIds(progression.events, storedRecord.id) };
  }, [persistAndVerifyPhotos, scope]);
  const updateCatch = useCallback(async (record) => {
    if (scope.status !== "ready") throw new Error("Místní profil se ještě načítá.");
    const latestRecord = await catchRepository.get(record.id, scope);
    const safeRecord = latestRecord ? await preserveSyncedPhotoMetadata(record, latestRecord) : record;
    const storedRecord = await catchRepository.put(safeRecord, scope);
    await persistAndVerifyPhotos(safeRecord, storedRecord);
    if ((storedRecord.photos ?? []).some((photo) => photo.blob instanceof Blob)) void requestPhotoStorageDurability();
    await progressionLedger.reconcileCatch(storedRecord, scope);
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "UPDATE_CATCH", payload: storedRecord });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
    window.dispatchEvent(new Event("chytnu:progression-changed"));
    return storedRecord;
  }, [persistAndVerifyPhotos, scope]);
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
    if (activeScopeKey.current !== scope.scopeKey) return;
    dispatch({ type: "DELETE_CATCH", payload: id });
    window.dispatchEvent(new Event("chytnu:outbox-changed"));
  }, [scope]);

  return (
    <CatchContext.Provider value={{ state, dispatch, refresh, createCatch, updateCatch, toggleFavorite, deleteCatch }}>
      {children}
    </CatchContext.Provider>
  );
}
