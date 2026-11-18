# MedCord

A scalable, Discord-like community platform for doctors and medical professionals: verified profiles, communities, channels, threads, DMs, editable messages with history.

**Stack:** Spring Boot 3 (Java 21) · Hibernate/JPA · Flyway · PostgreSQL · React + Vite + TypeScript · Nexconn Chat SDK/API.

## Quickstart
Prerequisites: Java 21, Node 20 (`.nvmrc`), PostgreSQL on `localhost:5432`.

```bash
cp .env.example .env     # fill in values (never commit .env)
make setup               # installs deps
make db                  # creates local `medcord` database + role
make dev                 # backend :8080, frontend :5173
```
(Make targets arrive in task T-002; see `docs/PROGRESS.md`.)

## Repo map
| Path | Purpose |
|---|---|
| `backend/` | Spring Boot API, Flyway migrations, Nexconn gateway |
| `frontend/` | React app |
| `docs/` | Architecture, ADRs, use cases, task backlog, runbook |
| `CLAUDE.md` | Working agreement for AI/human contributors |

## Contributing
Read `CLAUDE.md` and `docs/PROGRESS.md`. One task per PR, Conventional Commits, CI must pass.
