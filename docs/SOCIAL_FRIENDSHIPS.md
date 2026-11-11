# Social stage 4 — online friendships

Existing canonical length-prefixed UID pair is the only relationship record.
States: pending, accepted, rejected, cancelled, unfriended, blocked. API projects
pending as incoming/outgoing per actor. Terminal states are retained; unblocking
never restores friendship. Rejected invitations have a24-hour resend cooldown.
Participant-authorized accept/reject/cancel/unfriend are transactional and
revision-checked. Operation receipts under the actor's private `socialMutations`
make retries read current state rather than resurrect old accepted/pending state.
Reversed requests do not auto-accept. Blocking removes grants atomically, including
reciprocal blocks; the other side receives a generic unavailable result.

`/friends` provides bounded pages of friends/incoming/outgoing, profile links,
Find and real public-directory discovery. Public profiles expose appropriate
friendship buttons. Visible pages refresh every45s and onfocus. Offline mode
hides unverified state and disables mutations; no local friendship is fabricated.
Counts describe only the signed-in account's loaded rows, never a public graph.

Lists require authentication, query memberUids+status and scan10+lookahead.
AES-GCM cursors bind UID/tab and expire after15min. Profile projections obey
visibility; an existing invitation may retain only the minimal name/handle
explicitly shared at request time. Blocks, suspensions/deletion markers and
current profile availability are rechecked server-side on every read.
`assertSocialInteraction` centralizes checks for friends-only reads and future
private messages; private-conversation SDK writes remain denied, no chat UI is
claimed here. Runtime `adminConfig/social.friendshipsEnabled=false` is the kill
switch. OWNER/CO_CREATOR have no privacy bypass.

Bounded latest-request/latest-accept/latest-removal event slots are server-only
under the pair. Request/accept creates one deduplicated existing in-app
notification (type social), with generic text and `/friends` link. Clients cannot
create social notifications or edit their contents; owners can mark them read.
Each pair/event type is limited to one notice per10min, including cancel/block cycles. No push, removal notification or global fan-out is enabled. Generic historical
notifications reveal no deleted/blocked profile, message body or location.

Account deletion recursively removes canonical relationships/events and its own
operation receipts through the existing lifecycle. Private catches, XP ledgers,
other accounts and global quotas are unchanged. All direct relationship SDK
reads/writes stay denied. Test fixtures use real local emulator Auth accounts.
