# Social network — stage 1

The existing Firebase UID remains the identity. There is no social login, client
role system, migration or automatic publication. Existing local Community, Crew,
Nearby and Water Chat remain unchanged. `FEATURES.socialNetwork` is false.

## Boundary and rollout

`features/social/data/socialModel.js` is the single DTO/path/visibility contract.
`server/socialRepository.js` verifies revoked Firebase tokens and rechecks
suspensions/deletion receipts inside transactions. It implements explicit profile
projection, exact normalized-handle lookup/reservation, request/accept/remove
friendship and bilateral blocking checks. Handle ownership and rate counters are
transactional. No admin role bypasses social privacy or mutation limits.

There is intentionally **no HTTP route, sync adapter or UI rollout**. All social
collections deny direct SDK reads, listing and writes, even for OWNER/CO_CREATOR.
Repository calls also require server-only `adminConfig/social.enabled == true`
(absent/false in production). Emulator fixtures alone enable it temporarily.
Enabling that document is insufficient to launch: a future authenticated API with
bounded reads, request limits, feature-specific consent and moderation must ship
first. Do not connect these records to the private outbox.

## Collections

- `publicProfiles/{uid}`: explicit minimal displayName/bio/handle/visibility;
  default private. No editable roles, XP, GPS, image URLs or private catch fields.
- `publicHandles/{normalizedHandle}`: unique UID claim; NFKC lower case, ASCII
  letter followed by 2–23 letters/digits/underscores. Exact discovery only;
  no directory enumeration. Changing handle atomically frees the old claim.
- `socialRelationships/{canonicalPair}`: length-prefixed sorted UID pair,
  pending/accepted; only the recipient accepts. Reversed requests never accept.
- `socialBlocks/{uid}/blocked/{targetUid}`: block removes the pair; unblocking
  does not restore friendship. Either direction prevents profile/relationship access.
- `socialPosts/{id}` with `comments/{id}` and `reactions/{uid}`: validated text
  contracts only; future publishing, photo assets and catch sharing remain disabled.
- `nearbyPresence/{session}`: opt-in coarse geohash (4 characters), never GPS.
  `waterPresence/{session}`: canonical public RIS water ID; expiry max 30 minutes.
- `waterRooms/{risId}/messages/{id}`: validated canonical RIS references/text.
- `privateConversations/{id}`: exactly two UID members; `crews/{id}`: max 20
  members and explicit owner/visibility. Messaging/membership APIs not launched.
- Notifications reuse **`users/{uid}/notifications/{id}`** and its existing model,
  permissions and delivery preferences. No competing global notification store.
- Internal quota uses existing `serverRateLimits/social-{sha256(uid)}`: max
  20 successful mutations/minute, including privileged accounts. No fan-out jobs.

All records have server-supplied millisecond `createdAt`/`updatedAt`; strict DTO
whitelists reject unknown fields, future timestamps, control characters and long
values. Presence schemas prepare expiry, but no presence reader exists yet:
future readers must filter expiry on every read, irrespective of TTL cleanup.
Public/friends/private checks require authentication and fail closed for blocks
or unavailable accounts. Existing catch privacy defaults are not changed and
never count as consent to network publication.

Stable water references are existing `ris-<24 hex>` catalogue IDs, not users' local
water UUIDs. Schema validation checks shape; future water-write APIs must also
resolve catalogue membership. No precise private GPS or public coordinates are
copied between these domains.

## Deletion and future dependencies

Account deletion runs bounded social cleanup before removing private subcollections.
It removes owned profiles/handle claims/posts/presence/crews and relationships,
removes crew memberships, and removes shared conversations involving the account
(including their child messages). Other authors' posts and the diary remain intact.
Future nested-content writers **must atomically register**
`users/{uid}/socialReferences/{stableId} = { path }` with each comment, reaction or
room message. Cleanup validates the allowed path and actual author before deletion.
Incoming blocks retain only UID anti-abuse tombstones, no public identity or content;
they are removed when the blocking account unblocks/deletes. Security audit retention
continues to follow the existing account-deletion policy.

Prepared indexes: visibility/time posts, member/status/time relationships and
water/expiry presence. No production records or user data are backfilled.

Before later stages enable sharing: add explicit per-item publication/revocation,
separate sanitized published media assets with ownership checks (never expose
existing private Cloudinary references), server-verified progression summaries
(never trust migrated/client XP), bounded feed/comment/chat APIs, reports/moderation,
notification deduplication/preferences, Nearby opt-in and expiry, conversation and
crew authorization. Schemas alone do not authorize any future write.

## Verification

`npm run test:rules` includes social SDK rules tests for A/B/C/anonymous and forged
OWNER/CO_CREATOR claims plus real Auth-emulator login/repository tests: feature
gating, private/public/friends, reserved handles and races, spoofing, blocks,
quota, suspension, deletion and preservation of another author's content.
No production account, private diary, provider or paid service is used.
