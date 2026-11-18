# MedCord

A scalable, Discord-like community platform for doctors and medical professionals: verified profiles, communities, channels, threads, DMs, editable messages with history.

**Stack:** Spring Boot 3 (Java 21) · Hibernate/JPA · Flyway · PostgreSQL · React + Vite + TypeScript · Nexconn Chat SDK/API.

## Quickstart
Prerequisites: Java 21, Node 24 LTS (`.nvmrc` — run `nvm use`), PostgreSQL on `localhost:5432`.

```bash
cp .env.example .env     # fill in values (never commit .env)
make setup               # installs deps
make db                  # creates local `medcord` database + role
make dev                 # backend :8080, frontend :5173
```
Then sign in with a seeded account from `docs/dev-accounts.md` (e.g. `priya.raman@medcord.dev` / `Passw0rd!Med`).

## Features
Verified-professional accounts and admin licence review · communities with channels, roles and invites · real-time-style chat (replies, edit history, delete, threads, reactions, pins) · direct and group messages with blocking and presence · full-text search · moderation (mutes, reports, audit log). See `docs/architecture.md`.

## Repo map
| Path | Purpose |
|---|---|
| `backend/` | Spring Boot API, Flyway migrations, Nexconn gateway |
| `frontend/` | React app |
| `docs/` | `architecture.md`, `runbook.md`, ADRs, 20 use cases, task backlog (`PROGRESS.md`), `ui-ux-guide.md`, `nexconn-notes.md` |
| `CLAUDE.md` | Working agreement for AI/human contributors |

## Contributing
Read `CLAUDE.md` and `docs/PROGRESS.md`. One task per PR, Conventional Commits, CI must pass.
