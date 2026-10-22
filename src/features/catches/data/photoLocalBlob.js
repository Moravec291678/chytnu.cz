export const PHOTO_LOCAL_BLOB_UNREADABLE = "photo_local_blob_unreadable";

export function annotatePhotoBlobError(error, stage) {
  const failure = error && typeof error === "object" ? error : new Error("Fotografii se nepodařilo přečíst.", { cause: error });
  try { failure.photoStage = stage; } catch { /* Preserve the original platform exception. */ }
  if (failure.name === "NotFoundError") {
    try { failure.photoErrorCode = PHOTO_LOCAL_BLOB_UNREADABLE; } catch { /* Use the name if the platform exception is immutable. */ }
  }
  return failure;
}

export async function readPhotoBlob(blob, stage = "photo-read-local-blob") {
  try {
    return await blob.arrayBuffer();
  } catch (error) {
    throw annotatePhotoBlobError(error, stage);
  }
}

export async function verifyPhotoBlobReadback(sourceBlob, storedBlob, expectedHash, hashBlob) {
  const sourceBytes = await readPhotoBlob(sourceBlob, "photo-verify-source-bytes");
  const sourceHash = await hashBlob(new Blob([sourceBytes], { type: sourceBlob.type }));
  if (expectedHash && sourceHash !== expectedHash) throw Object.assign(new Error("Původní fotografie neodpovídá svému kontrolnímu součtu."), {
    code: "photo_content_mismatch", photoStage: "photo-verify-source-bytes",
  });
  const storedBytes = await readPhotoBlob(storedBlob, "photo-readback-local-blob");
  const storedHash = await hashBlob(new Blob([storedBytes], { type: storedBlob.type || sourceBlob.type }));
  if (storedHash !== sourceHash) throw Object.assign(new Error("Místní kopie fotografie neodpovídá uloženým bajtům."), {
    code: "photo_local_blob_readback_failed", photoStage: "photo-readback-local-blob",
  });
  return { hash: storedHash, size: storedBytes.byteLength };
}

export function photoBlobErrorCode(error) {
  return error?.name === "NotFoundError" || error?.photoErrorCode === PHOTO_LOCAL_BLOB_UNREADABLE || error?.code === PHOTO_LOCAL_BLOB_UNREADABLE
    ? PHOTO_LOCAL_BLOB_UNREADABLE : error?.code;
}
