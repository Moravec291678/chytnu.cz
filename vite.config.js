import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

/* global process */

function appBuildId() {
  const deployed = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.VITE_BUILD_ID || process.env.VERCEL_DEPLOYMENT_ID;
  if (deployed) return deployed.slice(0, 12);
  try {
    const gitOptions = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], gitOptions).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], gitOptions).trim();
    return `${commit}${dirty ? '-dirty' : ''}`;
  }
  catch { return 'local'; }
}

function offlineShell() {
  return {
    name: 'chytnucz-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const generated = Object.values(bundle).map((item) => `/${item.fileName}`);
      const files = ['/', '/index.html', '/favicon.svg', '/icons.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', ...generated];
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
  if (url.pathname.startsWith('/assets/') || ['/favicon.svg', '/icons.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'].includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = typeof payload.title === 'string' && payload.title ? payload.title.slice(0, 120) : 'ChytnuCz';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 500) : '';
  const path = typeof payload.deepLink === 'string' && /^\\/[A-Za-z0-9/_?=&%#.-]*$/.test(payload.deepLink) ? payload.deepLink : '/notifications';
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', data: { deepLink: path } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.deepLink;
  const target = typeof path === 'string' && /^\\/[A-Za-z0-9/_?=&%#.-]*$/.test(path) ? new URL(path, self.location.origin).href : new URL('/notifications', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineShell()],
  define: { __APP_BUILD_ID__: JSON.stringify(appBuildId()) },
})
