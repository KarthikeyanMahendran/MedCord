# UC-002 Login and refresh

**Actor:** User
**Preconditions:** User authenticated (except UC-001/002); relevant membership/permission present.

## Main flow
1 Login with email+password. 2 Receive short-lived access JWT + refresh token. 3 Client refreshes silently. 4 Client requests Nexconn token and connects.

## Alternate / error flows
- Validation failure -> 400 (RFC 7807). Unauthorized -> 401/403. Nexconn unavailable -> 503 with retry; no partial DB state (transactional).

## Data & Nexconn
DB: refresh_tokens. Nexconn: POST /v4/auth/access-token/issue (server side).

## API
POST /api/v1/auth/login, /refresh, /logout; GET /api/v1/chat/token

## UI
Login page, protected routes

## Acceptance criteria
- Wrong password -> 401 RFC7807; refresh rotation; logout revokes refresh token; Nexconn connect succeeds with returned token.
- Unit + integration tests cover main and one error flow.
