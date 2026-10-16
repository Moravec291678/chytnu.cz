# ChytnuCz — Agent Instructions

## Language and communication
- Communicate with the project owner in Czech.
- Be precise about completed, tested, and unverified work.
- Explain major technical decisions and their trade-offs.

## Main project instructions
- Read `docs/CODEX_MASTER_PROMPT.md` before starting substantial work.
- Follow its phased roadmap and acceptance criteria.
- Start with the project audit. Do not rewrite the application before documenting the architecture decision.
- Treat the actual repository as the source of truth. Older documentation may be outdated.

## Engineering rules
- Inspect Git status before modifying files.
- Preserve existing user changes and data.
- Never perform destructive Git operations without explicit approval.
- Never commit secrets, credentials, private user data, or production data.
- Never claim a test, build, deployment, or store submission succeeded unless it actually did.
- Use real data in production. Clearly separate test fixtures from production data.
- Keep business logic testable and validate user input.
- Test relevant changes and update documentation.

## Data integrity and privacy
- Never invent weather, fish activity, catch statistics, fishing regulations, or other factual data.
- Distinguish measured or sourced values from calculated results and heuristic estimates.
- Request location and other sensitive permissions only when needed.
- Keep precise fishing locations private by default.
- Use official documentation for external APIs and platform requirements.

## Delivery process
- Work in small, documented phases.
- Each phase must include implementation, relevant tests, review, and a summary of remaining risks.
- Do not mark a feature complete while its critical user flows are broken.
- Prioritize a reliable MVP over unnecessary features.
- Keep the application buildable for its selected iOS and Android architecture.
