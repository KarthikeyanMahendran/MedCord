# T-013 Send/receive/history/reply UI

**Milestone:** M4  **Depends on:** T-012  **Use cases:** UC-006, UC-009, UC-012

## Goal
composer, message list, reply, unread

## Steps
1. Branch `feat/T-013-send-receive-history-reply-ui` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(send): send/receive/history/reply ui`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
