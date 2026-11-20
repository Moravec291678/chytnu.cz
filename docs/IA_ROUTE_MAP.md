# ChytnuCz — canonical route map

Audit baseline: 2026-11-20. This map reflects `src/app/App.jsx` and navigation links in the current source. Feature-flagged routes are explicitly marked; legacy URLs remain supported.

## Primary navigation

| Section | Entry route | Related routes |
| --- | --- | --- |
| Domů | `/` | `/fish-activity`, `/insights`, `/season-story`, `/year-summary` |
| Deník | `/journal` | Visible section links: `/trips`, `/gallery`, `/stats`, `/journal/calendar`, `/journal/map`. Catch flows: `/add`, `/catch/:id`, `/catch/:id/edit`, `/catch/:id/reward`, `/catch/:id/share`. Reference pages: `/map`, `/album`, `/species/:speciesKey`, `/species/:speciesKey/mastery`, `/insights`, `/season-story`, `/year-summary` |
| Komunita | `/community` | `/community/post/:postId`, `/community/catch/:catchId`, `/community/:postId/report`, `/u/:identity` (public profile feature flag), `/friends`, `/community/find` (feature flag), `/nearby`, `/crew`, `/waters/:waterId/chat` |
| Profil | `/profile` | `/waters` and non-chat `/waters/*`, `/profile/social` (public profiles feature flag), `/settings`, `/privacy`, `/notifications`, `/achievements`, `/levels`, `/challenges`, `/streak`, `/supporter` (feature flag), `/admin/*` (server-authorized) |
| Quick Catch | `/add` | Persistent central action, independent of the four sections |

## Other routes

- Account/legal: `/login`, `/onboarding`, `/privacy-policy`, `/terms`.
- Waters chat is listed under Komunita; other water management/catalogue routes are grouped with Profil, which currently owns the "Moje revíry" entry.
- Not found: `*`.

## Findings and decisions

- Before this audit, the bottom bar exposed Domů, Deník, Quick Catch, Vycházky and Profil; Komunita was only reachable from Home/profile links. It now exposes the requested four sections plus the central Quick Catch action. Community subroutes share its active state.
- Trips retain all existing `/trips/*` URLs and are reachable from the Journal's section tabs; no data or route migration is needed.
- Gallery, stats, species, calendar, map and progression pages remain available through their existing parent section entry points. Profile retains shortcuts to personal reports and progression.
- The app already has both `/map` and `/journal/map` and both `/map` and `/journal/map` render the map page. They are retained for compatibility; future cleanup requires caller/deep-link verification.
- Admin, social, water chat, public profile, and other feature-gated destinations remain governed by their existing feature flags and access controls. This navigation change does not loosen route guards.
- Stage 1 scope is an inventory and safe organization decision, not route deletion. No route was identified as safe to remove based solely on static inspection.

## Verification limits

This is a source-based route and link audit. The local Home page was opened in the browser and showed all four destinations plus Quick Catch. Structural tests verify Community navigation, active-route grouping, Journal destinations, and safe-area/flexible-width CSS constraints. In the isolated UX checkout, 22 targeted tests and all 1,166 unit tests passed. Lint, build, Cloudinary client-secret scan and diff check passed. An existing Vite chunk-size warning remains.

Headless Chromium verified 66 guest route and viewport combinations at 320, 360, 375, 390, 430 and 1280 CSS pixels. Checks covered the active section, Journal links and grid, horizontal overflow, navigation placement and 56/64 px catch-button sizes. Safe-area CSS was checked structurally. Authenticated navigation and physical-device safe areas remain outside this verification.
