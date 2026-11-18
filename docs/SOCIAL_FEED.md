# Social stage 7 — live, permission-filtered timelines

`feed.list` reuses authenticated social API and the existing `socialPosts`
collection. Global queries select public posts; friends queries select public
or friends posts and return only current accepted friends' permitted content.
Every row is checked server-side against account state, bilateral blocks,
profile/section/item visibility, moderation and current source approval.
Own rows in the global timeline use the stranger projection. No owner-only
source IDs, private catches, GPS or provider URLs enter feed DTOs.

Each request reads at most twenty indexed candidates plus one lookahead and
returns at most ten posts (three for Home). It never fetches an unbounded friend
list or creates per-user feed fanout copies. Latest ordering uses creation time
and document ID; opaque encrypted fifteen-minute cursors are bound to viewer,
mode and page size. Denied candidate windows can be empty with a next cursor;
the UI preserves continuation rather than pretending the entire feed is empty.
Friends feeds are a bounded scan of the permitted timeline, not an unbounded
real-time listener. Nearby feed remains gated pending stage 10.

Catch posts preserve the existing approved photo/measurement snapshots. Explicit
experience, selected achievement and confirmed progression milestone posts use
the same collection and permission boundary. Stable UUID-derived entry IDs,
mandatory expected revisions and deletion tombstones prevent duplicate retries
and stale restores. Entries are private by default, with five writes/user/minute
and twenty/day. Achievement highlights remain visibly unverified owner reports;
confirmed milestones use only the existing server XP summary. Source withdrawal
or downward correction revokes affected highlights. Publication never awards XP.
Non-catch posts do not contribute to catch statistics or trophies.

`posts.view` supports safe public permalinks; private/friends items still require
authorization. Images reuse the guarded authenticated derivative delivery API.
Community preserves the original local preview separately without uploading it.
Home displays a small friends preview. Refresh, account switching, offline and
revoked sharing discard stale audience state; media loads lazily. The owner's
entry detail supports revision-checked removal. No local reaction counts are
presented as online reactions; interactions are stage 8.

Existing feed indexes were verified against production using bounded query
shapes without printing document content. Direct client Firestore access stays denied.
