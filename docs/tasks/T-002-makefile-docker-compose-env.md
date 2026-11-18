# T-002 Makefile, docker-compose, env

**Milestone:** M0  **Depends on:** T-001  **Use cases:** UC: -

## Goal
`make setup/db/dev/test` work; compose runs Postgres

## Steps
1. Branch `feat/T-002-makefile-docker-compose-env` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(makefile): makefile, docker-compose, env`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
