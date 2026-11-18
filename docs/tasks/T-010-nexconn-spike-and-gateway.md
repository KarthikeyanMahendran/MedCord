# T-010 Nexconn spike and gateway

**Milestone:** M4  **Depends on:** T-009  **Use cases:** UC-002

## Goal
verify secret via token issue, NexconnGateway + ChannelTransport, docs/nexconn-notes update

## Steps
1. Branch `feat/T-010-nexconn-spike-and-gateway` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(nexconn): nexconn spike and gateway`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
