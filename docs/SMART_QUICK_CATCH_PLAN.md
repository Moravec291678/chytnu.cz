# Smart Quick Catch

## Architecture decision

Baseline: clean working tree at `58c88b6`; 756 tests pass. Keep CatchRepository,
photoBinaries, the existing outbox, Cloudinary signed uploads and realtime sync.
The current CatchProvider readback catches errors; quick capture needs strict,
independent readback of persisted binary bytes before reporting success.

1. Add a Home action with rear-camera input and optional gallery input. Keep pending
   photo/session identity in CatchProvider across page navigation; retry the same ID.
2. Create an ordinary catch with empty species key and null measurements. Persist
   catch/photo/outbox through the existing atomic repository transaction. Verify raw
   stored bytes, then confirm. Never wait for network or progression rewards.
3. Read EXIF alongside existing image preparation; distinguish gallery dates from
   capture time. Inherit only explicit active-trip context. Collect granted GPS and
   weather after saving. Persist bounded enrichment jobs on the catch.
4. Apply enrichment using atomic revision checks and field ownership. Preserve
   manual edits, including cleared fields; never recreate deleted records.
5. Add Journal incomplete filter and normal-editor completion. Extend the existing
   sync contract/rules only for optional bounded quickCatch metadata.
6. Add disabled, validated AI modules and deterministic diary aggregates. Research
   official provider terms; no paid activation, no fake predictions or visible
   unfinished controls.
7. Run targeted tests, full existing quality gates and browser capture checks where
   available. Release only after passing gates; report device/cloud gaps honestly.

## Release risks

Firestore strict field allowlist requires compatible rules before shipping metadata.
Physical iPhone/PWA and real second-device behavior require actual device acceptance.
Browser storage persistence is best effort; background execution is never guaranteed.
