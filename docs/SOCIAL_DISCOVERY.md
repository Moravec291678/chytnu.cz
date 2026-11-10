# Social stage 3 — Find fishers

`/community/find` is reachable from Profile and Community. No existing local
Community, Nearby, Crew, diary or water-chat data is migrated or replaced.
Search requires a real authenticated account; private diary access is unchanged.

## Opt-in, query and projection

Existing `discoverable` enables public username search only. New
`directoryDiscoverable` defaults false and explicitly adds public display name,
public specialization/favorite fish and the new-members list. A separate
`regionDiscoverable` defaults false and additionally allows the voluntarily
entered general region when interests are public. All indexing requires overall
PUBLIC visibility and `discoverable=true`. Friends/private sections never enter
the index. Existing users are not opted into directory or regional discovery.

Server-generated `publicProfiles.searchPrefixes` contains bounded word/phrase
prefixes, NFKC/NFKD folded without accents and case, min2/max40 query characters.
At most1000 prefix tokens are stored; each field has a128-prefix budget. Search
matches starts of words/phrases, not arbitrary infixes. No emails, private GPS,
water locations, catches or presence enter search. Two composite indexes cover
prefix+handle/UID and directory+createdAt/UID. No new provider or paid search engine.

POST `/api/social`, action `search`, uses equality filters PUBLIC/discoverable
and indexed array-contains token. A transaction scans at most10 candidates plus
one lookahead, rechecks current consent and index tokens, suspended/deleting
accounts and bilateral blocks before returning existing safe profile summaries.
No catches/photos are read for directory summaries; public rank uses only the
existing verified server XP calculation. The UI fetches avatars through existing
guarded delivery. No total or distinguishable hidden/private-account response is
returned. Empty filtered pages can still have a next cursor.

Cursors use AES-256-GCM, random nonces, UID/query/mode binding and15-minute expiry.
The key is domain-separated from the existing server-only Firebase credential;
no new secret setup or client secret. Skipped identities stay encrypted. Ordering
is handle thenUID, or createdAt descending thenUID; no offsets. Pages reflect live
privacy/rename changes; UI deduplicates UID and refresh restarts the search.

Network queries debounce350ms; max10 returned per page/max100 displayed. No
initial full-directory download. New public members load only on explicit click.
Search has30 requests/user/minute and150/day in addition to existing global API
limits. There is no OWNER/CO quota or privacy bypass. Runtime
`adminConfig/social.discoveryEnabled=false` disables search and these invitation
actions independently of profile viewing. `FEATURES.userDiscovery` controls UI.

## Relationships and scope

Directory cards reuse the stage1 canonical relationship repository: request,
incoming/outgoing, accept, cancel/reject and remove. Requesting requires an
existing public, username-discoverable sender and target; accepting an existing
recipient-owned request remains possible if the sender disables discovery.
Authentication, blocks, suspension, account deletion and transactional mutation
limits are rechecked. No client-supplied actor/role is accepted. No notification
fan-out, mutual-friend recommendations, Nearby inference or stage4 inbox is added.

## Existing profile index maintenance

Profile saves atomically regenerate the index; older handle claims stay reserved.
`reindexDiscoveryPage` rereads bounded pages transactionally and only updates
derived index/version fields. Invalid legacy profiles are excluded with empty
prefixes; private source data and existing opt-in settings are preserved.
Account deletion removes profiles/indexes, relationships and per-user search
counters using the existing lifecycle, without deleting global quotas.

Operator command `node tools/reindex-social-discovery.mjs --apply` uses existing
Firebase CLI OAuth credentials in memory for project `chutnucz`; it never pulls
Vercel secrets. At most2500 profiles/run, with private resume cursor under existing
`adminDirectoryState`. No browser migration endpoint. Without `--apply` it reads
only a25-record sample and prints counts. `--verify-indexes` executes both bounded
production query shapes without returning profile contents.

## Acceptance

Emulator checks create20 real Auth accounts and cover exact/partial/accent-free
queries, duplicate names, public-role badges, privacy/blocking, pagination and
cursor replay/tampering/expiry, rename/retired handles, legacy index idempotency,
friend states and accepting after discovery opt-out, kill switch and quota.
Browser acceptance uses local synthetic accounts: Profile→Find, JIRI→Jiří,
optional Morava region, invitation and stable public-profile link;390px without
horizontal overflow or GPS permission. No synthetic profiles are deployed.
