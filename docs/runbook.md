# Runbook

## Local
`make db` → `make seed` (dev data) → backend `cd backend && set -a && . ../.env && set +a && ./mvnw spring-boot:run` → `cd frontend && npm run dev` → http://localhost:5173.
Dev accounts: `docs/dev-accounts.md`.

## Configuration (env vars, see `.env.example`)
`DB_*`, `JWT_SECRET` (>=32 bytes, required), `JWT_ACCESS_TTL_MINUTES`, `JWT_REFRESH_TTL_DAYS`, `AUTH_RATE_LIMIT_PER_MINUTE` (default 30), `NEXCONN_APP_KEY/SECRET/API_BASE_URL`.

## Health
`GET /actuator/health` (liveness/readiness groups). 401 JSON on missing/invalid tokens; errors are RFC 7807.

## Deploying
1. Build: `cd backend && ./mvnw -DskipTests package` → `target/*.jar`; `cd frontend && npm ci && npm run build` → `dist/`.
2. Provision Postgres (16+); create DB and a least-privilege role. Flyway applies migrations at startup.
3. Set env vars from a secrets manager, never from the repo. Serve `dist/` behind a reverse proxy that forwards `/api` to the backend (same origin avoids CORS). Set `server.forward-headers-strategy=framework` when behind a proxy so rate limiting sees real client IPs.
4. Rollback: redeploy the previous jar. Migrations are forward-only; ship a compensating migration instead of editing an old one.

## Known limits / next hardening
- Rate limiter is in-memory (single instance). Use Redis-backed counters before scaling horizontally.
- Refresh token is in `localStorage`; move to an httpOnly cookie (needs CSRF protection) before launch.
- Realtime is polling until Nexconn is reachable (blocked by the dev network DNS filter; see `docs/nexconn-notes.md`).
- No attachments yet (T-020); no push notifications (T-023). No patient data may be stored (policy: PHI reports exist for this reason).
- Back up Postgres daily and test restores; the audit log and message revisions are compliance-relevant.

## Secrets rotation
Rotate `JWT_SECRET` (invalidates sessions), DB password, Nexconn secret (invalidates Nexconn tokens), and GitHub tokens on a schedule and immediately if exposed. Rotate any token that was pasted into a chat or ticket.

## Running the backend tests against Supabase
The session pooler drops connections when many Spring contexts open at once. Before running the full suite:
- Stop the dev backend so it does not hold pooled connections.
- Keep the Hikari pool small for tests: max pool size 3, min idle 1, connection timeout 60000 ms.
- Expect a slow first run; the last full run passed (85 tests, 0 failures).
