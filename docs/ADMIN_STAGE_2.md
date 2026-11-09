# Administration — Stage 2

Completed on 2026-11-09. Extends the deployed Stage 1 RBAC; no Stage 3–5 management systems are introduced.

- Server-authenticated user directory and account detail; exact UID/email lookup, owner-built name-prefix index (50 Auth accounts per confirmed request), page-local filters/sorting. The index is a snapshot, not a live global search or private-diary scan.
- OWNER-only privileged delegation and XP correction; controlled CO_CREATOR permissions, expiring delegation, reasoned suspension and optional expiry. Existing authorized daily photo-cleanup cron restores at most 20 expired suspensions per run, preserving concurrent restrictions/deletion. Auth failures remain retryable.
- Assigned support cases, private staff notes, user-visible resolutions. Users open cases and grant selected categories/records to the assigned worker for up to 72 hours, then revoke access. Each private read checks the grant, assignment, current privileges and account status transactionally and writes an audit record. GPS, private water names and catch notes are excluded.
- Support photos use a server proxy and existing authenticated Cloudinary delivery. Signed URLs are not returned. Only JPEG up to 2 MB that the existing parser can strip of metadata is supported; unsupported formats fail closed. No production customer photograph was used for QA.
- Public-catch moderation preserves original diary records and generates a notification. Current Community is a local preview; this does not invent a global social feed or abuse-report intake.
- XP adjustments are immutable, bounded, idempotent server ledger entries. They affect actual level calculations, persist locally for offline use, and cannot recreate a cache after local account cleanup. Historical rewards/automatic achievements remain unchanged. User-submitted diagnostic snapshots are explicitly distinguished from server reconciliation and are not a verified complete ledger.
- Account deletion removes support cases/notes, moderation and directory/account metadata while retaining security audit. Direct client access to administrative documents, grants and correction ledgers is denied by Firestore rules.

## Validation

Full unit suite: 1,015 passed, plus the subsequently added cache-cleanup regression. Lint, production build/secret scan, photo, product inventory, sync and auth checks passed. Rules emulator passed, including direct client/claimed-OWNER denial for new collections; 39 admin API and 49 support API checks passed using actual emulator Auth tokens. Browser QA used synthetic local password-authenticated users: case → scoped consent → OWNER preview/confirm +50 XP → user re-login at level 2 → revoke. Mobile viewport checked at 390 × 844.

## Explicit bounds and remaining product dependencies

Support listing/export is bounded to 50 cases, 200 recent own grants and 20 XP corrections; admin view reads 50 cases/grants/notes. Selected private data is limited to 20 catches, 20 trips and 40 photos. Diagnostic snapshots include up to 100 reward rows/category. These are selected support records, not a full account export or global catch statistics/PB.

Global public profiles, global level search, published community report intake, arbitrary photo formats and manual grants of unsupported achievement/challenge definitions remain unavailable. The UI states these limits. No impersonation, fabricated activity, paid services, credentials UI or bypass of AI consent/global free capacity is added. Real OWNER/CO_CREATOR browser sessions were not impersonated or tested; local authenticated and unauthorized access paths were tested.
