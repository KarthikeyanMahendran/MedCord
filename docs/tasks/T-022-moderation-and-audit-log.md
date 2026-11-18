# T-022 Moderation and audit log

**Milestone:** M6  **Depends on:** T-021  **Use cases:** UC-016, UC-020

## Goal
mute/ban/report, audit_log

## Steps
1. Branch `feat/T-022-moderation-and-audit-log` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(moderation): moderation and audit log`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
