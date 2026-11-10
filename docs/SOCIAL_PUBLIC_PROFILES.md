# Social stage 2 — public fishing identity

Stage 1 domain and restrictive Firestore rules are retained. Only ready profile
operations are exposed by POST `/api/social`, multiplexed through the existing
account function to stay within the current Vercel function limit. Other social
features remain disabled; stage 3 is not started.

## Identity and settings

Stable route `/u/{FirebaseUID}`; optional `/u/@{handle}` discovery. Handles are
NFKC/ASCII lower-case normalized and transactionally reserved. Retired handles
stay owned by the original UID, cannot redirect to a new owner after a rename,
and are removed with account deletion. No public directory listing exists.

`/profile/social` edits display name, handle, biography, voluntary general region,
specialization, favorite fish, overall visibility, discovery and per-section
public/friends/private visibility. Defaults are private and undiscoverable, with
empty sharing selections. Disabling discovery hides handle lookup; direct UID
links still obey overall visibility. Stranger/friend previews use server
projections of the last saved version, never client simulation.

Sections: interests, selected catches/photos, statistics, trophies, achievements.
Statistics/trophy highlights use only up to 12 explicitly selected catches.
Date is day-only; notes, GPS, private waters, email, cloud object keys and source
documents are excluded. Gallery contains up to 6 selected synced JPEG photos.
Deleted or moderator-hidden catches/photos disappear on the next read/delivery.
Existing private Catch/privacy documents are never modified by sharing.

Role badges derive only from existing trusted OWNER/CO_CREATOR server UID config.
Public progression uses serverEventXp with the existing level/rank calculations;
unverified legacy/client XP and client achievement ledgers are excluded. Thus
public level may differ from a local diary. No verified achievement ledger exists
yet: the UI shows an honest empty state rather than publishing client awards.

## Security and media

All SDK access to social collections stays denied, including forged admin claims.
Writes require revoked-token verification, exact input whitelists, UID derived
from the token, account-state checks, transactional reservation and bounded quotas.
Anonymous readers get PUBLIC sections only; authenticated reads also enforce
bilateral blocks, suspensions and deletion receipts. Already public content
remains accessible anonymously even if an account is blocked; the UI explains this.

Every API response is no-store. Profiles refresh on focus or explicit refresh;
revocation is enforced server-side on every new read/image request. Already seen
images cannot be recalled. No content is loaded into private diary storage.

Avatars reuse Cloudinary authenticated image storage and existing JPEG metadata
stripping. Browser canvas makes a square JPEG <=512px, server checks <=200000 B,
dimensions/type and metadata. Immutable random server asset IDs, durable
`socialAvatarJobs` written before upload, 2-minute pending lease and revision CAS
protect replacement/deletion races. Cleanup retries via the existing protected
daily photo cron (max100 jobs/run); no additional paid service or cron is created.
Account deletion waits for pending uploads and cleans all owned avatar jobs,
including first uploads before a profile has an avatar. Source URLs never reach
clients. Selected catch photos reuse the existing bounded private delivery proxy,
only after checking current sharing, moderation, blocks and ownership.

Existing mutation limit:20/minute; profile API:60 requests/user/minute,
120 global/minute, 2000 global/day,30 avatar uploads globally/day. These are
internal safety caps, not guarantees of remaining provider or Firebase free quota.
No billing configuration changes are made. Global limits also cover anonymous reads.
Runtime emergency switch `adminConfig/social.profilesEnabled=false` disables
profile reads/writes; default production profile readiness is explicit in code.
`FEATURES.publicProfiles=true`, overall socialNetwork/friends flags remain false.

Reports are canonical UID based, deduplicated per reporter/target/day and stored
server-only in `socialReports`. They are moderation intake; a dedicated reports
dashboard is a later moderation stage. Account deletion removes reports either
written by or targeting the deleted account. Blocking/unblocking is real and
available in the profile/settings. Friendship UI and broader notifications/feed
work remain later stages; existing accepted relationships determine friends access.

## Verification

`npm run test:rules` runs the original suites plus profile Auth/Firestore emulator
HTTP tests for A/B/C, anonymous, principal badges, uniqueness/retired claims,
publication/revocation, section isolation/previews, explicit photo ownership,
moderation, blocking, suspension, report normalization and full account cleanup.
Avatar unit tests cover sanitization, dimensions, immutable objects, concurrency,
crashes/leases, failed cleanup retention and bounded cron work. Browser acceptance
uses synthetic local emulator accounts only; never production customer data.
Live Cloudinary upload from a physical device is not part of these automated tests.
