import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'

function offlineShell() {
  return {
    name: 'chytnucz-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const generated = Object.values(bundle).map((item) => `/${item.fileName}`);
      const files = ['/', '/index.html', '/favicon.svg', '/icons.svg', '/manifest.webmanifest', ...generated];
      const version = createHash('sha256').update(generated.sort().join('|')).digest('hex').slice(0, 16);
      const source = `const CACHE = ${JSON.stringify(`chytnucz-shell-${version}`)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('chytnucz-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put('/index.html', copy)); return response; }).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.pathname.startsWith('/assets/') || ['/favicon.svg', '/icons.svg', '/manifest.webmanifest'].includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineShell()],
})
