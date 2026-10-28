# Web Push foundation

The Notification Center can request a browser subscription only after the signed-in user presses **Zapnout oznámení**. It does not request permission during startup. On iOS/iPadOS the browser must expose Push API support and ChytnuCz must be launched as a Home Screen web app.

Configure `VITE_WEB_PUSH_PUBLIC_KEY` with the public VAPID application-server key to enable the CTA. This public key is expected in the browser bundle. Never use a `VITE_` variable for the VAPID private key. Subscription records live in `users/{uid}/pushSubscriptions/{sha256(endpoint)}` and Firestore rules restrict every operation to that authenticated owner. Updating a subscription upserts the endpoint and removes a rotated endpoint for the same installation. Expired subscriptions can be removed when the browser subscription is absent; a sender can call the owner-scoped invalid-endpoint cleanup after a provider reports an expired endpoint.

The generated offline service worker now handles `push` and `notificationclick` events. Its existing GET cache strategy is unchanged; non-GET requests, including photo POST transport, still bypass the cache.

This stage does not include server-side push delivery. There is no configured VAPID private key or authenticated delivery endpoint in the repository. Until an authenticated server sender is added, push subscriptions can be created and stored but no server can send them notifications. Any later delivery API must verify the Firebase ID token and derive the owner UID from that token; it must never accept an owner UID from an unauthenticated request. No billing or paid service is configured by this change.
