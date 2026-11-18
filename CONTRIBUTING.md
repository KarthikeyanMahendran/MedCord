# Contributing

1. Pick the first unchecked task in `docs/PROGRESS.md`; read its `docs/tasks/T-###-*.md` and the linked use cases.
2. Work on `main` directly: `git pull --ff-only` first. (Solo, private repo: no feature branches or PRs.)
3. Commits: short, imperative Conventional Commits (`feat(chat): add thread panel`). No force-pushes to `main`.
4. Before pushing, run: `cd backend && ./mvnw verify` and `cd frontend && npm run lint && npx tsc -b && npm test && npm run build`.
5. Add tests with the change. Backend integration tests extend `ApiTestSupport`; remember MockMvc encodes URLs itself (do not pre-encode), and that bulk `@Modifying` queries need a real transaction (see `PresenceCommitTest`).
6. Update docs (progress, use case, ADR for any decision). Never commit `.env`, tokens or keys; CI runs gitleaks.
7. Push to `main`. CI runs on every push; if it goes red, fix it in the next commit straight away.
