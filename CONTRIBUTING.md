# Contributing

Thanks for looking.

## Before opening a PR

1. **Open an issue first** for anything larger than a typo.
2. **Match the existing output shape.** The `_deeptrend` extension on each feed item has a documented schema — do not break it silently.
3. **Test the full pipeline locally.** Source ingestion → LLM Counsel synthesis → feed publication should produce a valid JSON Feed 1.1 document.
4. **Validate against the schema.** `schema/feed.schema.json` is the contract with consumers.

## What this project will not accept

deeptrend publishes to a public URL that autonomous agents consume. Schema drift or feed corruption will break downstream agents without warning. Bar is high for changes that touch publication.

- PRs that break JSON Feed 1.1 compatibility.
- PRs that modify the `_deeptrend` extension fields without a schema update and a deprecation path.
- PRs that change the update cadence (every 6 hours) without documentation — some consumers cache based on it.
- PRs that add sources without honest source_count and convergence handling. Fake diversity (listing similar sources separately to inflate convergence) is worse than fewer real sources.
- PRs that reduce priority signal quality — p0 means something, do not inflate.
- PRs that add authentication requirements to the primary endpoints. The feed must stay free and unauthenticated.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do not file security issues in the public tracker.

## Author

[Christopher Bailey](https://github.com/chrbailey).
