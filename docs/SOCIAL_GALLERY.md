# Social stage 5 — explicitly approved publications

`socialPosts/{sha256(uid/catchId)}` is a server-only, versioned projection. One
stable post per catch prevents duplicate publication. Source IDs, fingerprints,
photo receipts and field selections are returned only to the owner; public DTOs
contain an explicit content/author allowlist. No publication awards XP.

`posts.save`, `posts.own`, `posts.list`, `posts.image`, `posts.delete` reuse the
authenticated social API. Anonymous reads receive only approved public content.
All mutations require the caller UID; updates require the current revision.
Deletion retains a tombstone. Republishing requires fresh explicit approval.

Private, friends and public item visibility is additionally restricted by the
profile visibility and its gallery (photo posts) or catches (text posts) section.
Blocking, suspension, deletion, loss of friendship and moderation are checked on
every read. Owner-only audience previews use the same checks. Pagination scans
ten records plus one lookahead and uses viewer-bound opaque expiring cursors.

Approved fields are computed from the owned server catch, never client values.
Dates omit time and optionally day. Estimated weights are omitted. Water names
come only from a verified canonical RIS link, never private location names.
Changing an approved value, source privacy or source photo invalidates the
publication until reconfirmed. Private notes/GPS do not affect or enter content.
Source deletion/revocation hides media immediately on the next authorized read.
Bytes already downloaded by a recipient cannot be recalled.

Cloudinary originals remain authenticated. A durable owner-scoped receipt and
lease coalesce eager creation of a fixed 1280px JPEG derivative. Preparation is
bounded to 30 globally/day and 10/owner/day, failed preparation backs off one
hour, and delivery never requests another transformation. Source ownership,
SHA, object key, MIME and provider metadata are verified. Delivered frame size,
dimensions and metadata are checked independently. No provider URLs or original
image bytes are returned. Existing selected profile photos use the same adapter.
Legacy profile selections also store server-only approval fingerprints; edits
to their approved catch values or source privacy hide them until reconfirmed.
Selections predating these fingerprints fail closed until their owner saves
their selection again.
Account cleanup removes owner receipts/posts; derivatives are removed with the
original by the existing Cloudinary deletion flow.

Tests use actual separate Firebase Auth emulator accounts and Firestore
transactions. Provider tests exercise installed SDK signatures/serialization
with synthetic transport fixtures; they do not establish live Cloudinary
delivery or physical-device acceptance.
