# Repository Instructions

## Objective

Build a presentable Recall.ai DXE interview demo around one useful, complete
Recall workflow that a customer could extend. Favor a clear product rationale,
readable code, and real verification over broad API coverage or speculative
infrastructure.

## Sources and decisions

When sources disagree, use this order:

1. The user's current explicit instructions and approvals.
2. `docs/DXE-technical-interview.md` for assessment requirements.
3. `docs/PRODUCT.md` for accepted product scope.
4. Current official Recall.ai documentation for API behavior.
5. Verified implementation and test evidence.
6. Other repository documents as reference material only.

Keep facts, accepted decisions, assumptions, recommendations, and ideas
distinct. Existing files, code, or brainstorming do not prove user acceptance.
Preserve uncertainty instead of silently converting it into a requirement.

When discussing a product or architecture decision:

- Do not edit application code.
- Separate known facts from assumptions.
- Present two or three materially different options and tradeoffs.
- Recommend one and ask for explicit acceptance, rejection, or deferral.
- Update `docs/PRODUCT.md` only after the user decides.

Do not invent branding, personas, workflows, fixtures, or product features.

## Implementation

Work on one explicitly authorized, reviewable milestone at a time. Restate its
scope and acceptance criteria before starting.

Within an authorized milestone, independently make small, reversible
implementation choices. Ask before changing the product, architecture, scope,
external behavior, or material project risk.

- Prefer the smallest clear implementation that satisfies the milestone.
- Do not add files, layers, abstractions, dependencies, configuration, or
  compatibility code for hypothetical future needs.
- Use plain functions and data structures unless a more complex pattern
  provides immediate value.
- When two implementations are equally clear, choose the one with less code.
- Implement only the authorized milestone.
- Avoid adjacent features and speculative abstractions.
- Identify manual setup clearly.
- Run checks proportionate to the change.
- At completion, report results, show `git status`, summarize changed files,
  and stop for review and manual testing.
- Never begin the next milestone automatically.

## Recall.ai guardrails

- Check current official Recall documentation before relying on schemas,
  configuration fields, defaults, or product behavior.
- Use only the API surface required by the accepted workflow.
- Use webhooks for lifecycle updates; do not poll Recall.
- Verify incoming Recall requests against the raw payload before parsing,
  storing, enqueueing, or processing them.
- Reject unverified requests without downstream work.
- Acknowledge verified webhooks promptly and process substantial work outside
  the response path.
- Keep dashboard lifecycle webhooks distinct from per-bot real-time events.
- Keep region-specific resources and credentials in the same Recall region.
- Keep Recall credentials server-only.
- Prefer one live-verifiable vertical slice over broad endpoint coverage.
- Do not mutate Recall workspace configuration without explicit authorization.

## Security

- Never read, print, expose, or commit values from `.env`.
- Never expose secrets, meeting credentials, signed download URLs, or sensitive
  meeting data in client code, logs, fixtures, or documentation.
- Do not commit real participant data, meeting content, or transcripts.
- Sanitize diagnostics and approved fixtures.
- Do not log raw webhook bodies by default.

## Verification

Distinguish static checks, automated tests, manual verification, and live Recall
verification. Mocked or unit-tested behavior does not prove a real integration
works. Do not claim an end-to-end Recall workflow works until an actual Recall
request and its expected verified webhook, callback, artifact, or result have
been observed.

## Documentation and Git

- Keep `AGENTS.md` limited to durable working instructions.
- Keep accepted product scope, open questions, assumptions, and candidate ideas
  in `docs/PRODUCT.md`.
- Update documentation when accepted decisions or verified behavior make it
  inaccurate.
- Do not turn `AGENTS.md` into a roadmap, backlog, changelog, or status report.
- Do not commit or push unless the user explicitly requests it.
