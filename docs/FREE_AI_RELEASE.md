# Zero-cost intelligence release — 2026-11-05

## Available behavior

All four optional AI capabilities use the existing /api/ai/species server function:
fish-species suggestions, diary explanations, fishing recommendations and story
assessment/editing. Source flags are enabled only after the successful live vision
check described below. Each capability requires its own explicit current-version
Cloudflare consent, an authenticated Firebase owner and a user-triggered action.
Quick Catch, photo persistence, offline saves, deterministic statistics and local
Czech diary analysis remain independent of model availability.

Settings → Umělá inteligence a místní postřehy exposes separate local preferences
and external consent. Nothing is checked by default and saving consent does not
run a model. Revocation commits a new revision before attempting cache cleanup;
cleanupPending is reported truthfully. User-scoped consent/results are included in
cloud export and recursive account deletion, with server-only writes in rules.

Species suggestions never update confirmed fields. The explicit editor link checks
owner, analyzed photo SHA, current local revision and server revision; final Save
atomically rejects newer edits or deletion. Stories remain editable drafts, with a
fact-review checkbox and explicit approval. Atomic note approval checks original
notes and revision and changes only notes, retaining current photos and factual
fields. Diary statistics are calculated deterministically; generated prose is marked
as a hypothesis and separated from sourced aggregates/evidence.

## Real-provider evidence and limits

Model: @cf/google/gemma-4-26b-a4b-it, pinned without provider fallback or retry.
Official Cloudflare documentation confirms text and image input and Workers Free
eligibility. David explicitly confirmed Workers Free only, without paid AI credits.
The four supplied secret environment variables were present in Vercel Production.
AI_ZERO_COST_CONFIRMED=true records the owner's confirmation, not a billing audit.

On 2026-11-05 exactly one real inference was issued from deployment
96TUn9HyZoxJMjmb8ADdH4RRLGof (commit511d083), after READY, through an authenticated,
quota-limited fixed-fixture operator route. Public-domain USFWS common-carp JPEG,
metadata stripped: HTTP200, commonCarp, fishCount1, uncalibrated score0.95.
No customer records were accessed or sent. One earlier request stopped at Vercel
protection401 before reaching the provider. See AI_FIXTURE_ATTRIBUTION.md and
FREE_AI_PROVIDER_REVIEW.md for source, digest, response and official links.

The temporary operator route/code and secret are removed. Its fixture is outside
public assets. Production permits no caller-supplied prompts/photos/owner IDs.
Bodies, photo downloads, outputs and timeouts are bounded. Results are private,
owner-scoped cache entries fenced by consent revision and source identity.

Application limits permit one new model request per owner/day and three globally/day;
cache hits do not issue another inference. Reservations are not measured neurons.
Workers Free's enforced10000neurons/day ceiling, without paid upgrade/credits, is
the zero-spend boundary. Quota exhaustion fails closed until the next UTC day.
No paid plan, billing, Blaze, Gateway credits or paid fallback was enabled.

One image smoke test is not an accuracy study or a Czech language-quality review.
Text routes have automated contract/security/provider-validation tests; there was
no separate live text call because this task authorized one bounded inference.
Physical iPhone, installed-PWA close/reopen and live Cloudinary acceptance remain
separately unverified. No claim of resolving those prior device checks is made.

## Validation

- npm run lint: PASS.
- npm test:894tests PASS (including export/delete, local persistence, manual edits,
  source/owner/consent isolation, quota transactions and AI contracts).
- npm run build: PASS; client secret scan124assets PASS; existing chunk-size warnings.
- npm run test:sync and npm run test:photos: PASS, including Quick Catch and simulated
  second-device synchronization. Delivery timings are synthetic, not physical-device tests.
- npm run test:rules:14/14PASS; npm run test:auth:PASS.
- npm run product and git diff --check:PASS.
- Czech settings guest view inspected in the browser: clear sign-in requirement,
  separate local preferences and no unauthenticated inference controls.
- Firestore rules deployed to the existing chutnucz project after emulator success;
  indexes and architecture unchanged.

## David's optional acceptance

Open https://chytnu-cz.vercel.app → sign in → Nastavení → Umělá inteligence a místní
postřehy. Select desired external capabilities and choose Uložit souhlas s AI.
In a synced catch open Volitelná pomoc AI, or in Tipy a postřehy expand the diary
report. Review any model suggestion; a proposal is never a confirmed measurement.
The daily allowance is shared by all four tools; it resets at00:00UTC.
No further credential setup or paid account is required.
