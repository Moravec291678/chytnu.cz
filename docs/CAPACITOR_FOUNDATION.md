# Capacitor Android foundation

## Compatibility audit

- The application is a React/Vite SPA. `npm run build` produces `dist/index.html`, which Capacitor can package using `webDir: "dist"`.
- Routing uses `BrowserRouter` and starts at `/`; this matches Capacitor's bundled `localhost` web origin.
- Firebase Auth and Firestore are configured by the existing Vite environment variables. Build the Android assets with the same Firebase project/mode used by the intended web deployment to use the same accounts and server data. Cloudinary remains behind the existing server capability/signing endpoints. No Firebase or photo schema was changed for Capacitor.
- Set `VITE_API_BASE_URL` to the existing HTTPS backend origin for a bundled native build. Browser builds continue using their current same-origin `/api/...` paths. The authenticated Cloudinary request body, token verification, local persistence and outbox have not changed.
- Firebase email/password auth uses the existing web SDK. Google popup/redirect sign-in and any external OAuth providers still need a native device smoke check; no native auth plugin was added.
- The PWA remains a separate browser install. Its offline service worker is not registered inside a native Capacitor runtime.
- Catch, photo, trip and notification local stores use IndexedDB/localStorage inside the active web origin. A native WebView has its own storage sandbox; local-only browser/guest records do not automatically migrate to the Android app. Signed-in data synchronized to the same Firebase project remains available after authentication.
- Add Catch now requests GPS through `src/platform/location/`; the adapter currently delegates to the Web Geolocation API. Other browser-only location screens can migrate to the same seam as native support is added. Native permission mediation and background location are not added in this foundation.
- Native push delivery, background trip activity, native permission screens and Android hardware verification are not included yet.

## Environment and commands

Capacitor 8 is configured for Node 22+. The current workspace has Node 22 and Java 21. Android Studio, Android SDK tools, an emulator/device bridge (`adb`) and SDK environment variables are absent, so this workspace cannot build or launch the generated Android project yet. Install Android Studio and an Android SDK (API 26 or newer per Capacitor's Android guide), then run:

```powershell
npm run build:android
npm run android:open
# Or with a connected device/emulator:
npm run android:run
```

Web/PWA development remains `npm run dev` and `npm run build`. Rebuild and sync after changing web assets. iOS is not generated on this Windows host.

## Platform adapters

`src/platform/` exposes runtime detection and web-compatible seams for notifications, location and active-trip activity. The active-trip activity and native notification adapters are intentionally no-ops until native plugin requirements and permission flows are designed. Web behaviors remain available independently of Capacitor.
