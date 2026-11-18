# ADR 0001 – Monorepo; Nexconn transport with Postgres as source of truth

Status: accepted (2026-11-18)

## Decisions
1. **Monorepo** (`backend/`, `frontend/`, `docs/`): atomic cross-stack PRs, one history, simple handoff.
2. **Nexconn** carries real-time delivery (channels, DMs, presence, push). **PostgreSQL** is the source of truth for users, communities, channels, roles, and for features Nexconn lacks.
3. All Nexconn access sits behind `NexconnGateway` / `ChannelTransport`, so native community channels (Pro) can replace group-channel mapping without touching domain code.

## Consequences
- Webhook ingestion mirrors messages into Postgres (enables threads, search, audit).
- Vendor lock-in is contained to the `nexconn` package.
