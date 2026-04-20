# Security

## Responsible Disclosure

If you find a security issue, please do **not** file a public GitHub issue.

Email: chris.bailey@erp-access.com — include "SECURITY: deeptrend" in the subject line.

Expect an acknowledgment within 72 hours.

## What this tool does

deeptrend ingests from 14+ public sources, synthesizes trends using LLM Counsel, and publishes four artifacts every 6 hours to a static site: `feed.json` (JSON Feed 1.1), `feed.xml` (RSS 2.0), `hot.json` (current state), and `llms.txt` (agent discovery). Consumers are autonomous agents and monitoring systems.

## What this tool does NOT do

- It does not require or accept authentication at the published endpoints. The feed is public.
- It does not collect telemetry or identify consumers.
- It does not make outbound requests except to its documented source list during the synthesis cycle.
- It does not execute arbitrary content from sources — ingestion is parse-and-classify, not exec.
- It does not publish personally-identifying information about authors of source items beyond what is already public at the source.

## Known Considerations

- The feed is consumed by autonomous agents that will act on priority (p0) signals without human review. A compromised synthesis step could inject misleading signals — treat the publication pipeline as load-bearing for consumer trust.
- The synthesis relies on an LLM. LLM output can be hallucinated or biased. The `_deeptrend.confidence` field and `source_count` let consumers filter; do not use items with `source_count=1` for high-stakes automation.
- Source URLs are not sanitized against active content. Consumers should treat `content_text` and any URLs as untrusted input for rendering.
- If a source changes its terms or adds authentication, ingestion will drop that source. Downstream agents depending on convergence from that source will see degraded confidence — this is the intended behavior.

If you see evidence of any of the "does NOT do" items, that is a security issue — please report.
