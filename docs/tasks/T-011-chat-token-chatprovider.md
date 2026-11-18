# T-011 Chat token + ChatProvider

**Milestone:** M4  **Depends on:** T-010  **Use cases:** UC-002, UC-006

## Goal
/chat/token endpoint; React ChatProvider init/connect

## Steps
1. Branch `feat/T-011-chat-token-chatprovider` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(chat): chat token + chatprovider`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
