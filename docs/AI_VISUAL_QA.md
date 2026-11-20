# Visual QA checkpoint

Status: PARTIAL

## 2026-11-19

- Existing dark theme and green accent tokens remain unchanged.
- Local guest browser smoke passed without horizontal overflow on main routes at a 390 px-class viewport.
- Gallery CSS retains 2 columns on narrow screens and expands to 4/5 columns on desktop.
- Gallery has short broken-photo copy, 44 px retry actions and responsive viewer controls.
- Journal sort controls now share one unique key list.
- At this initial checkpoint, real 320 px/desktop screenshots and authenticated route screenshots remained; the expanded coverage is recorded below. Physical iPhone/Android checks remain outstanding.
- Browser smoke used guest routes and did not replace physical-device validation.

## 2026-11-19 — expanded responsive and authenticated checks

- Preserved the existing dark theme, green accents and component identity.
- Used isolated headless Chrome at exactly 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 CSS px. All 47 guest routes were checked at each width (470 route/width checks); no horizontal overflow or persistent loading state was observed.
- Separately navigated 47 route paths while authenticated as a synthetic account at 400 px. The synthetic community post-detail URL had no fixture and no heading. The integrated browser did not honor requested viewport changes, so authenticated screenshots do not count as coverage at the ten-width matrix.
- Screenshot comparison found the inactive Home fish-activity card's detail link touching its action button (0 px gap at 1920 px). Both controls now use the existing compact action row. Post-fix computed gap: 14 px at 320 px, 84 px at 390 px and 181 px at desktop; no overflow.
- A synthetic Catch and Trip were exercised through the UI and removed after verification.
- Vercel `/api/*` routes are not provided by the Vite dev server; API-backed social browser behavior remains unverified. Physical iPhone/Android and PWA service-worker behavior remain **MANUAL TEST REQUIRED**.

## 2026-11-19 — AI consent and social visibility screens

- Preserved the existing dark palette, green accent tokens and component identity.
- Exercised the community composer’s public-default consent flow in the browser with synthetic draft text only. The submit button was disabled before confirmation, enabled after confirmation, and disabled again after unchecking. Nothing was published.
- Checked `/community` with the composer open and `/profile/social` with the existing synthetic profile at measured CSS widths 320, 360, 375, 390, 430, 768, 1025, 1280, 1440 and 1920 for the composer, and 320, 360, 375, 390, 430, 767, 1023, 1280, 1440 and 1920 for profile settings. No horizontal overflow was observed.
- The integrated browser quantizes requested widths; authenticated profile screens could not be measured at exactly 1024 px. Do not count this as exact 1024 px coverage.
- No new profile was saved and no existing profile settings were changed. Authenticated route/API coverage remains incomplete; the browser later showed a logged-out state and the cause was not verified. The local `/api/progression/reconcile` 404 is a Vite harness limitation, not a production conclusion.
- Physical iOS/Android and installed-PWA checks remain **MANUAL TEST REQUIRED**.

## 2026-11-20 — four-section navigation implementation

- Source navigation now presents Domů, Deník, Komunita, Profil and preserves the center Quick Catch button. Trips are linked in the Journal's four section tabs.
- No browser viewport run was performed after this edit. The earlier 320–1920 px coverage predates it and is not evidence for the new layout. Narrow-screen and safe-area navigation verification remains pending; physical device checks remain manual.

## 2026-11-20 — Home dashboard hierarchy

- Home JSX now presents Quick Catch, fishing conditions, then active-trip context (or the start-trip action) before XP and seasonal/weekly challenge panels. No cards or data sources were removed.
- A structural regression test verifies this order. It does not substitute for a visual screenshot or mobile viewport check; those remain outstanding for Stage 4.

## 2026-11-20 — duplicate Home routes

- Removed the redundant List/Map/Calendar tabs from the Home recent-catches panel; its Journal link remains, and those views stay available in the Journal. Removed the now-unused Home-only CSS.
- Regression coverage confirms the Journal link is retained and the destination tabs remain in Journal. Full tests/visual review follow.

## 2026-11-20 — onboarding privacy and storage clarity

- The existing two-step onboarding now states that records save locally first and sync after sign-in, public sharing requires the user's confirmation, and GPS is optional with precise location not automatically public. No new mandatory step or permission prompt was added.
- Copy is covered by `src/pages/OnboardingPage.test.js`. Small-screen visual fit still needs a viewport check.

## 2026-11-20 — deep route active sections

- Revíry entered through Profile now retain the Profile active indicator, water-room chat maps to Community, and diary insight/story routes map to Deník. The four destinations do not overlap for the chat/profile distinction by source rule.
- Navigation, onboarding, and Home structural checks: 22/22 PASS. Full unit suite: 1,170/1,170; lint, build/secret scan, and diff check PASS. This is structural coverage, not a viewport-based visual check.

## Authenticated takeover browser QA — 2026-11-19

Real localhost handlers and Auth/Firestore emulators: A chose public profile with all public presets and explicit checkbox; A created an actual experience post, visible in feed and detail (ID 63076cc37d7fd4e32b951ae63f049bcfddfda76b01296c0d68732684c76ade7d). B logged in, created its own profile, reacted and commented; server confirmed both. B invited A; A accepted and saw B as a friend. A saved a manual carp catch (42 cm, estimated weight marked as estimated, no new XP). A changed to private; C logged in and was denied the original post, and username search returned no available profile.

390px checks showed no horizontal overflow on catch/revoked-post screens. Production build guest Quick Catch accepted a non-private carp JPEG fixture, saved one incomplete catch and rendered the locally read-back image. No species AI control appeared. Local Cloudinary delivery was unavailable by design; media revocation/derivative privacy was tested in the emulator, not falsely claimed as a browser upload PASS.

Offline close/reopen in the integrated browser showed an empty app; cause remains unverified. Online reopening was initiated but not completed before computer-use ended. Native Chrome inspection was stopped by the tool because it could not confidently determine the current browser URL. No further UI input was attempted. Physical-device/PWA acceptance and full responsive authenticated coverage remain UNVERIFIED. Original visual identity retained.

## Browser QA · 20. listopadu 2026

Chromium ověřilo 18 tras při šířkách 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 a 1920 px v hostovském režimu. Kontroly ověřily trasu, aktivní sekci a vodorovné přetečení bez nálezu. Při 390 px skutečným kliknutím prošly všechny tři odkazy z rozbalovací skupiny přehledů v Deníku. Tato sada nepokrývá všechny přihlášené obrazovky, vizuální regresi všech komponent ani hardwarové safe areas.

### Doplňující ověření přihlášeného účtu

Syntetický účet Firebase Auth prošel přihlášením e-mailem, onboardingem bez žádosti o GPS a 140 kombinacemi přihlášené trasy a šířky. Rozsah zahrnul Domů, Deník, Vycházky, Galerii, Statistiky, Komunitu, Přátele, Okolí, Profil, Nastavení, Soukromí, katalog revírů, Přidat úlovek a Oznámení při stejných deseti šířkách. Kontrolovaná navigace bez nálezu.
