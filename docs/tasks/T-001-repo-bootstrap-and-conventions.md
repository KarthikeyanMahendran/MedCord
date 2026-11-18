# T-001 Repo bootstrap and conventions

**Milestone:** M0  **Depends on:** none  **Use cases:** UC: -

## Goal
Docs/hygiene files committed, pushed to main

## Steps
1. Branch `feat/T-001-repo-bootstrap-and-conventions` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(repo): repo bootstrap and conventions`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
