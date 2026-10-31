/** Bound network waits; abort fetch before releasing the worker for reconciliation. */
export async function withPhotoDeadline(action, timeoutMs = 30_000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(action(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error("Požadavek fotografie překročil časový limit."), { code: "photo_cloud_timeout" }));
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
