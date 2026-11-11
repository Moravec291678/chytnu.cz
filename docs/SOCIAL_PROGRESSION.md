# Social stage 6 — public progression without reward mutations

The existing `serverProgressionState/summary.serverEventXp` supplies version 1
public XP, level and rank using the existing progression engine. The summary
must belong to the profile UID. Client-reconciled legacy baseline XP is excluded.
No public profile, publication, preview or comparison writes progression state,
reward events, private catches or historical achievements.

Achievement unlocks currently exist only in the private local ledger. Owners
may explicitly select up to twelve non-hidden catalogue IDs they have unlocked
locally. Public DTOs label these as unverified owner reports, omit unlock dates,
and describe catalogue XP as the standard reward, never a new reward. Server
validation excludes unknown/hidden IDs and all client-supplied XP, rank, titles
and verified claims. There is no new achievement issuer or mastery engine.

The existing section visibility settings control PUBLIC / FRIENDS / PRIVATE
access. Defaults remain private. Missing server authority produces no invented
level. Directory summaries omit award claims. Founder/Co-Creator badges retain
their existing trusted UID authority and confer no private-data access.

Shared statistics and trophies combine at most twelve approved legacy catch
selections and twenty recent permitted publications, deduplicated by internal
source identity. The public DTO never exposes that internal link. Item/source
revocation, moderation and approved measurement selections remain enforced.
Unknown Quick Catch species cannot generate species counts or trophies.
Statistics always explain their bounded scope and never disclose a private
diary total or imply effort-adjusted fishing success.

`progression.compare` is authenticated, capped at five requests/user/minute,
and checks an accepted friendship, bilateral blocks and account availability in
one Firestore transaction. Both profiles are projected as visible to a friend,
including the caller's own profile; owner-only fields cannot enter comparison.
No global ranking or leaderboard is introduced.

New composite indexes support bounded owner/date and owner/visibility/date
queries. Firestore client access remains denied to social posts/profiles and
server progression accounting. Physical device validation is separate from the
multi-account emulator and 390px browser acceptance tests.
