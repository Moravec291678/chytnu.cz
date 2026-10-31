/** Reset only on increasing transferred bytes, with an absolute upper bound. */
export function uploadPhotoWithProgress({ url, form, createRequest = () => new XMLHttpRequest(),
  idleMs = 60_000, maximumMs = 10 * 60_000,
  schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout }) {
  return new Promise((resolve, reject) => {
    const request = createRequest();
    let idleTimer;
    let maximumTimer;
    let settled = false;
    let uploaded = 0;
    let downloaded = 0;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      cancel(idleTimer);
      cancel(maximumTimer);
      request.onload = request.onerror = request.onabort = request.onprogress = null;
      request.upload.onprogress = null;
      if (error) reject(error); else resolve(result);
    };
    const timeout = () => {
      finish(Object.assign(new Error("Přenos fotografie překročil časový limit."), { code: "photo_cloud_timeout" }));
      request.abort();
    };
    const resetIdle = () => { cancel(idleTimer); idleTimer = schedule(timeout, idleMs); };
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      if (event.loaded > uploaded) { uploaded = event.loaded; resetIdle(); }
    };
    request.onprogress = (event) => {
      if (event.loaded > downloaded) { downloaded = event.loaded; resetIdle(); }
    };
    request.onload = () => {
      let body;
      try { body = JSON.parse(request.responseText); } catch { body = {}; }
      finish(null, { state: request.status >= 200 && request.status < 300 ? "completed" : "failed_retryable",
        httpStatus: request.status, body });
    };
    request.onerror = request.onabort = () => finish(Object.assign(new Error("Přenos fotografie byl přerušen."), { code: "cloudinary_network_error" }));
    resetIdle();
    maximumTimer = schedule(timeout, maximumMs);
    try { request.send(form); } catch (error) { finish(error); }
  });
}
