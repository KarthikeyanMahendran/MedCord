# T-005 Postgres db/role and Flyway V1

**Milestone:** M1  **Depends on:** T-004  **Use cases:** UC-001

## Goal
medcord DB + medcord_app role; V1 users/profiles; ddl validate

## Steps
1. Branch `feat/T-005-postgres-db-role-and-flyway-v1` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(postgres): postgres db/role and flyway v1`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
