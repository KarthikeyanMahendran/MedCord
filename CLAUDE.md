# MedCord – instructions for Claude (and humans)

MedCord is a Discord-like community platform for doctors and medical professionals.
Monorepo: `backend/` (Spring Boot 3, Java 21, Hibernate, Flyway, PostgreSQL) · `frontend/` (React + Vite + TS) · `docs/`.
Real-time chat transport is **Nexconn** (SDK + Server API). Postgres is the source of truth for domain data and for features Nexconn lacks (threads, edit history, search).

## How to work (AUTO mode loop)
1. Read `docs/PROGRESS.md`; take the first unchecked task under "Next up".
2. Open `docs/tasks/T-###-*.md` and the use cases it references in `docs/use-cases/`.
3. `git switch -c feat/T-###-slug` from an up-to-date `main`.
4. Implement exactly the task scope. Do not start the next task.
5. Run the task's **Verification** commands. If anything fails or is ambiguous: stop and report.
6. Update docs (`docs/PROGRESS.md`, use case, ADR if a decision was made).
7. Commit (rules below), push, open a PR, tick the task.

## Version-control rules
- Git identity is repo-local: `KarthikeyanMahendran <karthi13122005@gmail.com>`. Never change global git config.
- Commits: short, Conventional Commits (`feat(chat): add edit endpoint`), imperative, ≤72 chars. **No attribution/co-author lines.**
- One task per PR, squash-merge, branches `feat/ fix/ chore/ docs/`. Never force-push `main`.
- Never commit `.env`, tokens, keys, or the Nexconn secret. Only `.env.example` (placeholders).
- Flyway migrations are immutable once merged; add a new `V<n>__*.sql`.
- Ask before destructive or outward actions: force-push, dropping DBs/roles, changing GitHub settings, upgrading the Nexconn plan.

## Commands
`make setup` · `make db` (create local DB/role) · `make dev` · `make test` · `make lint` (see Makefile once added in T-002).
Backend: `cd backend && ./mvnw verify`. Frontend: `cd frontend && npm run lint && npm test && npm run build`.

## Architecture rules
- Domain data (users, communities, channels, roles, messages mirror, threads, revisions, reactions) lives in Postgres. Schema is owned by Flyway; Hibernate `ddl-auto=validate`.
- All Nexconn calls go through `backend/.../nexconn/` (`NexconnGateway`, `ChannelTransport`). Domain code must not call Nexconn directly.
- Edits go through the backend so a revision snapshot is written before Nexconn `message/update`.
- Threads are modelled by us (Nexconn has no thread API): custom fields `{threadId, rootMsgId}` + `threads` table.
- API is versioned `/api/v1`, errors are RFC 7807, config via env vars (12-factor).
- No PHI/patient data in v1. Do not add features that store or transmit it.
- See `docs/nexconn-notes.md` for verified Nexconn facts; do not re-research them.

## Frontend / UI
Follow `docs/ui-ux-guide.md` (tokens `--mc-*`, `components/ui` kit, Discord-style shell, light/dark). MedCord is fully standalone: never import from, copy from, or reference other projects.

## Environment
Local PostgreSQL on `localhost:5432`. Create only the `medcord` DB and `medcord_app` role; do not touch other databases on the server.
Secrets live in gitignored `.env` (template: `.env.example`).
