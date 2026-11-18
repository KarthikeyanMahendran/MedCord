# T-008 Profile and verification workflow

**Milestone:** M2  **Depends on:** T-007  **Use cases:** UC-001, UC-017

## Goal
profiles, verification queue API + admin UI

## Steps
1. Branch `feat/T-008-profile-and-verification-workflow` from up-to-date `main`.
2. Implement only the scope above; read the referenced use cases and `docs/nexconn-notes.md`, `docs/ui-ux-guide.md` as relevant.
3. Add/adjust tests and docs (use case acceptance criteria, ADR if a decision is made).

## Verification
Run the relevant commands (`make test`, `cd backend && ./mvnw verify`, `cd frontend && npm run lint && npm test && npm run build`) plus the use-case acceptance criteria. All must pass.

## Commit
Short Conventional Commit, e.g. `feat(profile): profile and verification workflow`. No attribution lines.

## Rollback
Revert the squash-merge commit; for DB changes add a new compensating migration (never edit merged ones).
