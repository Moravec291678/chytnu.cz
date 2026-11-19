# ChytnuCz — canonical route map

Audit baseline: 2026-11-20. This map reflects `src/app/App.jsx` and navigation links in the current source. Feature-flagged routes are explicitly marked; legacy URLs remain supported.

## Primary navigation

| Section | Entry route | Related routes |
| --- | --- | --- |
| Domů | `/` | `/fish-activity`, `/insights`, `/season-story`, `/year-summary` |
| Deník | `/journal` | Visible section links: `/trips`, `/gallery`, `/stats`, `/journal/calendar`, `/journal/map`. Catch flows: `/add`, `/catch/:id`, `/catch/:id/edit`, `/catch/:id/reward`, `/catch/:id/share`. Reference pages: `/map`, `/album`, `/species/:speciesKey`, `/species/:speciesKey/mastery` |
| Komunita | `/community` | `/community/post/:postId`, `/community/catch/:catchId`, `/community/:postId/report`, `/friends`, `/community/find` (feature flag), `/nearby`, `/crew`, `/waters/:waterId/chat` |
| Profil | `/profile` | `/profile/social` and `/u/:identity` (public profiles feature flag), `/settings`, `/privacy`, `/notifications`, `/achievements`, `/levels`, `/challenges`, `/streak`, `/supporter` (feature flag), `/admin/*` (server-authorized) |
| Quick Catch | `/add` | Persistent central action, independent of the four sections |

## Other routes

- Account/legal: `/login`, `/onboarding`, `/privacy-policy`, `/terms`.
- Waters: `/waters`, `/waters/catalogue`, `/waters/catalogue/:catalogueId`, `/waters/new`, `/waters/:waterId`, `/waters/:waterId/edit`.
- Not found: `*`.

## Findings and decisions

- Before this audit, the bottom bar exposed Domů, Deník, Quick Catch, Vycházky and Profil; Komunita was only reachable from Home/profile links. It now exposes the requested four sections plus the central Quick Catch action. Community subroutes share its active state.
- Trips retain all existing `/trips/*` URLs and are reachable from the Journal's section tabs; no data or route migration is needed.
- Gallery, stats, species, calendar, map and progression pages remain available through their existing parent section entry points. Profile retains shortcuts to personal reports and progression.
- The app already has both `/map` and `/journal/map` and both `/map` and `/journal/map` render the map page. They are retained for compatibility; future cleanup requires caller/deep-link verification.
- Admin, social, water chat, public profile, and other feature-gated destinations remain governed by their existing feature flags and access controls. This navigation change does not loosen route guards.
- Stage 1 scope is an inventory and safe organization decision, not route deletion. No route was identified as safe to remove based solely on static inspection.

## Verification limits

This is a source-based route and link audit. The local Home page was opened in the browser and showed all four destinations plus Quick Catch. Structural tests verify Community navigation, active-route grouping, and the Journal-to-Trips link. `node --test src/features/catches/data/catchGallery.test.js` passed 19/19; the full `npm test` suite passed 1,167/1,167; `npm run lint`, `npm run build` (including the Cloudinary client-secret scan), `npm run product`, and `git diff --check` passed. An existing Vite chunk-size warning remains.

The browser observation used its default desktop viewport; authenticated production behavior, analytics-based route usage, narrow-width checks after this edit, and physical-device navigation were not asserted here. Stage 1 is complete; visual/responsive acceptance for Stage 2/3 remains pending.
