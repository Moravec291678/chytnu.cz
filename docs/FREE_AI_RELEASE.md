# Zero-cost intelligence release — 2026-11-04

## Available now

Profile → Tipy a postřehy → **Vyhodnotit deník místně** computes Czech facts,
data-quality notes and evidence-backed recommendations from the real local Catch
repository. No model is invoked and no data is transmitted to an AI provider.
Small samples, missing measurements, estimated weights, invalid/future dates,
unconfirmed species and unequal comparison periods are handled explicitly.
Frequencies are not fishing success probabilities. Measurements remain length-first.
The original insight cards remain accessible; the old frequency list is collapsible.

Settings → **Umělá inteligence a místní postřehy** separately enables/disables local
diary analysis and recommendations. These profile-scoped preferences are not consent
for external processing. Existing scoped preference deletion clears them. No new
catch/photo repository, upload queue, server data collection or Firestore rule exists.

## External AI remains off

All four `AI_FEATURES` source flags remain false. The species route returns
`503 ai_disabled`; the server factory now only permits the fixed Cloudflare candidate,
not a paid Gemini fallback. A real Cloudflare REST vision adapter and Czech story-draft
adapter are implemented and tested against injected responses. That is not evidence
of actual model quality or a live integration. Story drafts never save themselves.
There is no active external story route or consent writer/UI yet; both require the
reviewed activation release after credentials and model acceptance are available.

Vercel environment-name inspection found no AI provider credentials. Local credential
name checks found none either; values were never printed. The explicit real-provider
smoke check stopped before network access with missing account/token/model names.
No model processed a real request, no billing was enabled, no key was installed.

See [provider review and precise operator steps](FREE_AI_PROVIDER_REVIEW.md). Gemini's
current EEA conditions and Hugging Face's current zero free credits rule them out for
this budget. The Cloudflare Free candidate is
`@cf/google/gemma-4-26b-a4b-it`; source flags cannot be enabled before confirming the
account's Workers Free plan, privacy/consent notices and actual fish/Czech tests.

## Quota and security foundation

The existing Firebase token, account-deletion, owner/photo identity, READY/hash,
metadata removal, request-size and consent gates are reused. New server-only quota
transactions reserve 2500 units per request, 7500 units globally/day and 2500 per
user/day: at most three model requests per app/day and one per user/day initially.
These are conservative application reservations, not measured Cloudflare neurons.
Only a verified Workers Free account's provider-enforced ceiling establishes zero AI
charges. A paid account cannot be made safe just by setting a confirmation variable.

Provider quota error 3036 records a global block until the next UTC day. Capacity
errors do not trigger retries or provider fallback. Failed requests are not refunded:
a timeout may occur after resource consumption. Firestore quota state is bounded in
existing serverRateLimits with expiry. No cache/consent/provider output is stored on
user records while inference is disabled.

Future server configuration: `AI_PROVIDER=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, `AI_CLOUDFLARE_MODEL=@cf/google/gemma-4-26b-a4b-it`.
Activation additionally requires the source release gate, `AI_SPECIES_ENABLED=true`
and `AI_ZERO_COST_CONFIRMED=true`, after actual verification. Never use `VITE_` keys.

`tools/ai-free-provider-check.mjs` is an explicit operator test with fixed nonpersonal
Czech notes and a generated no-fish image. It performs no request without configuration
and zero-cost confirmation. A PASS only proves validated text/no-fish responses, not
fish recognition accuracy, Czech factual preservation or iPhone compatibility.
Representative clear/unclear/similar/unsupported/multiple-fish photos and human Czech
review remain necessary. Never enable merely because injected-response tests pass.

## Verification

- Unit suite: 856 tests PASS, including 15 local insight tests, 11 Cloudflare/quota
  tests and existing consent/auth/owner/draft/manual-override cases.
- Browser: actual local journal → button → Czech summary/recommendations rendered;
  390px viewport checked without horizontal overflow. No hosted inference occurred.
- Real-provider smoke check: BLOCKED before request by missing credentials (expected).
- Full lint/build/sync/photo/rules/auth/product gates and `git diff --check`: PASS.
  Build retains the existing large-chunk warnings; client secret scan passes.
- Physical iPhone/PWA recovery and live Cloudinary acceptance remain separately
  unverified from the previous release. This change does not claim to resolve them.

## Activation work after David supplies a free-account token securely

Run nonpersonal provider checks, representative fish/photo and Czech story acceptance,
confirm the account plan, and then complete authenticated consent write/revoke UI,
provider notices, cached identity reuse, suggestion approval and story route/UI. Wire
any saved AI output/consent into account export/deletion before enabling its flag.
Those provider-dependent capabilities remain unavailable; the local fallback is usable.
