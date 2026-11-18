# T-006 Frontend scaffold and UI kit

**Milestone:** M1  **Depends on:** T-005  **Use cases:** UC: -

## Goal
Vite+React+TS, tokens, ui kit (Button, Modal, Drawer, Input...), theme, /dev/ui

## Steps
1. Branch `feat/T-006-frontend-scaffold-and-ui-kit` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(frontend): frontend scaffold and ui kit`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
