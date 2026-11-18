# T-012 App shell and channel sidebar

**Milestone:** M4  **Depends on:** T-011  **Use cases:** UC-003, UC-004

## Goal
community rail, sidebar, message pane layout

## Steps
1. Branch `feat/T-012-app-shell-and-channel-sidebar` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(app): app shell and channel sidebar`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
