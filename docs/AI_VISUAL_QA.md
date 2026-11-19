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
- Separately inspected all 47 routes while authenticated as a synthetic account at 400 px. The integrated browser did not honor requested viewport changes, so authenticated screenshots do not count as coverage at the ten-width matrix.
- Screenshot comparison found the inactive Home fish-activity card's detail link touching its action button (0 px gap at 1920 px). Both controls now use the existing compact action row. Post-fix computed gap: 14 px at 320 px, 84 px at 390 px and 181 px at desktop; no overflow.
- A synthetic Catch and Trip were exercised through the UI and removed after verification.
- Vercel `/api/*` routes are not provided by the Vite dev server; API-backed social browser behavior remains unverified. Physical iPhone/Android and PWA service-worker behavior remain **MANUAL TEST REQUIRED**.
