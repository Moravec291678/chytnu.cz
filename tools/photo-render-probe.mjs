// Optional loopback-only rendering probe for synthetic emulator fixtures. It opens an isolated headless Chromium profile.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function openPhotoRenderProbe(executable) {
  if (!executable) return null;
  const ready = Promise.withResolvers();
  const pending = new Map();
  let stream;
  const server = createServer(async (request, response) => {
    if (request.url === "/events") {
      stream = response;
      stream.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
      stream.write(": ready\n\n"); ready.resolve(); return;
    }
    if (request.url === "/result" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) { body += chunk; if (body.length > 1024) { response.writeHead(413).end(); return; } }
      try { const result = JSON.parse(body); pending.get(result.id)?.resolve(result); } catch { response.writeHead(400).end(); return; }
      response.writeHead(204).end(); return;
    }
    if (request.url !== "/") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><body><script>
      new EventSource('/events').onmessage = async ({ data }) => {
        const { id, encoded, mimeType } = JSON.parse(data); const start = performance.now();
        const blob = new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: mimeType || 'image/png' });
        const image = new Image(); image.style.maxWidth = '90vw'; image.style.maxHeight = '90vh'; image.src = URL.createObjectURL(blob); document.body.append(image);
        try { await image.decode(); const decoded = performance.now();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const rect = image.getBoundingClientRect();
          await fetch('/result', {method:'POST',body:JSON.stringify({ id, decodeMs:decoded-start, frameMs:performance.now()-decoded,
            inViewport:rect.width>0 && rect.height>0 && rect.top>=0 && rect.bottom<=innerHeight, width:image.naturalWidth, height:image.naturalHeight })});
        } finally { URL.revokeObjectURL(image.src); image.remove(); }
      }; </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(join(tmpdir(), "chytnu-photo-probe-"));
  const child = spawn(executable, ["--headless", "--disable-extensions", "--disable-background-networking", "--no-first-run", `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/`], { windowsHide: true, stdio: "ignore" });
  child.once("error", ready.reject);
  const close = async () => {
    stream?.end(); server.closeAllConnections(); server.close();
    child.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }).catch(() => {});
  };
  async function bounded(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Synthetic Chromium probe timed out")), 15_000); })]); }
    finally { clearTimeout(timer); }
  }
  try { await bounded(ready.promise); } catch (error) { await close(); throw error; }
  return { close, async render(id, blob) {
    const result = Promise.withResolvers(); pending.set(id, result);
    try { stream.write(`data: ${JSON.stringify({ id, encoded: Buffer.from(await blob.arrayBuffer()).toString("base64"), mimeType: blob.type })}\n\n`); return await bounded(result.promise); }
    finally { pending.delete(id); }
  } };
}
